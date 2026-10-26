import mongoose from "mongoose";
import Event from "../models/Event.model.js";
import EventDay from "../models/EventDay.model.js";
import EventDayEntry from "../models/EventDayEntry.model.js";
import AppError from "../utils/AppError.js";

/**
 * PUBLIC
 * GET /api/events/:eventId/leaderboard
 * Overall leaderboard (all days combined)
 */
export const getEventLeaderboard = async (req, res, next) => {
  try {
    const { eventId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(eventId)) {
      return next(new AppError("Invalid eventId", 400));
    }

    const event = await Event.findById(eventId).lean();
    if (!event) return next(new AppError("Event not found", 404));

    const entries = await EventDayEntry.find({
      event: eventId,
      isFinalized: true,
    })
      .populate("teamId", "teamName")
      .populate("bulls", "name")
      .lean();

    if (entries.length === 0) {
      return res.status(200).json({
        status: "success",
        data: [],
      });
    }

    // Aggregate per team
    const teamMap = new Map();

    for (const entry of entries) {
      const teamId = entry.teamId._id.toString();

      if (!teamMap.has(teamId)) {
        teamMap.set(teamId, {
          team: entry.teamId,
          totalDistance: 0,
          totalTime: 0,
          totalEntries: 0,
          bestRank: Infinity,
          entries: [],
        });
      }

      const teamStat = teamMap.get(teamId);

      teamStat.totalDistance += entry.performance?.distanceMeters || 0;
      teamStat.totalTime += entry.performance?.timeSeconds || 0;
      teamStat.totalEntries += 1;
      teamStat.bestRank = Math.min(teamStat.bestRank, entry.rank || Infinity);

      teamStat.entries.push({
        eventDay: entry.eventDay,
        bulls: entry.bulls,
        distance: entry.performance?.distanceMeters || 0,
        time: entry.performance?.timeSeconds || 0,
        rank: entry.rank,
      });
    }

    // Sort teams
    const leaderboard = Array.from(teamMap.values()).sort((a, b) => {
      if (a.totalDistance !== b.totalDistance)
        return b.totalDistance - a.totalDistance;

      if (a.totalTime !== b.totalTime) return a.totalTime - b.totalTime;

      return a.bestRank - b.bestRank;
    });

    // Assign ranks
    leaderboard.forEach((item, index) => {
      item.rank = index + 1;
    });

    res.status(200).json({
      status: "success",
      data: leaderboard,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * PUBLIC
 * GET /api/event-days/:eventDayId/leaderboard
 * Day-wise leaderboard
 */
export const getEventDayLeaderboard = async (req, res, next) => {
  try {
    const { eventDayId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(eventDayId)) {
      return next(new AppError("Invalid eventDayId", 400));
    }

    const day = await EventDay.findById(eventDayId).lean();
    if (!day) return next(new AppError("EventDay not found", 404));

    const entries = await EventDayEntry.find({
      eventDay: eventDayId,
      isFinalized: true,
    })
      .populate("teamId", "teamName")
      .populate("bulls", "name")
      .sort({ rank: 1 })
      .lean();

    const leaderboard = entries.map((entry) => ({
      rank: entry.rank,
      team: entry.teamId,
      bulls: entry.bulls,
      distance: entry.performance?.distanceMeters || 0,
      time: entry.performance?.timeSeconds || 0,
      rockWeight: entry.performance?.rockWeightKg || 0,
    }));

    res.status(200).json({
      status: "success",
      data: leaderboard,
    });
  } catch (err) {
    next(err);
  }
};
