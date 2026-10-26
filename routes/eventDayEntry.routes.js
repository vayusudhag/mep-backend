import express from "express";
import { protect, restrictTo } from "../middleware/auth.middleware.js";
import {
  createEntriesForEventDay,
  startEntry,
  completeEntry,
  updateEntryPerformance,
  getEventDayEntries,
  getAvailableBullsForDay,
} from "../controllers/eventDayEntry.controller.js";

const router = express.Router();

router.get("/events/:eventId/days/:dayId/entries", getEventDayEntries);

router.use(protect);
router.use(restrictTo("admin"));

router.get(
  "/events/:eventId/days/:dayId/available-bulls",
  getAvailableBullsForDay,
);

// Support frontend convenience route: POST /api/event-day-entries/events/:eventId/days/:dayId/entries
// Map dayId -> eventDayId and call existing controller
router.post("/events/:eventId/days/:dayId/entries", (req, res, next) => {
  req.params.eventDayId = req.params.dayId;
  return createEntriesForEventDay(req, res, next);
});

router.post("/event-days/:eventDayId/entries", createEntriesForEventDay);
router.patch("/entries/:entryId/performance", updateEntryPerformance);
router.patch("/entries/:entryId/start", startEntry);
router.patch("/entries/:entryId/complete", completeEntry);

export default router;
