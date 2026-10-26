import express from "express";
import {
  createEvent,
  getAllEvents,
  getEventDetails,
  getTeamsInOngoingEvents,
  getLeaderboard,
  updateEvent,
  deleteEvent,
} from "../controllers/event.controller.js";
import { getMyRegistrations } from "../controllers/eventRegistration.controller.js";
import { protect, restrictTo } from "../middleware/auth.middleware.js";

const router = express.Router();

router.get("/", getAllEvents);
router.get("/teams/ongoing-and-upcoming", getTeamsInOngoingEvents);
router.get("/my-registrations", protect, getMyRegistrations);
router.get("/:eventId/leaderboard", getLeaderboard);
router.get("/:eventId", getEventDetails);

router.post("/", protect, restrictTo("admin"), createEvent);
router.patch("/:eventId", protect, restrictTo("admin"), updateEvent);
router.delete("/:eventId", protect, restrictTo("admin"), deleteEvent);

export default router;
