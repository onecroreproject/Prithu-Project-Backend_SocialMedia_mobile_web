const mongoose = require("mongoose");
const User = require("../models/userModels/userModel");
const Feed = require("../models/feedModel");
const UserFeedAnalytics = require("../models/analytics/userFeedAnalyticsModel");
const RecommendationScore = require("../models/analytics/recommendationScoreModel");

/**
 * 🔄 Recalculate scores for all active users
 */
const recalculateAllScores = async () => {
  console.log("🔄 Starting recommendation score recalculation...");
  const startTime = Date.now();

  try {
    // 1. Get active users (e.g., active in last 7 days)
    const activeUsers = await User.find({ 
      lastActiveAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } 
    }).select("_id categoryPreference").lean();

    console.log(`👥 Processing ${activeUsers.length} active users`);

    for (const user of activeUsers) {
      // 2. Get user's recent analytics
      const userAnalytics = await UserFeedAnalytics.find({ userId: user._id }).lean();
      
      // 3. Get potential feeds (trending/recent)
      const potentialFeeds = await Feed.find({
        isApproved: true,
        status: "published",
        createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } // Last 30 days
      }).limit(500).lean();

      const scoreUpdates = [];

      for (const feed of potentialFeeds) {
        const analytics = userAnalytics.find(a => a.feedId.toString() === feed._id.toString()) || {};
        
        let score = 0;
        
        // Weighted Scoring Logic
        // watchTime (35%)
        const watchTimeScore = Math.min(analytics.watchTime || 0, 60) / 60 * 100;
        score += watchTimeScore * 0.35;

        // engagement (likes 20%, saves 15%, comments 10%, shares 10%)
        if (analytics.liked) score += 20;
        if (analytics.saved) score += 15;
        if (analytics.commented) score += 10;
        if (analytics.shared) score += 10;

        // Category Preference (5%)
        const hasMatch = (feed.category || []).some(catId => 
          (user.categoryPreference || []).some(pref => pref.categoryId.toString() === catId.toString())
        );
        if (hasMatch) score += 5;

        // Trending (5%)
        const trendingBoost = Math.min(feed.playbackStats?.totalViews || 0, 1000) / 1000 * 5;
        score += trendingBoost;

        // Penalty
        if (analytics.skipped) score -= 50;
        if (analytics.notInterested) score -= 200;

        if (score > 0) {
          scoreUpdates.push({
            updateOne: {
              filter: { userId: user._id, feedId: feed._id },
              update: { score, lastCalculated: new Date() },
              upsert: true
            }
          });
        }
      }

      if (scoreUpdates.length > 0) {
        await RecommendationScore.bulkWrite(scoreUpdates);
      }
    }

    console.log(`✅ Recalculation complete in ${(Date.now() - startTime) / 1000}s`);
  } catch (err) {
    console.error("❌ Recalculation Error:", err);
  }
};

module.exports = { recalculateAllScores };
