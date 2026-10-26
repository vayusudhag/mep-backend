// models/AuthAuditLog.js
import mongoose from "mongoose";

const auditSchema = new mongoose.Schema(
  {
    userId: mongoose.Schema.Types.ObjectId,
    mobileNumber: String,
    action: String,
    ip: String,
    userAgent: String,
    success: Boolean,
  },
  { timestamps: true }
);

export default mongoose.model("AuthAuditLog", auditSchema);
