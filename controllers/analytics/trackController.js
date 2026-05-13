const UserFeedAnalytics = require("../../models/analytics/userFeedAnalyticsModel");
const Feed = require("../../models/feedModel");
const User = require("../../models/userModels/userModel");
const SearchHistory = require("../../models/analytics/searchHistoryModel");
const mongoose = require("mongoose");

/**
 * 🚀 Initialize feed view tracking
 * Called when a feed first appears on screen
 */
exports.trackFeedView = async (req, res) => {
  try {
    const { feedId, deviceType, location, sessionId } = req.body;
    const userId = req.Id || null;

    if (!feedId) return res.status(400).json({ message: "feedId is required" });

    const analytics = await UserFeedAnalytics.findOneAndUpdate(
      { userId, feedId, sessionId },
      {
        $setOnInsert: {
          impressionTime: new Date(),
          openTimestamp: new Date(),
          deviceType: deviceType || "web",
          location: location || { type: "Point", coordinates: [0, 0] },
        },
        $inc: { clickCount: 1 }
      },
      { upsert: true, new: true }
    );

    // Increment global view count in Feed model
    await Feed.findByIdAndUpdate(feedId, {
      $inc: { 
        "playbackStats.totalViews": 1,
        "playbackStats.uniqueViewers": userId ? 0 : 1 // Simple guest unique check
      }
    });

    res.status(200).json({ success: true, analyticsId: analytics._id });
  } catch (err) {
    console.error("❌ trackFeedView Error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

/**
 * ⏱️ Update watch time continuously
 * Called periodically from frontend (debounced)
 */
exports.trackWatchTime = async (req, res) => {
  try {
    const { feedId, watchTime, percentageWatched, sessionId } = req.body;
    const userId = req.Id || null;

    if (!feedId || watchTime === undefined) {
      return res.status(400).json({ message: "feedId and watchTime are required" });
    }

    const analytics = await UserFeedAnalytics.findOneAndUpdate(
      { userId, feedId, sessionId },
      {
        $set: { 
          watchTime, 
          percentageWatched,
          closeTimestamp: new Date() 
        }
      },
      { new: true }
    );

    // Update global watch time in Feed
    await Feed.findByIdAndUpdate(feedId, {
      $inc: { "playbackStats.totalWatchTime": watchTime }
    });

    res.status(200).json({ success: true });
  } catch (err) {
    console.error("❌ trackWatchTime Error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

/**
 * 📜 Track scroll behavior
 */
exports.trackScroll = async (req, res) => {
  try {
    const { feedId, scrollStopDuration, sessionId } = req.body;
    const userId = req.Id || null;

    if (!feedId) return res.status(400).json({ message: "feedId is required" });

    await UserFeedAnalytics.findOneAndUpdate(
      { userId, feedId, sessionId },
      { $inc: { scrollStopDuration: Number(scrollStopDuration) || 0 } }
    );

    res.status(200).json({ success: true });
  } catch (err) {
    console.error("❌ trackScroll Error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

/**
 * 🔍 Log search history and hashtag clicks
 */
exports.logSearchHistory = async (req, res) => {
  try {
    const { query, hashtag, type } = req.body;
    const userId = req.Id;

    if (!userId) return res.status(401).json({ message: "Login required" });

    const history = await SearchHistory.create({
      userId,
      query,
      hashtag,
      type: type || "search"
    });

    res.status(200).json({ success: true, history });
  } catch (err) {
    console.error("❌ logSearchHistory Error:", err);
    res.status(500).json({ message: "Server error" });
  }
};
