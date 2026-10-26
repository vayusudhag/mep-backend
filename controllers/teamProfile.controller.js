import mongoose from "mongoose";
import Team from "../models/Team.model.js";
import Bull from "../models/Bull.model.js";
import EventDayEntry from "../models/EventDayEntry.model.js";
import AppError from "../utils/AppError.js";

export const getTeamProfile = async (req, res, next) => {
  try {
    const { teamId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(teamId)) {
      return next(new AppError("Invalid teamId", 400));
    }

    const team = await Team.findById(teamId)
      .populate("ownerId", "username")
      .lean();

    if (!team) return next(new AppError("Team not found", 404));

    const bulls = await Bull.find({ teamId, status: "ACTIVE", isDeleted: false })
      .select("name currentCategory status")
      .lean();

    const entries = await EventDayEntry.find({
      teamId,
      isFinalized: true,
    })
      .populate("event", "title")
      .populate("eventDay", "date")
      .populate("bulls", "name")
      .populate("drivers", "name")
      .sort({ createdAt: 1 })
      .lean();

    const summary = {
      totalEntries: entries.length,
      podiums: 0,
      bestRank: Infinity,
      totalDistance: 0,
      bestDistance: 0,
    };

    const history = [];
    const bullStatsMap = new Map();

    for (const e of entries) {
      const perf = e.performance || {};

      summary.totalDistance += perf.distanceMeters || 0;
      summary.bestDistance = Math.max(
        summary.bestDistance,
        perf.distanceMeters || 0,
      );
      summary.bestRank = Math.min(summary.bestRank, e.rank || Infinity);
      if (e.rank <= 3) summary.podiums++;

      history.push({
        event: e.event.title,
        date: e.eventDay.date,
        bulls: e.bulls.map((b) => ({ _id: b._id, name: b.name })),
        drivers: e.drivers.map((d) => d.name),
        entryType: e.entryType,
        rank: e.rank,
        performance: perf,
      });

      for (const b of e.bulls || []) {
        const id = String(b._id);
        const current = bullStatsMap.get(id) || {
          eventsPlayed: 0,
          bestRank: Infinity,
          podiums: 0,
          wins: 0,
        };

        current.eventsPlayed += 1;
        if (typeof e.rank === "number") {
          current.bestRank = Math.min(current.bestRank, e.rank);
          if (e.rank <= 3) current.podiums += 1;
          if (e.rank === 1) current.wins += 1;
        }

        bullStatsMap.set(id, current);
      }
    }

    if (summary.bestRank === Infinity) summary.bestRank = null;

    const bullsWithStats = bulls.map((b) => {
      const stats = bullStatsMap.get(String(b._id));
      return {
        ...b,
        stats: {
          eventsPlayed: stats?.eventsPlayed || 0,
          bestRank:
            stats && stats.bestRank !== Infinity ? stats.bestRank : null,
          podiums: stats?.podiums || 0,
          wins: stats?.wins || 0,
        },
      };
    });

    res.status(200).json({
      status: "success",
      data: {
        team,
        bulls: bullsWithStats,
        summary,
        history,
      },
    });
  } catch (err) {
    next(err);
  }
};
