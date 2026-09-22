const UserActivity = require("../../models/userModels/userActivitySchema");


exports.getMyActivities = async (req, res) => {
  try {
    const userId = req.Id;

    if (!userId) {
      return res.status(400).json({ success: false, message: "User ID missing" });
    }

    // 🔥 Get today's date range
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);   // 00:00

    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999); // 23:59

    // 🔥 Query only today’s activities
    const activities = await UserActivity.find({
      userId,
      createdAt: { $gte: startOfDay, $lte: endOfDay }
    })
      .sort({ createdAt: -1 })
      .populate("targetId", "title userName companyName");

    res.json({ success: true, activities });

  } catch (err) {
    console.error("Error fetching today's activities:", err);
    res.status(500).json({ error: err.message });
  }
};

const Feed = require("../../models/feedModel");
const UnifiedUserView = require("../../models/userModels/userViewFeedsModel");
const UserFeedActions = require("../../models/userFeedInterSectionModel");

exports.getUserActivitiesForAdmin = async (req, res) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({ success: false, message: "User ID missing" });
    }

    const [rawActivities, userFeedActions, userViews] = await Promise.all([
      UserActivity.find({ userId })
        .sort({ createdAt: -1 })
        .limit(100)
        .populate({
          path: "targetId",
          select: "_id title caption description postType mediaUrl files contentUrl category duration createdAt userName displayName profileAvatar",
          populate: { path: "category", select: "name categoriesName" }
        })
        .lean()
        .catch(() => []),
      UserFeedActions.findOne({ userId })
        .populate({
          path: "watchedFeeds.feedId",
          select: "_id title caption description postType mediaUrl files contentUrl category duration createdAt",
          populate: { path: "category", select: "name categoriesName" }
        })
        .populate({
          path: "likedFeeds.feedId",
          select: "_id title caption description postType mediaUrl files contentUrl category duration createdAt",
          populate: { path: "category", select: "name categoriesName" }
        })
        .populate({
          path: "savedFeeds.feedId",
          select: "_id title caption description postType mediaUrl files contentUrl category duration createdAt",
          populate: { path: "category", select: "name categoriesName" }
        })
        .lean()
        .catch(() => null),
      UnifiedUserView.find({ userId })
        .sort({ createdAt: -1 })
        .limit(50)
        .populate({
          path: "feedId",
          select: "_id title caption description postType mediaUrl files contentUrl category duration createdAt",
          populate: { path: "category", select: "name categoriesName" }
        })
        .populate("categoryId", "name categoriesName")
        .lean()
        .catch(() => [])
    ]);

    const activityList = [];
    const seenActionKeys = new Set();

    // 1. Process UserActivity records
    rawActivities.forEach(act => {
      const target = act.targetId;
      const isFeed = act.targetModel === "Feed" || (!act.targetModel && (target?.mediaUrl || target?.postType || act.metadata?.feedId));
      const feedId = isFeed ? (target?._id?.toString() || act.metadata?.feedId || null) : null;
      
      const key = `${act.actionType}_${feedId || act.targetId?._id || act._id}`;
      seenActionKeys.add(key);

      const categoryName = isFeed
        ? ((Array.isArray(target?.category) && target.category[0]?.name) ||
           target?.category?.name ||
           act.metadata?.categoryName ||
           act.metadata?.category ||
           "General")
        : (act.targetModel === "Categories" ? (target?.name || target?.categoriesName || "Category") : null);

      const mediaUrl = isFeed
        ? (target?.mediaUrl || (target?.files && target.files[0]?.url) || target?.contentUrl || act.metadata?.mediaUrl || null)
        : (target?.profileAvatar || null);

      const postType = isFeed
        ? (target?.postType || act.metadata?.postType || (act.actionType === "WATCH_FEED" ? "video" : "image"))
        : null;

      activityList.push({
        _id: act._id,
        actionType: act.actionType,
        targetModel: act.targetModel || (isFeed ? "Feed" : "User"),
        targetId: target?._id || act.targetId,
        feedId,
        title: target?.title || target?.caption || target?.userName || target?.displayName || act.metadata?.title || act.metadata?.caption || act.actionType.replace(/_/g, " "),
        description: target?.description || act.metadata?.description || "",
        categoryName: categoryName || "General",
        mediaUrl,
        postType,
        watchDuration: act.metadata?.watchDuration || act.metadata?.watchedSeconds || target?.duration || 0,
        metadata: act.metadata || {},
        deviceType: act.metadata?.deviceType || "app",
        createdAt: act.createdAt || new Date(),
        updatedAt: act.updatedAt || act.createdAt || new Date()
      });
    });

    // 2. Add watched feeds from UserFeedActions if not already present
    if (userFeedActions?.watchedFeeds && Array.isArray(userFeedActions.watchedFeeds)) {
      userFeedActions.watchedFeeds.forEach(item => {
        const feed = item.feedId;
        if (feed && feed._id) {
          const feedId = feed._id.toString();
          const key = `WATCH_FEED_${feedId}`;
          if (!seenActionKeys.has(key)) {
            seenActionKeys.add(key);
            const categoryName = (Array.isArray(feed.category) && feed.category[0]?.name) || feed.category?.name || "General";
            const mediaUrl = feed.mediaUrl || (feed.files && feed.files[0]?.url) || feed.contentUrl || null;
            activityList.push({
              _id: item._id || feedId,
              actionType: "WATCH_FEED",
              targetModel: "Feed",
              targetId: feed._id,
              feedId,
              title: feed.title || feed.caption || "Video Feed",
              description: feed.description || "",
              categoryName,
              mediaUrl,
              postType: feed.postType || "video",
              watchDuration: feed.duration || 0,
              metadata: { source: "UserFeedActions" },
              deviceType: "app",
              createdAt: item.watchedAt || new Date(),
              updatedAt: item.watchedAt || new Date()
            });
          }
        }
      });
    }

    // 3. Add liked feeds from UserFeedActions if not present
    if (userFeedActions?.likedFeeds && Array.isArray(userFeedActions.likedFeeds)) {
      userFeedActions.likedFeeds.forEach(item => {
        const feed = item.feedId;
        if (feed && feed._id) {
          const feedId = feed._id.toString();
          const key = `LIKE_POST_${feedId}`;
          if (!seenActionKeys.has(key)) {
            seenActionKeys.add(key);
            const categoryName = (Array.isArray(feed.category) && feed.category[0]?.name) || feed.category?.name || "General";
            const mediaUrl = feed.mediaUrl || (feed.files && feed.files[0]?.url) || feed.contentUrl || null;
            activityList.push({
              _id: item._id || feedId,
              actionType: "LIKE_POST",
              targetModel: "Feed",
              targetId: feed._id,
              feedId,
              title: feed.title || feed.caption || "Liked Post",
              description: feed.description || "",
              categoryName,
              mediaUrl,
              postType: feed.postType || "image",
              watchDuration: 0,
              metadata: { source: "UserFeedActions" },
              deviceType: "app",
              createdAt: item.likedAt || new Date(),
              updatedAt: item.likedAt || new Date()
            });
          }
        }
      });
    }

    // 4. Add unified views if not present
    userViews.forEach(v => {
      const feed = v.feedId;
      if (feed && feed._id) {
        const feedId = feed._id.toString();
        const actionType = v.postType === "video" ? "WATCH_FEED" : "VIEW_FEED";
        const key = `${actionType}_${feedId}`;
        if (!seenActionKeys.has(key)) {
          seenActionKeys.add(key);
          const categoryName = v.categoryId?.name || v.categoryId?.categoriesName ||
            (Array.isArray(feed.category) && feed.category[0]?.name) ||
            feed.category?.name || "General";
          const mediaUrl = feed.mediaUrl || (feed.files && feed.files[0]?.url) || feed.contentUrl || null;
          activityList.push({
            _id: v._id,
            actionType,
            targetModel: "Feed",
            targetId: feed._id,
            feedId,
            title: feed.title || feed.caption || (v.postType === "video" ? "Video Feed" : "Image Feed"),
            description: feed.description || "",
            categoryName,
            mediaUrl,
            postType: v.postType || feed.postType || "image",
            watchDuration: v.watchDuration || feed.duration || 0,
            metadata: { deviceType: v.deviceType || "app" },
            deviceType: v.deviceType || "app",
            createdAt: v.createdAt || new Date(),
            updatedAt: v.createdAt || new Date()
          });
        }
      }
    });

    // Sort descending by date
    activityList.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    res.json({ success: true, activities: activityList });

  } catch (err) {
    console.error("Error fetching user activities for admin:", err);
    res.status(500).json({ error: err.message });
  }
};
