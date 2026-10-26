// models/EventRegistration.js
import mongoose from "mongoose";

const registrationEntrySchema = new mongoose.Schema(
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
    borrowedFromTeamId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Team",
      default: null,
    },
  },
  { _id: false },
);

registrationEntrySchema.pre("validate", function () {
  if (!Array.isArray(this.bulls) || this.bulls.length < 1 || this.bulls.length > 2) {
    throw new Error("Each entry must contain 1 or 2 bulls");
  }

  if (this.bulls.length === 1 && this.entryType !== "SINGLE_BULL") {
    throw new Error("entryType must be SINGLE_BULL when exactly 1 bull is selected");
  }

  if (this.bulls.length === 2 && this.entryType !== "PAIR_BULL") {
    throw new Error("entryType must be PAIR_BULL when exactly 2 bulls are selected");
  }

  if (
    this.bulls.length === 2 &&
    String(this.bulls[0]) === String(this.bulls[1])
  ) {
    throw new Error("Entry cannot contain duplicate bulls");
  }
});

const eventRegistrationSchema = new mongoose.Schema(
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

    captain: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Person",
      required: true,
    },
    contactMobile: {
      type: String,
      required: true,
      trim: true,
      match: [/^\d{10}$/, "Please enter a valid 10-digit mobile number"],
    },

    entries: {
      type: [registrationEntrySchema],
      required: true,
      validate: {
        validator: (v) => Array.isArray(v) && v.length > 0,
        message: "At least one entry is required",
      },
    },
    teamMembers: {
      type: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Person",
          required: true,
        },
      ],
      validate: {
        validator: (v) => Array.isArray(v) && v.length >= 5,
        message: "At least 5 team members are required",
      },
    },

    status: {
      type: String,
      enum: ["PENDING", "APPROVED", "REJECTED"],
      default: "PENDING",
    },

    registeredBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    approvedAt: {
      type: Date,
    },

    adminNotes: {
      type: String,
      trim: true,
    },
  },
  { timestamps: true },
);

// One team can register once per event
eventRegistrationSchema.index({ event: 1, team: 1 }, { unique: true });

export default mongoose.model("EventRegistration", eventRegistrationSchema);
