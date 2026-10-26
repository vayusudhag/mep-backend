import EventRegistration from "../models/EventRegistration.model.js";
import TeamPerformance from "../models/TeamPerformance.model.js";
import AppError from "../utils/AppError.js";

export const recordTeamPerformance = async (req, res, next) => {
  try {
    const { eventId } = req.params;
    const { teamId, distanceCovered, timeTaken, rockWeight } = req.body;

    if (
      !teamId ||
      distanceCovered == null ||
      timeTaken == null ||
      rockWeight == null
    ) {
      return next(new AppError("Missing required fields", 400));
    }

    // Ensure team has a registration for this event
    const reg = await EventRegistration.findOne({
      event: eventId,
      team: teamId,
    }).sort({ createdAt: 1 });
    if (!reg)
      return next(new AppError("Team not registered for this event", 400));

    // Compute registration order
    const registrationOrder = await EventRegistration.countDocuments({
      event: eventId,
      createdAt: { $lte: reg.createdAt },
    });

    const performance = await TeamPerformance.create({
      event: eventId,
      team: teamId,
      registrationOrder,
      distanceCovered,
      timeTaken,
      rockWeight,
      recordedBy: req.user._id,
    });

    res.status(201).json({ status: "success", data: performance });
  } catch (err) {
    if (err.code === 11000) {
      return next(
        new AppError("Performance already recorded for this team", 409),
      );
    }
    next(err);
  }
};
