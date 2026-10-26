import express from "express";
import {
  getBullStats,
  getTeamStats,
  getDayLeaderboard,
} from "../controllers/stats.controller.js";
import { getLeaderboard } from "../controllers/event.controller.js";

const router = express.Router();

router.get("/events/:eventId", getLeaderboard);
router.get("/events/:eventId/days/:dayId", getDayLeaderboard);
router.get("/bulls", getBullStats);
router.get("/teams", getTeamStats);

export default router;
