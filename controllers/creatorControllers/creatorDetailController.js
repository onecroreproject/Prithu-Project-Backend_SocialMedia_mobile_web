const Account = require("../../models/accountSchemaModel");
const Feed = require("../../models/feedModel");
const ProfileSettings = require('../../models/profileSettingModel');
const TrendingCreators = require('../../models/treandingCreators');
const ImageStats = require("../../models/userModels/MediaSchema/imageViewModel");
const VideoStats = require("../../models/userModels/MediaSchema/videoViewStatusModel");
const UserFeedActions = require("../../models/userFeedInterSectionModel");
const { saveFile, getMediaUrl } = require("../../utils/storageEngine");
const mongoose = require("mongoose")




exports.getAllCreatorDetails = async (req, res) => {
  console.log("working");

  try {
    // Find all accounts and populate user and profileSettings
    const allCreators = await Account.find()
      .populate({
        path: "userId",
        select: "userName email profileSettings",
        populate: {
          path: "profileSettings",
          select:
            "profileAvatar timeAgo contentUrl contentFullUrl feedId likeCount shareCount comments downloadCount"
        }
      })
      .lean(); // returns plain JS objects

    if (!allCreators || allCreators.length === 0) {
      return res.status(400).json({ message: "Creators Details not Found" });
    }

    // Map creators and include feed count + createdAt
    const creators = await Promise.all(
      allCreators.map(async (acc) => {
        const user = acc.userId || {};
        const profile = user.profileSettings || {};

        // 🔹 Aggregate feed counts by type
        const feedStats = await Feed.aggregate([
          {
            $match: { createdByAccount: acc._id }
          },
          {
            $group: {
              _id: "$type",
              count: { $sum: 1 }
            }
          }
        ]);

        // Convert stats to easy lookup
        const statsMap = feedStats.reduce((map, obj) => {
          map[obj._id] = obj.count;
          return map;
        }, {});

        const imageCount = statsMap["image"] || 0;
        const videoCount = statsMap["video"] || 0;
        const totalFeeds = imageCount + videoCount;

        return {
          accountId: acc._id,
          userName: user.userName || "Unknown",
          email: user.email || "",
          profileAvatar: profile.profileAvatar || "",
          followers: null, // placeholder
          totalFeeds,
          imageCount,
          videoCount,
          createdAt: acc.createdAt
        };
      })
    );

    res.status(200).json({
      total: creators.length,
      creators
    });
  } catch (err) {
    console.error(err);
    res
      .status(500)
      .json({ message: "Cannot Fetch Creator Details", error: err });
  }
};


exports.getAllTrendingCreators = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      search = "",
      sortBy = "trendingScore",
      sortOrder = "desc",
      minScore,
      maxScore,
      minFollowers,
      maxFollowers,
      contentType, // 'image', 'video', or 'all'
    } = req.query;

    const skip = (page - 1) * limit;
    const sortDirection = sortOrder === "desc" ? -1 : 1;

    // -----------------------------------------
    // 1️⃣ Build base query
    // -----------------------------------------
    let query = {};

    // Search filter (by userName from trending creators collection)
    if (search) {
      query.userName = { $regex: search, $options: "i" };
    }

    // Trending score range filter
    if (minScore || maxScore) {
      query.trendingScore = {};
      if (minScore) query.trendingScore.$gte = Number(minScore);
      if (maxScore) query.trendingScore.$lte = Number(maxScore);
    }

    // Follower count range filter
    if (minFollowers || maxFollowers) {
      query.followerCount = {};
      if (minFollowers) query.followerCount.$gte = Number(minFollowers);
      if (maxFollowers) query.followerCount.$lte = Number(maxFollowers);
    }

    // -----------------------------------------
    // 2️⃣ Fetch trending creators with pagination
    // -----------------------------------------
    const creatorsQuery = TrendingCreators.find(query)
      .sort({ [sortBy]: sortDirection })
      .skip(skip)
      .limit(Number(limit))
      .lean();

    const totalCountQuery = TrendingCreators.countDocuments(query);

    const [creators, totalCount] = await Promise.all([
      creatorsQuery,
      totalCountQuery,
    ]);

    if (!creators.length) {
      return res.status(200).json({
        success: true,
        creators: [],
        pagination: {
          page: Number(page),
          limit: Number(limit),
          totalCount,
          totalPages: Math.ceil(totalCount / limit),
        },
      });
    }

    // -----------------------------------------
    // 3️⃣ Get all userIds
    // -----------------------------------------
    const userIds = creators.map((c) => c.userId);

    // -----------------------------------------
    // 4️⃣ Fetch all profile settings in ONE query
    // -----------------------------------------
    const profiles = await ProfileSettings.find({
      userId: { $in: userIds },
    })
      .select("userId userName profileAvatar")
      .lean();

    const profileMap = {};
    profiles.forEach((p) => {
      profileMap[p.userId.toString()] = p;
    });

    // -----------------------------------------
    // 5️⃣ Fetch post counts (FAST aggregation)
    // -----------------------------------------
    const postCounts = await Feed.aggregate([
      {
        $match: {
          createdByAccount: { $in: userIds },
          ...(contentType && contentType !== "all"
            ? { type: contentType }
            : {}),
        },
      },
      {
        $group: {
          _id: "$createdByAccount",
          totalPosts: { $sum: 1 },
          imagePosts: {
            $sum: {
              $cond: [{ $eq: ["$type", "image"] }, 1, 0],
            },
          },
          videoPosts: {
            $sum: {
              $cond: [{ $eq: ["$type", "video"] }, 1, 0],
            },
          },
        },
      },
    ]);

    const postMap = {};
    postCounts.forEach((pc) => {
      postMap[pc._id.toString()] = pc;
    });

    // -----------------------------------------
    // 6️⃣ Build final response
    // -----------------------------------------
    const result = creators.map((creator) => {
      const uid = creator.userId.toString();
      const profile = profileMap[uid];
      const postInfo = postMap[uid] || {
        totalPosts: 0,
        imagePosts: 0,
        videoPosts: 0,
      };

      return {
        userId: creator.userId,
        userName: profile?.userName || creator.userName || "Unknown",
        profileAvatar: profile?.profileAvatar || creator.profileAvatar || "",

        // Trending stats
        trendingScore: creator.trendingScore || 0,
        totalVideoViews: creator.totalVideoViews || 0,
        totalImageViews: creator.totalImageViews || 0,
        totalLikes: creator.totalLikes || 0,
        totalShares: creator.totalShares || 0,
        followerCount: creator.followerCount || 0,
        lastUpdated: creator.lastUpdated,

        // Post counts
        totalPosts: postInfo.totalPosts,
        imagePosts: postInfo.imagePosts,
        videoPosts: postInfo.videoPosts,
      };
    });

    // -----------------------------------------
    // 7️⃣ Send response with pagination
    // -----------------------------------------
    res.status(200).json({
      success: true,
      creators: result,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        totalCount,
        totalPages: Math.ceil(totalCount / limit),
      },
    });

  } catch (error) {
    console.error("Error fetching trending creators:", error);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};




exports.adminGetTrendingFeeds = async (req, res) => {
  try {
    const {
      limit = 20,
      type = "all",
      search = "",
      sortBy = "trendingScore",
      sortOrder = "desc"
    } = req.query;

    const limitNumber = parseInt(limit);

    // -------------------------------------------------------
    // 1️⃣ FETCH TRENDING STATS (ImageStats + VideoStats)
    // -------------------------------------------------------
    const [imageStats, videoStats] = await Promise.all([
      ImageStats.find({})
        .sort({ totalViews: -1, lastViewed: -1 })
        .limit(limitNumber)
        .lean(),

      VideoStats.find({})
        .sort({ totalViews: -1, lastViewed: -1 })
        .limit(limitNumber)
        .lean()
    ]);

    const trendingMap = new Map();

    imageStats.forEach(s => {
      trendingMap.set(s.imageId.toString(), {
        feedId: s.imageId,
        totalViews: s.totalViews || 0,
        lastViewed: s.lastViewed
      });
    });

    videoStats.forEach(s => {
      trendingMap.set(s.videoId.toString(), {
        feedId: s.videoId,
        totalViews: s.totalViews || 0,
        lastViewed: s.lastViewed
      });
    });

    const trendingFeedIds = [...trendingMap.keys()];

    if (trendingFeedIds.length === 0) {
      return res.json({
        message: "No trending feeds found",
        data: [],
        total: 0
      });
    }

    // -------------------------------------------------------
    // 2️⃣ BUILD FEED QUERY
    // -------------------------------------------------------
    const feedQuery = { _id: { $in: trendingFeedIds } };

    // Filter by type
    if (type && type !== "all") {
      feedQuery.type = type;
    }

    // -------------------------------------------------------
    // 3️⃣ APPLY SEARCH FILTER (CORRECTED — NO $options ERROR)
    // -------------------------------------------------------
    if (search) {
      const searchRegex = new RegExp(search, "i");

      // 1. Search profiles
      const matchedProfiles = await ProfileSettings.find({
        $or: [
          { userName: searchRegex },
          { name: searchRegex },
          { lastName: searchRegex }
        ]
      })
        .select("userId adminId childAdminId")
        .lean();

      const matchedOwnerIds = [];

      matchedProfiles.forEach(p => {
        if (p.userId) matchedOwnerIds.push(p.userId.toString());
        if (p.adminId) matchedOwnerIds.push(p.adminId.toString());
        if (p.childAdminId) matchedOwnerIds.push(p.childAdminId.toString());
      });

      // 2. Search feed by ID (exact only)
      let feedIdMatch = null;
      if (mongoose.isValidObjectId(search)) {
        feedIdMatch = new mongoose.Types.ObjectId(search);
      }

      // build OR filter
      feedQuery.$or = [];

      if (matchedOwnerIds.length) {
        feedQuery.$or.push({ createdByAccount: { $in: matchedOwnerIds } });
      }

      if (feedIdMatch) {
        feedQuery.$or.push({ _id: feedIdMatch });
      }

      // if no search matches → return empty result
      if (feedQuery.$or.length === 0) {
        return res.json({
          message: "No matching feeds",
          data: [],
          total: 0
        });
      }
    }

    // -------------------------------------------------------
    // 4️⃣ FETCH FEEDS
    // -------------------------------------------------------
    const feeds = await Feed.find(feedQuery)
      .select("_id postType mediaUrl createdByAccount roleRef createdAt")
      .lean();

    const ownerIds = feeds.map(f => f.createdByAccount?.toString()).filter(Boolean);

    // -------------------------------------------------------
    // 5️⃣ FETCH ENGAGEMENT (likes, shares, downloads, saves, dislikes)
    // -------------------------------------------------------
    const engagement = await UserFeedActions.aggregate([
      {
        $facet: {
          likes: [
            { $unwind: "$likedFeeds" },
            { $group: { _id: "$likedFeeds.feedId", count: { $sum: 1 } } }
          ],
          shares: [
            { $unwind: "$sharedFeeds" },
            { $group: { _id: "$sharedFeeds.feedId", count: { $sum: 1 } } }
          ],
          downloads: [
            { $unwind: "$downloadedFeeds" },
            { $group: { _id: "$downloadedFeeds.feedId", count: { $sum: 1 } } }
          ],
          saves: [
            { $unwind: "$savedFeeds" },
            { $group: { _id: "$savedFeeds.feedId", count: { $sum: 1 } } }
          ],
          dislikes: [
            { $unwind: "$disLikeFeeds" },
            { $group: { _id: "$disLikeFeeds.feedId", count: { $sum: 1 } } }
          ]
        }
      },
      {
        $project: {
          allStats: {
            $concatArrays: [
              { $map: { input: "$likes", as: "x", in: { _id: "$$x._id", type: "likes", count: "$$x.count" } } },
              { $map: { input: "$shares", as: "x", in: { _id: "$$x._id", type: "shares", count: "$$x.count" } } },
              { $map: { input: "$downloads", as: "x", in: { _id: "$$x._id", type: "downloads", count: "$$x.count" } } },
              { $map: { input: "$saves", as: "x", in: { _id: "$$x._id", type: "saves", count: "$$x.count" } } },
              { $map: { input: "$dislikes", as: "x", in: { _id: "$$x._id", type: "dislikes", count: "$$x.count" } } }
            ]
          }
        }
      },
      { $unwind: "$allStats" },
      {
        $group: {
          _id: "$allStats._id",
          likes: { $sum: { $cond: [{ $eq: ["$allStats.type", "likes"] }, "$allStats.count", 0] } },
          shares: { $sum: { $cond: [{ $eq: ["$allStats.type", "shares"] }, "$allStats.count", 0] } },
          downloads: { $sum: { $cond: [{ $eq: ["$allStats.type", "downloads"] }, "$allStats.count", 0] } },
          saves: { $sum: { $cond: [{ $eq: ["$allStats.type", "saves"] }, "$allStats.count", 0] } },
          dislikes: { $sum: { $cond: [{ $eq: ["$allStats.type", "dislikes"] }, "$allStats.count", 0] } }
        }
      }
    ]);

    const engagementMap = {};
    engagement.forEach(e => {
      if (e._id) {
        engagementMap[e._id.toString()] = {
          likes: e.likes || 0,
          shares: e.shares || 0,
          downloads: e.downloads || 0,
          saves: e.saves || 0,
          dislikes: e.dislikes || 0
        };
      }
    });

    // -------------------------------------------------------
    // 6️⃣ FETCH PROFILE SETTINGS OF CREATORS
    // -------------------------------------------------------
    const profiles = await ProfileSettings.find({
      $or: [
        { userId: { $in: ownerIds } },
        { adminId: { $in: ownerIds } },
        { childAdminId: { $in: ownerIds } }
      ]
    })
      .select("userId adminId childAdminId userName profileAvatar email")
      .lean();

    const profileMap = {};
    profiles.forEach(p => {
      if (p.userId) profileMap[p.userId.toString()] = p;
      if (p.adminId) profileMap[p.adminId.toString()] = p;
      if (p.childAdminId) profileMap[p.childAdminId.toString()] = p;
    });

    // -------------------------------------------------------
    // 7️⃣ BUILD FINAL TRENDING RESPONSE
    // -------------------------------------------------------
    let finalData = feeds.map(feed => {
      const stats = trendingMap.get(feed._id.toString()) || {};
      const e = engagementMap[feed._id.toString()] || {};
      const owner = profileMap[feed.createdByAccount?.toString()] || {};

      const trendingScore =
        (stats.totalViews || 0) * 3 +
        (e.likes || 0) * 2 +
        (e.shares || 0) * 2 +
        (e.downloads || 0) * 1;

      return {
        feedId: feed._id,
        type: feed.postType || "image",
        contentUrl: getMediaUrl(feed.mediaUrl),
        createdAt: feed.createdAt,

        createdBy: {
          _id: feed.createdByAccount,
          userName: owner.userName || "Unknown",
          avatar: getMediaUrl(owner.profileAvatar),
          email: owner.email || null
        },

        views: stats.totalViews || 0,
        lastViewed: stats.lastViewed || null,
        likes: e.likes || 0,
        shares: e.shares || 0,
        downloads: e.downloads || 0,
        saves: e.saves || 0,
        dislikes: e.dislikes || 0,

        trendingScore
      };
    });

    // -------------------------------------------------------
    // 8️⃣ SORT BY FIELD
    // -------------------------------------------------------
    finalData.sort((a, b) => {
      const valA = a[sortBy] ?? 0;
      const valB = b[sortBy] ?? 0;

      return sortOrder === "asc" ? valA - valB : valB - valA;
    });

    // Add ranks
    finalData = finalData.map((d, i) => ({ ...d, rank: i + 1 }));

    // Apply limit
    const limitedData = finalData.slice(0, limitNumber);

    return res.json({
      message: "Trending feeds fetched successfully",
      data: limitedData,
      total: limitedData.length,
      filters: { type, sortBy, sortOrder, limit },
      timestamp: new Date().toISOString()
    });

  } catch (err) {
    console.error("❌ Error fetching trending feeds:", err);
    return res.status(500).json({
      message: "Internal Server Error",
      error: err.message
    });
  }
};



