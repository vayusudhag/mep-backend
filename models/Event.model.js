import mongoose from "mongoose";

const eventSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 150,
    },

    description: {
      type: String,
      maxlength: 2000,
    },

    location: {
      name: {
        type: String,
        required: true,
        trim: true,
        maxlength: 150,
      },
      googleMapUrl: {
        type: String,
        required: true,
        trim: true,
      },
    },

    timings: {
      from: {
        type: Date,
        required: true,
      },
      to: {
        type: Date,
        required: true,
      },
    },

    prizeMoney: {
      type: Number,
      required: true,
      min: 0,
    },

    state: {
      type: String,
      enum: ["UPCOMING", "ONGOING", "COMPLETED"],
      default: "UPCOMING",
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true },
);

// sanity check: end date must be after start date
eventSchema.pre("validate", function () {
  if (!this.timings || !this.timings.from || !this.timings.to) {
    return new Error("Event timings are required");
  }

  if (this.timings.to <= this.timings.from) {
    return new Error("Event end date must be after start date");
  }
});

const validTransitions = {
  UPCOMING: ["ONGOING"],
  ONGOING: ["COMPLETED"],
  COMPLETED: [],
};

eventSchema.pre("save", function () {
  if (!this.isModified("state")) return;

  const prev = this.$locals.previousState;
  if (prev && !validTransitions[prev].includes(this.state)) {
    return new Error(`Invalid state transition ${prev} → ${this.state}`);
  }
});

eventSchema.pre("init", function (doc) {
  this.$locals.previousState = doc.state;
});

export default mongoose.model("Event", eventSchema);
