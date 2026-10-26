import mongoose from "mongoose";
import EventDayEntry from "../models/EventDayEntry.model.js";
import EventDay from "../models/EventDay.model.js";
import EventResult from "../models/EventResult.model.js";
import AppError from "../utils/AppError.js";
import BullHistory from "../models/BullHistory.model.js";

export const finalizeEventDayService = async (eventId, eventDayId) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // 1. Validate EventDay
    const eventDay = await EventDay.findOne({
      _id: eventDayId,
      event: eventId,
    }).session(session);

    if (!eventDay) {
      throw new AppError("EventDay not found", 404);
    }

    if (eventDay.status === "COMPLETED") {
      throw new AppError("EventDay already finalized", 400);
    }

    // 2. Fetch eligible entries
    const entries = await EventDayEntry.find({
      event: eventId,
      eventDay: eventDayId,
      gameStatus: "COMPLETED",
      isFinalized: false,
    })
      .populate("bulls")
      .session(session);

    if (entries.length === 0) {
      throw new AppError("No unfinalized completed entries found", 400);
    }

    // 3. Sort entries (business rule)
    entries.sort((a, b) => {
      const dA = a.performance?.distanceMeters || 0;
      const dB = b.performance?.distanceMeters || 0;
      if (dA !== dB) return dB - dA;

      const tA = a.performance?.timeSeconds ?? Infinity;
      const tB = b.performance?.timeSeconds ?? Infinity;
      if (tA !== tB) return tA - tB;

      const rA = a.performance?.rockWeightKg || 0;
      const rB = b.performance?.rockWeightKg || 0;
      return rB - rA;
    });

    // 4. Rank assignment (sequential, tie-aware)
    let rank = 1;
    let prevScore = null;

    for (const entry of entries) {
      const score = `${entry.performance.distanceMeters}-${entry.performance.timeSeconds}-${entry.performance.rockWeightKg}`;

      if (prevScore !== null && score !== prevScore) {
        rank++;
      }

      entry.rank = rank;
      prevScore = score;
    }

    // 5. Persist results
    for (const entry of entries) {
      for (const bull of entry.bulls) {
        const exists = await EventResult.exists({
          eventDay: eventDayId,
          bull: bull._id,
        }).session(session);

        if (exists) continue; // idempotent

        const partner =
          entry.bulls.length === 2
            ? entry.bulls.find((b) => b._id.toString() !== bull._id.toString())
            : null;

        const result = await EventResult.create(
          [
            {
              event: eventId,
              eventDay: eventDayId,
              bull: bull._id,
              team: bull.teamId,
              partnerBull: partner?._id,
              categoryAtPlay: bull.currentCategory,
              performance: new Map([
                ["distance", entry.performance.distanceMeters],
                ["time", entry.performance.timeSeconds],
                ...(entry.performance.rockWeightKg
                  ? [["rockWeight", entry.performance.rockWeightKg]]
                  : []),
              ]),
              rank: entry.rank,
            },
          ],
          { session },
        );

        await updateBullCareer(bull._id, result[0], session);
      }

      entry.isFinalized = true;
      await entry.save({ session });
    }

    // 6. Mark EventDay completed
    eventDay.status = "COMPLETED";
    await eventDay.save({ session });

    await session.commitTransaction();
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
};

/**
 * Update Bull Career based on new Result
 */
const updateBullCareer = async (bullId, result, session) => {
  await BullHistory.create(
    [
      {
        bull: bullId,
        type: "EVENT_RESULT",
        event: result.event,
        eventDay: result.eventDay,
        result: result._id,
        categoryAtThatTime: result.categoryAtPlay,
      },
    ],
    { session },
  );
};
