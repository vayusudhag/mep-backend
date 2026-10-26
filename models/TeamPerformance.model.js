import mongoose from "mongoose";

const teamPerformanceSchema = new mongoose.Schema(
  {
    event: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Event",
      required: true,
    },
    team: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Team",
      required: true,
    },
    registrationOrder: {
      type: Number,
      required: true,
    },
    distanceCovered: {
      type: Number,
      required: true,
      min: 0,
    },
    timeTaken: {
      type: Number,
      required: true,
      min: 0,
    },
    rockWeight: {
      type: Number,
      required: true,
      min: 0,
    },
    recordedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    recordedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

// Prevent duplicate performance entries for the same team in the same event
teamPerformanceSchema.index({ event: 1, team: 1 }, { unique: true });

export default mongoose.model("TeamPerformance", teamPerformanceSchema);
