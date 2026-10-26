import mongoose from "mongoose";
import EventDay from "../models/EventDay.model.js";
import EventRegistration from "../models/EventRegistration.model.js";
import EventDayEntry from "../models/EventDayEntry.model.js";
import Bull from "../models/Bull.model.js";
import TeamPersonRole from "../models/TeamPersonRole.model.js";
import Team from "../models/Team.model.js";
import User from "../models/Users.model.js";
import AppError from "../utils/AppError.js";
import { getBullDisplayName } from "../utils/bullDisplay.js";

const sameCategory = (a, b) => {
  return a?.type === b?.type && a?.value === b?.value;
};

const buildBullSnapshots = (bulls, teamById, ownerById) =>
  bulls.map((bull) => {
    const team = teamById.get(String(bull.teamId));
    const owner = team?.ownerId ? ownerById.get(String(team.ownerId)) : null;
    return {
      bullId: bull._id,
      name: bull.name,
      category: bull.currentCategory,
      teamId: bull.teamId,
      teamName: team?.teamName || "Unknown Team",
      ownerId: team?.ownerId || null,
      ownerName: owner?.username || null,
      statusAtThatTime: bull.status,
    };
  });

const buildTeamOwnerMaps = async (bulls, session = null) => {
  const teamIds = [
    ...new Set(bulls.map((b) => String(b.teamId)).filter(Boolean)),
  ];
  const teams = teamIds.length
    ? await Team.find({ _id: { $in: teamIds } })
        .select("teamName ownerId")
        .session(session)
        .lean()
    : [];
  const teamById = new Map(teams.map((t) => [String(t._id), t]));

  const ownerIds = [
    ...new Set(teams.map((t) => String(t.ownerId)).filter(Boolean)),
  ];
  const owners = ownerIds.length
    ? await User.find({ _id: { $in: ownerIds } })
        .select("username")
        .session(session)
        .lean()
    : [];
  const ownerById = new Map(owners.map((o) => [String(o._id), o]));

  return { teamById, ownerById };
};

const toNormalizedEntry = async (entryId) => {
  const entry = await EventDayEntry.findById(entryId)
    .populate("teamId", "teamName")
    .populate("captain", "name")
    .populate("bulls", "name")
    .populate("borrowedFromTeamId", "teamName")
    .populate("drivers", "name")
    .lean();

  if (!entry) return null;

  return {
    ...entry,
    team: entry.teamId || null,
    borrowedBullFromTeam: entry.borrowedFromTeamId || null,
    bullCategorySnapshot: entry.bullCategoryAtThatTime || null,
  };
};

export const createEntriesFromApprovedRegistrationsForDay = async (
  eventDay,
  session,
) => {
  const registrations = await EventRegistration.find({
    event: eventDay.event,
    status: "APPROVED",
  }).session(session);

  if (registrations.length === 0) {
    return [];
  }

  const allBullIds = registrations.flatMap((reg) =>
    (reg.entries || []).flatMap((entry) => entry.bulls || []),
  );

  const uniqueBullIds = [...new Set(allBullIds.map((id) => String(id)))];
  const bulls = uniqueBullIds.length
    ? await Bull.find({
        _id: { $in: uniqueBullIds },
        status: "ACTIVE",
        isDeleted: false,
      })
        .select("_id name teamId currentCategory status")
        .session(session)
        .lean()
    : [];

  const bullById = new Map(bulls.map((b) => [String(b._id), b]));

  const { teamById, ownerById } = await buildTeamOwnerMaps(bulls, session);

  const existingEntries = await EventDayEntry.find({
    event: eventDay.event,
    eventDay: eventDay._id,
  })
    .select("bulls")
    .session(session)
    .lean();

  const docsToInsert = [];
  const driverIdsByTeam = new Map();

  for (const reg of registrations) {
    const teamKey = String(reg.team);
    if (!driverIdsByTeam.has(teamKey)) {
      const teamDrivers = await TeamPersonRole.find({
        teamId: reg.team,
        role: "DRIVER",
        leftAt: null,
      })
        .select("personId")
        .session(session)
        .lean();

      const ids = teamDrivers.map((d) => d.personId).filter(Boolean);
      driverIdsByTeam.set(teamKey, ids);
    }

    const activeDriverIds = driverIdsByTeam.get(teamKey) || [];
    if (activeDriverIds.length === 0) {
      throw new AppError(
        `Team ${teamKey} has no active drivers for event day entry creation`,
        400,
      );
    }

    for (const declaredEntry of reg.entries || []) {
      const bullIds = (declaredEntry.bulls || []).map((id) => String(id));
      if (bullIds.length < 1 || bullIds.length > 2) {
        throw new AppError(
          `Invalid entry shape in registration ${reg._id.toString()}`,
          400,
        );
      }

      const resolvedBulls = bullIds.map((id) => bullById.get(id));
      if (resolvedBulls.some((b) => !b)) {
        throw new AppError(
          `Registration ${reg._id.toString()} contains inactive or invalid bulls`,
          400,
        );
      }

      const isCategoryMatch = resolvedBulls.every((b) =>
        sameCategory(b.currentCategory, eventDay.category),
      );

      if (!isCategoryMatch) {
        continue;
      }

      const bullSnapshots =
        Array.isArray(declaredEntry.bullSnapshots) &&
        declaredEntry.bullSnapshots.length > 0
          ? declaredEntry.bullSnapshots
          : buildBullSnapshots(resolvedBulls, teamById, ownerById);

      docsToInsert.push({
        event: eventDay.event,
        eventDay: eventDay._id,
        teamId: reg.team,
        captain: reg.captain || null,
        bulls: declaredEntry.bulls,
        bullSnapshots,
        entryType: declaredEntry.entryType,
        borrowedFromTeamId: declaredEntry.borrowedFromTeamId || null,
        bullCategoryAtThatTime: eventDay.category,
        drivers: activeDriverIds,
        gameStatus: "NEXT",
      });
    }
  }

  if (docsToInsert.length === 0) {
    return [];
  }

  const created = await EventDayEntry.insertMany(docsToInsert, { session });
  return created;
};

/**
 * ADMIN
 * POST /api/event-days/:eventDayId/entries
 * Create entries from approved registrations (team-declared entries only)
 */
export const createEntriesForEventDay = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { eventDayId } = req.params;

    const eventDay = await EventDay.findById(eventDayId).session(session);
    if (!eventDay) {
      throw new AppError("Event day not found", 404);
    }

    // Auto-complete past event days
    if (eventDay.date && eventDay.status !== "COMPLETED") {
      const endOfDay = new Date(eventDay.date);
      endOfDay.setHours(23, 59, 59, 999);
      if (new Date() > endOfDay) {
        eventDay.status = "COMPLETED";
        await eventDay.save({ session });
      }
    }

    const allowedStatuses = ["UPCOMING", "ONGOING"];
    if (!allowedStatuses.includes(eventDay.status)) {
      throw new AppError(
        "Entries can only be created when day status is UPCOMING or ONGOING",
        400,
      );
    }

    const existingCount = await EventDayEntry.countDocuments({
      event: eventDay.event,
      eventDay: eventDay._id,
    }).session(session);

    if (existingCount > 0) {
      throw new AppError("Entries already exist for this event day", 409);
    }

    const createdEntries = await createEntriesFromApprovedRegistrationsForDay(
      eventDay,
      session,
    );

    await session.commitTransaction();

    res.status(201).json({
      status: "success",
      results: createdEntries.length,
      data: createdEntries,
    });
  } catch (err) {
    await session.abortTransaction();
    next(err);
  } finally {
    session.endSession();
  }
};

/**
 * ADMIN
 * PATCH /api/event-day-entries/:entryId/start
 */
export const startEntry = async (req, res, next) => {
  try {
    const entry = await EventDayEntry.findById(req.params.entryId);
    if (!entry) return next(new AppError("Entry not found", 404));

    if (entry.gameStatus !== "NEXT") {
      return next(new AppError("Entry already started", 400));
    }

    entry.gameStatus = "PLAYING";
    entry.playedAt = new Date();

    await entry.save();
    const normalized = await toNormalizedEntry(entry._id);

    res.status(200).json({ status: "success", data: normalized });
  } catch (err) {
    next(err);
  }
};

/**
 * ADMIN
 * PATCH /api/event-day-entries/:entryId/complete
 */
export const completeEntry = async (req, res, next) => {
  try {
    const { performance } = req.body;

    const entry = await EventDayEntry.findById(req.params.entryId);
    if (!entry) return next(new AppError("Entry not found", 404));

    if (entry.gameStatus !== "PLAYING") {
      return next(new AppError("Entry not in playing state", 400));
    }

    entry.performance = performance;
    entry.gameStatus = "COMPLETED";

    await entry.save();
    const normalized = await toNormalizedEntry(entry._id);

    res.status(200).json({ status: "success", data: normalized });
  } catch (err) {
    next(err);
  }
};

/**
 * ADMIN
 * PATCH /api/event-day-entries/entries/:entryId/performance
 * Backward-compatible endpoint used by frontend for status/performance updates.
 */
export const updateEntryPerformance = async (req, res, next) => {
  try {
    const { entryId } = req.params;
    const {
      status,
      performance,
      rockWeightKg,
      distanceMeters,
      timeSeconds,
      driverIds,
      driverId,
    } = req.body || {};

    const entry = await EventDayEntry.findById(entryId);
    if (!entry) return next(new AppError("Entry not found", 404));

    const hasFlatPerformance =
      rockWeightKg !== undefined ||
      distanceMeters !== undefined ||
      timeSeconds !== undefined;
    const hasNestedPerformance =
      performance && typeof performance === "object";

    const incomingDriverIds = Array.isArray(driverIds)
      ? driverIds
      : driverId
        ? [driverId]
        : null;

    if (incomingDriverIds !== null) {
      if (!incomingDriverIds.every((id) => mongoose.Types.ObjectId.isValid(id))) {
        return next(new AppError("Invalid driver id", 400));
      }

      const validDriverRoles = await TeamPersonRole.find({
        teamId: entry.teamId,
        personId: { $in: incomingDriverIds },
        role: "DRIVER",
        leftAt: null,
      })
        .select("personId")
        .lean();

      if (validDriverRoles.length !== incomingDriverIds.length) {
        return next(
          new AppError("One or more selected drivers are invalid for this team", 400),
        );
      }

      entry.drivers = incomingDriverIds.map((id) => new mongoose.Types.ObjectId(id));
    }

    if (hasFlatPerformance || hasNestedPerformance) {
      const nextPerf = {
        rockWeightKg:
          hasNestedPerformance && performance.rockWeightKg !== undefined
            ? Number(performance.rockWeightKg)
            : rockWeightKg !== undefined
              ? Number(rockWeightKg)
              : entry.performance?.rockWeightKg || 0,
        distanceMeters:
          hasNestedPerformance && performance.distanceMeters !== undefined
            ? Number(performance.distanceMeters)
            : distanceMeters !== undefined
              ? Number(distanceMeters)
              : entry.performance?.distanceMeters || 0,
        timeSeconds:
          hasNestedPerformance && performance.timeSeconds !== undefined
            ? Number(performance.timeSeconds)
            : timeSeconds !== undefined
              ? Number(timeSeconds)
              : entry.performance?.timeSeconds || 0,
      };

      if (
        nextPerf.rockWeightKg < 0 ||
        nextPerf.distanceMeters < 0 ||
        nextPerf.timeSeconds < 0 ||
        Number.isNaN(nextPerf.rockWeightKg) ||
        Number.isNaN(nextPerf.distanceMeters) ||
        Number.isNaN(nextPerf.timeSeconds)
      ) {
        return next(new AppError("Performance values must be valid non-negative numbers", 400));
      }

      entry.performance = nextPerf;
    }

    if (status !== undefined) {
      const allowedStatus = ["NEXT", "PLAYING", "COMPLETED"];
      if (!allowedStatus.includes(status)) {
        return next(new AppError("Invalid status", 400));
      }

      const transitions = {
        NEXT: ["PLAYING"],
        PLAYING: ["COMPLETED"],
        COMPLETED: [],
      };

      if (status !== entry.gameStatus) {
        if (!transitions[entry.gameStatus].includes(status)) {
          return next(
            new AppError(
              `Invalid transition ${entry.gameStatus} -> ${status}`,
              400,
            ),
          );
        }

        if (status === "COMPLETED" && (!entry.drivers || entry.drivers.length === 0)) {
          const autoDrivers = await TeamPersonRole.find({
            teamId: entry.teamId,
            role: "DRIVER",
            leftAt: null,
          })
            .select("personId")
            .lean();

          if (!autoDrivers.length) {
            return next(
              new AppError(
                "At least one active driver is required before completing an entry",
                400,
              ),
            );
          }
          entry.drivers = autoDrivers.map((d) => d.personId);
        }

        entry.gameStatus = status;
        if (status === "PLAYING") {
          entry.playedAt = new Date();
        }
      }
    }

    await entry.save();
    const normalized = await toNormalizedEntry(entry._id);
    res.status(200).json({ status: "success", data: normalized });
  } catch (err) {
    next(err);
  }
};

/**
 * PUBLIC
 * GET /api/events/:eventId/days/:dayId/entries
 */
export const getEventDayEntries = async (req, res, next) => {
  try {
    const { eventId, dayId } = req.params;

    if (
      !mongoose.Types.ObjectId.isValid(eventId) ||
      !mongoose.Types.ObjectId.isValid(dayId)
    ) {
      return next(new AppError("Invalid IDs", 400));
    }

    const entries = await EventDayEntry.find({
      event: eventId,
      eventDay: dayId,
    })
      .populate("teamId", "teamName")
      .populate("captain", "name")
      .populate("bulls", "name")
      .populate("borrowedFromTeamId", "teamName")
      .populate("drivers", "name")
      .sort({ createdAt: 1 })
      .lean();

    const normalized = entries.map((entry) => ({
      ...entry,
      team: entry.teamId || null,
      borrowedBullFromTeam: entry.borrowedFromTeamId || null,
      bullCategorySnapshot: entry.bullCategoryAtThatTime || null,
      bullDisplayNames: (entry.bulls || []).map((bull) => {
        const snapshot = Array.isArray(entry.bullSnapshots)
          ? entry.bullSnapshots.find(
              (s) =>
                String(s?.bullId || "") === String(bull?._id || bull || ""),
            )
          : null;
        return getBullDisplayName({
          bullId: bull,
          bullSnapshot: snapshot,
        });
      }),
    }));

    res
      .status(200)
      .json({ status: "success", results: normalized.length, data: normalized });
  } catch (err) {
    next(err);
  }
};

/**
 * ADMIN
 * GET /api/event-day-entries/events/:eventId/days/:dayId/available-bulls
 */
export const getAvailableBullsForDay = async (req, res, next) => {
  try {
    const { eventId, dayId } = req.params;

    if (
      !mongoose.Types.ObjectId.isValid(eventId) ||
      !mongoose.Types.ObjectId.isValid(dayId)
    ) {
      return next(new AppError("Invalid IDs", 400));
    }

    const eventDay = await EventDay.findById(dayId).lean();
    if (!eventDay) return next(new AppError("Event day not found", 404));

    const registrations = await EventRegistration.find({
      event: eventId,
      status: "APPROVED",
    })
      .select("entries")
      .lean();

    const alreadyUsed = await EventDayEntry.find({
      event: eventId,
      eventDay: dayId,
    })
      .select("bulls")
      .lean();

    const usedBullIds = new Set(
      alreadyUsed.flatMap((e) => (e.bulls || []).map((id) => String(id))),
    );

    const snapshotCandidates = [];
    const fallbackBullIds = new Set();

    for (const reg of registrations) {
      for (const entry of reg.entries || []) {
        const snapshots = Array.isArray(entry.bullSnapshots)
          ? entry.bullSnapshots
          : [];
        if (snapshots.length > 0) {
          snapshotCandidates.push(...snapshots);
        } else {
          (entry.bulls || []).forEach((id) => fallbackBullIds.add(String(id)));
        }
      }
    }

    let snapshots = snapshotCandidates;

    if (fallbackBullIds.size > 0) {
      const bulls = await Bull.find({
        _id: { $in: [...fallbackBullIds].map((id) => new mongoose.Types.ObjectId(id)) },
        status: "ACTIVE",
        isDeleted: false,
      })
        .select("_id name teamId currentCategory status")
        .lean();
      const { teamById, ownerById } = await buildTeamOwnerMaps(bulls);
      snapshots = snapshots.concat(buildBullSnapshots(bulls, teamById, ownerById));
    }

    const category = eventDay.category;
    const filtered = snapshots.filter((s) => {
      if (!s?.bullId) return false;
      if (usedBullIds.has(String(s.bullId))) return false;
      if (category && !sameCategory(s.category, category)) return false;
      return true;
    });

    // Unique by bullId
    const unique = Array.from(
      new Map(filtered.map((s) => [String(s.bullId), s])).values(),
    );

    res.status(200).json({
      status: "success",
      results: unique.length,
      data: unique,
    });
  } catch (err) {
    next(err);
  }
};
