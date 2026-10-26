import mongoose from "mongoose";
import Bull from "../models/Bull.model.js";
import EventDayEntry from "../models/EventDayEntry.model.js";
import EventDay from "../models/EventDay.model.js";
import Event from "../models/Event.model.js";
import AppError from "../utils/AppError.js";

export const getBullProfile = async (req, res, next) => {
  try {
    const { bullId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(bullId)) {
      return next(new AppError("Invalid bullId", 400));
    }

    const bull = await Bull.findOne({ _id: bullId, isDeleted: false })
      .populate("team", "teamName")
      .lean();

    if (!bull) return next(new AppError("Bull not found", 404));

    const entries = await EventDayEntry.find({
      bulls: bull._id,
      isFinalized: true,
    })
      .populate("event", "title")
      .populate("eventDay", "date category")
      .populate("bulls", "name")
      .sort({ createdAt: 1 })
      .lean();

    // ===== Career summary =====
    const summary = {
      totalEvents: entries.length,
      podiums: 0,
      bestRank: Infinity,
      totalDistance: 0,
      bestDistance: 0,
      bestTime: Infinity,
    };

    const categoryHistory = {};
    const history = [];

    for (const e of entries) {
      const perf = e.performance || {};

      summary.totalDistance += perf.distanceMeters || 0;
      summary.bestDistance = Math.max(
        summary.bestDistance,
        perf.distanceMeters || 0,
      );
      summary.bestTime = Math.min(
        summary.bestTime,
        perf.timeSeconds ?? Infinity,
      );
      summary.bestRank = Math.min(summary.bestRank, e.rank || Infinity);

      if (e.rank <= 3) summary.podiums++;

      const cat = e.bullCategoryAtThatTime || e.bullCategorySnapshot;
      const catKey = `${cat.type}:${cat.value}`;
      categoryHistory[catKey] = (categoryHistory[catKey] || 0) + 1;

      history.push({
        event: e.event.title,
        date: e.eventDay.date,
        category: cat,
        entryType: e.entryType,
        partnerBull:
          e.bulls.length === 2
            ? e.bulls.find((b) => b._id.toString() !== bullId)?.name
            : null,
        rank: e.rank,
        performance: perf,
      });
    }

    if (summary.bestRank === Infinity) summary.bestRank = null;
    if (summary.bestTime === Infinity) summary.bestTime = null;

    res.status(200).json({
      status: "success",
      data: {
        bull,
        summary,
        categoryHistory,
        history,
      },
    });
  } catch (err) {
    next(err);
  }
};
