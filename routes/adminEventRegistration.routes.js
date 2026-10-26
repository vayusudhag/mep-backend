// routes/adminEventRegistration.routes.js
import express from "express";
import { protect, restrictTo } from "../middleware/auth.middleware.js";
import {
  getRegistrationsByEvent,
  updateRegistrationStatus,
} from "../controllers/adminEventRegistration.controller.js";

const router = express.Router();

router.use(protect, restrictTo("admin"));

router.get("/", getRegistrationsByEvent);

router.patch("/:registrationId", updateRegistrationStatus);

export default router;
