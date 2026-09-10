const mongoose = require("mongoose");
const {prithuDB}=require("../../../database");


const videoStatsSchema = new mongoose.Schema(
  {
    videoId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Feed",
      required: true,
      unique: true,         // ensures one stats document per video
      index: true,          // faster lookups
    },

    totalViews: {
      type: Number,
      default: 0,
      index: true,          // supports sorting for trending/most viewed videos
    },

    totalDuration: {
      type: Number,
      default: 0,
      // total user watch-time in seconds (or ms)
    },

    uniqueUsers: {
      type: Number,
      default: 0,
    },

    lastViewed: {
      type: Date,
      index: true,          // helps find recently viewed videos
    },
  },
  {
    timestamps: true,
    minimize: true,           // removes empty fields
  }
);

/* 🔥 Compound Index (Best for Trending Queries)
   - Sorts by views first, then recent activity
*/
videoStatsSchema.index({ totalViews: -1, lastViewed: -1 });

module.exports = prithuDB.model("VideoStats", videoStatsSchema,"VideoStats");
