import express from "express";
import {
  signup,
  login,
  logout,
  forgotPassword,
  resetPassword,
  refreshAccessToken,
  changePassword,
  verifyUser,
  getMe,
  uploadBannerImage,
  uploadProfileImage,
} from "../controllers/auth.controller.js";
import { protect } from "../middleware/auth.middleware.js";
import {
  forgotPasswordLimiter,
  resetPasswordLimiter,
  loginLimiter,
  signupLimiter,
} from "../middleware/rateLimit.js";
import multer from "multer";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
});

const router = express.Router();

router.post("/signup", signupLimiter, signup);
router.post("/login", loginLimiter, login);
router.post("/refresh", refreshAccessToken);
router.post("/forgot-password", forgotPasswordLimiter, forgotPassword);
router.post("/reset-password", resetPasswordLimiter, resetPassword);
router.get("/verify", verifyUser);

router.use(protect);
router.get("/me", getMe);
router.post("/logout", logout);
router.post("/change-password", changePassword);
router.patch("/banner-image", upload.single("image"), uploadBannerImage);
router.patch("/profile-image", upload.single("image"), uploadProfileImage);

export default router;
