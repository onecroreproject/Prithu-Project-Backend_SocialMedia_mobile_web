const mongoose = require("mongoose");
const { prithuDB } = require("../../database");

const UserFeedAnalyticsSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true },
    feedId: { type: mongoose.Schema.Types.ObjectId, ref: "Feed", required: true, index: true },
    
    // Watch Time Metrics
    watchTime: { type: Number, default: 0 }, // Total seconds spent viewing
    percentageWatched: { type: Number, default: 0 }, // (watchTime / feedDuration) * 100
    impressionTime: { type: Date, default: Date.now },
    openTimestamp: { type: Date },
    closeTimestamp: { type: Date },
    
    // Engagement Actions
    clickCount: { type: Number, default: 0 },
    liked: { type: Boolean, default: false },
    shared: { type: Boolean, default: false },
    commented: { type: Boolean, default: false },
    saved: { type: Boolean, default: false },
    skipped: { type: Boolean, default: false }, // Stopped viewing quickly
    notInterested: { type: Boolean, default: false },
    
    // Video Specific Metrics
    pauseCount: { type: Number, default: 0 },
    replayCount: { type: Number, default: 0 },
    scrollStopDuration: { type: Number, default: 0 }, // Duration user stayed on this feed without scrolling
    
    // Device & Context
    deviceType: { type: String, enum: ["mobile", "desktop", "tablet", "web"], default: "web" },
    location: {
      type: { type: String, enum: ["Point"], default: "Point" },
      coordinates: { type: [Number], default: [0, 0] }, // [longitude, latitude]
    },
    
    // Session Info
    sessionId: { type: String, index: true },
    sessionDuration: { type: Number, default: 0 },
    
    // ML Recommendation Info
    recoSource: { type: String, default: "trending" }, // e.g. "collaborative", "content-based", "trending", "search"
    recoScore: { type: Number, default: 0 }
  },
  { timestamps: true }
);

// Indexes for fast retrieval and aggregation
UserFeedAnalyticsSchema.index({ userId: 1, feedId: 1, sessionId: 1 }, { unique: true });
UserFeedAnalyticsSchema.index({ userId: 1, createdAt: -1 });
UserFeedAnalyticsSchema.index({ feedId: 1, watchTime: -1 });
UserFeedAnalyticsSchema.index({ "location.coordinates": "2dsphere" });

module.exports = prithuDB.model("UserFeedAnalytics", UserFeedAnalyticsSchema, "UserFeedAnalytics");
