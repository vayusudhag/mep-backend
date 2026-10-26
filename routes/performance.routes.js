import express from "express";
import { protect, restrictTo } from "../middleware/auth.middleware.js";
import { getLeaderboard } from "../controllers/event.controller.js";
import { recordTeamPerformance } from "../controllers/performance.controller.js";

const router = express.Router();

router.get("/:eventId/leaderboard", getLeaderboard);

// Admin: record team performance
router.post(
  "/:eventId/team-performance",
  protect,
  restrictTo("admin"),
  recordTeamPerformance,
);

export default router;
