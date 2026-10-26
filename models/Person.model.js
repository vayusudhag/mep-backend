import mongoose from "mongoose";

const personSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 50,
    },

    phone: {
      type: String,
      match: /^[6-9]\d{9}$/,
      index: true,
      default: null, // optional
    },

    identityLevel: {
      type: String,
      enum: ["VERIFIED", "UNVERIFIED"],
      default: "UNVERIFIED",
      index: true,
    },

    linkedUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true },
);

// Auto-upgrade identity level
personSchema.pre("save", function () {
  if (this.phone) {
    this.identityLevel = "VERIFIED";
  }
});

export default mongoose.model("Person", personSchema);
