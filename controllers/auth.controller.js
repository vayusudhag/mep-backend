import crypto from "crypto";
import jwt from "jsonwebtoken";
import User from "../models/Users.model.js";
import AppError from "../utils/AppError.js";
import { AuthError } from "../utils/AuthError.js";
import {
  getAuthCookieOptions,
  sendTokens,
  verifyRefreshToken,
} from "../utils/sendTokens.js";
import { sendOTP } from "../utils/sms/sendOTP.js";
import { logAuthEvent } from "../utils/logAuthEvent.js";
import { getSignedImageUrl, uploadImageToS3 } from "../utils/s3.js";

const normalizeMobile = (value) => {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith("0")) return digits.slice(1);
  return digits;
};

// SIGNUP
export const signup = async (req, res, next) => {
  try {
    const { username, mobileNumber, password } = req.body;
    const normalizedMobile = normalizeMobile(mobileNumber);

    if (!username || !normalizedMobile || !password) {
      return next(new AppError("Missing fields", 400));
    }

    const existingUser = await User.findOne({ mobileNumber: normalizedMobile });
    if (existingUser) {
      return next(new AppError("User already exists", 409));
    }

    const user = await User.create({
      username,
      mobileNumber: normalizedMobile,
      password,
    });

    const accessToken = user.signAccessToken();
    const refreshToken = user.signRefreshToken();

    sendTokens(res, accessToken, refreshToken);

    res.status(201).json({
      status: "success",
      data: {
        user: {
          id: user._id,
          username: user.username,
          role: user.role,
        },
      },
    });
  } catch (err) {
    next(err);
  }
};

// LOGIN
export const login = async (req, res, next) => {
  try {
    const { mobileNumber, password } = req.body;
    const normalizedMobile = normalizeMobile(mobileNumber);

    if (!normalizedMobile || !password) {
      return next(new AppError("Missing credentials", 400));
    }

    const user = await User.findOne({
      mobileNumber: {
        $in: [normalizedMobile, String(mobileNumber ?? "").trim()],
      },
    }).select("+password");
    if (!user) {
      return next(new AppError("Invalid credentials", 401));
    }

    const isCorrect = await user.correctPassword(password, user.password);
    if (!isCorrect) {
      return next(new AppError("Invalid credentials", 401));
    }

    user.lastLogin = new Date();
    await user.save({ validateBeforeSave: false });

    const accessToken = user.signAccessToken();
    const refreshToken = user.signRefreshToken();

    sendTokens(res, accessToken, refreshToken);

    res.status(200).json({
      status: "success",
      data: {
        user: {
          id: user._id,
          username: user.username,
          role: user.role,
        },
      },
    });
  } catch (err) {
    console.log("Login error:", err);
    next(err);
  }
};

// REFRESH ACCESS TOKEN
export const refreshAccessToken = async (req, res, next) => {
  try {
    // console.log("REFRESH ACCESS TOKEN at controller");
    // console.log(req.cookies.refreshToken);
    const refreshToken = req.cookies.refreshToken;
    if (!refreshToken) {
      return next(
        new AuthError({
          code: "NO_REFRESH_TOKEN",
        }),
      );
    }

    let decoded;
    try {
      decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_TOKEN);
    } catch (err) {
      return next(
        new AuthError({
          code: "INVALID_REFRESH_TOKEN",
        }),
      );
    }

    const user = await User.findById(decoded.id);
    if (!user) {
      return next(
        new AuthError({
          code: "USER_NOT_FOUND",
        }),
      );
    }

    // CRITICAL: invalidate old refresh tokens
    if (user.tokenVersion !== decoded.tv) {
      return next(new AuthError({ code: "TOKEN_REVOKED" }));
    }

    // Rotate refresh token properly
    // user.tokenVersion += 1;
    // await user.save();
    // already doing in model

    const newAccessToken = user.signAccessToken();
    const newRefreshToken = user.signRefreshToken();

    sendTokens(res, newAccessToken, newRefreshToken);

    res.status(200).json({
      ok: true,
      status: "success",
      data: {
        user: {
          id: user._id,
          username: user.username,
          role: user.role,
        },
      },
    });
  } catch (err) {
    next(err);
  }
};

// FORGOT PASSWORD

export const forgotPassword = async (req, res, next) => {
  try {
    let { mobileNumber } = req.body;
    if (mobileNumber !== undefined) {
      mobileNumber = String(mobileNumber).trim();
    }

    if (!mobileNumber) {
      return next(new AppError("mobileNumber required", 400));
    }

    const user = await User.findOne({ mobileNumber });
    // Always same response → anti-enumeration
    const genericResponse = {
      status: "success",
      message:
        "If the mobile number is registered, a reset code has been sent.",
    };

    if (!user) {
      return res.status(200).json(genericResponse);
    }

    // cooldown: 60 seconds
    if (user.lastOTPSentAt && Date.now() - user.lastOTPSentAt < 60 * 1000) {
      return res.status(200).json({
        status: "success",
        message:
          "If the mobile number is registered, a reset code has been sent.",
      });
    }

    const otp = user.createPasswordResetOTP();

    await user.save({ validateBeforeSave: false });

    try {
      console.log("sending otp");
      await sendOTP({
        phoneNumber: `+91${user.mobileNumber}`,
        otp,
      });
      console.log("sent otp");
    } catch {
      // NEVER leak provider failure
    }

    await logAuthEvent({
      user,
      mobileNumber,
      action: "FORGOT_PASSWORD_REQUEST",
      req,
      success: true,
    });

    res.status(200).json(genericResponse);
  } catch (err) {
    next(err);
  }
};

// RESET PASSWORD

export const resetPassword = async (req, res, next) => {
  try {
    const { mobileNumber, otp, newPassword } = req.body;

    if (!mobileNumber || !otp || !newPassword) {
      return next(new AppError("All fields required", 400));
    }

    if (!/^\d{6}$/.test(otp)) {
      await logAuthEvent({
        mobileNumber,
        action: "RESET_PASSWORD_INVALID_OTP_FORMAT",
        req,
        success: false,
      });

      return next(new AppError("Invalid OTP format", 400));
    }

    const hashedOTP = crypto.createHash("sha256").update(otp).digest("hex");

    const user = await User.findOne({ mobileNumber });

    if (!user || !user.passwordResetOTP) {
      await logAuthEvent({
        user,
        mobileNumber,
        action: "RESET_PASSWORD_NO_ACTIVE_OTP",
        req,
        success: false,
      });

      return next(new AppError("Invalid or expired OTP", 400));
    }

    // Check expiry
    if (user.passwordResetExpires < Date.now()) {
      await logAuthEvent({
        user,
        mobileNumber,
        action: "RESET_PASSWORD_TOO_MANY_ATTEMPTS",
        req,
        success: false,
      });

      return next(new AppError("OTP expired. Request a new.", 429));
    }

    // Count attempts BEFORE match
    user.passwordResetAttempts += 1;

    if (user.passwordResetAttempts > 5) {
      await user.save({ validateBeforeSave: false });
      return next(new AppError("Too many attempts. Request a new OTP.", 429));
    }

    if (user.passwordResetOTP !== hashedOTP) {
      await user.save({ validateBeforeSave: false });

      await logAuthEvent({
        user,
        mobileNumber,
        action: "RESET_PASSWORD_INVALID_OTP",
        req,
        success: false,
      });
      return next(new AppError("Invalid or expired OTP", 400));
    }

    // OTP valid → reset password
    user.password = newPassword;
    user.passwordResetOTP = undefined;
    user.passwordResetExpires = undefined;
    user.passwordResetAttempts = 0;
    user.lastOTPSentAt = undefined;

    await user.save();

    await logAuthEvent({
      user,
      mobileNumber,
      action: "RESET_PASSWORD_SUCCESS",
      req,
      success: true,
    });

    res.status(200).json({
      status: "success",
      message: "Password reset successful. Please login again.",
    });
  } catch (err) {
    next(err);
  }
};

// CHANGE PASSWORD
export const changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return next(
        new AppError("Current password and new password are required", 400),
      );
    }

    // Get user with password
    const user = await User.findById(req.user._id).select("+password");
    if (!user) {
      return next(new AppError("User not found", 404));
    }

    // Check if current password is correct
    const isCorrect = await user.correctPassword(
      currentPassword,
      user.password,
    );
    if (!isCorrect) {
      return next(new AppError("Current password is incorrect", 400));
    }

    // Update password
    user.password = newPassword;
    await user.save(); // This will hash the password and increment tokenVersion

    // Generate new tokens
    const accessToken = user.signAccessToken();
    const refreshToken = user.signRefreshToken();
    sendTokens(res, accessToken, refreshToken);

    res.status(200).json({
      status: "success",
      message: "Password changed successfully",
    });
  } catch (err) {
    next(err);
  }
};

// verify me

export const verifyUser = async (req, res, next) => {
  // Prevent caching of authentication status
  res.set("Cache-Control", "no-cache, no-store, must-revalidate");
  res.set("Pragma", "no-cache");
  res.set("Expires", "0");

  const token = req.cookies.refreshToken;

  if (!token) {
    return res.status(401).json({ message: "Not authenticated" });
  }

  try {
    const decoded = verifyRefreshToken(token);

    const user = await User.findById(decoded.id);
    if (!user) {
      return res.status(401).json({ message: "User not found" });
    }

    let bannerImageUrl = null;
    let profileImageUrl = null;
    if (user.bannerUrl) {
      bannerImageUrl = await getSignedImageUrl(user.bannerUrl);
    }
    if (user.profileUrl) {
      profileImageUrl = await getSignedImageUrl(user.profileUrl);
    }
    res.status(200).json({
      user: {
        id: user._id,
        username: user.username,
        mobileNumber: user.mobileNumber,
        role: user.role,
        bannerUrl: bannerImageUrl,
        lastLogin: user.lastLogin,
        profileUrl: profileImageUrl,
      },
    });
  } catch (err) {
    return res.status(401).json({ message: "Invalid refresh token" });
  }
};

// GET CURRENT AUTH USER (/auth/me)
export const getMe = async (req, res) => {
  const user = req.user;

  return res.status(200).json({
    status: "success",
    user: {
      _id: user._id,
      username: user.username,
      mobileNumber: user.mobileNumber,
      role: user.role,
    },
  });
};

//  LOGOUT
export const logout = async (req, res, next) => {
  try {
    // req.user is set by auth middleware
    const userId = req.user?.id;

    if (userId) {
      await User.findByIdAndUpdate(
        userId,
        { $inc: { tokenVersion: 1 } }, // revoke all tokens
        { new: true },
      );
    }

    const clearOptions = getAuthCookieOptions(undefined);

    res.clearCookie("accessToken", clearOptions);
    res.clearCookie("refreshToken", clearOptions);

    return res.status(200).json({
      status: "success",
      message: "Logged out successfully",
    });
  } catch (err) {
    next(err);
  }
};

export const uploadBannerImage = async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: "No image uploaded" });
  }

  const userId = req.user.id;

  // users/{userId}/banner.
  const key = await uploadImageToS3(req.file, `users/banners/${userId}`);
  await User.findByIdAndUpdate(userId, {
    bannerUrl: key,
  });

  const signedUrl = await getSignedImageUrl(key);

  res.status(200).json({
    message: "Banner image uploaded successfully",
    bannerUrl: signedUrl,
    key,
  });
};

export const uploadProfileImage = async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: "No image uploaded" });
  }

  const userId = req.user.id;

  const key = await uploadImageToS3(req.file, `users/profile/${userId}`);
  await User.findByIdAndUpdate(userId, {
    profileUrl: key,
  });

  const signedUrl = await getSignedImageUrl(key);

  res.status(200).json({
    message: "Profile image uploaded successfully",
    profileUrl: signedUrl,
    key,
  });
};
