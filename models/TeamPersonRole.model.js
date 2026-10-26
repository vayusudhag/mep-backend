import mongoose from "mongoose";

const teamPersonRoleSchema = new mongoose.Schema(
  {
    teamId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Team",
      required: true,
      index: true,
    },

    personId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Person",
      required: true,
      index: true,
    },

    role: {
      type: String,
      enum: ["OWNER", "DRIVER", "TRAINER", "HELPER", "CAPTAIN", "OTHER"],
      required: true,
    },
    info: {
      type: String,
      trim: true,
      default: "",
    },

    joinedAt: {
      type: Date,
      default: Date.now,
    },

    leftAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true },
);

teamPersonRoleSchema.index(
  { teamId: 1, personId: 1, role: 1, leftAt: 1 },
  { unique: true },
);

export default mongoose.model("TeamPersonRole", teamPersonRoleSchema);
