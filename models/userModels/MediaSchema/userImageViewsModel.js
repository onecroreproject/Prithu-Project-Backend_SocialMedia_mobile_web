const mongoose = require("mongoose");
const { prithuDB } = require("../../../database");


const imageViewSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: false, // Optional for guest users
      index: true
    },

    deviceId: {
      type: String, // Unique identifier for guests (browser fingerprint/uuid)
      required: false,
      index: true
    },

    imageId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Image",
      required: true,
      index: true
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
// This ensures that a view is recorded only once per user (if logged in) or deviceId (if guest) per feed item.
imageViewSchema.index({ imageId: 1, userId: 1, deviceId: 1 }, { unique: true });

// Compound index for fastest analytics queries
imageViewSchema.index({ imageId: 1, viewedAt: -1 }); // For recent viewers
imageViewSchema.index({ userId: 1, viewedAt: -1 }); // For user history

module.exports = prithuDB.model("UserImageView", imageViewSchema, "UserImageView");
