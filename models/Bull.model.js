import mongoose from "mongoose";

const bullSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 50,
    },
    teamId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Team",
      required: true,
      index: true,
    },

    currentCategory: {
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

    age: {
      type: Number,
      min: 0,
      default: null,
    },

    breed: {
      type: String,
      trim: true,
      maxlength: 80,
      default: "",
    },

    weight: {
      type: Number,
      min: 0,
      default: null,
    },

    healthStatus: {
      type: String,
      enum: ["HEALTHY", "INJURED", "UNDER_OBSERVATION", "UNFIT"],
      default: "HEALTHY",
      index: true,
    },

    imageUrl: {
      type: String,
      trim: true,
      default: null,
    },

    status: {
      type: String,
      enum: ["ACTIVE", "DISQUALIFIED", "RETIRED"],
      default: "ACTIVE",
      index: true,
    },

    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },

    deletionRequestedAt: {
      type: Date,
      default: null,
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

// Helper for category validation
bullSchema.pre("validate", function () {
  const allowedMap = {
    DENTITION: ["MILK", "TWO", "FOUR", "SIX"],
    AGE_GROUP: ["SUB_JUNIOR", "JUNIOR", "SENIOR"],
    CLASS: ["GENERAL", "NEW", "OLD"],
  };

  const allowedValues = allowedMap[this.currentCategory.type];

  if (!allowedValues || !allowedValues.includes(this.currentCategory.value)) {
    throw new Error(
      `Invalid ${this.currentCategory.type} value: ${this.currentCategory.value}`,
    );
  }
});

bullSchema.index({ isDeleted: 1, deletionRequestedAt: 1 });

export default mongoose.model("Bull", bullSchema);
