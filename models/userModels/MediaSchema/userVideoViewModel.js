const mongoose = require("mongoose");
const { prithuDB } = require("../../../database");


const videoViewSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: false, // Optional for guest users
      index: true
    },

    deviceId: {
      type: String, // Unique identifier for guests
      required: false,
      index: true
    },

    videoId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Feed",
      required: true,
      index: true
    },

    watchedSeconds: {
      type: Number,
      default: 0,
      min: 0
    },

    viewedAt: {
      type: Date,
      default: Date.now,
      index: true
    }
  },
  { timestamps: true }
);

// Unified Unique Index for Deduplication
videoViewSchema.index({ videoId: 1, userId: 1, deviceId: 1 }, { unique: true });

// Compound indexes for super-fast lookups
videoViewSchema.index({ videoId: 1, viewedAt: -1 });
videoViewSchema.index({ userId: 1, viewedAt: -1 });

module.exports = prithuDB.model("UserVideoView", videoViewSchema, "UserVideoView");
