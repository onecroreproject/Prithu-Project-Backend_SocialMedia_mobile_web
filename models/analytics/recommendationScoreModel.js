const mongoose = require("mongoose");
const { prithuDB } = require("../../database");

const RecommendationScoreSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    feedId: { type: mongoose.Schema.Types.ObjectId, ref: "Feed", required: true, index: true },
    score: { type: Number, default: 0 },
    lastCalculated: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

// Compound index for fast lookup of recommendations for a user
RecommendationScoreSchema.index({ userId: 1, score: -1 });
// Ensure unique score entry per user-feed pair
RecommendationScoreSchema.index({ userId: 1, feedId: 1 }, { unique: true });

module.exports = prithuDB.model("RecommendationScore", RecommendationScoreSchema, "RecommendationScores");
