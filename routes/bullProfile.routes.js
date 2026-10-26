import express from "express";
import { getBullProfile } from "../controllers/bullProfile.controller.js";

const router = express.Router();

// Public: Bull profile
router.get("/:bullId", getBullProfile);

export default router;
