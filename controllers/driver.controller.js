import mongoose from "mongoose";
import Person from "../models/Person.model.js";
import EventDayEntry from "../models/EventDayEntry.model.js";
import TeamPersonRole from "../models/TeamPersonRole.model.js";
import Team from "../models/Team.model.js";
import AppError from "../utils/AppError.js";

export const getAllDrivers = async (req, res, next) => {
  try {
    const approvedTeams = await Team.find({ status: "APPROVED" })
      .select("_id")
      .lean();
    const approvedTeamIds = approvedTeams.map((t) => t._id);

    if (approvedTeamIds.length === 0) {
      return res.status(200).json({ status: "success", data: [] });
    }

    const memberships = await TeamPersonRole.find({
      role: "DRIVER",
      teamId: { $in: approvedTeamIds },
      leftAt: null,
    })
      .select("personId teamId leftAt")
      .populate("teamId", "teamName")
      .lean();

    const driverIds = Array.from(
      new Set(memberships.map((m) => m.personId?.toString()).filter(Boolean)),
    );

    if (driverIds.length === 0) {
      return res.status(200).json({ status: "success", data: [] });
    }

    const [drivers, entries] = await Promise.all([
      Person.find({ _id: { $in: driverIds } }).lean(),
      EventDayEntry.find({
        drivers: { $in: driverIds },
        teamId: { $in: approvedTeamIds },
        isFinalized: true,
      })
        .populate("teamId", "teamName")
        .populate("event", "title")
        .populate("bulls", "name")
        .lean(),
    ]);

    const driverMap = new Map(
      drivers.map((d) => [d._id.toString(), d]),
    );

    const membershipByDriver = memberships.reduce((acc, m) => {
      const id = m.personId?.toString();
      if (!id) return acc;
      if (!acc[id]) acc[id] = [];
      acc[id].push(m);
      return acc;
    }, {});

    const statsByDriver = {};
    for (const e of entries) {
      for (const dId of e.drivers || []) {
        const id = dId.toString();
        const s =
          statsByDriver[id] ||
          (statsByDriver[id] = {
            events: new Set(),
            teams: new Set(),
            bulls: new Set(),
            podiums: 0,
            wins: 0,
            bestRank: Infinity,
            lastPlayedAt: null,
          });

        if (e.event?._id) s.events.add(e.event._id.toString());
        if (e.teamId?.teamName) s.teams.add(e.teamId.teamName);
        for (const b of e.bulls || []) {
          if (b?.name) s.bulls.add(b.name);
        }
        if (e.rank && e.rank <= 3) s.podiums += 1;
        if (e.rank === 1) s.wins += 1;
        if (e.rank) s.bestRank = Math.min(s.bestRank, e.rank);

        const playedAt = e.playedAt || e.createdAt || null;
        if (
          playedAt &&
          (!s.lastPlayedAt || new Date(playedAt) > new Date(s.lastPlayedAt))
        ) {
          s.lastPlayedAt = playedAt;
        }
      }
    }

    const payload = driverIds.map((id) => {
      const driver = driverMap.get(id);
      const stats = statsByDriver[id] || {
        events: new Set(),
        bulls: new Set(),
        podiums: 0,
        wins: 0,
        bestRank: Infinity,
        lastPlayedAt: null,
      };
      const membershipsForDriver = membershipByDriver[id] || [];
      const isActive = membershipsForDriver.length > 0;
      const currentTeams = Array.from(
        new Set(
          membershipsForDriver
            .map((m) => m.teamId?.teamName)
            .filter(Boolean),
        ),
      );

      return {
        id,
        name: driver?.name || "Unknown",
        phone: driver?.phone || null,
        teamsPlayed: currentTeams,
        bullsPlayed: Array.from(stats.bulls),
        eventsParticipated: stats.events.size,
        podiums: stats.podiums,
        wins: stats.wins,
        bestRank: stats.bestRank === Infinity ? null : stats.bestRank,
        lastPlayedAt: stats.lastPlayedAt,
        isActive,
      };
    });

    res.status(200).json({ status: "success", data: payload });
  } catch (err) {
    next(err);
  }
};

export const getDriverProfile = async (req, res, next) => {
  try {
    const { driverId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(driverId)) {
      return next(new AppError("Invalid driverId", 400));
    }

    const driver = await Person.findById(driverId).lean();
    if (!driver) return next(new AppError("Driver not found", 404));

    const entries = await EventDayEntry.find({
      drivers: driverId,
      isFinalized: true,
    })
      .populate("teamId", "teamName")
      .populate("event", "title")
      .populate("eventDay", "date")
      .populate("bulls", "name")
      .sort({ createdAt: 1 })
      .lean();

    const summary = {
      totalEvents: entries.length,
      podiums: 0,
      bestRank: Infinity,
      totalDistance: 0,
      bestDistance: 0,
      bestTime: Infinity,
    };

    const teamHistory = {};
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

      const teamName = e.teamId?.teamName || "Unknown";
      teamHistory[teamName] = (teamHistory[teamName] || 0) + 1;

      history.push({
        event: e.event.title,
        date: e.eventDay.date,
        team: teamName,
        bulls: e.bulls.map((b) => b.name),
        entryType: e.entryType,
        rank: e.rank,
        performance: perf,
      });
    }

    if (summary.bestRank === Infinity) summary.bestRank = null;
    if (summary.bestTime === Infinity) summary.bestTime = null;

    res.status(200).json({
      status: "success",
      data: {
        driver,
        summary,
        teamHistory,
        history,
      },
    });
  } catch (err) {
    next(err);
  }
};
