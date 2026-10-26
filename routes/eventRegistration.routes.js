import express from "express";
import { protect } from "../middleware/auth.middleware.js";
import {
  registerForEvent,
  getMyRegistrationStatus,
  getApprovedRegistrations,
} from "../controllers/eventRegistration.controller.js";

const router = express.Router();

router.get("/:eventId/participants", getApprovedRegistrations);
router.get("/:eventId/registrations/approved", getApprovedRegistrations);

router.post("/:eventId/register", protect, registerForEvent);
router.post("/:eventId/registrations", protect, registerForEvent);
router.get("/:eventId/my-registration", protect, getMyRegistrationStatus);

export default router;
