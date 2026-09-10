const mongoose = require("mongoose");
const { prithuDB } = require("../database");

const TrendingCreatorsSchema = new mongoose.Schema(
  {
    // User reference — MUST BE indexed for fast lookup
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },

    // Cached user identity (reduces lookup cost)
    userName: {
      type: String,
      trim: true,
      index: true, // allows search/filter by username
    },

    profileAvatar: {
      type: String,
      default: "",
    },

    // 🧮 Performance-critical stats with defaults
    trendingScore: {
      type: Number,
      default: 0,
      index: true, // used for sorting trending creators
    },

    totalVideoViews: {
      type: Number,
      default: 0,
    },

    totalImageViews: {
      type: Number,
      default: 0,
    },

    totalLikes: {
      type: Number,
      default: 0,
    },

    totalShares: {
      type: Number,
      default: 0,
    },

    followerCount: {
      type: Number,
      default: 0,
      index: true, // useful filter for ranking
    },

    // Useful timestamp for recalculating trending scores
    lastUpdated: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    timestamps: true, // automatically adds createdAt & updatedAt
    versionKey: false,
  }
);

/* ----------------------------------------
 * 🚀 INDEXES — MASSIVE PERFORMANCE BOOST
 * ----------------------------------------
 */

// Sort by trending score quickly
TrendingCreatorsSchema.index({ trendingScore: -1 });

// Fetch top creators based on engagement
TrendingCreatorsSchema.index({ totalLikes: -1 });
TrendingCreatorsSchema.index({ totalShares: -1 });
TrendingCreatorsSchema.index({ totalVideoViews: -1 });
TrendingCreatorsSchema.index({ totalImageViews: -1 });

// Ranking by followers
TrendingCreatorsSchema.index({ followerCount: -1 });

// Search creators by name (case insensitive)
TrendingCreatorsSchema.index({ userName: "text" });

module.exports = prithuDB.model(
  "TrendingCreators",
  TrendingCreatorsSchema,
  "TrendingCreators"
);
