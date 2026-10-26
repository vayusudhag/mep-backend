import express from "express";
import { protect, restrictTo } from "../middleware/auth.middleware.js";
import {
  createEventDay,
  getEventDays,
  updateEventDayStatus,
  finalizeEventDay,
} from "../controllers/eventDay.controller.js";

const router = express.Router();

router.get("/events/:eventId/days", getEventDays);

router.use(protect);
router.use(restrictTo("admin"));
router.post("/events/:eventId/days", createEventDay);
router.patch("/:dayId/status", updateEventDayStatus);
router.post("/:dayId/finalize", finalizeEventDay);
router.post("/:dayId/calculate-results", finalizeEventDay);

export default router;
