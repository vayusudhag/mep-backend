import express from "express";
import {
  createTeam,
  getMyTeam,
  updateTeam,
  updateTeamRoster,
  decideTeamStatus,
  getAllTeams,
  getPendingTeams,
  getTeamById,
} from "../controllers/team.controller.js";
import { onboardTeam } from "../controllers/teamOnboarding.controller.js";
import {
  addTeamMember,
  removeTeamMember,
  listTeamMembers,
} from "../controllers/teamMember.controller.js";
import { getTeamProfile } from "../controllers/teamProfile.controller.js";
import { protect, restrictTo } from "../middleware/auth.middleware.js";

const router = express.Router();

router.get("/", getAllTeams);
router.get("/pending", protect, restrictTo("admin"), getPendingTeams);
router.get("/myTeam", protect, getMyTeam);
router.get("/:teamId/profile", getTeamProfile);
router.get("/:teamId", getTeamById);

router.use(protect);
router.post("/onboard", onboardTeam);
router.post("/", createTeam);
router.put("/:teamId", updateTeam);
router.patch("/:teamId/roster", updateTeamRoster);

router.post("/:teamId/members", addTeamMember);
router.delete("/:teamId/members/:personId", removeTeamMember);
router.get("/:teamId/members", listTeamMembers);

router.patch("/:teamId/decision", restrictTo("admin"), decideTeamStatus);

export default router;
