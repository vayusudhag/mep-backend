import mongoose from "mongoose";
import Event from "../models/Event.model.js";
import EventDay from "../models/EventDay.model.js";
import EventDayEntry from "../models/EventDayEntry.model.js";
import EventRegistration from "../models/EventRegistration.model.js";
import TeamPerformance from "../models/TeamPerformance.model.js";
import AppError from "../utils/AppError.js";

/**
 * PUBLIC
 * GET /api/events
 * List events (paginated)
 */
export const getAllEvents = async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(50, Number(req.query.limit) || 10);
    const skip = (page - 1) * limit;
    const now = new Date();
    const includePast = String(req.query.includePast || "false") === "true";

    const query = includePast ? {} : { "timings.to": { $gte: now } };

    const [events, total] = await Promise.all([
      Event.find(query)
        .select("title location timings state prizeMoney")
        .sort({ "timings.from": -1 })
        .skip(skip)
        .limit(limit)
        .lean(),

      Event.countDocuments(query),
    ]);

    res.status(200).json({
      status: "success",
      page,
      totalPages: Math.ceil(total / limit),
      totalResults: total,
      data: events,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * PUBLIC
 * GET /api/events/:eventId
 * Event details + days
 */
export const getEventDetails = async (req, res, next) => {
  try {
    const { eventId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(eventId)) {
      return next(new AppError("Invalid event ID", 400));
    }

    const event = await Event.findById(eventId).lean();
    if (!event) {
      return next(new AppError("Event not found", 404));
    }

    const days = await EventDay.find({ event: eventId })
      .sort({ date: 1 })
      .lean();

    res.status(200).json({
      status: "success",
      data: {
        event,
        days,
      },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * ADMIN
 * POST /api/events
 * Create event
 */
export const createEvent = async (req, res, next) => {
  try {
    const { title, description, location, timings, prizeMoney } = req.body;

    if (!title || !timings?.from || !timings?.to) {
      return next(new AppError("Missing required fields", 400));
    }

    if (new Date(timings.from) >= new Date(timings.to)) {
      return next(new AppError("Invalid event timing range", 400));
    }

    const event = await Event.create({
      title: title.trim(),
      description,
      location,
      timings,
      prizeMoney,
      createdBy: req.user._id,
    });

    res.status(201).json({
      status: "success",
      data: event,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * ADMIN
 * PATCH /api/events/:eventId
 * Update event metadata
 */
export const updateEvent = async (req, res, next) => {
  try {
    const { eventId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(eventId)) {
      return next(new AppError("Invalid event ID", 400));
    }

    const allowed = [
      "title",
      "description",
      "location",
      "timings",
      "prizeMoney",
      "state",
    ];
    const updates = {};

    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        updates[key] = req.body[key];
      }
    }

    const event = await Event.findByIdAndUpdate(eventId, updates, {
      new: true,
      runValidators: true,
    });

    if (!event) {
      return next(new AppError("Event not found", 404));
    }

    res.status(200).json({
      status: "success",
      data: event,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * ADMIN
 * DELETE /api/events/:eventId
 * Soft delete (optional, if you support it)
 */
export const deleteEvent = async (req, res, next) => {
  try {
    const { eventId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(eventId)) {
      return next(new AppError("Invalid event ID", 400));
    }

    const event = await Event.findById(eventId);
    if (!event) {
      return next(new AppError("Event not found", 404));
    }

    // Optional: prevent deleting ongoing/completed events
    if (event.state === "ONGOING") {
      return next(new AppError("Cannot delete ongoing event", 400));
    }

    await event.deleteOne();

    res.status(204).json({
      status: "success",
      data: null,
    });
  } catch (err) {
    next(err);
  }
};

//
//
// check them later and remove
//
//
/**
 * PUBLIC: Get Teams in UPCOMING and ONGOING events
 * GET /api/events/teams/ongoing-and-upcoming
 *
 * Returns an array of {
 *  event: { _id, title, state },
 *  teams: [ { registrationId, team, captainName, registrationOrder, hasPlayed, selectedBullIds, selectedBulls } ]
 * }
 */
export const getTeamsInOngoingEvents = async (req, res, next) => {
  try {
    // 1. Find events that are UPCOMING or ONGOING
    const events = await Event.find({
      state: { $in: ["UPCOMING", "ONGOING"] },
    }).select("_id title state");

    if (!events || events.length === 0) {
      return res.status(200).json({ status: "success", data: [] });
    }

    const eventIds = events.map((e) => e._id);

    // 2. Find approved registrations for these events
    const registrations = await EventRegistration.find({
      event: { $in: eventIds },
      status: "APPROVED",
    })
      .populate("team", "teamName")
      .populate("captain", "name")
      .populate("entries.bulls", "_id name currentCategory")
      .sort({ createdAt: 1 })
      .lean();

    // 3. Find performances to detect which teams have played
    const performances = await TeamPerformance.find({
      event: { $in: eventIds },
    })
      .select("event team")
      .lean();

    const playedSet = new Set(
      performances.map((p) => `${p.event.toString()}:${p.team.toString()}`),
    );

    // 4. Group registrations per event and attach meta
    const grouped = events.reduce((acc, ev) => {
      acc[ev._id] = { event: ev, teams: [] };
      return acc;
    }, {});

    registrations.forEach((reg) => {
      const key = reg.event.toString();
      if (!grouped[key]) return; // ignore registrations for events not in our list
      if (!reg.team?._id) return; // skip malformed registrations

      const registrationOrder = grouped[key].teams.length + 1;
      const selectedBulls = (reg.entries || [])
        .flatMap((entry) => entry.bulls || [])
        .map((b) => ({
          _id: b?._id?.toString(),
          name: b?.name || null,
          currentCategory: b?.currentCategory || null,
        }))
        .filter((b) => b._id);
      const uniqueSelectedBulls = Array.from(
        new Map(selectedBulls.map((b) => [b._id, b])).values(),
      );

      grouped[key].teams.push({
        registrationId: reg._id,
        team: reg.team,
        captainName: reg.captain?.name || null,
        registrationOrder,
        hasPlayed: playedSet.has(`${key}:${reg.team._id.toString()}`),
        selectedBullIds: uniqueSelectedBulls.map((b) => b._id),
        selectedBulls: uniqueSelectedBulls,
      });
    });

    const data = Object.values(grouped);

    res.status(200).json({ status: "success", data });
  } catch (err) {
    next(err);
  }
};

/**
 * PUBLIC: Get Event Leaderboard
 * GET /api/events/:eventId/leaderboard
 */
export const getLeaderboard = async (req, res, next) => {
  try {
    const { eventId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(eventId)) {
      return next(new AppError("Invalid event ID", 400));
    }

    // Fetch all finalized entries for this event
    const entries = await EventDayEntry.find({
      event: eventId,
      isFinalized: true,
    })
      .populate("teamId", "teamName")
      .populate("bulls", "name")
      .lean();

    // Sort entries: Distance DESC, Time ASC, Rock Weight DESC
    entries.sort((a, b) => {
      const distA = a.performance?.distanceMeters || 0;
      const distB = b.performance?.distanceMeters || 0;
      if (distA !== distB) return distB - distA;

      const timeA = a.performance?.timeSeconds ?? Infinity;
      const timeB = b.performance?.timeSeconds ?? Infinity;
      if (timeA !== timeB) return timeA - timeB;

      const rockA = a.performance?.rockWeightKg || 0;
      const rockB = b.performance?.rockWeightKg || 0;
      return rockB - rockA;
    });

    // Add rank
    const leaderboard = entries.map((entry, index) => ({
      ...entry,
      rank: index + 1,
      teamName: entry.teamId?.teamName || null,
      bullNames: (entry.bulls || [])
        .map((b) => b?.name)
        .filter(Boolean)
        .join(" + "),
    }));

    res.status(200).json({
      status: "success",
      data: leaderboard,
    });
  } catch (err) {
    next(err);
  }
};
