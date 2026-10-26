import mongoose from "mongoose";
import Event from "../models/Event.model.js";
import EventDay from "../models/EventDay.model.js";
import EventDayEntry from "../models/EventDayEntry.model.js";
import AppError from "../utils/AppError.js";
import { finalizeEventDayService } from "../services/ranking.service.js";
import { createEntriesFromApprovedRegistrationsForDay } from "./eventDayEntry.controller.js";

/**
 * ADMIN: Create EventDay
 */
export const createEventDay = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { eventId } = req.params;
    const { date, prizeMoney, category, timings } = req.body;

    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new AppError("Valid YYYY-MM-DD date required", 400);
    }

    if (prizeMoney === undefined) {
      throw new AppError("prizeMoney is required", 400);
    }

    if (!category?.type || !category?.value) {
      throw new AppError("category.type and category.value required", 400);
    }

    if (!timings?.from || !timings?.to) {
      throw new AppError("timings.from and timings.to required", 400);
    }

    if (!/^\d{2}:\d{2}$/.test(timings.from) || !/^\d{2}:\d{2}$/.test(timings.to)) {
      throw new AppError("timings must be in HH:mm format", 400);
    }

    if (timings.from >= timings.to) {
      throw new AppError("timings.from must be earlier than timings.to", 400);
    }

    const event = await Event.findById(eventId).session(session);
    if (!event) throw new AppError("Event not found", 404);

    if (event.state === "COMPLETED") {
      throw new AppError("Cannot add days to completed event", 400);
    }

    const exists = await EventDay.findOne({
      event: eventId,
      dayKey: date,
      "category.type": category.type,
      "category.value": category.value,
      "timings.from": timings.from,
      "timings.to": timings.to,
    }).session(session);
    if (exists) {
      throw new AppError(
        "Event day already exists for this date, category, and timing slot",
        409,
      );
    }

    const dateTime = new Date(`${date}T${timings.from}:00`);
    if (Number.isNaN(dateTime.getTime())) {
      throw new AppError("Invalid date/timing combination", 400);
    }

    const [day] = await EventDay.create(
      [
        {
          event: eventId,
          date: dateTime,
          dayKey: date,
          timings,
          category,
          prizeMoney,
          status: "UPCOMING",
        },
      ],
      { session },
    );

    const createdEntries = await createEntriesFromApprovedRegistrationsForDay(
      day,
      session,
    );

    await session.commitTransaction();
    res.status(201).json({
      status: "success",
      data: day,
      meta: { entriesCreated: createdEntries.length },
    });
  } catch (err) {
    await session.abortTransaction();
    if (err?.code === 11000) {
      return next(
        new AppError(
          "Event day already exists for this date, category, and timing slot",
          409,
        ),
      );
    }
    next(err);
  } finally {
    session.endSession();
  }
};

/**
 * ADMIN / PUBLIC: Get EventDays
 */
export const getEventDays = async (req, res, next) => {
  try {
    const { eventId } = req.params;
    const days = await EventDay.find({ event: eventId })
      .sort({ date: 1 })
      .lean();

    res.status(200).json({ status: "success", data: days });
  } catch (err) {
    next(err);
  }
};

/**
 * ADMIN: Update EventDay status
 */
export const updateEventDayStatus = async (req, res, next) => {
  try {
    const { dayId } = req.params;
    const { status } = req.body;

    const allowed = ["UPCOMING", "ONGOING", "COMPLETED"];
    if (!allowed.includes(status)) {
      return next(new AppError("Invalid status", 400));
    }

    const day = await EventDay.findById(dayId);
    if (!day) return next(new AppError("EventDay not found", 404));

    const transitions = {
      UPCOMING: ["ONGOING"],
      ONGOING: ["COMPLETED"],
      COMPLETED: [],
    };

    if (!transitions[day.status].includes(status)) {
      return next(
        new AppError(`Invalid transition ${day.status} → ${status}`, 400),
      );
    }

    day.status = status;
    await day.save();

    res.status(200).json({ status: "success", data: day });
  } catch (err) {
    next(err);
  }
};

/**
 * ADMIN: Finalize EventDay (Compute Ranks ONCE)
 */

export const finalizeEventDay = async (req, res, next) => {
  try {
    const { eventId: eventIdFromRoute, dayId } = req.params;

    let eventId = eventIdFromRoute;

    if (!eventId) {
      const day = await EventDay.findById(dayId).select("event").lean();
      if (!day) {
        return next(new AppError("EventDay not found", 404));
      }
      eventId = String(day.event);
    }

    await finalizeEventDayService(eventId, dayId);

    res.status(200).json({
      status: "success",
      message: "Event day finalized successfully",
    });
  } catch (err) {
    next(err);
  }
};
