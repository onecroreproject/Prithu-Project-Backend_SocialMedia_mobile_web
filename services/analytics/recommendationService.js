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
    const response = await axios.post(`${ML_SERVICE_URL}/recommend`, {
      userId: userId, 
      feedId: feedId, 
      excludeIds: excludeIds, 
      limit: limit
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

    const HiddenPost = require("../../models/userModels/hiddenPostSchema");
    const UserFeedActions = require("../../models/userFeedInterSectionModel");
    const mlRecommendationService = require("../mlRecommendationService");

    // 1. Gather all exclusions (Hidden, Watched, Shown in Redis, Disliked)
    const [hiddenPosts, userFeedActionsDoc, shownFeedIds] = await Promise.all([
      HiddenPost.find({ userId }).select("postId -_id").lean(),
      UserFeedActions.findOne({ userId }).select("watchedFeeds.feedId likedFeeds.feedId savedFeeds.feedId disLikeFeeds.feedId").lean(),
      mlRecommendationService.getShownFeeds(userId)
    ]);

    const hiddenPostIds = hiddenPosts.map(h => h.postId.toString());
    const watchedFeedIds = (userFeedActionsDoc?.watchedFeeds || []).map(w => w.feedId.toString());
    const dislikedFeedIds = (userFeedActionsDoc?.disLikeFeeds || []).map(d => d.feedId.toString());

    // Exclude list (as string array for API/Mongoose matching)
    const excludeIdsStr = [
      ...new Set([
        ...hiddenPostIds,
        ...watchedFeedIds,
        ...shownFeedIds,
        ...dislikedFeedIds
      ])
    ].filter(id => mongoose.Types.ObjectId.isValid(id));

    const excludeObjectIds = excludeIdsStr.map(id => new mongoose.Types.ObjectId(id));

    // 2. Fetch from ML Service using the V2 centralized wrapper (passes diversity boost, prefer short duration)
    const mlRecos = await mlRecommendationService.getRecommendations(userId, excludeIdsStr, null, limit);
    const mlFeedIds = mlRecos.map(r => r.feed_id);

    // 3. Fetch local potential feeds (trending + user preferences) for fallback/blending
    const preferredCategoryIds = (user.categoryPreference || []).map(p => p.categoryId);
    
    let query = {
      _id: { $nin: excludeObjectIds },
      isApproved: true,
      status: "published"
    };

    if (preferredCategoryIds.length > 0) {
      query.category = { $in: preferredCategoryIds };
    }

    const localFeeds = await Feed.find(query)
      .sort({ "playbackStats.totalViews": -1, createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit) 
      .lean();

    // 4. Cold Start / New Content Discovery (10%)
    const freshFeeds = await Feed.find({
      _id: { $nin: excludeObjectIds },
      isApproved: true,
      status: "published",
      createdAt: { $gte: new Date(Date.now() - 48 * 60 * 60 * 1000) },
      "playbackStats.totalViews": { $lt: 500 }
    })
      .skip((page - 1) * 2)
      .limit(2)
      .lean();

    // 5. Blend Results
    const mlFeeds = await Feed.find({ _id: { $in: mlFeedIds } }).lean();
    
    // Maintain ML order but keep feed objects
    const sortedMlFeeds = mlFeedIds.map(id => mlFeeds.find(f => f._id.toString() === id.toString())).filter(Boolean);

    // 5. Blend Results based on slots: ML (60%), Fresh (10%), Local (30%)
    const mlCount = Math.ceil(limit * 0.6);
    const freshCount = Math.ceil(limit * 0.1);
    const localCount = limit - mlCount - freshCount;

    const blendedFeeds = [
      ...sortedMlFeeds.slice(0, mlCount),
      ...freshFeeds.slice(0, freshCount),
      ...localFeeds.slice(0, localCount)
    ];

    // Fill remaining if we are short of the requested limit
    let finalFeeds = blendedFeeds;
    if (finalFeeds.length < limit) {
      const existingIds = new Set(finalFeeds.map(f => f._id.toString()));
      const remainingPool = [...sortedMlFeeds, ...freshFeeds, ...localFeeds].filter(f => !existingIds.has(f._id.toString()));
      finalFeeds = [...finalFeeds, ...remainingPool].slice(0, limit);
    }

    // 🔄 FALLBACK: If finalFeeds is empty on Page 1, clear shown filter and retry to prevent "No Content" error
    if (finalFeeds.length === 0 && page === 1) {
      const fallbackQuery = {
        _id: { $nin: [...hiddenPostIds, ...watchedFeedIds, ...dislikedFeedIds].map(id => new mongoose.Types.ObjectId(id)) },
        isApproved: true,
        status: "published"
      };
      if (preferredCategoryIds.length > 0) {
        fallbackQuery.category = { $in: preferredCategoryIds };
      }
      finalFeeds = await Feed.find(fallbackQuery)
        .sort({ "playbackStats.totalViews": -1, createdAt: -1 })
        .limit(limit)
        .lean();
    }

    return finalFeeds;
  } catch (err) {
    console.error("❌ getRecommendedFeeds Error:", err);
    return [];
  }
};
