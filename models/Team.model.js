import mongoose from "mongoose";

const teamSchema = new mongoose.Schema(
  {
    teamName: {
      type: String,
      required: true,
      trim: true,
      minlength: 3,
      maxlength: 50,
      unique: true,
    },

    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      // unique constraint enforced by explicit sparse index below to tolerate legacy null values
    },

    teamLocation: {
      village: { type: String, trim: true },
      district: { type: String, trim: true },
      state: { type: String, trim: true },
    },

    status: {
      type: String,
      enum: ["PENDING", "APPROVED", "REJECTED"],
      default: "PENDING",
      index: true,
    },

    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    approvedAt: {
      type: Date,
    },

    rejectedReason: {
      type: String,
    },

    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },

    deletedAt: {
      type: Date,
      default: null,
      index: true,
    },
  },
  { timestamps: true },
);

teamSchema.virtual("bulls", {
  ref: "Bull",
  localField: "_id",
  foreignField: "teamId",
});

teamSchema.set("toJSON", { virtuals: true });
teamSchema.set("toObject", { virtuals: true });

// Ensure unique owner per team, but ignore documents where ownerId is null (legacy garbage)
teamSchema.index({ ownerId: 1 }, { unique: true, sparse: true });

export default mongoose.model("Team", teamSchema);
