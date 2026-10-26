import express from "express";
import { protect, restrictTo } from "../middleware/auth.middleware.js";
import {
  createBull,
  listBullsByTeam,
  requestCategoryUpdate,
  approveCategoryUpdate,
  rejectCategoryUpdate,
  listAllBulls,
  scheduleBullDelete,
  revokeBullDelete,
} from "../controllers/bull.controller.js";

const router = express.Router();

router.get("/", listBullsByTeam);
router.get("/all", listAllBulls);
router.get("/:bullId", (req, res, next) => {
  res
    .status(404)
    .json({ status: "fail", message: "Use /api/bulls/profile/:bullId" });
});

router.post("/", protect, createBull);
router.delete("/:bullId", protect, scheduleBullDelete);
router.patch("/:bullId/revoke-delete", protect, revokeBullDelete);
router.post("/category-update-requests", protect, requestCategoryUpdate);

router.patch(
  "/category-update-requests/:requestId/approve",
  protect,
  restrictTo("admin"),
  approveCategoryUpdate,
);
router.patch(
  "/category-update-requests/:requestId/reject",
  protect,
  restrictTo("admin"),
  rejectCategoryUpdate,
);

export default router;
