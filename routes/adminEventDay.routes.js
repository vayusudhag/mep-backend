import express from "express";
import { protect, restrictTo } from "../middleware/auth.middleware.js";
import {
  createEventDay,
  getEventDaysAdmin,
  updateEventDayStatus,
  calculateDayResults,
} from "../controllers/performance.controller.js";

const router = express.Router();

router.use(protect, restrictTo("admin"));

router.post("/events/:eventId/days", createEventDay);
router.get("/events/:eventId/days", getEventDaysAdmin);
router.patch("/event-days/:dayId/status", updateEventDayStatus);
router.post("/event-days/:dayId/calculate-results", calculateDayResults);

export default router;
