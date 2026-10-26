import express from "express";
import { getAllDrivers } from "../controllers/driver.controller.js";

const router = express.Router();

// Public: list drivers with stats
router.get("/", getAllDrivers);

export default router;
