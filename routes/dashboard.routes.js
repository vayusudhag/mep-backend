import express from "express";
import { getDashboardCounts } from "../controllers/dashboard.controller.js";

const router = express.Router();

// Get dashboard counts
router.get("/counts", getDashboardCounts);

export default router;
