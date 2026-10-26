import mongoose from "mongoose";
import Event from "../models/Event.model.js";
import EventRegistration from "../models/EventRegistration.model.js";
import Team from "../models/Team.model.js";
import TeamPersonRole from "../models/TeamPersonRole.model.js";
import Bull from "../models/Bull.model.js";
import Person from "../models/Person.model.js";
import User from "../models/Users.model.js";
import AppError from "../utils/AppError.js";

/**
 * USER
 * POST /api/events/:eventId/register
 */
export const registerForEvent = async (req, res, next) => {
  try {
    const { eventId } = req.params;
    const {
      captainName,
      captainPersonId,
      contactMobile,
      entries = [],
      teamMembers = [],
    } = req.body;

    if (!mongoose.Types.ObjectId.isValid(eventId)) {
      return next(new AppError("Invalid event ID", 400));
    }

    if ((!captainPersonId && !captainName) || !contactMobile) {
      return next(new AppError("Captain and contact mobile are required", 400));
    }

    if (!Array.isArray(entries) || entries.length === 0) {
      return next(new AppError("At least one entry is required", 400));
    }

    if (!Array.isArray(teamMembers) || teamMembers.length < 5) {
      return next(new AppError("At least 5 team members are required", 400));
    }

    /* Event validation */
    const event = await Event.findById(eventId).lean();
    if (!event) return next(new AppError("Event not found", 404));
    if (event.state === "COMPLETED") {
      return next(new AppError("Registration closed for this event", 400));
    }

    /* Resolve approved team (OWNER only) */
    const team = await Team.findOne({
      ownerId: req.user._id,
      status: "APPROVED",
      deletedAt: null,
    }).lean();

    if (!team) {
      return next(new AppError("No approved team found", 403));
    }

    /* Validate team has minimum 5 active members */
    const activeMembers = await TeamPersonRole.countDocuments({
      teamId: team._id,
      leftAt: null,
    });

    if (activeMembers < 5) {
      return next(
        new AppError("Team must have at least 5 active members", 400),
      );
    }

    if (!teamMembers.every((id) => mongoose.Types.ObjectId.isValid(id))) {
      return next(new AppError("Invalid team member id", 400));
    }

    const uniqueTeamMemberIds = [...new Set(teamMembers.map((id) => String(id)))];

    const validTeamMembers = await TeamPersonRole.find({
      teamId: team._id,
      personId: { $in: uniqueTeamMemberIds.map((id) => new mongoose.Types.ObjectId(id)) },
      leftAt: null,
    })
      .select("personId")
      .lean();

    if (validTeamMembers.length !== uniqueTeamMemberIds.length) {
      return next(
        new AppError("One or more selected team members are invalid for this team", 400),
      );
    }

    /* Resolve captain as Person (accept free-text captain name) */
    let captainId = captainPersonId;
    if (captainId) {
      if (!mongoose.Types.ObjectId.isValid(captainId)) {
        return next(new AppError("Invalid captain ID", 400));
      }
      const captainExists = await Person.findById(captainId).select("_id").lean();
      if (!captainExists) {
        return next(new AppError("Captain not found", 400));
      }
    } else {
      const normalizedCaptainName = String(captainName || "").trim();
      if (!normalizedCaptainName) {
        return next(new AppError("Captain name is required", 400));
      }
      const captainPerson = await Person.create({
        name: normalizedCaptainName,
      });
      captainId = captainPerson._id;
    }

    const allBullIds = entries.flatMap((entry) => entry?.bulls || []);
    if (allBullIds.length === 0) {
      return next(new AppError("At least one bull must be selected", 400));
    }

    const uniqueBullIds = new Set(allBullIds.map((id) => String(id)));
    if (
      !allBullIds.every((id) => mongoose.Types.ObjectId.isValid(id))
    ) {
      return next(new AppError("Invalid bull id in entries", 400));
    }

    const bulls = await Bull.find({
      _id: { $in: [...uniqueBullIds] },
      status: "ACTIVE",
      isDeleted: false,
    })
      .select("_id name teamId currentCategory status")
      .lean();

    if (bulls.length !== uniqueBullIds.size) {
      return next(new AppError("One or more selected bulls are invalid or inactive", 400));
    }

    const bullById = new Map(bulls.map((b) => [String(b._id), b]));

    const teamIds = [
      ...new Set(bulls.map((b) => String(b.teamId)).filter(Boolean)),
    ];
    const teams = teamIds.length
      ? await Team.find({ _id: { $in: teamIds } })
          .select("teamName ownerId")
          .lean()
      : [];
    const teamById = new Map(teams.map((t) => [String(t._id), t]));

    const ownerIds = [
      ...new Set(teams.map((t) => String(t.ownerId)).filter(Boolean)),
    ];
    const owners = ownerIds.length
      ? await User.find({ _id: { $in: ownerIds } })
          .select("username")
          .lean()
      : [];
    const ownerById = new Map(owners.map((o) => [String(o._id), o]));

    const borrowedTeamIds = [
      ...new Set(
        entries
          .map((entry) => entry?.borrowedFromTeamId)
          .filter(Boolean)
          .map((id) => String(id)),
      ),
    ];

    if (
      borrowedTeamIds.some((id) => !mongoose.Types.ObjectId.isValid(id))
    ) {
      return next(new AppError("Invalid borrowedFromTeamId in entries", 400));
    }

    const borrowedTeams = borrowedTeamIds.length
      ? await Team.find({
          _id: { $in: borrowedTeamIds },
          status: "APPROVED",
        })
          .select("_id status")
          .lean()
      : [];
    const borrowedTeamSet = new Set(borrowedTeams.map((t) => String(t._id)));

    const normalizedEntries = [];

    for (const entry of entries) {
      const rawBulls = Array.isArray(entry?.bulls) ? entry.bulls : [];
      if (rawBulls.length < 1 || rawBulls.length > 2) {
        return next(new AppError("Each entry must contain 1 or 2 bulls", 400));
      }

      if (rawBulls.length === 1 && entry.entryType !== "SINGLE_BULL") {
        return next(new AppError("entryType must be SINGLE_BULL for single-bull entry", 400));
      }

      if (rawBulls.length === 2 && entry.entryType !== "PAIR_BULL") {
        return next(new AppError("entryType must be PAIR_BULL for two-bull entry", 400));
      }

      if (rawBulls.length === 2 && String(rawBulls[0]) === String(rawBulls[1])) {
        return next(new AppError("Two bulls in an entry cannot be identical", 400));
      }

      const resolvedBulls = rawBulls.map((id) => bullById.get(String(id)));
      if (resolvedBulls.some((b) => !b)) {
        return next(new AppError("One or more selected bulls are invalid", 400));
      }

      const catA = resolvedBulls[0].currentCategory;
      const sameCategory = resolvedBulls.every(
        (b) =>
          b.currentCategory?.type === catA?.type &&
          b.currentCategory?.value === catA?.value,
      );
      if (!sameCategory) {
        return next(new AppError("Bulls in an entry must match the same category", 400));
      }

      const nonMain = resolvedBulls.filter(
        (b) => String(b.teamId) !== String(team._id),
      );

      if (nonMain.length > 1) {
        return next(new AppError("Only one borrowed bull is allowed per entry", 400));
      }

      if (nonMain.length === 1) {
        if (!entry.borrowedFromTeamId) {
          return next(new AppError("borrowedFromTeamId is required when using a borrowed bull", 400));
        }

        if (String(entry.borrowedFromTeamId) !== String(nonMain[0].teamId)) {
          return next(new AppError("borrowedFromTeamId must match borrowed bull owner team", 400));
        }

        if (!borrowedTeamSet.has(String(entry.borrowedFromTeamId))) {
          return next(new AppError("Borrowed bull must belong to another approved team", 400));
        }

        if (String(entry.borrowedFromTeamId) === String(team._id)) {
          return next(new AppError("borrowedFromTeamId must be a different team", 400));
        }
      } else if (entry.borrowedFromTeamId) {
        return next(new AppError("borrowedFromTeamId is allowed only when an entry contains a borrowed bull", 400));
      }

      const bullSnapshots = resolvedBulls.map((bull) => {
        const team = teamById.get(String(bull.teamId));
        const owner = team?.ownerId
          ? ownerById.get(String(team.ownerId))
          : null;
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

      normalizedEntries.push({
        bulls: rawBulls.map((id) => new mongoose.Types.ObjectId(id)),
        entryType: entry.entryType,
        borrowedFromTeamId: entry.borrowedFromTeamId
          ? new mongoose.Types.ObjectId(entry.borrowedFromTeamId)
          : null,
        bullSnapshots,
      });
    }

    /* Create registration */
    const registration = await EventRegistration.create({
      event: eventId,
      team: team._id,
      captain: captainId,
      contactMobile,
      entries: normalizedEntries,
      teamMembers: uniqueTeamMemberIds.map((id) => new mongoose.Types.ObjectId(id)),
      registeredBy: req.user._id,
    });

    res.status(201).json({
      status: "success",
      data: registration,
    });
  } catch (err) {
    if (err.code === 11000) {
      return next(new AppError("Team already registered for this event", 409));
    }
    next(err);
  }
};

/**
 * ADMIN
 * PATCH /api/events/:eventId/registrations/:registrationId/decision
 */
export const decideRegistration = async (req, res, next) => {
  try {
    const { registrationId } = req.params;
    const { decision, adminNotes } = req.body;

    if (!["APPROVED", "REJECTED"].includes(decision)) {
      return next(new AppError("Invalid decision", 400));
    }

    const registration = await EventRegistration.findById(registrationId);
    if (!registration) {
      return next(new AppError("Registration not found", 404));
    }

    if (registration.status !== "PENDING") {
      return next(new AppError("Registration already processed", 400));
    }

    registration.status = decision;
    registration.approvedBy = req.user._id;
    registration.approvedAt = new Date();
    registration.adminNotes = adminNotes || null;

    await registration.save();

    res.status(200).json({
      status: "success",
      data: registration,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * PUBLIC
 * GET /api/events/:eventId/registrations/approved
 */
export const getApprovedRegistrations = async (req, res, next) => {
  try {
    const { eventId } = req.params;

    const registrations = await EventRegistration.find({
      event: eventId,
      status: "APPROVED",
    })
      .populate("team", "teamName")
      .populate("captain", "name")
      .populate("entries.bulls", "name currentCategory teamId")
      .populate("entries.borrowedFromTeamId", "teamName")
      .populate("teamMembers", "name")
      .sort({ createdAt: 1 })
      .lean();

    res.status(200).json({
      status: "success",
      results: registrations.length,
      data: registrations,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * USER
 * GET /api/events/:eventId/my-registration
 */
export const getMyRegistrationStatus = async (req, res, next) => {
  try {
    const { eventId } = req.params;

    const team = await Team.findOne({
      ownerId: req.user._id,
      status: "APPROVED",
    }).select("_id");

    if (!team) {
      return res.status(200).json({
        status: "success",
        data: null,
      });
    }

    const registration = await EventRegistration.findOne({
      event: eventId,
      team: team._id,
    })
      .select("status createdAt")
      .lean();

    res.status(200).json({
      status: "success",
      data: registration || null,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * USER
 * GET /api/events/my-registrations
 */
export const getMyRegistrations = async (req, res, next) => {
  try {
    const team = await Team.findOne({
      ownerId: req.user._id,
      status: "APPROVED",
      deletedAt: null,
    }).select("_id");

    if (!team) {
      return res.status(200).json({
        status: "success",
        data: [],
      });
    }

    const registrations = await EventRegistration.find({ team: team._id })
      .select("event status createdAt updatedAt")
      .populate("event", "_id title state timings")
      .sort({ createdAt: -1 })
      .lean();

    res.status(200).json({
      status: "success",
      results: registrations.length,
      data: registrations,
    });
  } catch (err) {
    next(err);
  }
};
