import mongoose from "mongoose";

const teamAuditSchema = new mongoose.Schema(
  {
    team: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Team",
      required: true,
      index: true,
    },
    action: {
      type: String,
      enum: [
        "CREATED",
        "APPROVED",
        "REJECTED",
        "ROSTER_UPDATED",
        "ADMIN_TEAM_UPDATED",
        "ADMIN_TEAM_DELETED",
        "ADMIN_MEMBER_CREATED",
        "ADMIN_MEMBER_UPDATED",
        "ADMIN_MEMBER_DELETED",
        "ADMIN_BULL_CREATED",
        "ADMIN_BULL_UPDATED",
        "ADMIN_BULL_DELETED",
      ],
      required: true,
    },
    performedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    metadata: Object,
  },
  { timestamps: true }
);

export default mongoose.model("TeamAudit", teamAuditSchema);
