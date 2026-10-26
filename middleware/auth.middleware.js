// AUTHENTICATION MIDDLEWARE
import jwt from "jsonwebtoken";
import User from "../models/Users.model.js";
import AppError from "../utils/AppError.js";
import { AuthError } from "../utils/AuthError.js";

export const protect = async (req, res, next) => {
  try {
    if (req.method === "OPTIONS") return next();

    const token = req.cookies?.accessToken;

    // console.log("Cookies", req.cookies);
    // console.log("checking Token at protect", token);

    if (!token) {
      return next(
        new AuthError({
          code: "NO_ACCESS_TOKEN",
          message: "Access token missing",
        }),
      );
    }

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_ACCESS_TOKEN);
    } catch (e) {
      if (e?.name === "TokenExpiredError") {
        return next(
          new AuthError({
            code: "TOKEN_EXPIRED",
            message: "Access token expired",
          }),
        );
      }
      return next(
        new AuthError({
          code: "INVALID_ACCESS_TOKEN",
          message: "Invalid access token",
        }),
      );
    }

    const user = await User.findById(decoded.id);

    // console.log("DB tokenVersion:", user.tokenVersion);
    // console.log("Token tv:", decoded.tv);
    // console.log("Auth header:", req.headers.authorization);
    // console.log("Cookie token exists:", !!req.cookies.accessToken);

    if (!user) {
      return next(
        new AuthError({
          code: "USER_NOT_FOUND",
          message: "User no longer exists",
        }),
      );
    }

    if (user.tokenVersion !== decoded.tv) {
      return next(
        new AuthError({
          code: "TOKEN_INVALIDATED",
          message: "Access token invalidated",
        }),
      );
    }

    if (user.changedPasswordAfter(decoded.iat)) {
      return next(
        new AuthError({
          code: "PASSWORD_CHANGED",
          message: "Password changed after token issued",
        }),
      );
    }

    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
};

// RESTRICT TO (AUTHORIZATION MIDDLEWARE)
export const restrictTo =
  (...roles) =>
  (req, res, next) => {
    // console.log("Restricted too", req.user);
    console.log("Restricted too roles", roles);
    const userRole = (req.user?.role || "").toLowerCase();
    const allowedRoles = roles.map((r) => String(r).toLowerCase());
    if (!allowedRoles.includes(userRole)) {
      return next(new AppError("Permission denied", 403));
    }
    next();
  };
