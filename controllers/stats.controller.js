import EventDayEntry from "../models/EventDayEntry.model.js";
import mongoose from "mongoose";
import AppError from "../utils/AppError.js";

// GET /api/stats/bulls
export const getBullStats = async (req, res, next) => {
  try {
    const stats = await EventDayEntry.aggregate([
      { $match: { isFinalized: true } },

      { $unwind: "$bulls" },

      {
        $group: {
          _id: "$bulls",
          totalPlays: { $sum: 1 },
          podiums: {
            $sum: { $cond: [{ $lte: ["$rank", 3] }, 1, 0] },
          },
          bestRank: { $min: "$rank" },
          avgRank: { $avg: "$rank" },
          maxDistance: { $max: "$performance.distanceMeters" },
          bestTime: { $min: "$performance.timeSeconds" },
          totalDistance: { $sum: "$performance.distanceMeters" },
        },
      },

      {
        $lookup: {
          from: "bulls",
          localField: "_id",
          foreignField: "_id",
          as: "bull",
        },
      },
      { $unwind: "$bull" },

      {
        $lookup: {
          from: "teams",
          localField: "bull.teamId",
          foreignField: "_id",
          as: "team",
        },
      },
      { $unwind: "$team" },

      {
        $project: {
          bullId: "$_id",
          bullName: "$bull.name",
          teamName: "$team.teamName",
          totalPlays: 1,
          podiums: 1,
          bestRank: 1,
          avgRank: { $round: ["$avgRank", 2] },
          maxDistance: 1,
          bestTime: 1,
        },
      },

      { $sort: { podiums: -1, avgRank: 1 } },
    ]);

    res.status(200).json({ status: "success", data: stats });
  } catch (err) {
    next(err);
  }
};

// GET /api/stats/teams
export const getTeamStats = async (req, res, next) => {
  try {
    const stats = await EventDayEntry.aggregate([
      { $match: { isFinalized: true } },

      {
        $group: {
          _id: "$teamId",
          totalEntries: { $sum: 1 },
          podiums: {
            $sum: { $cond: [{ $lte: ["$rank", 3] }, 1, 0] },
          },
          avgRank: { $avg: "$rank" },
          totalDistance: { $sum: "$performance.distanceMeters" },
          bestRank: { $min: "$rank" },
        },
      },

      {
        $lookup: {
          from: "teams",
          localField: "_id",
          foreignField: "_id",
          as: "team",
        },
      },
      { $unwind: "$team" },

      {
        $project: {
          teamId: "$_id",
          teamName: "$team.teamName",
          totalEntries: 1,
          podiums: 1,
          avgRank: { $round: ["$avgRank", 2] },
          totalDistance: 1,
          bestRank: 1,
        },
      },

      { $sort: { podiums: -1, avgRank: 1 } },
    ]);

    res.status(200).json({ status: "success", data: stats });
  } catch (err) {
    next(err);
  }
};

// GET /api/event-days/:dayId/leaderboard
export const getDayLeaderboard = async (req, res, next) => {
  try {
    const { dayId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(dayId)) {
      return next(new AppError("Invalid dayId", 400));
    }

    const entries = await EventDayEntry.find({
      eventDay: dayId,
      isFinalized: true,
    })
      .populate("teamId", "teamName")
      .populate("bulls", "name")
      .sort({ rank: 1 })
      .lean();

    const leaderboard = entries.map((e) => ({
      rank: e.rank,
      team: e.teamId?.teamName || "Unknown",
      bulls: e.bulls.map((b) => b.name).join(" + "),
      distanceMeters: e.performance?.distanceMeters || 0,
      timeSeconds: e.performance?.timeSeconds || 0,
      rockWeightKg: e.performance?.rockWeightKg || 0,
    }));

    res.status(200).json({ status: "success", data: leaderboard });
  } catch (err) {
    next(err);
  }
};
