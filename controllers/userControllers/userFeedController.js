
const Feed = require("../../models/feedModel");
const UserImageView = require("../../models/userModels/MediaSchema/userImageViewsModel");
const ImageStats = require("../../models/userModels/MediaSchema/imageViewModel");
const UserVideoView = require("../../models/userModels/MediaSchema/userVideoViewModel");
const VideoStats = require("../../models/userModels/MediaSchema/videoViewStatusModel");
const mongoose = require("mongoose");

const User = require("../../models/userModels/userModel");
const Follower = require("../../models/userFollowingModel");
const UserFeedActions = require("../../models/userFeedInterSectionModel");
const UserCategory = require("../../models/userModels/userCategotyModel");
const { buildDateFilter } = require("../../middlewares/helper/buildDateFilter");
const Hidden = require("../../models/userModels/hiddenPostSchema");
const ProfileSettings = require('../../models/profileSettingModel');
const UserComment = require('../../models/userCommentModel');
const CreatorFollower = require("../../models/creatorFollowerModel");
const { feedTimeCalculator } = require("../../middlewares/feedTimeCalculator")






const redisClient = require("../../Config/redisConfig");

exports.userImageViewCount = async (req, res) => {
  try {
    const feedId = req.body.feedId || req.params.id || req.query.feedId;
    const userId = req.Id || req.body.userId; // Optional for guests
    const deviceId = req.body.deviceId || req.headers["x-device-id"]; // Guest ID

    if (!feedId || (!userId && !deviceId)) {
      return res.status(400).json({ message: "feedId and (userId or deviceId) are required" });
    }

    const viewerId = userId || deviceId;
    const redisKey = `view:img:${feedId}:${viewerId}`;

    // 1️⃣ Short-circuit with Redis to avoid DB hit for recent views
    const cachedView = await redisClient.get(redisKey);
    if (cachedView) {
      const stats = await ImageStats.findOne({ imageId: feedId }).lean();
      return res.json({
        message: "View already counted (cached)",
        isNewView: false,
        totalViews: stats?.totalViews || 0
      });
    }

    let isNewView = false;
    try {
      // 2️⃣ Try to create a unique view record (Atomic via Unique Constraint)
      await UserImageView.create({
        userId: userId || null,
        deviceId: deviceId || null,
        imageId: feedId,
        viewedAt: new Date(),
      });
      isNewView = true;

      // 3️⃣ Increment global stats only if record was created
      await ImageStats.findOneAndUpdate(
        { imageId: feedId },
        {
          $inc: { totalViews: 1, uniqueUsers: 1 },
          $set: { lastViewed: new Date() },
        },
        { upsert: true, new: true }
      );
    } catch (dbErr) {
      // Duplicate key error (code 11000) means already viewed
      if (dbErr.code !== 11000) throw dbErr;
    }

    // 4️⃣ Cache the view event in Redis (TTL: 24h)
    await redisClient.set(redisKey, "1", "EX", 86400);

    const finalStats = await ImageStats.findOne({ imageId: feedId }).lean();

    return res.json({
      message: isNewView ? "Image view recorded" : "View already exists",
      isNewView,
      totalViews: finalStats?.totalViews || 0,
    });

  } catch (err) {
    console.error("❌ Error recording image view:", err);
    return res.status(500).json({ message: "Server error" });
  }
};

exports.userVideoViewCount = async (req, res) => {
  try {
    const feedId = req.body.feedId || req.params.id || req.query.feedId;
    const userId = req.Id || req.body.userId;
    const deviceId = req.body.deviceId || req.headers["x-device-id"];

    if (!feedId || (!userId && !deviceId)) {
      return res.status(400).json({ message: "feedId and (userId or deviceId) are required" });
    }

    // 1️⃣ Validate feed
    const feed = await Feed.findById(feedId, "postType duration");
    if (!feed || feed.postType !== "video") {
      return res.status(400).json({ message: "Video feed not found" });
    }

    const viewerId = userId || deviceId;
    const redisKey = `view:vid:${feedId}:${viewerId}`;

    // 2️⃣ Short-circuit with Redis
    const cachedView = await redisClient.get(redisKey);
    if (cachedView) {
      const stats = await VideoStats.findOne({ videoId: feedId }).lean();
      return res.json({
        message: "View already counted (cached)",
        isNewView: false,
        totalViews: stats?.totalViews || 0
      });
    }

    let isNewView = false;
    try {
      // 3️⃣ Atomic Unique Guard
      await UserVideoView.create({
        userId: userId || null,
        deviceId: deviceId || null,
        videoId: feedId,
        viewedAt: new Date(),
      });
      isNewView = true;

      // 4️⃣ Update global video stats
      await VideoStats.findOneAndUpdate(
        { videoId: feedId },
        {
          $inc: { totalViews: 1, uniqueUsers: 1, totalDuration: feed.duration || 0 },
          $set: { lastViewed: new Date() },
        },
        { upsert: true, new: true }
      );

      // 5️⃣ Track watched feeds for user personal list (Logged-in only)
      if (userId) {
        await UserFeedActions.findOneAndUpdate(
          { userId },
          {
            $addToSet: {
              watchedFeeds: {
                feedId: new mongoose.Types.ObjectId(feedId),
                watchedAt: new Date()
              }
            }
          },
          { upsert: true }
        );
      }
    } catch (dbErr) {
      if (dbErr.code !== 11000) throw dbErr;
    }

    // 6️⃣ Cache in Redis
    await redisClient.set(redisKey, "1", "EX", 86400);

    const finalStats = await VideoStats.findOne({ videoId: feedId }).lean();

    return res.json({
      message: isNewView ? "Video view recorded" : "View already exists",
      isNewView,
      totalViews: finalStats?.totalViews || 0,
      durationAdded: isNewView ? feed.duration : 0
    });

  } catch (err) {
    console.error("❌ Error recording video view:", err);
    return res.status(500).json({ message: "Server error" });
  }
};









/* ================================================================
   1️⃣ FETCH USER FEEDS — all feeds created by the user
================================================================ */
exports.fetchUserFeeds = async (req, res) => {
  try {
    const { userId } = req.params;
    const { startDate, endDate, type } = req.query;

    const filter = {};
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) filter.createdAt.$lte = new Date(endDate);
    }
    if (type) filter.type = type;

    const feeds = await Feed.find({
      $or: [
        { createdByAccount: userId },
        { "postedBy.userId": userId }
      ],
      ...filter
    })
      .populate("createdByAccount", "userName email");


    res.status(200).json({ success: true, feeds });
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch user feeds", error: err.message });
  }
};

/* ================================================================
   2️⃣ FOLLOWING USERS
================================================================ */
exports.fetchUserFollowing = async (req, res) => {
  try {
    const { userId } = req.params;
    const { startDate, endDate } = req.query;

    // ✅ Date filter builder (optional helper)
    const dateFilter = buildDateFilter("followerIds", "createdAt", startDate, endDate);

    // ✅ Find the following list
    const followingData = await Follower.findOne({ userId, ...dateFilter })
      .populate("followerIds.userId", "userName email");

    if (!followingData || !followingData.followerIds?.length) {
      return res.status(200).json({
        success: true,
        following: [],
        message: "No following users found for the given criteria",
      });
    }

    // ✅ Extract all followed user IDs
    const followedUserIds = followingData.followerIds.map(f => f.userId?._id);

    // ✅ Fetch corresponding profile avatars
    const profiles = await ProfileSettings.find({
      userId: { $in: followedUserIds },
    }).select("userId profileAvatar");

    // ✅ Map userId → avatar for quick lookup
    const avatarMap = profiles.reduce((acc, profile) => {
      acc[profile.userId.toString()] = profile.profileAvatar;
      return acc;
    }, {});

    // Merge avatar into response
    const followingWithAvatars = followingData.followerIds.map(f => ({
      userId: f.userId?._id,
      userName: f.userId?.userName,
      email: f.userId?.email,
      profileAvatar: avatarMap[f.userId?._id?.toString()],
      followedAt: f.createdAt,
    }));

    res.status(200).json({
      success: true,
      following: followingWithAvatars,
    });
  } catch (err) {
    console.error(" Error in fetchUserFollowing:", err);
    res.status(500).json({
      message: "Failed to fetch following users",
      error: err.message,
    });
  }
};

/* ================================================================
   3️⃣ INTERESTED CATEGORIES
================================================================ */
exports.fetchUserInterested = async (req, res) => {
  try {
    const { userId } = req.params;
    const { startDate, endDate } = req.query;

    // Build the date filter if you have a utility function
    const match = buildDateFilter("interestedCategories", "updatedAt", startDate, endDate);

    // Find user categories
    const userCats = await UserCategory.findOne({ userId, ...match })
      .populate({
        path: "interestedCategories.categoryId",
        model: "Categories",
        select: "name",
      });
    // Map to get category name + user's updatedAt
    const categories = userCats?.interestedCategories.map((c) => ({
      _id: c.categoryId._id,
      name: c.categoryId.name,
      updatedAt: c.updatedAt, // user's updated date
    })) || [];

    res.status(200).json({
      success: true,
      categories,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      message: "Failed to fetch interested categories",
      error: err.message,
    });
  }
};

/* ================================================================
   4️⃣ NON-INTERESTED CATEGORIES
================================================================ */
exports.fetchUserNonInterested = async (req, res) => {
  try {
    const { userId } = req.params;
    const { startDate, endDate } = req.query;

    // Build date filter for non-interested categories
    const match = buildDateFilter(
      "nonInterestedCategories",
      "updatedAt",
      startDate,
      endDate
    );

    const userCats = await UserCategory.findOne({ userId, ...match }).populate({
      path: "nonInterestedCategories.categoryId",
      model: "Categories",
      select: "name", // only category name
    });
    console.log(userCats)
    // Map to include category name + user's updatedAt
    const categories = userCats?.nonInterestedCategories.map((c) => ({
      _id: c.categoryId._id,
      name: c.categoryId.name,
      updatedAt: c.updatedAt, // user's updated date
    })) || [];

    res.status(200).json({
      success: true,
      categories,
    });
  } catch (err) {
    res.status(500).json({
      message: "Failed to fetch non-interested categories",
      error: err.message,
    });
  }
};

/* ================================================================
   5️⃣ HIDDEN FEEDS
================================================================ */
exports.fetchUserHidden = async (req, res) => {
  try {
    const { userId } = req.params;
    const { type, startDate, endDate } = req.query;

    // Step 1: Find all hidden feeds for the user
    const hiddenEntries = await Hidden.find({ userId }).select("feedId");
    if (!hiddenEntries.length) {
      return res.status(200).json({ success: true, hiddenFeeds: [] });
    }

    // Step 2: Extract feed IDs
    const feedIds = hiddenEntries.map((h) => h.feedId);

    // Step 3: Build filter using your utility
    const feedFilter = {
      _id: { $in: feedIds },
      ...buildDateFilter({ field: "createdAt", type, startDate, endDate }),
    };

    // Step 4: Fetch hidden feeds
    const hiddenFeeds = await Feed.find(feedFilter).select(
      "type contentUrl language createdAt"
    );

    res.status(200).json({ success: true, hiddenFeeds });
  } catch (err) {
    console.error("Error fetching hidden feeds:", err);
    res.status(500).json({
      message: "Failed to fetch hidden feeds",
      error: err.message,
    });
  }
};



/* ================================================================
   6️⃣ LIKED FEEDS
================================================================ */
exports.fetchUserLiked = async (req, res) => {
  try {
    const { userId } = req.params;
    const { startDate, endDate, type } = req.query;

    // Optimized: Use aggregation to filter and fetch liked feeds with feed details
    const pipeline = [
      { $match: { userId: mongoose.Types.ObjectId(userId) } },
      { $unwind: "$likedFeeds" },
      {
        $lookup: {
          from: "Feed",
          localField: "likedFeeds.feedId",
          foreignField: "_id",
          as: "feedDetails",
          pipeline: [{ $project: { type: 1, category: 1, language: 1, contentUrl: 1 } }]
        }
      },
      { $unwind: "$feedDetails" },
      {
        $match: {
          ...(type && type !== "all" && { "feedDetails.type": type }),
          ...(startDate || endDate ? {
            "likedFeeds.likedAt": {
              ...(startDate && { $gte: new Date(startDate) }),
              ...(endDate && { $lte: new Date(endDate) })
            }
          } : {})
        }
      },
      {
        $project: {
          feedId: "$feedDetails._id",
          type: "$feedDetails.type",
          category: "$feedDetails.category",
          language: "$feedDetails.language",
          contentUrl: "$feedDetails.contentUrl",
          likedAt: "$likedFeeds.likedAt"
        }
      },
      { $sort: { likedAt: -1 } }
    ];

    const likedFeeds = await UserFeedActions.aggregate(pipeline);

    res.status(200).json({
      success: true,
      likedFeeds,
    });
  } catch (err) {
    console.error("Error fetching liked feeds:", err);
    res.status(500).json({
      success: false,
      message: "Failed to fetch liked feeds",
      error: err.message,
    });
  }
};

/* ================================================================
   7️⃣ DISLIKED FEEDS (if tracked later)
================================================================ */
exports.fetchUserDisliked = async (req, res) => {
  try {
    res.status(200).json({ success: true, dislikedFeeds: [] });
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch disliked feeds", error: err.message });
  }
};

/* ================================================================
   8️⃣ COMMENTED FEEDS (placeholder — if comment model exists)
================================================================ */
exports.fetchUserCommented = async (req, res) => {
  try {
    const { userId } = req.params;

    // Fetch comments by user and populate feed contentUrl
    const comments = await UserComment.find({ userId })
      .sort({ createdAt: -1 }) // latest comments first
      .populate({
        path: "feedId",
        select: "contentUrl title", // fetch only contentUrl and title
      });

    // Format response
    const commentedFeeds = comments.map((comment) => ({
      _id: comment._id,
      commentText: comment.commentText,
      createdAt: comment.createdAt,
      feed: comment.feedId
        ? {
          _id: comment.feedId._id,
          contentUrl: comment.feedId.contentUrl,
          title: comment.feedId.title || null,
        }
        : null,
    }));

    res.status(200).json({ success: true, commentedFeeds });
  } catch (err) {
    res.status(500).json({
      message: "Failed to fetch commented feeds",
      error: err.message,
    });
  }
};

/* ================================================================
   9️⃣ SHARED FEEDS
================================================================ */
exports.fetchUserShared = async (req, res) => {
  try {
    const { userId } = req.params;
    const { startDate, endDate, type } = req.query;

    // Build date filter
    const match = buildDateFilter("sharedFeeds", "sharedAt", startDate, endDate);

    // Get user's shared feeds
    const actions = await UserFeedActions.findOne({ userId, ...match })
      .populate("sharedFeeds.feedId", "type category language contentUrl title");

    if (!actions || !actions.sharedFeeds) {
      return res.status(200).json({ success: true, sharedFeeds: [] });
    }

    // 1️⃣ Pre-calculate counts in O(N)
    const feedCounts = new Map();
    actions.sharedFeeds.forEach(f => {
      const id = f.feedId?._id?.toString() || f.feedId?.toString();
      if (id) feedCounts.set(id, (feedCounts.get(id) || 0) + 1);
    });

    // 2️⃣ Map in O(N)
    const processedFeeds = actions.sharedFeeds
      .filter((item) => !type || item.feedId?.type === type)
      .map((item) => ({
        feed: item.feedId,
        sharedAt: item.sharedAt,
        count: feedCounts.get(item.feedId?._id?.toString() || item.feedId?.toString()) || 0,
      }));

    res.status(200).json({
      success: true,
      sharedFeeds: processedFeeds,
    });
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch shared feeds", error: err.message });
  }
};

/* ================================================================
   🔟 DOWNLOADED FEEDS
================================================================ */
exports.fetchUserDownloaded = async (req, res) => {
  try {
    const { userId } = req.params;
    const { startDate, endDate, type } = req.query;

    // Build date filter
    const match = buildDateFilter("downloadedFeeds", "downloadedAt", startDate, endDate);

    // Get user's downloaded feeds
    const actions = await UserFeedActions.findOne({ userId, ...match })
      .populate("downloadedFeeds.feedId", "type category language contentUrl title");

    if (!actions || !actions.downloadedFeeds) {
      return res.status(200).json({ success: true, downloadedFeeds: [] });
    }

    // 1️⃣ Pre-calculate counts in O(N)
    const feedCounts = new Map();
    actions.downloadedFeeds.forEach(f => {
      const id = f.feedId?._id?.toString() || f.feedId?.toString();
      if (id) feedCounts.set(id, (feedCounts.get(id) || 0) + 1);
    });

    // 2️⃣ Map in O(N)
    const processedFeeds = actions.downloadedFeeds
      .filter((item) => !type || item.feedId?.type === type)
      .map((item) => ({
        feed: item.feedId,
        downloadedAt: item.downloadedAt,
        count: feedCounts.get(item.feedId?._id?.toString() || item.feedId?.toString()) || 0,
      }));

    res.status(200).json({
      success: true,
      downloadedFeeds: processedFeeds,
    });
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch downloaded feeds", error: err.message });
  }
};



exports.getUserAnalyticsSummary = async (req, res) => {
  try {
    const { userId } = req.params;
    if (!userId) {
      return res.status(400).json({ success: false, message: "User ID required" });
    }

    const redisKey = `analytics:summary:${userId}`;
    const cached = await redisClient.get(redisKey);
    if (cached) return res.status(200).json(JSON.parse(cached));

    // Optimized: Single aggregation pipeline to count all metrics
    const [result] = await UserFeedActions.aggregate([
      {
        $lookup: {
          from: "User",
          localField: "userId",
          foreignField: "_id",
          as: "user",
          pipeline: [{ $project: { hiddenPostIds: 1 } }]
        }
      },
      {
        $lookup: {
          from: "UserCategories",
          localField: "userId",
          foreignField: "userId",
          as: "userCategory",
          pipeline: [{ $project: { interestedCategories: 1, nonInterestedCategories: 1 } }]
        }
      },
      {
        $lookup: {
          from: "UserFollowings",
          localField: "userId",
          foreignField: "userId",
          as: "followerData",
          pipeline: [{ $project: { followerIds: 1, blockedIds: 1 } }]
        }
      },
      {
        $project: {
          liked: { $size: { $ifNull: ["$likedFeeds", []] } },
          saved: { $size: { $ifNull: ["$savedFeeds", []] } },
          downloaded: { $size: { $ifNull: ["$downloadedFeeds", []] } },
          shared: { $size: { $ifNull: ["$sharedFeeds", []] } },
          interested: { $size: { $ifNull: ["$userCategory.interestedCategories", []] } },
          notInterested: { $size: { $ifNull: ["$userCategory.nonInterestedCategories", []] } },
          hidden: { $size: { $ifNull: ["$user.hiddenPostIds", []] } },
          following: { $size: { $ifNull: ["$followerData.followerIds", []] } },
          blocked: { $size: { $ifNull: ["$followerData.blockedIds", []] } }
        }
      }
    ]);

    if (!result) {
      return res.status(404).json({ success: false, message: "No user data found" });
    }

    return res.status(200).json({
      success: true,
      message: "User analytics summary fetched successfully",
      summary: result,
    });

  } catch (error) {
    console.error("Error fetching user analytics summary:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while fetching user analytics summary",
    });
  }
};




// In-memory cache for profile data (simple Map-based cache)
const profileCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Assuming you have a middleware that sets req.userId from the token
exports.getUserdetailWithinTheFeed = async (req, res) => {
  try {
    const currentUserId = req.Id; // from token middleware
    const { profileUserId, roleRef } = req.query;

    if (!profileUserId || !roleRef) {
      return res.status(400).json({ message: "profileUserId and roleRef are required" });
    }

    // Check cache first
    const cacheKey = `${profileUserId}-${roleRef}`;
    const cached = profileCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return res.json({
        success: true,
        profile: cached.data,
      });
    }

    // Determine the field to query based on roleRef
    let query = {};
    if (roleRef === "Admin") query.adminId = profileUserId;
    else if (roleRef === "User") query.userId = profileUserId;
    else if (roleRef === "Child_Admin") query.childAdminId = profileUserId;
    else return res.status(400).json({ message: "Invalid roleRef" });

    // Find the profile
    const profile = await ProfileSettings.findOne(query).select("userName profileAvatar bio coverPhoto");
    if (!profile) return res.status(404).json({ message: "Profile not found" });

    // Get following info from Follower collection
    const followerDoc = await Follower.findOne({ userId: profileUserId });
    const followingCount = followerDoc ? followerDoc.followingIds.length : 0;

    // Get creator follower count
    const creatorFollowerDoc = await CreatorFollower.findOne({ creatorId: profileUserId });
    const creatorFollowerCount = creatorFollowerDoc ? creatorFollowerDoc.followerIds.length : 0;

    // Check if current user is following this profile
    const isFollowing = followerDoc
      ? followerDoc.followingIds.some(f => f.userId.toString() === currentUserId)
      : false;

    const profileData = {
      userName: profile.userName,
      profileAvatar: profile.profileAvatar,
      coverPhoto: profile.coverPhoto,
      bio: profile.bio,
      followingCount,
      creatorFollowerCount,
      isFollowing,
    };

    // Cache the result
    profileCache.set(cacheKey, { data: profileData, timestamp: Date.now() });

    return res.json({
      success: true,
      profile: profileData,
    });

  } catch (error) {
    console.error("Error in getUserdetailWithinTheFeed:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};










