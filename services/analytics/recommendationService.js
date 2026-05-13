const Feed = require("../../models/feedModel");
const UserFeedAnalytics = require("../../models/analytics/userFeedAnalyticsModel");
const RecommendationScore = require("../../models/analytics/recommendationScoreModel");
const User = require("../../models/userModels/userModel");
const mongoose = require("mongoose");
const axios = require("axios");

const ML_SERVICE_URL = process.env.ML_SERVICE_URL || "http://localhost:8001";

/**
 * 🤖 Fetch advanced similarity-based recommendations from Python ML service
 */
const fetchMLRecommendations = async (userId, feedId, excludeIds, limit) => {
  try {
    const response = await axios.get(`${ML_SERVICE_URL}/recommend`, {
      params: { user_id: userId, feed_id: feedId, exclude_ids: excludeIds, limit }
    });
    return response.data.recommended_reels || [];
  } catch (err) {
    console.error("⚠️ ML Service unreachable:", err.message);
    return [];
  }
};

/**
 * 🎯 Calculate recommendation score for a user and feed
 * score = watchTime * 0.35 + likes * 0.20 + save * 0.15 + comment * 0.10 + share * 0.10 + searchMatch * 0.05 + trending * 0.05
 */
const calculateScore = (analytics, feed, user) => {
  let score = 0;

  // 1. Watch Time (normalized to 100 max)
  const watchTimeScore = Math.min(analytics.watchTime || 0, 60) / 60 * 100;
  score += watchTimeScore * 0.35;

  // 2. Likes
  if (analytics.liked) score += 100 * 0.20;

  // 3. Saves
  if (analytics.saved) score += 100 * 0.15;

  // 4. Comments
  if (analytics.commented) score += 100 * 0.10;

  // 5. Shares
  if (analytics.shared) score += 100 * 0.10;

  // 6. Search Match (if feed categories match user's preferred categories)
  const userPrefs = user.categoryPreference || [];
  const feedCats = feed.category || [];
  const hasMatch = feedCats.some(catId => 
    userPrefs.some(pref => pref.categoryId.toString() === catId.toString())
  );
  if (hasMatch) score += 100 * 0.05;

  // 7. Trending boost
  const trendingBoost = Math.min(feed.playbackStats?.totalViews || 0, 1000) / 1000 * 100;
  score += trendingBoost * 0.05;

  // Reduce score for skipped or not interested
  if (analytics.skipped) score -= 50;
  if (analytics.notInterested) score -= 200;

  return score;
};

/**
 * 🚀 Get personalized recommended feeds
 */
exports.getRecommendedFeeds = async (userId, page = 1, limit = 10) => {
  try {
    const user = await User.findById(userId).lean();
    if (!user) return [];

    // Fetch analytics for this user to calculate scores
    const userAnalytics = await UserFeedAnalytics.find({ userId }).select("feedId").lean();
    const seenFeedIds = userAnalytics.map(a => a.feedId);
    
    // In a real production app, we would use a pre-calculated RecommendationScore collection
    // or an aggregation pipeline. For now, we'll build a hybrid approach.
    
    // 1. Fetch from ML Service (Advanced Content-Based Similarity)
    const mlRecos = await fetchMLRecommendations(userId, null, seenFeedIds, limit);
    const mlFeedIds = mlRecos.map(r => r.feed_id);

    // 2. Fetch local potential feeds (trending + user preferences) for fallback/blending
    const preferredCategoryIds = (user.categoryPreference || []).map(p => p.categoryId);
    
    let query = {
      isApproved: true,
      status: "published",
      _id: { $nin: [...seenFeedIds, ...mlFeedIds] } // Exclude seen and already fetched by ML
    };

    if (preferredCategoryIds.length > 0) {
      query.category = { $in: preferredCategoryIds };
    }

    const localFeeds = await Feed.find(query)
      .sort({ "playbackStats.totalViews": -1, createdAt: -1 })
      .limit(limit) 
      .lean();

    // 3. Blend Results
    const mlFeeds = await Feed.find({ _id: { $in: mlFeedIds } }).lean();
    
    // Maintain ML order but keep feed objects
    const sortedMlFeeds = mlFeedIds.map(id => mlFeeds.find(f => f._id.toString() === id.toString())).filter(Boolean);

    const finalFeeds = [...sortedMlFeeds, ...localFeeds].slice(0, limit);

    return finalFeeds;
  } catch (err) {
    console.error("❌ getRecommendedFeeds Error:", err);
    return [];
  }
};
