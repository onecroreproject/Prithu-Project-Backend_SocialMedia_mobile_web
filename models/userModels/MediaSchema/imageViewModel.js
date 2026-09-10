const mongoose = require("mongoose");
const {prithuDB}=require("../../../database");

const imageStatsSchema = new mongoose.Schema(
  {
    imageId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Image",
      required: true,
      unique: true,
      index: true,         // ⚡ fast lookup for specific image
    },

    totalViews: {
      type: Number,
      default: 0,
      index: true,         // ⚡ supports top viewed/trending queries
    },

    uniqueUsers: {
      type: Number,
      default: 0,
    },

    lastViewed: {
      type: Date,
      index: true,         // ⚡ helps recent-views based queries
    },
  },
  {
    timestamps: true,
    minimize: true,        // removes empty fields → smaller documents
  }
);

/* 🔥 Compound index for trending logic based on views + recent activity */
imageStatsSchema.index({ totalViews: -1, lastViewed: -1 });

module.exports = prithuDB.model("ImageStats", imageStatsSchema,"ImageStats");
