const Categories = require('../models/categorySchema');
const Feed = require('../models/feedModel');
const mongoose = require('mongoose')
const { feedTimeCalculator } = require("../middlewares/feedTimeCalculator");
const UserLanguage = require('../models/userModels/userLanguageModel');
const { getLanguageCode } = require("../middlewares/helper/languageHelper");
const UserCategory = require("../models/userModels/userCategotyModel");
const ProfileSettings = require('../models/profileSettingModel');

const { extractThemeColor } = require("../middlewares/helper/extractThemeColor.js");
const UserFeedActions = require('../models/userFeedInterSectionModel');



exports.getAllCategories = async (req, res) => {
  try {
    // Check cache first
    const cacheKey = 'allCategories';
    const cached = categoryStatsCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
      return res.status(200).json({
        message: "Categories retrieved successfully",
        categories: cached.data,
      });
    }

    // Step 1: Fetch all categories (only _id, name, subcategories)
    const categories = await Categories.find({}, { _id: 1, name: 1, subcategories: 1 })
      .sort({ createdAt: -1 })
      .lean();

    if (!categories.length) {
      return res.status(404).json({ message: "No categories found" });
    }

    // Step 2: Aggregate feed stats by category (category stored as Array of ObjectId)
    const feedStats = await Feed.aggregate([
      { $unwind: "$category" },
      {
        $group: {
          _id: "$category", // ObjectId reference to Categories
          totalFeeds: { $sum: 1 },
          videoCount: {
            $sum: { $cond: [{ $eq: ["$postType", "video"] }, 1, 0] },
          },
          imageCount: {
            $sum: { $cond: [{ $eq: ["$postType", "image"] }, 1, 0] },
          },
          audioCount: {
            $sum: { $cond: [{ $eq: ["$postType", "image+audio"] }, 1, 0] },
          },
        },
      },
    ]);

    // Step 3: Merge category details with feed stats
    const formattedCategories = categories.map((cat) => {
      const stat = feedStats.find((f) => f._id.toString() === cat._id.toString());
      return {
        categoryId: cat._id,
        categoriesName: cat.name,
        subcategories: cat.subcategories || [],
        totalFeeds: stat ? stat.totalFeeds : 0,
        videoCount: stat ? stat.videoCount : 0,
        imageCount: stat ? stat.imageCount : 0,
        audioCount: stat ? stat.audioCount : 0,
      };
    });

    // Cache the result
    categoryStatsCache.set(cacheKey, { data: formattedCategories, timestamp: Date.now() });

    // Step 4: Send success response
    return res.status(200).json({
      message: "Categories retrieved successfully",
      categories: formattedCategories,
    });
  } catch (error) {
    console.error("Error fetching categories:", error);
    return res.status(500).json({
      message: "Server error",
      error: error.message,
    });
  }
};


exports.getUserPostCategories = async (req, res) => {
  try {
    // Fetch only category _id and name
    const categories = await Categories.find({}, { _id: 1, name: 1 })
      .sort({ createdAt: -1 })
      .lean();

    if (!categories.length) {
      return res.status(404).json({ message: "No categories found" });
    }

    // Format response (optional renaming for clarity)
    const formattedCategories = categories.map(cat => ({
      categoryId: cat._id,
      categoryName: cat.name,
    }));

    // Send response
    return res.status(200).json({
      message: "Categories retrieved successfully",
      categories: formattedCategories,
    });
  } catch (error) {
    console.error("Error fetching categories:", error);
    return res.status(500).json({
      message: "Server error",
      error: error.message,
    });
  }
};




exports.getCategoriesWithFeeds = async (req, res) => {
  try {
    // 1️⃣ Fetch non-interested categories if user is authenticated
    let nonInterestedCategoryIds = [];
    const userId = req.Id;
    if (userId) {
      const userCategory = await UserCategory.findOne({ userId }).select("nonInterestedCategories").lean();
      nonInterestedCategoryIds = (userCategory?.nonInterestedCategories || []).map(id => id.toString());
    }

    // 2️⃣ Fetch categories that have at least one feed
    const categories = await Categories.find({
      feedIds: { $exists: true, $ne: [] },
      _id: { $nin: nonInterestedCategoryIds }
    })
      .select("_id name feedIds")
      .lean();

    if (!categories.length) {
      return res.status(404).json({
        message: "No categories with feeds found",
        categories: [],
      });
    }

    // 3️⃣ Optional: filter out categories where all feedIds do not exist in Feed collection
    const filteredCategories = [];
    for (const cat of categories) {
      const feedCount = await Feed.countDocuments({
        _id: { $in: cat.feedIds },
        category: { $nin: nonInterestedCategoryIds }
      });
      if (feedCount > 0) {
        filteredCategories.push({
          categoryId: cat._id,
          categoryName: cat.name,
          totalFeeds: feedCount,
        });
      }
    }

    if (!filteredCategories.length) {
      return res.status(404).json({
        message: "No categories with active feeds found",
        categories: [],
      });
    }

    // 3️⃣ Return response
    res.status(200).json({
      message: "Categories with feeds retrieved successfully",
      categories: filteredCategories,
    });
  } catch (error) {
    console.error("Error fetching categories with feeds:", error);
    res.status(500).json({
      message: "Server error",
      error: error.message,
    });
  }
};







// Save interested category (single or multiple)
exports.saveInterestedCategory = async (req, res) => {
  try {
    const { categoryIds } = req.body;
    const userId = req.Id;
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: "Invalid userId" });
    }

    // Ensure categoryIds is always an array
    const categories = Array.isArray(categoryIds) ? categoryIds : [categoryIds];

    // Validate all category IDs
    for (const id of categories) {
      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ message: `Invalid categoryId: ${id}` });
      }
    }

    let userCategory = await UserCategory.findOne({ userId });

    if (!userCategory) {
      // Create new document if not exists
      userCategory = new UserCategory({
        userId,
        interestedCategories: categories.map(id => ({ categoryId: id })),
      });
    } else {
      // Add categories to interestedCategories if not already present
      categories.forEach(id => {
        const exists = userCategory.interestedCategories.some(c => c.categoryId.toString() === id);
        if (!exists) {
          userCategory.interestedCategories.push({ categoryId: id });
        } else {
          // Update timestamp if already exists
          userCategory.interestedCategories = userCategory.interestedCategories.map(c =>
            c.categoryId.toString() === id ? { ...c.toObject(), updatedAt: new Date() } : c
          );
        }

        // Remove from nonInterestedCategories if exists
        userCategory.nonInterestedCategories = userCategory.nonInterestedCategories.filter(
          c => c.categoryId.toString() !== id
        );
      });
    }

    await userCategory.save();

    res.status(200).json({ message: "Interested categories saved successfully", userCategory });
  } catch (error) {
    console.error("Error saving interested categories:", error);
    res.status(500).json({ message: "Server error" });
  }
};








// In-memory cache for category stats
const categoryStatsCache = new Map();
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

exports.clearCategoryCache = () => {
  categoryStatsCache.clear();
};

exports.getfeedWithCategoryWithId = async (req, res) => {
  try {
    const categoryId = req.params.id;
    const userId = req.Id; // assuming middleware adds req.Id

    let hiddenPostIds = [];
    let nonInterestedCategoryIds = [];

    if (userId) {
      const [hiddenPosts, userCategories] = await Promise.all([
        UserFeedActions.findOne({ userId }).select("hiddenFeeds").lean(), // Adjust model if needed
        UserCategory.findOne({ userId }).select("nonInterestedCategories").lean()
      ]);

      // Attempt to get from HiddenPost model as well (consistent with feedsController)
      const hiddenPostDocs = await mongoose.model("HiddenPost").find({ userId }).select("postId").lean();
      hiddenPostIds = hiddenPostDocs.map(h => h.postId.toString());

      nonInterestedCategoryIds = (userCategories?.nonInterestedCategories || []).map(id => id.toString());
    }

    if (nonInterestedCategoryIds.includes(categoryId.toString())) {
      return res.status(403).json({ message: "This category is marked as non-interested" });
    }

    if (!mongoose.Types.ObjectId.isValid(categoryId)) {
      return res.status(400).json({ message: "Invalid category ID" });
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // 1️⃣ Find category
    const category = await Categories.findById(categoryId).lean();
    if (!category) {
      return res.status(404).json({ message: "Category not found" });
    }

    // Optimized: Pre-fetch profiles for batch processing
    const feeds = await Feed.find({
      category: categoryId,
      _id: { $nin: hiddenPostIds },
    })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .select("type language category contentUrl roleRef createdByAccount createdAt")
      .lean();

    if (!feeds.length) {
      return res.status(200).json({
        category: {
          categoryId: category._id,
          categoryName: category.name,
        },
        feeds: [],
        pagination: {
          total: 0,
          page,
          limit,
          hasMore: false,
        },
      });
    }

    // Collect unique creator IDs for batch profile lookup
    const creatorIds = [...new Set(feeds.map(f => f.createdByAccount.toString()))];

    // Batch fetch profiles
    const profiles = await ProfileSettings.find({
      $or: [
        { userId: { $in: creatorIds } },
        { adminId: { $in: creatorIds } },
        { childAdminId: { $in: creatorIds } },
      ]
    }).select("userId adminId childAdminId userName profileAvatar").lean();

    const profileMap = {};
    profiles.forEach(p => {
      if (p.userId) profileMap[p.userId.toString()] = { userName: p.userName, profileAvatar: p.profileAvatar };
      if (p.adminId) profileMap[p.adminId.toString()] = { userName: p.userName, profileAvatar: p.profileAvatar };
      if (p.childAdminId) profileMap[p.childAdminId.toString()] = { userName: p.userName, profileAvatar: p.profileAvatar };
    });

    // Batch fetch analytics using parallel aggregations
    const feedIds = feeds.map(f => f._id);
    const [likesResult, dislikesResult, downloadsResult, sharesResult] = await Promise.all([
      UserFeedActions.aggregate([
        { $unwind: "$likedFeeds" },
        { $match: { "likedFeeds.feedId": { $in: feedIds } } },
        { $group: { _id: "$likedFeeds.feedId", count: { $sum: 1 } } }
      ]),
      UserFeedActions.aggregate([
        { $unwind: "$disLikeFeeds" },
        { $match: { "disLikeFeeds.feedId": { $in: feedIds } } },
        { $group: { _id: "$disLikeFeeds.feedId", count: { $sum: 1 } } }
      ]),
      UserFeedActions.aggregate([
        { $unwind: "$downloadedFeeds" },
        { $match: { "downloadedFeeds.feedId": { $in: feedIds } } },
        { $group: { _id: "$downloadedFeeds.feedId", count: { $sum: 1 } } }
      ]),
      UserFeedActions.aggregate([
        { $unwind: "$sharedFeeds" },
        { $match: { "sharedFeeds.feedId": { $in: feedIds } } },
        { $group: { _id: "$sharedFeeds.feedId", count: { $sum: 1 } } }
      ])
    ]);

    const analyticsMap = {};
    likesResult.forEach(r => analyticsMap[r._id.toString()] = { ...analyticsMap[r._id.toString()], likesCount: r.count });
    dislikesResult.forEach(r => analyticsMap[r._id.toString()] = { ...analyticsMap[r._id.toString()], dislikesCount: r.count });
    downloadsResult.forEach(r => analyticsMap[r._id.toString()] = { ...analyticsMap[r._id.toString()], downloadsCount: r.count });
    sharesResult.forEach(r => analyticsMap[r._id.toString()] = { ...analyticsMap[r._id.toString()], shareCount: r.count });

    // Batch fetch user actions
    const userActions = await UserFeedActions.findOne({ userId }).lean();
    const userActionMap = {};
    if (userActions) {
      userActions.likedFeeds?.forEach(l => userActionMap[l.feedId.toString()] = { ...userActionMap[l.feedId.toString()], isLiked: true });
      userActions.savedFeeds?.forEach(s => userActionMap[s.feedId.toString()] = { ...userActionMap[s.feedId.toString()], isSaved: true });
      userActions.disLikeFeeds?.forEach(d => userActionMap[d.feedId.toString()] = { ...userActionMap[d.feedId.toString()], isDisliked: true });
    }

    // 3️⃣ Enrich feeds with theme colors and avatar frames (batch process theme colors)


    const enrichedFeeds = await Promise.all(
      feeds.map(async (feed) => {

        let themeColor = {
          primary: "#ffffff",
          secondary: "#cccccc",
          accent: "#999999",
          text: "#000000",
          gradient: "linear-gradient(135deg, #ffffff, #cccccc, #999999)",
        };
        try {
          const feedType = feed.type === "video" ? "video" : "image";
          themeColor = await extractThemeColor(feed.contentUrl, feedType);
        } catch (err) {
          console.warn(`Theme extraction failed for feed ${feed.feedId}:`, err.message);
        }

        const profile = profileMap[feed.createdByAccount.toString()] || {};
        const analytics = analyticsMap[feed._id.toString()] || {};
        const actions = userActionMap[feed._id.toString()] || {};

        return {
          feedId: feed._id,
          type: feed.type,
          language: feed.language,
          category: feed.category,
          contentUrl: feed.contentUrl,
          roleRef: feed.roleRef,
          createdByAccount: feed.createdByAccount,
          createdAt: feed.createdAt,
          userName: profile.userName,
          profileAvatar: profile.profileAvatar,
          ...analytics,
          viewsCount: 0, // Placeholder, implement if needed
          commentsCount: 0, // Placeholder, implement if needed
          ...actions,
          framedAvatar: feed.profileAvatar || null,
          themeColor,
          timeAgo: feedTimeCalculator(feed.createdAt),
        };
      })
    );

    // 4️⃣ Pagination
    const totalFeeds = await Feed.countDocuments({
      category: categoryId,
      _id: { $nin: hiddenPostIds },
    });

    res.status(200).json({
      category: {
        categoryId: category._id,
        categoryName: category.name,
      },
      feeds: enrichedFeeds,
      pagination: {
        total: totalFeeds,
        page,
        limit,
        hasMore: skip + feeds.length < totalFeeds,
      },
    });
  } catch (error) {
    console.error("Error fetching category feeds:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};








exports.getUserContentCategories = async (req, res) => {
  try {
    // 1️⃣ Get userId from token
    const userId = req.Id; // assuming middleware sets req.user
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized: user not found in token" });
    }

    // 2️⃣ Get user's preferred feed language
    const userLang = await UserLanguage.findOne({ userId }).lean();
    const feedLang = userLang?.feedLanguageCode
      ? getLanguageCode(userLang.feedLanguageCode)
      : null;

    const feedMatch = feedLang ? { language: feedLang } : {};

    // 3️⃣ Find all unique feed category IDs in user's language
    const categoryIds = await Feed.find(feedMatch).distinct("category");

    if (!categoryIds.length) {
      return res.status(404).json({
        message: "No categories with content found",
        categories: [],
      });
    }

    // 4️⃣ Check if user has a UserCategory record
    const userCategory = await UserCategory.findOne({ userId }).lean();
    const nonInterestedCategoryIds = (userCategory?.nonInterestedCategories || []).map(id => id.toString());

    let filteredCategoryIds = categoryIds.filter(id => !nonInterestedCategoryIds.includes(id.toString()));

    // 5️⃣ Fetch category details
    const categories = await Categories.find({ _id: { $in: filteredCategoryIds } })
      .select("_id name")
      .sort({ name: 1 })
      .lean();

    res.status(200).json({
      message: "Categories with content retrieved successfully",
      language: feedLang
        ? { code: userLang.feedLanguageCode, name: feedLang }
        : { code: null, name: "All Languages" },
      categories,
    });
  } catch (error) {
    console.error("Error fetching content categories:", error);
    res.status(500).json({
      message: "Server error",
      error: error.message,
    });
  }
};








exports.searchCategories = async (req, res) => {
  try {
    const userId = req.Id || req.body.userId;
    const query = req.body.query;

    if (!query || query.trim() === "") {
      return res.status(400).json({ message: "Query is required" });
    }

    // 1️⃣ Optional user language
    const userLang = await UserLanguage.findOne({ userId }).lean();
    const feedLang = userLang?.feedLanguageCode
      ? getLanguageCode(userLang.feedLanguageCode)
      : null;

    // 2️⃣ Build match condition for feeds
    const feedMatch = feedLang ? { language: feedLang } : {};

    // 3️⃣ Aggregate feeds -> categories -> filter by search query & count videos
    const categories = await Feed.aggregate([
      { $match: feedMatch },
      {
        $addFields: {
          categoryObjId: {
            $cond: [
              {
                $and: [
                  { $ne: ["$category", null] },
                  {
                    $regexMatch: {
                      input: { $toString: "$category" },
                      regex: /^[0-9a-fA-F]{24}$/
                    }
                  }
                ]
              },
              { $toObjectId: "$category" },
              null
            ]
          }
        }
      },
      {
        $group: {
          _id: "$categoryObjId",
          videoCount: {
            $sum: { $cond: [{ $eq: ["$postType", "video"] }, 1, 0] }
          }
        }
      },
      {
        $lookup: {
          from: "Categories",
          localField: "_id",
          foreignField: "_id",
          as: "category"
        }
      },
      { $unwind: "$category" },
      {
        $match: {
          "category.name": { $regex: query, $options: "i" }
        }
      },
      {
        $project: {
          _id: "$category._id",
          name: "$category.name",
          videoCount: 1
        }
      },
      { $limit: 10 }
    ]);

    if (!categories.length) {
      return res.status(404).json({ message: "No matching categories found" });
    }

    // 4️⃣ Send response
    return res.status(200).json({
      message: "Categories retrieved successfully",
      language: feedLang
        ? { code: userLang.feedLanguageCode, name: feedLang }
        : { code: null, name: "All Languages" },
      categories
    });
  } catch (error) {
    console.error("Error searching categories:", error);
    return res.status(500).json({ message: "Server error" });
  }
};







exports.getFeedLanguageCategories = async (req, res) => {
  try {
    const userId = req.Id;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized: user not found in token" });
    }

    // 1️⃣ Find user's preferred feed language
    const userLangDoc = await UserLanguage.findOne({ userId }).lean();
    const feedLanguageCode = userLangDoc?.feedLanguageCode;

    if (!feedLanguageCode) {
      return res.status(400).json({
        success: false,
        message: "Feed language not set for this user",
      });
    }

    // 2️⃣ Find all feeds in the user's preferred language
    const feeds = await Feed.find({ language: feedLanguageCode }).select("category").lean();

    if (!feeds.length) {
      return res.status(404).json({
        success: false,
        message: `No categories available for feeds in selected language (${getLanguageCode(feedLanguageCode)})`,
        categories: [],
      });
    }

    // 3️⃣ Extract unique category IDs
    const categoryIds = [...new Set(feeds.map(f => f.category?.toString()).filter(Boolean))];

    // 4️⃣ Fetch matching category details
    const categories = await Categories.find({ _id: { $in: categoryIds } })
      .select("_id name")
      .sort({ name: 1 })
      .lean();

    if (!categories.length) {
      return res.status(404).json({
        success: false,
        message: `No category details found for selected language (${getLanguageCode(feedLanguageCode)})`,
        categories: [],
      });
    }

    // ✅ 5️⃣ Send success response
    res.status(200).json({
      success: true,
      message: "Feed language categories fetched successfully",
      language: {
        code: feedLanguageCode,
        name: getLanguageCode(feedLanguageCode),
      },
      categories,
    });

  } catch (error) {
    console.error("Error fetching feed language categories:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching feed language categories",
      error: error.message,
    });
  }
};





exports.getFeedWithCategoryId = async (req, res) => {
  try {
    const { categoryId } = req.params;

    if (!categoryId) {
      return res.status(400).json({ message: "Category ID is required" });
    }

    // 1️⃣ Fetch all feeds in the given category
    const feeds = await Feed.find({ category: categoryId })
      .populate("category", "name") // optional: get category name
      .sort({ createdAt: -1 }) // latest first
      .lean();

    if (!feeds.length) {
      return res.status(404).json({ message: "No feeds found for this category" });
    }

    // 2️⃣ Get like counts for each feed
    const feedIds = feeds.map((f) => f._id);

    const actions = await UserFeedActions.aggregate([
      { $match: { "likedFeeds.feedId": { $in: feedIds } } },
      { $unwind: "$likedFeeds" },
      { $match: { "likedFeeds.feedId": { $in: feedIds } } },
      {
        $group: {
          _id: "$likedFeeds.feedId",
          likeCount: { $sum: 1 },
        },
      },
    ]);

    // 3️⃣ Map like counts to feeds
    const likeMap = {};
    actions.forEach((a) => {
      likeMap[a._id.toString()] = a.likeCount;
    });

    const feedsWithLikes = feeds.map((f) => ({
      ...f,
      likeCount: likeMap[f._id.toString()] || 0,
    }));

    res.status(200).json({
      message: "Feeds fetched successfully",
      categoryId,
      feeds: feedsWithLikes,
    });
  } catch (error) {
    console.error("Error fetching feeds:", error);
    res.status(500).json({
      message: "Server error",
      error: error.message,
    });
  }
};
















