import Event from "../models/Event.model.js";
import Bull from "../models/Bull.model.js";
import EventRegistration from "../models/EventRegistration.model.js";
import Team from "../models/Team.model.js";

// GET /api/dashboard/counts
export const getDashboardCounts = async (req, res, next) => {
  try {
    // Get active teams count: teams registered in UPCOMING or ONGOING events
    const activeEvents = await Event.find({
      state: { $in: ["UPCOMING", "ONGOING"] },
    }).select("_id");

    const activeEventIds = activeEvents.map((e) => e._id);

    const activeTeamIds =
      activeEventIds.length === 0
        ? []
        : await EventRegistration.distinct("team", {
            event: { $in: activeEventIds },
            status: "APPROVED",
          });

    const activeTeamsCount = activeTeamIds.length;

    // Get active bulls count: bulls that are part of approved registrations for UPCOMING/ONGOING events
    const activeBullIds =
      activeEventIds.length === 0
        ? []
        : await EventRegistration.distinct("entries.bulls", {
            event: { $in: activeEventIds },
            status: "APPROVED",
          });
    const activeBullsCount = activeBullIds.length;

    // Get events count
    const eventsCount = await Event.countDocuments();

    // Pending teams count (case-safe)
    const pendingTeamsCount = await Team.countDocuments({
      status: { $in: ["PENDING", "pending"] },
    });

    res.status(200).json({
      status: "success",
      data: {
        activeTeams: activeTeamsCount,
        activeBulls: activeBullsCount,
        totalEvents: eventsCount,
        pendingTeams: pendingTeamsCount,
      },
    });
  } catch (err) {
    next(err);
  }
};
