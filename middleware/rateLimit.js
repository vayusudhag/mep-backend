// middlewares/rateLimit.js
import rateLimit from "express-rate-limit";

export const forgotPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: 5, // 5 requests
  standardHeaders: true,
  legacyHeaders: false,
});

export const resetPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5, // OTP attempts handled separately
  standardHeaders: true,
  legacyHeaders: false,
});

// Brute-force protection for credential entry (per IP).
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { status: "fail", message: "Too many login attempts. Try again later." },
});

// Limit account creation per IP to curb abuse.
export const signupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { status: "fail", message: "Too many accounts created. Try again later." },
});
