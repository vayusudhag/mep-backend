import mongoose from "mongoose";

const eventDaySchema = new mongoose.Schema(
  {
    event: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Event",
      required: true,
      index: true,
    },

    date: {
      type: Date,
      required: true,
      index: true,
    },
    dayKey: {
      type: String,
      required: true,
      index: true,
    },

    timings: {
      from: {
        type: String,
        required: true,
        match: [/^\d{2}:\d{2}$/, "timings.from must be in HH:mm format"],
      },
      to: {
        type: String,
        required: true,
        match: [/^\d{2}:\d{2}$/, "timings.to must be in HH:mm format"],
      },
    },

    category: {
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

    prizeMoney: {
      type: Number,
      min: 0,
      required: true,
    },

    status: {
      type: String,
      enum: ["UPCOMING", "ONGOING", "COMPLETED"],
      default: "UPCOMING",
      index: true,
    },
  },
  { timestamps: true },
);

eventDaySchema.index(
  {
    event: 1,
    dayKey: 1,
    "category.type": 1,
    "category.value": 1,
    "timings.from": 1,
    "timings.to": 1,
  },
  { unique: true },
);

export default mongoose.model("EventDay", eventDaySchema);
