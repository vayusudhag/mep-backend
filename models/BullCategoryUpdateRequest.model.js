import mongoose from "mongoose";

const bullCategoryUpdateRequestSchema = new mongoose.Schema(
  {
    bull: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Bull",
      required: true,
      index: true,
    },
    
    team: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Team",
      required: true,
    },

    fromCategory: {
      type: String,
      enum: ["MILK_TEETH", "TWO_TEETH", "FOUR_TEETH", "JUNIOR", "SENIOR"],
      required: true,
    },

    toCategory: {
      type: String,
      enum: ["MILK_TEETH", "TWO_TEETH", "FOUR_TEETH", "JUNIOR", "SENIOR"],
      required: true,
    },

    reason: {
      type: String,
      required: true,
    },

    status: {
      type: String,
      enum: ["PENDING", "APPROVED", "REJECTED"],
      default: "PENDING",
      index: true,
    },

    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    reviewedAt: {
      type: Date,
    },
  },
  { timestamps: true }
);

export default mongoose.model("BullCategoryUpdateRequest", bullCategoryUpdateRequestSchema);
