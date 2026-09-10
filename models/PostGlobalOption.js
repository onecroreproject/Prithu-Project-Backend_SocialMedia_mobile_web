const mongoose = require("mongoose");
const { prithuDB } = require("../database");

const weekGodItemSchema = new mongoose.Schema(
  {
    day: {
      type: String,
      required: true,
      enum: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
      trim: true,
    },
    godName: {
      type: String,
      required: true,
      trim: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

const specialDayItemSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    date: {
      type: String, // Format: "YYYY-MM-DD"
      required: true,
      trim: true,
    },
    dayOfWeek: {
      type: String,
      trim: true,
      default: "",
    },
    isRecurringYearly: {
      type: Boolean,
      default: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

const sessionDetailSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    startTime: {
      type: String,
      default: "",
    },
    endTime: {
      type: String,
      default: "",
    },
    timeRange: {
      type: String,
      default: "",
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

const postGlobalOptionSchema = new mongoose.Schema(
  {
    singletonId: {
      type: String,
      default: "global_post_options",
      unique: true,
    },
    sessions: {
      type: [String],
      default: ["Morning", "Afternoon", "Evening", "Night"],
    },
    sessionsDetailed: [sessionDetailSchema],
    days: {
      type: [String],
      default: [
        "Monday",
        "Tuesday",
        "Wednesday",
        "Thursday",
        "Friday",
        "Saturday",
        "Sunday",
      ],
    },
    weekGods: [weekGodItemSchema],
    specialDays: [specialDayItemSchema],
  },
  { timestamps: true }
);

module.exports = prithuDB.model("PostGlobalOption", postGlobalOptionSchema, "PostGlobalOptions");
