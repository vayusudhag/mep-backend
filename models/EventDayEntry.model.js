import mongoose from "mongoose";

const performanceSchema = new mongoose.Schema(
  {
    rockWeightKg: {
      type: Number,
      min: 0,
      default: 0,
    },
    distanceMeters: {
      type: Number,
      min: 0,
      default: 0,
    },
    timeSeconds: {
      type: Number,
      min: 0,
      default: 0,
    },
  },
  { _id: false },
);

const eventDayEntrySchema = new mongoose.Schema(
  {
    bullSnapshots: [
      {
        bullId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Bull",
          required: true,
        },
        name: { type: String, required: true },
        category: {
          type: {
            type: String,
            enum: ["DENTITION", "AGE_GROUP", "CLASS"],
            required: true,
          },
          value: { type: String, required: true },
        },
        teamId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Team",
          required: true,
        },
        teamName: { type: String, required: true },
        ownerId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          required: false,
        },
        ownerName: { type: String, required: false },
        statusAtThatTime: {
          type: String,
          enum: ["ACTIVE", "DISQUALIFIED", "RETIRED"],
          default: "ACTIVE",
        },
      },
    ],
    event: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Event",
      required: true,
      index: true,
    },

    eventDay: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "EventDay",
      required: true,
      index: true,
    },

    teamId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Team",
      required: true,
      index: true,
    },
    captain: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Person",
      default: null,
    },

    borrowedFromTeamId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Team",
      default: null,
    },

    bulls: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Bull",
        required: true,
      },
    ],

    entryType: {
      type: String,
      enum: ["SINGLE_BULL", "PAIR_BULL"],
      required: true,
    },

    bullCategoryAtThatTime: {
      type: {
        type: String,
        enum: ["DENTITION", "AGE_GROUP", "CLASS"],
        required: true,
      },
      value: {
        type: String,
        required: true,
      },
    },

    drivers: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Person",
      },
    ],

    gameStatus: {
      type: String,
      enum: ["NEXT", "PLAYING", "COMPLETED"],
      default: "NEXT",
      index: true,
    },

    performance: performanceSchema,

    playedAt: Date,

    rank: Number,

    isFinalized: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  { timestamps: true },
);

// Validate: bull1 required, bull2 optional (not same as bull1)
eventDayEntrySchema.pre("validate", function () {
  if (!this.bulls || this.bulls.length < 1 || this.bulls.length > 2) {
    throw new Error("Entry must have 1 or 2 bulls");
  }

  if (this.bulls.length === 1 && this.entryType !== "SINGLE_BULL") {
    throw new Error("entryType must be SINGLE_BULL");
  }

  if (this.bulls.length === 2 && this.entryType !== "PAIR_BULL") {
    throw new Error("entryType must be PAIR_BULL");
  }

  if (
    this.bulls.length === 2 &&
    this.bulls[0].toString() === this.bulls[1].toString()
  ) {
    throw new Error("Paired bulls must be different");
  }
});

export default mongoose.model("EventDayEntry", eventDayEntrySchema);
