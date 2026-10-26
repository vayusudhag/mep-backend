// utils/logAuthEvent.js
import AuthAuditLog from "../models/AuthAuditLog.js";

export const logAuthEvent = async ({
  user,
  mobileNumber,
  action,
  req,
  success,
}) => {
  try {
    await AuthAuditLog.create({
      userId: user?._id,
      mobileNumber,
      action,
      ip: req.ip,
      userAgent: req.headers["user-agent"],
      success,
    });
  } catch {
    // logging must NEVER break auth
  }
};
