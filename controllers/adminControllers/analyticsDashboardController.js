const UserFeedAnalytics = require("../../models/analytics/userFeedAnalyticsModel");
const SearchHistory = require("../../models/analytics/searchHistoryModel");
const Feed = require("../../models/feedModel");
const Categories = require("../../models/categorySchema");
const User = require("../../models/userModels/userModel");
const mongoose = require("mongoose");

/**
 * 📈 Get Comprehensive Recommendation KPIs
 */
exports.getRecommendationKPIs = async (req, res) => {
  try {
    const { range = "7d" } = req.query;
    let startDate = new Date();
    if (range === "24h") startDate.setHours(startDate.getHours() - 24);
    else if (range === "7d") startDate.setDate(startDate.getDate() - 7);
    else if (range === "30d") startDate.setDate(startDate.getDate() - 30);

    const [stats, totalUsers] = await Promise.all([
      UserFeedAnalytics.aggregate([
        { $match: { createdAt: { $gte: startDate } } },
        {
          $group: {
            _id: null,
            totalViews: { $sum: 1 },
            totalWatchTime: { $sum: "$watchTime" },
            avgWatchTime: { $avg: "$watchTime" },
            totalLikes: { $sum: { $cond: ["$liked", 1, 0] } },
            totalShares: { $sum: { $cond: ["$shared", 1, 0] } },
            totalSaves: { $sum: { $cond: ["$saved", 1, 0] } },
            recoSuccess: { $sum: { $cond: [{ $gte: ["$percentageWatched", 50] }, 1, 0] } }
          }
        }
      ]),
      User.countDocuments()
    ]);

    const result = stats[0] || { totalViews: 0, totalWatchTime: 0, avgWatchTime: 0, totalLikes: 0, totalShares: 0, totalSaves: 0, recoSuccess: 0 };
    
    res.status(200).json({ 
      success: true, 
      kpis: {
        ...result,
        totalUsers,
        successRate: result.totalViews > 0 ? (result.recoSuccess / result.totalViews) * 100 : 0
      }
    });
  } catch (err) {
    console.error("❌ getRecommendationKPIs Error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

/**
 * 📋 Get Feed Performance Table Data
 */
exports.getFeedPerformanceTable = async (req, res) => {
  try {
    const { page = 1, limit = 10, search = "" } = req.query;
    const skip = (page - 1) * limit;

    const pipeline = [
      {
        $group: {
          _id: "$feedId",
          views: { $sum: 1 },
          avgWatchTime: { $avg: "$watchTime" },
          avgCompletion: { $avg: "$percentageWatched" },
          likes: { $sum: { $cond: ["$liked", 1, 0] } },
          shares: { $sum: { $cond: ["$shared", 1, 0] } },
          skips: { $sum: { $cond: [{ $lt: ["$watchTime", 3] }, 1, 0] } }
        }
      },
      {
        $lookup: {
          from: "Feeds",
          localField: "_id",
          foreignField: "_id",
          as: "feed"
        }
      },
      { $unwind: "$feed" },
      {
        $project: {
          feedId: "$_id",
          caption: "$feed.caption",
          thumbnail: "$feed.mediaUrl",
          category: "$feed.category",
          views: 1,
          avgWatchTime: 1,
          avgCompletion: 1,
          likes: 1,
          shares: 1,
          skipRate: { $multiply: [{ $divide: ["$skips", "$views"] }, 100] }
        }
      },
      { $sort: { views: -1 } },
      { $skip: parseInt(skip) },
      { $limit: parseInt(limit) }
    ];

    const stats = await UserFeedAnalytics.aggregate(pipeline);
    res.status(200).json({ success: true, stats });
  } catch (err) {
    console.error("❌ getFeedPerformanceTable Error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

/**
 * 🔍 Get Search Analytics
 */
exports.getSearchAnalytics = async (req, res) => {
  try {
    const topSearches = await SearchHistory.aggregate([
      {
        $group: {
          _id: "$query",
          count: { $sum: 1 },
          uniqueUsers: { $addToSet: "$userId" }
        }
      },
      {
        $project: {
          query: "$_id",
          count: 1,
          userCount: { $size: "$uniqueUsers" }
        }
      },
      { $sort: { count: -1 } },
      { $limit: 10 }
    ]);

    res.status(200).json({ success: true, topSearches });
  } catch (err) {
    console.error("❌ getSearchAnalytics Error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

/**
 * 📺 Get Live Monitoring Stats (Last 10 mins)
 */
exports.getLiveMonitoring = async (req, res) => {
  try {
    const tenMinsAgo = new Date(Date.now() - 10 * 60 * 1000);
    
    const liveStats = await UserFeedAnalytics.aggregate([
      { $match: { createdAt: { $gte: tenMinsAgo } } },
      {
        $group: {
          _id: null,
          activeViews: { $sum: 1 },
          activeLikes: { $sum: { $cond: ["$liked", 1, 0] } },
          activeUsers: { $addToSet: "$userId" }
        }
      },
      {
        $project: {
          activeViews: 1,
          activeLikes: 1,
          onlineUsers: { $size: "$activeUsers" }
        }
      }
    ]);

    res.status(200).json({ 
      success: true, 
      stats: liveStats[0] || { activeViews: 0, activeLikes: 0, onlineUsers: 0 } 
    });
  } catch (err) {
    console.error("❌ getLiveMonitoring Error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

/**
 * 🤖 Get Recommendation Source Performance
 */
exports.getRecommendationPerformance = async (req, res) => {
  try {
    // This would ideally track the source of the recommendation (Similarity, Trending, etc.)
    // For now, we simulate based on category matching vs trending
    const stats = await UserFeedAnalytics.aggregate([
      {
        $group: {
          _id: "$recoSource", // Assuming we add this field to UserFeedAnalytics
          count: { $sum: 1 },
          avgWatchTime: { $avg: "$watchTime" },
          successCount: { $sum: { $cond: [{ $gte: ["$percentageWatched", 50] }, 1, 0] } }
        }
      }
    ]);

    res.status(200).json({ success: true, stats });
  } catch (err) {
    console.error("❌ getRecommendationPerformance Error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

/**
 * 📊 Get top performing categories based on watch time
 */
exports.getTopCategories = async (req, res) => {
  try {
    const stats = await UserFeedAnalytics.aggregate([
      {
        $lookup: {
          from: "Feeds",
          localField: "feedId",
          foreignField: "_id",
          as: "feed"
        }
      },
      { $unwind: "$feed" },
      { $unwind: "$feed.category" },
      {
        $group: {
          _id: "$feed.category",
          totalWatchTime: { $sum: "$watchTime" },
          totalViews: { $sum: 1 },
          avgPercentage: { $avg: "$percentageWatched" }
        }
      },
      {
        $lookup: {
          from: "Categories",
          localField: "_id",
          foreignField: "_id",
          as: "categoryInfo"
        }
      },
      { $unwind: "$categoryInfo" },
      { $sort: { totalWatchTime: -1 } },
      { $limit: 10 }
    ]);

    res.status(200).json({ success: true, stats });
  } catch (err) {
    console.error("❌ getTopCategories Error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

/**
 * 🔥 Get top performing feeds (Engagement Rate)
 */
exports.getTopFeeds = async (req, res) => {
  try {
    const feeds = await Feed.find({ isApproved: true, isDeleted: false })
      .sort({ "engagementStats.likes": -1, "playbackStats.totalViews": -1 })
      .limit(20)
      .select("caption postType mediaUrl engagementStats playbackStats")
      .lean();

    res.status(200).json({ success: true, feeds });
  } catch (err) {
    console.error("❌ getTopFeeds Error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

/**
 * 📈 Get overall engagement trends
 */
exports.getEngagementTrends = async (req, res) => {
  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    
    const trends = await UserFeedAnalytics.aggregate([
      { $match: { createdAt: { $gte: sevenDaysAgo } } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          views: { $sum: 1 },
          likes: { $sum: { $cond: ["$liked", 1, 0] } },
          shares: { $sum: { $cond: ["$shared", 1, 0] } },
          saves: { $sum: { $cond: ["$saved", 1, 0] } }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    res.status(200).json({ success: true, trends });
  } catch (err) {
    console.error("❌ getEngagementTrends Error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

/**
 * 🌅 Get Time of Day Insights
 * Categorizes views into Early Morning, Morning, Afternoon, Late Night
 */
exports.getTimeOfDayInsights = async (req, res) => {
  try {
    const { range = "7d" } = req.query;
    let startDate = new Date();
    if (range === "24h") startDate.setHours(startDate.getHours() - 24);
    else if (range === "7d") startDate.setDate(startDate.getDate() - 7);
    else if (range === "30d") startDate.setDate(startDate.getDate() - 30);

    const stats = await UserFeedAnalytics.aggregate([
      { $match: { createdAt: { $gte: startDate } } },
      {
        $project: {
          hour: { $hour: "$createdAt" },
          watchTime: 1,
          userId: 1
        }
      },
      {
        $addFields: {
          period: {
            $switch: {
              branches: [
                { case: { $and: [{ $gte: ["$hour", 0] }, { $lt: ["$hour", 6] }] }, then: "Early Morning" },
                { case: { $and: [{ $gte: ["$hour", 6] }, { $lt: ["$hour", 12] }] }, then: "Morning" },
                { case: { $and: [{ $gte: ["$hour", 12] }, { $lt: ["$hour", 18] }] }, then: "Afternoon" },
                { case: { $and: [{ $gte: ["$hour", 18] }, { $lt: ["$hour", 24] }] }, then: "Late Night" }
              ],
              default: "Unknown"
            }
          }
        }
      },
      {
        $group: {
          _id: "$period",
          views: { $sum: 1 },
          avgWatchTime: { $avg: "$watchTime" },
          uniqueUsers: { $addToSet: "$userId" },
          feedIds: { $addToSet: "$feedId" }
        }
      },
      {
        $lookup: {
          from: "Feeds",
          localField: "feedIds",
          foreignField: "_id",
          as: "feeds"
        }
      },
      {
        $project: {
          period: "$_id",
          views: 1,
          avgWatchTime: 1,
          userCount: { $size: "$uniqueUsers" },
          categories: "$feeds.category"
        }
      }
    ]);

    // Flatten and count categories per period
    const enrichedStats = await Promise.all(stats.map(async (period) => {
      const flattenedCategories = [].concat(...period.categories);
      const categoryCounts = {};
      flattenedCategories.forEach(cat => {
        const id = cat.toString();
        categoryCounts[id] = (categoryCounts[id] || 0) + 1;
      });

      const topCatIds = Object.keys(categoryCounts)
        .sort((a, b) => categoryCounts[b] - categoryCounts[a])
        .slice(0, 3);

      const topCategories = await Categories.find({ _id: { $in: topCatIds } }).select("name").lean();
      
      return {
        ...period,
        topCategories: topCategories.map(c => c.name).join(", ")
      };
    }));

    res.status(200).json({ success: true, stats: enrichedStats });
  } catch (err) {
    console.error("❌ getTimeOfDayInsights Error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

/**
 * 📅 Get Day of Week Insights
 */
exports.getDayOfWeekInsights = async (req, res) => {
  try {
    const { range = "30d" } = req.query;
    let startDate = new Date();
    startDate.setDate(startDate.getDate() - (range === "30d" ? 30 : 7));

    const stats = await UserFeedAnalytics.aggregate([
      { $match: { createdAt: { $gte: startDate } } },
      {
        $project: {
          dayOfWeek: { $dayOfWeek: "$createdAt" }, // 1 (Sun) to 7 (Sat)
          watchTime: 1,
          userId: 1
        }
      },
      {
        $group: {
          _id: "$dayOfWeek",
          views: { $sum: 1 },
          avgWatchTime: { $avg: "$watchTime" },
          uniqueUsers: { $addToSet: "$userId" }
        }
      },
      {
        $project: {
          dayNumber: "$_id",
          dayName: {
            $arrayElemAt: [
              ["", "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
              "$_id"
            ]
          },
          views: 1,
          avgWatchTime: 1,
          userCount: { $size: "$uniqueUsers" }
        }
      },
      { $sort: { dayNumber: 1 } }
    ]);

    res.status(200).json({ success: true, stats });
  } catch (err) {
    console.error("❌ getDayOfWeekInsights Error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

/**
 * 📥 Export Analytics to CSV
 */
exports.exportAnalyticsCSV = async (req, res) => {
  try {
    const { type, userId, range = '7d' } = req.query; // type: 'all' or 'single'
    
    let startDate = new Date();
    if (range === '24h') startDate.setHours(startDate.getHours() - 24);
    else if (range === '7d') startDate.setDate(startDate.getDate() - 7);
    else if (range === '30d') startDate.setDate(startDate.getDate() - 30);
    else startDate.setDate(startDate.getDate() - 7); // Default to 7d

    let data = [];
    let filename = `analytics_export_${range}_${Date.now()}.csv`;

    if (type === 'single' && userId) {
      if (!mongoose.Types.ObjectId.isValid(userId)) {
        return res.status(400).json({ message: "Invalid User ID" });
      }
      
      const [history, user] = await Promise.all([
        UserFeedAnalytics.aggregate([
          { $match: { 
              userId: new mongoose.Types.ObjectId(userId),
              createdAt: { $gte: startDate }
          } },
          {
            $lookup: {
              from: "Feeds",
              localField: "feedId",
              foreignField: "_id",
              as: "feed"
            }
          },
          { $unwind: "$feed" },
          {
            $lookup: {
              from: "Categories",
              localField: "feed.category",
              foreignField: "_id",
              as: "categoryDetails"
            }
          },
          {
            $project: {
              feedId: 1,
              caption: "$feed.caption",
              categoryNames: {
                $reduce: {
                  input: "$categoryDetails.name",
                  initialValue: "",
                  in: { $concat: ["$$value", { $cond: [{ $eq: ["$$value", ""] }, "", ", "] }, "$$this"] }
                }
              },
              recoSource: { $ifNull: ["$recoSource", "organic"] },
              recoScore: { $ifNull: ["$recoScore", 0] },
              watchTime: 1,
              percentageWatched: 1,
              liked: 1,
              shared: 1,
              saved: 1,
              commented: 1,
              skipped: 1,
              notInterested: 1,
              clickCount: 1,
              pauseCount: 1,
              replayCount: 1,
              scrollStopDuration: 1,
              deviceType: 1,
              sessionId: 1,
              createdAt: 1
            }
          },
          { $sort: { createdAt: -1 } }
        ]),
        User.findById(userId).select("userName name email").lean()
      ]);

      data = history;
      filename = `user_${user?.userName || userId}_${range}_analytics.csv`;
    } else {
      // Export all data (limit to last 10000 for safety, within range)
      data = await UserFeedAnalytics.aggregate([
        { $match: { createdAt: { $gte: startDate } } },
        { $sort: { createdAt: -1 } },
        { $limit: 10000 },
        {
          $lookup: {
            from: "Feeds",
            localField: "feedId",
            foreignField: "_id",
            as: "feed"
          }
        },
        { $unwind: "$feed" },
        {
          $lookup: {
            from: "Categories",
            localField: "feed.category",
            foreignField: "_id",
            as: "categoryDetails"
          }
        },
        {
          $project: {
            userId: 1,
            feedId: 1,
            caption: "$feed.caption",
            categoryNames: {
              $reduce: {
                input: "$categoryDetails.name",
                initialValue: "",
                in: { $concat: ["$$value", { $cond: [{ $eq: ["$$value", ""] }, "", ", "] }, "$$this"] }
              }
            },
            recoSource: { $ifNull: ["$recoSource", "organic"] },
            recoScore: { $ifNull: ["$recoScore", 0] },
            watchTime: 1,
            percentageWatched: 1,
            liked: 1,
            shared: 1,
            saved: 1,
            commented: 1,
            skipped: 1,
            notInterested: 1,
            clickCount: 1,
            pauseCount: 1,
            replayCount: 1,
            scrollStopDuration: 1,
            deviceType: 1,
            sessionId: 1,
            createdAt: 1
          }
        }
      ]);
    }

    if (!data.length) return res.status(404).json({ message: "No data found for export" });

    // Manually generate CSV string
    const headers = Object.keys(data[0]);
    const csvContent = [
      headers.join(','),
      ...data.map(row => headers.map(header => {
        let val = row[header];
        if (val instanceof Date) val = val.toISOString();
        if (typeof val === 'string') val = `"${val.replace(/"/g, '""')}"`;
        return val ?? '';
      }).join(','))
    ].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
    res.status(200).send(csvContent);
  } catch (err) {
    console.error("❌ exportAnalyticsCSV Error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

/**
 * 🔍 Search Users for Export Suggestion
 */
exports.searchUsersForExport = async (req, res) => {
  try {
    const { query } = req.query;
    if (!query || query.length < 2) return res.status(200).json({ success: true, users: [] });

    const users = await User.aggregate([
      {
        $match: {
          $or: [
            { userName: { $regex: query, $options: "i" } },
            { name: { $regex: query, $options: "i" } },
            { email: { $regex: query, $options: "i" } },
            { phoneNumber: { $regex: query, $options: "i" } },
            { referralCode: { $regex: query, $options: "i" } }
          ]
        }
      },
      {
        $lookup: {
          from: "ProfileSettings",
          localField: "_id",
          foreignField: "userId",
          as: "profile"
        }
      },
      { $unwind: { path: "$profile", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          id: "$_id",
          userName: { $ifNull: ["$profile.userName", "$userName"] },
          name: { $ifNull: ["$profile.name", "$name"] },
          email: 1,
          phoneNumber: { $ifNull: ["$profile.phoneNumber", "$phoneNumber"] },
          referralCode: 1,
          avatar: "$profile.modifyAvatar"
        }
      },
      { $limit: 10 }
    ]);

    res.status(200).json({ success: true, users });
  } catch (err) {
    console.error("❌ searchUsersForExport Error:", err);
    res.status(500).json({ message: "Server error" });
  }
};
