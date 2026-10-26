import mongoose from "mongoose";

const eventResultSchema = new mongoose.Schema(
  {
    // ---- CONTEXT (IMMUTABLE SNAPSHOT) ----
    event: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Event",
      required: true,
      index: true,
      immutable: true,
    },

    eventDay: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "EventDay",
      required: true,
      index: true,
      immutable: true,
    },

    bull: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Bull",
      required: true,
      index: true,
      immutable: true,
    },

    // Snapshot of team at the time of play (DO NOT UPDATE EVER)
    team: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Team",
      required: true,
      immutable: true,
    },

    // Optional: only for paired runs (informational, not authoritative)
    partnerBull: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Bull",
      immutable: true,
    },

    // ---- CATEGORY SNAPSHOT ----
    categoryAtPlay: {
      type: {
        type: String,
        enum: ["DENTITION", "AGE_GROUP", "CLASS"],
        required: true,
        immutable: true,
      },
      value: {
        type: String,
        required: true,
        immutable: true,
      },
    },

    // ---- PERFORMANCE METRICS (FLEXIBLE) ----
    // Allows future categories without schema changes
    performance: {
      type: Map,
      of: Number,
      required: true,
    },

    // ---- RESULT STATE ----
    status: {
      type: String,
      enum: ["VALID", "DQ", "DNS"],
      default: "VALID",
      index: true,
    },

    // Rank can be null until finalized or if DQ/DNS
    rank: {
      type: Number,
      min: 1,
    },

    prizeWon: {
      type: Number,
      default: 0,
      min: 0,
    },

    finalizedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
    strict: true,
  },
);

/**
 * HARD IMMUTABILITY GUARANTEE
 * After creation, NOTHING can be modified except:
 * - rank
 * - prizeWon
 * - status
 * - finalizedAt
 */
eventResultSchema.pre("save", function () {
  if (!this.isNew) {
    const allowedUpdates = ["rank", "prizeWon", "status", "finalizedAt"];
    const modified = this.modifiedPaths();

    const illegalUpdates = modified.filter(
      (field) => !allowedUpdates.includes(field),
    );

    if (illegalUpdates.length > 0) {
      throw new Error(
        `EventResult is immutable. Illegal updates: ${illegalUpdates.join(
          ", ",
        )}`,
      );
    }
  }
});

// One bull → one result → one event day (absolute rule)
eventResultSchema.index({ eventDay: 1, bull: 1 }, { unique: true });

// Fast leaderboard queries
eventResultSchema.index({ eventDay: 1, rank: 1 });
eventResultSchema.index({ event: 1, status: 1 });

export default mongoose.model("EventResult", eventResultSchema);
