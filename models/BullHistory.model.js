import mongoose from "mongoose";

const bullHistorySchema = new mongoose.Schema(
  {
    bull: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Bull",
      required: true,
      index: true,
      immutable: true,
    },

    type: {
      type: String,
      enum: ["CATEGORY_CHANGE", "EVENT_RESULT"],
      required: true,
      index: true,
      immutable: true,
    },

    // ---- CATEGORY CHANGE ----
    fromCategory: {
      type: String,
    },
    toCategory: {
      type: String,
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    // ---- EVENT RESULT ----
    event: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Event",
    },
    eventDay: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "EventDay",
    },
    result: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "EventResult",
    },

    // Snapshot at time of record
    categoryAtThatTime: {
      type: {
        type: String,
        enum: ["DENTITION", "AGE_GROUP", "CLASS"],
      },
      value: String,
    },

    createdAt: {
      type: Date,
      default: Date.now,
      immutable: true,
    },
  },
  {
    strict: true,
  },
);

bullHistorySchema.index({ bull: 1, createdAt: 1 });

export default mongoose.model("BullHistory", bullHistorySchema);
