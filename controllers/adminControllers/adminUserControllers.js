const Users = require("../../models/userModels/userModel.js");
const redisClient = require("../../Config/redisConfig");
const { userTimeAgo } = require('../../middlewares/userStatusTimeAgo.js');
const UserFeedActions = require('../../models/userFeedInterSectionModel');
const ProfileSettings = require('../../models/profileSettingModel.js');
const mongoose = require("mongoose");
const ImageStats = require("../../models/userModels/MediaSchema/imageViewModel.js")
const VideoStats = require("../../models/userModels/MediaSchema/videoViewStatusModel.js")
const UserDevices = require("../../models/userModels/userSession-Device/deviceModel");
const Subscriptions = require('../../models/subscriptionModels/userSubscriptionModel.js');
const UserLanguage = require('../../models/userModels/userLanguageModel.js');
const Follower = require("../../models/userFollowingModel.js");
const UserCategory = require('../../models/userModels/userCategotyModel.js');
const ImageView = require('../../models/userModels/MediaSchema/userImageViewsModel.js');
const VideoView = require('../../models/userModels/MediaSchema/userVideoViewModel.js');
const Feed = require('../../models/feedModel.js');
const Withdrawal = require('../../models/userModels/userRefferalModels/withdrawal.js');
const UserEarning = require('../../models/userModels/userRefferalModels/referralEarnings.js');
const Session = require('../../models/userModels/userSession-Device/sessionModel.js');
const UserSubscription = require("../../models/subscriptionModels/userSubscriptionModel.js");
const Account = require("../../models/accountSchemaModel.js");
const Report = require('../../models/feedReportModel.js');
const ReportType = require('../../models/userModels/Report/reportTypeModel');
const Followers = require("../../models/creatorFollowerModel.js");
const HiddenPost = require("../../models/userModels/hiddenPostSchema.js");
const UserComments = require("../../models/userCommentModel.js");
const UserEarnings = require('../../models/userModels/userRefferalModels/referralEarnings.js');
const UserFeedCategories = require('../../models/userModels/userCategotyModel.js');
const UserFollowings = require("../../models/userFollowingModel.js");
const UserReferral = require('../../models/userModels/userRefferalModels/userReferralModel.js');
const UserNotification = require("../../models/notificationModel.js");
const UserViews = require("../../models/userModels/MediaSchema/userImageViewsModel.js");
const { extractPublicId } = require("../../middlewares/helper/cloudnaryDetete.js");
const { deleteCloudinaryBatch } = require("../../middlewares/helper/geatherPubliceIds.js");
const { gatherFeedPublicIds } = require("../../middlewares/helper/geatherPubliceIds");
const UserSubscriptions = require("../../models/subscriptionModels/userSubscriptionModel.js");
const CommentLikes = require("../../models/commentsLikeModel.js");
const CreatorFollowers = require('../../models/creatorFollowerModel.js');
const Devices = require("../../models/userModels/userSession-Device/deviceModel.js");
const TrendingCreators = require("../../models/treandingCreators.js")





// Get single user detail
exports.getUserProfileDetailforAdmin = async (req, res) => {
  try {
    const { userId } = req.body; // from auth middleware

    if (!userId) {
      return res.status(400).json({ success: false, message: "User ID is required" });
    }

    // ✅ Run queries in parallel
    const [user, profile, languages] = await Promise.all([
      Users.findById(userId).select("userName email").lean(),
      ProfileSettings.findOne({ userId }).lean(),
      UserLanguage.find({ userId, active: true }).select("appLanguageCode feedLanguageCode").lean()
    ]);

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    return res.status(200).json({
      success: true,
      user: {
        ...user,
        profile,
        languages
      }
    });
  } catch (err) {
    console.error("Error fetching user profile:", err);
    return res.status(500).json({
      success: false,
      message: "Cannot fetch user profile",
      error: err.message
    });
  }
};

// Get user status with devices
exports.getUserStatus = async (req, res) => {

  try {
    const client = await getRedis();

    const users = await Users.find({}, "_id name role").lean();

    const result = [];

    for (const user of users) {
      const lastSeen = await client.get(`lastseen:${user._id}`);
      console.log(lastSeen)
      const sockets = await client.sMembers(`user:sockets:${user._id}`);

      // get devices
      const devices = [];
      for (const s of sockets) {
        const d = await client.hGetAll(`user:device:${user._id}:${s}`);
        if (Object.keys(d).length > 0) devices.push(d);
      }

      result.push({
        ...user,
        status: sockets.length > 0 ? "online" : "offline",
        lastSeen: sockets.length > 0 ? "now" : lastSeen ? userTimeAgo(lastSeen) : "unknown",
        devices,
      });
    }

    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong" });
  }
};


exports.getUsersByDate = async (req, res) => {
  try {
    const { date, type = "created" } = req.query;
    // type = "created" (default) or "updated"

    if (!date) {
      return res.status(400).json({ message: "Date is required" });
    }

    // Create start & end range for the day
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);

    const end = new Date(date);
    end.setHours(23, 59, 59, 999);

    // Choose filter field dynamically
    const filterField = type === "updated" ? "updatedAt" : "createdAt";

    // ✅ Query only required fields + populate
    const users = await Users.find(
      { [filterField]: { $gte: start, $lte: end } },
      "userName email profileSettings createdAt updatedAt" // projection
    )
      .populate("profileSettings") // one populate instead of multiple queries
      .lean(); // return plain JS objects (faster, less memory)

    if (!users || users.length === 0) {
      return res.status(404).json({ message: "No users found for this date" });
    }

    res.status(200).json({ users });
  } catch (err) {
    console.error("Error fetching users by date:", err);
    res.status(500).json({ message: "Cannot fetch user details", error: err.message });
  }
};


exports.getAllUserDetails = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 1000;
    const skip = (page - 1) * limit;

    // 1️⃣ Get total count for pagination metadata
    const totalUsers = await Users.countDocuments();

    // 2️⃣ Get paginated users
    const allUsers = await Users.find()
      .select(
        "userName _id email lastActiveAt lastLoginAt lastSeenAt createdAt subscription isBlocked isOnline profileSettings trialUsed referralCode referalCode referealCode gender phone phoneNumber"
      )
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    if (!allUsers || allUsers.length === 0) {
      return res.status(404).json({ message: "Users details not found" });
    }

    // 2️⃣ Extract userIds
    const userIds = allUsers.map((u) => u._id);

    // 3️⃣ Fetch profile settings (profile avatar & phone number)
    const profileSettingsList = await ProfileSettings.find({
      userId: { $in: userIds },
    })
      .select("userId profileAvatar phoneNumber gender")
      .lean();

    // Create quick lookup map for avatars, phone numbers and gender
    const profileMap = {};
    profileSettingsList.forEach((p) => {
      profileMap[p.userId.toString()] = {
        avatar: p.profileAvatar || null,
        phone: p.phoneNumber || null,
        gender: p.gender || null,
      };
    });

    // 4️⃣ Format final response
    const formattedUsers = allUsers.map((user) => ({
      userId: user._id,
      userName: user.userName,
      email: user.email,
      createdAt: user.createdAt,

      // 📌 USER ONLINE STATUS (Calculated with 20min threshold)
      isOnline: (() => {
        if (!user.isOnline) return false;
        if (!user.lastSeenAt) return false;
        const now = new Date();
        const diffInMinutes = (now - new Date(user.lastSeenAt)) / (1000 * 60);
        return diffInMinutes < 20; // Active in last 20 minutes
      })(),

      // 📌 LAST ACTIVE TIME (Already in User schema)
      lastActiveAt: user.lastActiveAt || null,

      // 📌 LAST LOGIN TIME (From User schema)
      lastLoginAt: user.lastLoginAt || null,

      // 📌 Avatar and Phone
      profileAvatar: profileMap[user._id.toString()]?.avatar || null,
      phone: profileMap[user._id.toString()]?.phone || user.phone || user.phoneNumber || null,
      gender: profileMap[user._id.toString()]?.gender || user.gender || null,
      referralCode: user.referralCode || user.referalCode || user.referealCode || null,

      // 📌 Subscription info
      subscription: user.subscription || {},
      subscriptionActive: user.subscription?.isActive || false,

      // 📌 Trial status calculation
      trialStatus: (() => {
        if (!user.trialUsed) return "Not Used";

        const now = new Date();
        const endDate = user.subscription?.endDate ? new Date(user.subscription.endDate) : null;
        const isTrial = user.subscription?.planType === 'trial';

        if (user.subscription?.isActive && isTrial && endDate && endDate > now) {
          return "Active";
        }
        return "Expired";
      })(),

      // 📌 Block status
      isBlocked: user.isBlocked,
    }));

    return res.status(200).json({
      users: formattedUsers,
      pagination: {
        total: totalUsers,
        page,
        limit,
        totalPages: Math.ceil(totalUsers / limit)
      }
    });
  } catch (err) {
    console.error("Error fetching users:", err);
    return res.status(500).json({
      message: "Cannot fetch user details",
      error: err.message,
    });
  }
};





exports.searchAllUserDetails = async (req, res) => {
  try {
    const { search } = req.query;
    let searchFilter = {};

    // -----------------------------------------
    // 1️⃣ APPLY SMART SEARCH FILTER (Improved)
    // -----------------------------------------
    if (search && search.trim() !== "") {
      const query = search.trim();

      const orConditions = [
        { userName: { $regex: query, $options: "i" } },
        { email: { $regex: query, $options: "i" } },
        { referralCode: { $regex: query, $options: "i" } },
      ];

      // Handle Numeric Search (Phone Number)
      if (/^\d+/.test(query)) {
        // Search phone field in User model (if any)
        orConditions.push({ phone: { $regex: query, $options: "i" } });

        // Search ProfileSettings for phoneNumber (Number field needs match)
        const numericQuery = parseInt(query, 10);
        if (!isNaN(numericQuery)) {
          const matchingProfiles = await ProfileSettings.find({
            phoneNumber: numericQuery
          }).select("userId").lean();

          if (matchingProfiles.length > 0) {
            const userIdsFromProfile = matchingProfiles.map(p => p.userId);
            orConditions.push({ _id: { $in: userIdsFromProfile } });
          }
        }
      }

      searchFilter.$or = orConditions;
    }

    // -----------------------------------------
    // 2️⃣ Fetch all users with search filter
    // -----------------------------------------
    const allUsers = await Users.find(searchFilter)
      .select(
        "userName _id email phone phoneNumber lastActiveAt lastLoginAt lastSeenAt createdAt subscription isBlocked isOnline profileSettings referralCode referalCode referealCode trialUsed gender"
      )
      .lean();

    if (!allUsers || allUsers.length === 0) {
      return res.status(200).json({ users: [], message: "No users found" });
    }

    // -----------------------------------------
    // 3️⃣ Fetch profile settings (avatars & phone numbers)
    const userIds = allUsers.map((u) => u._id);

    const profileSettingsList = await ProfileSettings.find({
      userId: { $in: userIds },
    })
      .select("userId profileAvatar phoneNumber gender")
      .lean();

    const profileMap = {};
    profileSettingsList.forEach((p) => {
      profileMap[p.userId.toString()] = {
        avatar: p.profileAvatar || null,
        phone: p.phoneNumber || null,
        gender: p.gender || null,
      };
    });

    // -----------------------------------------
    // 4️⃣ Build formatted response
    // -----------------------------------------
    const formattedUsers = allUsers.map((user) => ({
      userId: user._id,
      userName: user.userName,
      email: user.email,
      phone: profileMap[user._id.toString()]?.phone || user.phone || user.phoneNumber || null,
      gender: profileMap[user._id.toString()]?.gender || user.gender || null,
      referralCode: user.referralCode || user.referalCode || user.referealCode || null,
      createdAt: user.createdAt,
      isOnline: (() => {
        if (!user.isOnline) return false;
        if (!user.lastSeenAt) return false;
        const now = new Date();
        const diffInMinutes = (now - new Date(user.lastSeenAt)) / (1000 * 60);
        return diffInMinutes < 20;
      })(),
      lastActiveAt: user.lastActiveAt,
      lastLoginAt: user.lastLoginAt,
      subscription: user.subscription || {},
      subscriptionActive: user.subscription?.isActive || false,
      // 📌 Trial status calculation
      trialStatus: (() => {
        if (!user.trialUsed) return "Not Used";

        const now = new Date();
        const endDate = user.subscription?.endDate ? new Date(user.subscription.endDate) : null;
        const isTrial = user.subscription?.planType === 'trial';

        if (user.subscription?.isActive && isTrial && endDate && endDate > now) {
          return "Active";
        }
        return "Expired";
      })(),

      isBlocked: user.isBlocked,
      profileAvatar: profileMap[user._id.toString()]?.avatar || null,
    }));

    return res.status(200).json({ users: formattedUsers });
  } catch (err) {
    console.error("Error fetching users:", err);
    return res.status(500).json({
      message: "Cannot fetch user details",
      error: err.message,
    });
  }
};
















exports.getAnaliticalCountforUser = async (req, res) => {
  try {
    let userId = req.params.userId;
    if (!userId) {
      return res.status(400).json({ message: "userId is required" });
    }
    userId = userId.trim();

    const objectId = new mongoose.Types.ObjectId(userId);

    // 🔹 Fetch the UserActions doc for this user
    const userAction = await mongoose.connection
      .collection("UserFeedActions")
      .findOne({ userId: objectId });

    // 🔹 Count comments from UserComments
    const commentCount = await mongoose.connection
      .collection("UserComments")
      .countDocuments({ userId: objectId });

    // 🔹 Build response (count based on new object-array structure)
    const result = {
      likes: userAction?.likedFeeds?.length || 0,
      saves: userAction?.savedFeeds?.length || 0,
      shares: userAction?.sharedFeeds?.length || 0,
      downloads: userAction?.downloadedFeeds?.length || 0,
      comments: commentCount || 0,
    };

    res.status(200).json({
      message: "Analytical count fetched successfully",
      data: result,
    });
  } catch (err) {
    console.error("Error fetching analytical counts:", err);
    res.status(500).json({
      message: "Error fetching analytical counts",
      error: err.message,
    });
  }
};



exports.getUserLikedFeedsforAdmin = async (req, res) => {
  try {
    const userId = req.params.userId;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: "Invalid userId" });
    }

    const userLikedFeeds = await UserFeedActions.aggregate([
      { $match: { userId: new mongoose.Types.ObjectId(userId) } },
      { $unwind: "$likedFeeds" },
      // Lookup feed details
      {
        $lookup: {
          from: "Feeds",
          localField: "likedFeeds.feedId",
          foreignField: "_id",
          as: "feedInfo"
        }
      },
      { $unwind: "$feedInfo" },
      // Lookup creator account
      {
        $lookup: {
          from: "Accounts",
          localField: "feedInfo.createdByAccount",
          foreignField: "_id",
          as: "creatorAccount"
        }
      },
      { $unwind: { path: "$creatorAccount", preserveNullAndEmptyArrays: true } },
      // Lookup creator profile
      {
        $lookup: {
          from: "ProfileSettings",
          localField: "creatorAccount.userId",
          foreignField: "userId",
          as: "creatorProfile"
        }
      },
      { $unwind: { path: "$creatorProfile", preserveNullAndEmptyArrays: true } },
      // Project final fields (no host)
      {
        $project: {
          _id: 0,
          likedAt: "$likedFeeds.likedAt",
          contentUrl: "$feedInfo.contentUrl",
          feedInfo: {
            feedId: "$feedInfo._id",
            type: "$feedInfo.type",
            language: "$feedInfo.language",
            category: "$feedInfo.category",
            createdAt: "$feedInfo.createdAt",
            createdBy: {
              userName: { $ifNull: ["$creatorProfile.userName", "Unknown"] },
              profileAvatar: "$creatorProfile.profileAvatar"
            }
          }
        }
      }
    ]);

    res.status(200).json({
      message: "User liked feeds fetched successfully",
      count: userLikedFeeds.length,
      data: userLikedFeeds
    });
  } catch (err) {
    console.error("Error fetching user liked feeds:", err);
    res.status(500).json({
      message: "Error fetching user liked feeds",
      error: err.message
    });
  }
};





exports.getUsersStatus = async (req, res) => {
  try {
    // 1️⃣ Fetch users with required fields
    const users = await Users.find({}, "username email isOnline lastSeenAt").lean();

    if (!users.length) {
      return res.json({ totalOnline: 0, totalOffline: 0, users: [] });
    }

    // 2️⃣ Get devices in a single query (only needed fields)
    const userIds = users.map((u) => u._id);
    const devices = await UserDevices.find(
      { userId: { $in: userIds } },
      "userId deviceId deviceType ipAddress lastActiveAt"
    ).lean();

    // 3️⃣ Group devices by userId
    const devicesByUser = devices.reduce((acc, d) => {
      const id = d.userId.toString();
      if (!acc[id]) acc[id] = [];
      acc[id].push({
        deviceId: d.deviceId,
        deviceType: d.deviceType,
        ipAddress: d.ipAddress,
        lastActiveAt: d.lastActiveAt,
      });
      return acc;
    }, {});

    // 4️⃣ Build result + online/offline count
    let totalOnline = 0;
    let totalOffline = 0;

    const result = users.map((user) => {
      if (user.isOnline) totalOnline++;
      else totalOffline++;

      const userDevices = devicesByUser[user._id.toString()] || [];

      return {
        ...user,
        deviceCount: userDevices.length,
        devices: userDevices,
      };
    });

    // 5️⃣ Final response
    res.json({
      totalOnline,
      totalOffline,
      totalUsers: users.length,
      users: result,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getUserSocialMeddiaDetailWithIdForAdmin = async (req, res) => {
  try {
    const userId = req.params.id;

    if (!userId) {
      return res.status(400).json({ message: "User ID is required" });
    }

    // -------------------------------------------
    // 1️⃣ BASE USER
    // -------------------------------------------
    const user = await Users.findById(userId)
      .select(
        "userName email referralCode referalCode referealCode referredByUserId totalEarnings balanceEarnings withdrawnEarnings withdrawnAmount isActive lastActiveAt lastLoginAt lastSeenAt currentLevel currentTier roles isOnline subscription trialUsed gender"
      )
      .lean();

    if (!user) return res.status(404).json({ message: "User not found" });

    // Normalize referral code
    user.referralCode = user.referralCode || user.referalCode || user.referealCode || null;

    // -------------------------------------------
    // 2️⃣ PROFILE DETAILS (FULL SCHEMA)
    // -------------------------------------------
    const profile = await ProfileSettings.findOne({ userId })
      .select("-__v -createdAt -updatedAt")
      .lean();

    // -------------------------------------------
    // 3️⃣ REFERRAL NETWORK
    // -------------------------------------------
    const referralData = await UserReferral.findOne({ parentId: userId }).lean();
    let referralPeople = [];
    if (referralData && referralData.childIds && referralData.childIds.length > 0) {
      referralPeople = await Users.find({ _id: { $in: referralData.childIds } })
        .select("userName createdAt")
        .lean();

      const childProfileSettings = await ProfileSettings.find({ userId: { $in: referralData.childIds } })
        .select("userId profileAvatar")
        .lean();

      const profileMap = {};
      childProfileSettings.forEach(p => { profileMap[p.userId.toString()] = p.profileAvatar; });

      referralPeople = referralPeople.map(u => ({
        ...u,
        profileAvatar: profileMap[u._id.toString()] || null
      }));
    }

    // -------------------------------------------
    // 4️⃣ WATCH ANALYTICS (HOURS & TOP CATEGORY)
    // -------------------------------------------
    const videoViews = await VideoView.find({ userId }).select("videoId watchedSeconds").lean();
    const imageViews = await ImageView.find({ userId }).select("imageId").lean();

    const totalWatchSeconds = videoViews.reduce((acc, v) => acc + (v.watchedSeconds || 0), 0);
    const totalWatchHours = (totalWatchSeconds / 3600).toFixed(2);

    // Track category frequency
    const categoryFreq = {};
    const feedIdsToLookup = [
      ...videoViews.map(v => v.videoId),
      ...imageViews.map(i => i.imageId)
    ];

    if (feedIdsToLookup.length > 0) {
      const feeds = await Feed.find({ _id: { $in: feedIdsToLookup } })
        .select("category")
        .populate("category", "name")
        .lean();

      feeds.forEach(f => {
        if (f.category && Array.isArray(f.category)) {
          f.category.forEach(cat => {
            const catName = cat.name || "Uncategorized";
            categoryFreq[catName] = (categoryFreq[catName] || 0) + 1;
          });
        }
      });
    }

    const sortedCategories = Object.entries(categoryFreq).sort((a, b) => b[1] - a[1]);
    const topCategory = sortedCategories.length > 0 ? sortedCategories[0][0] : "N/A";

    // -------------------------------------------
    // 5️⃣ FINANCIALS (EARNINGS, WITHDRAWALS, BALANCE)
    // -------------------------------------------
    const recentEarnings = await UserEarning.find({ userId })
      .sort({ createdAt: -1 })
      .limit(5)
      .populate("fromUserId", "userName")
      .lean();

    const recentWithdrawals = await Withdrawal.find({ userId })
      .sort({ requestedAt: -1 })
      .limit(5)
      .lean();

    // Combine transactions
    const transactionHistory = [
      ...recentEarnings.map(e => ({
        type: "Earning",
        amount: e.amount,
        date: e.createdAt,
        status: "completed",
        description: `Referral from ${e.fromUserId?.userName || 'User'}`
      })),
      ...recentWithdrawals.map(w => ({
        type: "Withdrawal",
        amount: w.amount,
        date: w.requestedAt,
        status: w.status,
        description: "Withdrawal request"
      }))
    ].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 10);

    // -------------------------------------------
    // 6️⃣ FINAL RESPONSE CONSTRUCTION
    // -------------------------------------------
    const reports = await Report.find({ reportedBy: userId })
      .select("typeId targetId targetType answers status createdAt")
      .lean();

    const trending = await TrendingCreators.findOne({ userId }).lean();
    const device = await UserDevices.findOne({ userId })
      .select("deviceType deviceName ipAddress createdAt")
      .sort({ createdAt: -1 })
      .lean();
    const language = await UserLanguage.findOne({ userId })
      .select("feedLanguageCode appLanguageCode")
      .lean();

    return res.status(200).json({
      success: true,
      message: "User details fetched successfully",
      user: {
        ...user,
        isOnline: (() => {
          if (!user.isOnline) return false;
          if (!user.lastSeenAt) return false;
          const now = new Date();
          const diffInMinutes = (now - new Date(user.lastSeenAt)) / (1000 * 60);
          return diffInMinutes < 20; // Active in last 20 minutes
        })(),
        profile,
        referralPeople,
        watchAnalytics: {
          totalWatchHours,
          topCategory,
          categoryStats: sortedCategories.slice(0, 5) // Top 5 categories
        },
        financials: {
          totalEarnings: user.totalEarnings || 0,
          withdrawnAmount: user.withdrawnEarnings || user.withdrawnAmount || 0,
          balanceAmount: user.balanceEarnings || 0,
          transactionHistory
        },
        language,
        device,
        reports,
        trending,
      },
    });
  } catch (err) {
    console.error("Error fetching user details:", err);
    return res.status(500).json({
      success: false,
      message: "Cannot fetch user details",
      error: err.message,
    });
  }
};






exports.getUserAnalyticalData = async (req, res) => {
  try {
    const { userId } = req.params;
    if (!userId) return res.status(400).json({ message: "userId is required" });

    const redisKey = `admin:analytics:${userId}`;
    const cachedData = await redisClient.get(redisKey);
    if (cachedData) {
      return res.status(200).json(JSON.parse(cachedData));
    }
    let userIdTrimmed = userId.trim(); // Renamed to avoid conflict with const userId
    const objectId = new mongoose.Types.ObjectId(userIdTrimmed);

    const { startDate, endDate, type, tab } = req.query;

    // Build base query for date filtering
    const buildDateQuery = (field) => {
      const query = {};
      if (startDate) {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0); // Start of day
        query[field] = { $gte: start };
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999); // End of day
        query[field] = { ...query[field], $lte: end };
      }
      return Object.keys(query).length > 0 ? query : {};
    };

    // -------------------------------------------------------------------
    // 1️⃣ BASIC USER PROFILE
    // -------------------------------------------------------------------
    const userProfile = await ProfileSettings.findOne({ userId: userIdTrimmed })
      .select("userName profileAvatar createdAt lastSeen")
      .lean();

    const selectedUser = {
      userName: userProfile?.userName || "Unknown User",
      userAvatar: userProfile?.profileAvatar || "",
      joinedAt: userProfile?.createdAt || new Date(),
      lastSeen: userProfile?.lastSeen || null,
    };

    // -------------------------------------------------------------------
    // 2️⃣ USER POSTS (Full image/video posts with all engagement details)
    // -------------------------------------------------------------------
    const postsQuery = {
      createdByAccount: userIdTrimmed,
      roleRef: "User",
      ...buildDateQuery('createdAt'),
      ...(type && type !== 'all' ? { type } : {})
    };

    const postsRaw = await Feed.find(postsQuery)
      .select("_id type contentUrl title description createdAt")
      .sort({ createdAt: -1 })
      .lean();

    const postIds = postsRaw.map(p => p._id);

    // ----- Fetch views from image/video stats -----
    const imageViews = await ImageStats.find({ imageId: { $in: postIds } })
      .select("imageId totalViews")
      .lean();

    const videoViews = await VideoStats.find({ videoId: { $in: postIds } })
      .select("videoId totalViews")
      .lean();

    const viewMap = {};
    imageViews.forEach(v => (viewMap[v.imageId.toString()] = v.totalViews || 0));
    videoViews.forEach(v => (viewMap[v.videoId.toString()] = v.totalViews || 0));

    // ----- Fetch like/share/download activity using AGGREGATION (Scalable) -----
    const aggregationResult = await UserFeedActions.aggregate([
      {
        $facet: {
          likes: [
            { $unwind: "$likedFeeds" },
            { $match: { "likedFeeds.feedId": { $in: postIds } } },
            { $group: { _id: "$likedFeeds.feedId", count: { $sum: 1 } } }
          ],
          shares: [
            { $unwind: "$sharedFeeds" },
            { $match: { "sharedFeeds.feedId": { $in: postIds } } },
            { $group: { _id: "$sharedFeeds.feedId", count: { $sum: 1 } } }
          ],
          downloads: [
            { $unwind: "$downloadedFeeds" },
            { $match: { "downloadedFeeds.feedId": { $in: postIds } } },
            { $group: { _id: "$downloadedFeeds.feedId", count: { $sum: 1 } } }
          ],
          dislikes: [
            { $unwind: "$disLikeFeeds" },
            { $match: { "disLikeFeeds.feedId": { $in: postIds } } },
            { $group: { _id: "$disLikeFeeds.feedId", count: { $sum: 1 } } }
          ]
        }
      }
    ]);

    const actionCounts = aggregationResult[0] || { likes: [], shares: [], downloads: [], dislikes: [] };

    const likeMap = {};
    const shareMap = {};
    const downloadMap = {};
    const dislikeMap = {};

    actionCounts.likes.forEach(item => (likeMap[item._id.toString()] = item.count));
    actionCounts.shares.forEach(item => (shareMap[item._id.toString()] = item.count));
    actionCounts.downloads.forEach(item => (downloadMap[item._id.toString()] = item.count));
    actionCounts.dislikes.forEach(item => (dislikeMap[item._id.toString()] = item.count));

    // ----- Fetch comment counts -----
    const commentCounts = await UserComments.aggregate([
      { $match: { feedId: { $in: postIds } } },
      { $group: { _id: "$feedId", count: { $sum: 1 } } },
    ]);

    const commentMap = {};
    commentCounts.forEach(c => (commentMap[c._id.toString()] = c.count));

    // ----- FINAL POSTS -----
    const posts = postsRaw.map(p => ({
      id: p._id,
      type: p.type,
      url: p.contentUrl,
      title: p.title || `${p.type} post`,
      description: p.description || "",
      createdAt: p.createdAt,
      views: viewMap[p._id.toString()] || 0,
      likes: likeMap[p._id.toString()] || 0,
      shares: shareMap[p._id.toString()] || 0,
      downloads: downloadMap[p._id.toString()] || 0,
      dislikes: dislikeMap[p._id.toString()] || 0,
      comments: commentMap[p._id.toString()] || 0,
    }));

    const imageCount = posts.filter(p => p.type === "image").length;
    const videoCount = posts.filter(p => p.type === "video").length;

    // -------------------------------------------------------------------
    // 3️⃣ FOLLOWERS (Users who follow THIS user) with date filtering
    // -------------------------------------------------------------------
    const followersQuery = {
      creatorId: userIdTrimmed,
      ...buildDateQuery('createdAt')
    };

    const followers = await Followers.find(followersQuery)
      .select("followerId createdAt")
      .lean();

    const followerIds = followers.map(f => f.followerId);

    const followerProfiles = await ProfileSettings.find({
      userId: { $in: followerIds }
    }).select("userId userName profileAvatar").lean();

    const followerDateMap = {};
    followers.forEach(f => (followerDateMap[f.followerId.toString()] = f.createdAt));

    const followersList = followerProfiles.map(p => ({
      id: p.userId,
      userName: p.userName,
      profileAvatar: p.profileAvatar,
      followedAt: followerDateMap[p.userId.toString()],
    }));

    // -------------------------------------------------------------------
    // 4️⃣ FOLLOWING (Who THIS user follows) with date filtering
    // -------------------------------------------------------------------
    const followingQuery = {
      followerId: userIdTrimmed,
      ...buildDateQuery('createdAt')
    };

    const following = await Followers.find(followingQuery)
      .select("creatorId createdAt")
      .lean();

    const followingIds = following.map(f => f.creatorId);

    const followingProfiles = await ProfileSettings.find({
      userId: { $in: followingIds }
    }).select("userId userName profileAvatar").lean();

    const followingDateMap = {};
    following.forEach(f => (followingDateMap[f.creatorId.toString()] = f.createdAt));

    const followingList = followingProfiles.map(p => ({
      id: p.userId,
      userName: p.userName,
      profileAvatar: p.profileAvatar,
      followedAt: followingDateMap[p.userId.toString()],
    }));

    // -------------------------------------------------------------------
    // 5️⃣ USER INTERACTIONS (Liked, Shared, Downloaded…) with date filtering
    // -------------------------------------------------------------------
    const userAction = await UserFeedActions.findOne({ userId: userIdTrimmed })
      .populate({
        path: 'likedFeeds.feedId',
        select: '_id type contentUrl title description createdAt',
        model: 'Feed'
      })
      .populate({
        path: 'sharedFeeds.feedId',
        select: '_id type contentUrl title description createdAt',
        model: 'Feed'
      })
      .populate({
        path: 'downloadedFeeds.feedId',
        select: '_id type contentUrl title description createdAt',
        model: 'Feed'
      })
      .populate({
        path: 'disLikeFeeds.feedId',
        select: '_id type contentUrl title description createdAt',
        model: 'Feed'
      })
      .populate({
        path: 'savedFeeds.feedId',
        select: '_id type contentUrl title description createdAt',
        model: 'Feed'
      })
      .lean();

    // Filter interactions by date if provided
    const filterByDate = (items, dateField) => {
      if (!startDate && !endDate) return items || [];

      const start = startDate ? new Date(startDate).setHours(0, 0, 0, 0) : null;
      const end = endDate ? new Date(endDate).setHours(23, 59, 59, 999) : null;

      return (items || []).filter(item => {
        if (!item || !item[dateField]) return false;

        const itemDate = new Date(item[dateField]).getTime();

        if (start && itemDate < start) return false;
        if (end && itemDate > end) return false;

        return true;
      });
    };

    const likedPosts = filterByDate(userAction?.likedFeeds?.map(f => ({
      id: f.feedId?._id,
      type: f.feedId?.type,
      url: f.feedId?.contentUrl,
      title: f.feedId?.title || 'Liked post',
      description: f.feedId?.description || '',
      likedAt: f.likedAt,
    })), 'likedAt');

    const dislikedPosts = filterByDate(userAction?.disLikeFeeds?.map(f => ({
      id: f.feedId?._id,
      type: f.feedId?.type,
      url: f.feedId?.contentUrl,
      title: f.feedId?.title || 'Disliked post',
      description: f.feedId?.description || '',
      dislikedAt: f.dislikedAt,
    })), 'dislikedAt');

    const sharedPosts = filterByDate(userAction?.sharedFeeds?.map(f => ({
      id: f.feedId?._id,
      type: f.feedId?.type,
      url: f.feedId?.contentUrl,
      title: f.feedId?.title || 'Shared post',
      description: f.feedId?.description || '',
      sharedAt: f.sharedAt,
    })), 'sharedAt');

    const downloadedPosts = filterByDate(userAction?.downloadedFeeds?.map(f => ({
      id: f.feedId?._id,
      type: f.feedId?.type,
      url: f.feedId?.contentUrl,
      title: f.feedId?.title || 'Downloaded post',
      description: f.feedId?.description || '',
      downloadedAt: f.downloadedAt,
    })), 'downloadedAt');

    const savedPosts = filterByDate(userAction?.savedFeeds?.map(f => ({
      id: f.feedId?._id,
      type: f.feedId?.type,
      url: f.feedId?.contentUrl,
      title: f.feedId?.title || 'Saved post',
      description: f.feedId?.description || '',
      savedAt: f.savedAt,
    })), 'savedAt');

    const interactions = {
      liked: likedPosts.length,
      disliked: dislikedPosts.length,
      shared: sharedPosts.length,
      downloaded: downloadedPosts.length,
      saved: savedPosts.length,
    };

    // -------------------------------------------------------------------
    // 6️⃣ HIDDEN POSTS with date filtering
    // -------------------------------------------------------------------
    const hiddenQuery = {
      userId: userIdTrimmed,
      ...buildDateQuery('createdAt')
    };

    const hiddenRecords = await HiddenPost.find(hiddenQuery)
      .select("postId createdAt")
      .lean();

    const hiddenIds = hiddenRecords.map(h => h.postId);
    const hiddenDate = {};
    hiddenRecords.forEach(h => (hiddenDate[h.postId.toString()] = h.createdAt));

    const hiddenFeeds = await Feed.find({ _id: { $in: hiddenIds } })
      .select("_id type contentUrl title description createdByAccount")
      .lean();

    const hiddenCreatorIds = hiddenFeeds.map(f => f.createdByAccount);

    const hiddenCreators = await ProfileSettings.find({
      userId: { $in: hiddenCreatorIds }
    }).select("userId userName profileAvatar").lean();

    const hiddenCreatorMap = {};
    hiddenCreators.forEach(c => (hiddenCreatorMap[c.userId.toString()] = c));

    const hidden = hiddenFeeds.map(f => ({
      id: f._id,
      type: f.type,
      url: f.contentUrl,
      title: f.title || 'Hidden post',
      description: f.description || '',
      hiddenAt: hiddenDate[f._id.toString()],
      creator: hiddenCreatorMap[f.createdByAccount] || null,
    }));

    // -------------------------------------------------------------------
    // 7️⃣ CATEGORY INTERESTS
    // -------------------------------------------------------------------
    const categoryData = await UserCategory.findOne({ userId: userIdTrimmed })
      .populate("interestedCategories", "name description")
      .populate("nonInterestedCategories", "name description")
      .lean();

    const interested = categoryData?.interestedCategories?.map(c => ({
      id: c._id,
      name: c.name,
      description: c.description || "",
    })) || [];

    const nonInterested = categoryData?.nonInterestedCategories?.map(c => ({
      id: c._id,
      name: c.name,
      description: c.description || "",
    })) || [];

    // -------------------------------------------------------------------
    // 8️⃣ USER COMMENTS WITH POST DETAILS with date filtering
    // -------------------------------------------------------------------
    const commentsQuery = {
      userId: userIdTrimmed,
      ...buildDateQuery('createdAt')
    };

    const comments = await UserComments.find(commentsQuery)
      .select("_id commentText feedId createdAt")
      .sort({ createdAt: -1 })
      .lean();

    const commentFeedIds = comments.map(c => c.feedId);

    const commentFeeds = await Feed.find({ _id: { $in: commentFeedIds } })
      .select("_id type contentUrl title description createdByAccount")
      .lean();

    const commentFeedMap = {};
    commentFeeds.forEach(f => {
      commentFeedMap[f._id.toString()] = f;
    });

    const userComments = comments.map(c => ({
      id: c._id,
      text: c.commentText,
      createdAt: c.createdAt,
      post: commentFeedMap[c.feedId] || null,
    }));

    // -------------------------------------------------------------------
    // 9️⃣ ENGAGEMENT SUMMARY
    // -------------------------------------------------------------------
    const engagementSummary = {
      totalPosts: posts.length,
      totalFollowers: followersList.length,
      totalFollowing: followingList.length,
      totalPostLikes: posts.reduce((a, b) => a + b.likes, 0),
      totalPostViews: posts.reduce((a, b) => a + b.views, 0),
      totalComments: userComments.length,
      totalInteractions:
        likedPosts.length +
        dislikedPosts.length +
        sharedPosts.length +
        downloadedPosts.length +
        userComments.length,
    };

    // -------------------------------------------------------------------
    // 🔟 FINAL RESPONSE
    // -------------------------------------------------------------------
    const profile = await ProfileSettings.findOne({ userId: userIdTrimmed }).select("userId userName profileAvatar bio").lean();

    const totalViews = posts.reduce((acc, p) => acc + p.views, 0);
    const totalLikes = posts.reduce((acc, p) => acc + p.likes, 0);
    const totalShares = posts.reduce((acc, p) => acc + p.shares, 0);
    const totalDownloads = posts.reduce((acc, p) => acc + p.downloads, 0);

    const responseData = {
      success: true,
      user: {
        userId: profile?.userId || userIdTrimmed,
        userName: profile?.userName || "Unknown",
        profileAvatar: profile?.profileAvatar || null,
        bio: profile?.bio || "",
      },
      stats: {
        totalPosts: postIds.length,
        totalViews,
        totalLikes,
        totalShares,
        totalDownloads,
      },
      posts,
      imageCount,
      videoCount,
      followers: followersList,
      following: followingList,
      interactions,
      likedPosts,
      dislikedPosts,
      sharedPosts,
      downloadedPosts,
      savedPosts,
      hidden,
      interested,
      nonInterested,
      comments: userComments,
      engagementSummary,
      filters: {
        startDate,
        endDate,
        type,
        applied: !!(startDate || endDate || type)
      }
    };

    // Cache results for 5 minutes
    await redisClient.set(redisKey, JSON.stringify(responseData), "EX", 300);

    return res.status(200).json(responseData);

  } catch (err) {
    console.error("Error fetching analytics:", err);
    return res.status(500).json({
      success: false,
      message: "Server error",
      error: err.message,
    });
  }
};











exports.getUserProfileDashboardMetricCount = async (req, res) => {
  try {
    // 1️⃣ Total registered users
    const totalUsers = await Users.countDocuments();

    // 2️⃣ Active subscriptions
    const subscriptionCount = await Users.countDocuments({
      "subscription.isActive": true,
    });

    // 3️⃣ Unique user accounts
    const accountCount = await Account.distinct("userId").then(
      (ids) => ids.length
    );

    // 4️⃣ Blocked users
    const blockedUserCount = await Users.countDocuments({ isBlocked: true });

    // 5️⃣ Online users (⚡ from User schema + 20min threshold)
    const twentyMinsAgo = new Date(Date.now() - 20 * 60 * 1000);
    const onlineUsersCount = await Users.countDocuments({
      isOnline: true,
      lastSeenAt: { $gte: twentyMinsAgo }
    });

    // 6️⃣ Offline users = total - online
    const offlineUsersCount = totalUsers - onlineUsersCount;

    // 7️⃣ Trial used users
    const trialUsedCount = await Users.countDocuments({ trialUsed: true });

    return res.status(200).json({
      totalUsers,
      onlineUsers: onlineUsersCount,
      offlineUsers: offlineUsersCount,
      blockedUserCount,
      subscriptionCount,
      accountCount,
      trialUsedCount,
    });
  } catch (error) {
    console.error("Dashboard metric error:", error);
    return res.status(500).json({
      message: "Failed to fetch dashboard metrics",
      error: error.message,
    });
  }
};








exports.getReports = async (req, res) => {
  try {
    const formattedReports = await Report.aggregate([
      // 1️⃣ Lookup Report Type
      {
        $lookup: {
          from: "ReportTypes",
          localField: "typeId",
          foreignField: "_id",
          as: "reportType"
        }
      },
      { $unwind: { path: "$reportType", preserveNullAndEmptyArrays: true } },

      // 2️⃣ Lookup Reported By Profile
      {
        $lookup: {
          from: "ProfileSettings",
          localField: "reportedBy",
          foreignField: "userId",
          as: "reporterProfile"
        }
      },
      { $unwind: { path: "$reporterProfile", preserveNullAndEmptyArrays: true } },

      // 3️⃣ Lookup Target Feed (if applicable)
      {
        $lookup: {
          from: "Feeds",
          localField: "targetId",
          foreignField: "_id",
          as: "feedData"
        }
      },
      { $unwind: { path: "$feedData", preserveNullAndEmptyArrays: true } },

      // 4️⃣ Lookup Creator Account -> Creator Profile
      {
        $lookup: {
          from: "Accounts",
          localField: "feedData.createdByAccount",
          foreignField: "_id",
          as: "creatorAccount"
        }
      },
      { $unwind: { path: "$creatorAccount", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: "ProfileSettings",
          localField: "creatorAccount.userId",
          foreignField: "userId",
          as: "creatorProfile"
        }
      },
      { $unwind: { path: "$creatorProfile", preserveNullAndEmptyArrays: true } },

      // 5️⃣ Project final structure
      {
        $project: {
          _id: 1,
          type: { $ifNull: ["$reportType.name", "Unknown"] },
          reportedBy: {
            username: { $ifNull: ["$reporterProfile.userName", "Unknown"] },
            avatar: { $ifNull: ["$reporterProfile.profileAvatar", null] }
          },
          target: {
            $cond: {
              if: { $eq: ["$targetType", "Feed"] },
              then: {
                contentUrl: { $ifNull: ["$feedData.contentUrl", null] },
                createdBy: {
                  username: { $ifNull: ["$creatorProfile.userName", "Unknown"] },
                  avatar: { $ifNull: ["$creatorProfile.profileAvatar", null] }
                }
              },
              else: null
            }
          },
          answers: { $ifNull: ["$answers", "Not Available"] },
          status: 1,
          actionTaken: 1,
          actionDate: 1,
          createdAt: 1
        }
      }
    ]);

    res.status(200).json({ reports: formattedReports });
  } catch (error) {
    console.error("Error fetching reports:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};




exports.deleteUserAndAllRelated = async (req, res) => {
  console.log("🟦 [STEP 0] Controller entered");

  const { userId } = req.params;
  console.log("🧾 Starting deletion for user:", userId);

  if (!mongoose.Types.ObjectId.isValid(userId)) {
    console.log("❌ Invalid userId");
    return res.status(400).json({ message: "Invalid userId" });
  }

  // 1️⃣ Minimal check (fast)
  console.log("🟦 [STEP 1] Fetching user...");
  let user;
  try {
    user = await Users.findById(userId).select("profileAvatar").lean();
    console.log("✅ User fetch success");
  } catch (err) {
    console.error("❌ ERROR fetching user:", err);
    return res.status(500).json({
      message: "Error fetching user",
      error: err.message,
    });
  }

  if (!user) {
    console.log("❌ User not found");
    return res.status(404).json({ message: "User not found" });
  }

  // 2️⃣ Start session on the SAME connection as Users model
  console.log("🟦 [STEP 2] Starting DB session from Users.db...");
  let session;
  try {
    const start = Date.now();

    // IMPORTANT CHANGE ⬇️
    session = await Users.db.startSession();
    // or if you prefer and have prithuDB imported:
    // session = await prithuDB.startSession();

    console.log(
      `✅ startSession SUCCESS on DB "${Users.db.name}" (⏱ ${Date.now() - start} ms)`
    );
  } catch (err) {
    console.error("❌ FAILED at startSession() using Users.db:", err);
    return res.status(500).json({
      message: "DB Session initialization failed",
      error: err.message,
    });
  }

  try {
    console.log("🟦 [STEP 3] Starting transaction...");
    session.startTransaction();
    console.log("✅ Transaction started");

    // --------------------------------------------
    // 🔥 DELETE RELATED RECORDS USING FAST FILTERS
    // --------------------------------------------
    console.log("🟦 [STEP 4] Fetching Accounts...");
    const accounts = await Account.find({ userId }, "_id").lean();
    const accountIds = accounts.map((a) => a._id);
    console.log("✔ Accounts found:", accountIds.length);

    console.log("🟦 [STEP 5] Running delete operations...");

    const timedDelete = async (label, fn) => {
      const t = Date.now();
      try {
        await fn();
        console.log(`✔ ${label} completed (⏱ ${Date.now() - t}ms)`);
      } catch (e) {
        console.error(`❌ ${label} FAILED:`, e.message);
        throw e;
      }
    };

    await timedDelete("Account.deleteMany", () =>
      Account.deleteMany({ userId }, { session })
    );
    await timedDelete("CommentLikes.deleteMany", () =>
      CommentLikes.deleteMany({ userId }, { session })
    );
    await timedDelete("Devices.deleteMany", () =>
      Devices.deleteMany({ userId }, { session })
    );
    await timedDelete("Feed.deleteMany", () =>
      Feed.deleteMany(
        { $or: [{ createdBy: { $in: accountIds } }, { userId }] },
        { session }
      )
    );
    await timedDelete("Followers.updateMany", () =>
      Followers.updateMany({}, { $pull: { followerIds: userId } }, { session })
    );
    await timedDelete("HiddenPost.deleteMany", () =>
      HiddenPost.deleteMany({ userId }, { session })
    );
    await timedDelete("ImageView.deleteMany", () =>
      ImageView.deleteMany({ userId }, { session })
    );
    await timedDelete("ProfileSettings.deleteMany", () =>
      ProfileSettings.deleteMany({ userId }, { session })
    );
    await timedDelete("Report.deleteMany", () =>
      Report.deleteMany({ reportedBy: userId }, { session })
    );
    await timedDelete("UserComments.deleteMany", () =>
      UserComments.deleteMany({ userId }, { session })
    );
    await timedDelete("UserDevices.deleteMany", () =>
      UserDevices.deleteMany({ userId }, { session })
    );
    await timedDelete("UserEarnings.deleteMany", () =>
      UserEarnings.deleteMany({ userId }, { session })
    );
    await timedDelete("UserFeedActions.deleteMany", () =>
      UserFeedActions.deleteMany(
        { $or: [{ accountId: { $in: accountIds } }, { userId }] },
        { session }
      )
    );
    await timedDelete("UserLanguage.deleteMany", () =>
      UserLanguage.deleteMany({ userId }, { session })
    );

    await timedDelete("UserNotification.deleteMany", () =>
      UserNotification.deleteMany({ userId }, { session })
    );
    await timedDelete("UserSubscriptions.deleteMany", () =>
      UserSubscriptions.deleteMany({ userId }, { session })
    );
    await timedDelete("UserViews.deleteMany", () =>
      UserViews.deleteMany({ userId }, { session })
    );
    await timedDelete("VideoView.deleteMany", () =>
      VideoView.deleteMany({ userId }, { session })
    );
    await timedDelete("Users.deleteOne", () =>
      Users.deleteOne({ _id: userId }, { session })
    );

    console.log("🟦 [STEP 6] Committing transaction...");
    const commitStart = Date.now();
    await session.commitTransaction();
    console.log(`✅ Transaction committed (⏱ ${Date.now() - commitStart}ms)`);
  } catch (error) {
    console.error("❌ ERROR inside transaction:", error);
    console.log("⚠️ Aborting transaction...");
    await session.abortTransaction();
    await session.endSession();
    return res.status(500).json({
      message: "Failed to delete user",
      error: error.message,
    });
  }

  await session.endSession();
  console.log("🟦 [STEP 6.5] Session ended");

  // --------------------------------------------------------
  // 3️⃣ DELETE CLOUDINARY FILES AFTER COMMIT (not inside DB)
  // --------------------------------------------------------
  console.log("🟦 [STEP 7] Deleting Cloudinary resources...");
  let deleteCount = 0;

  const extractPid = (url) => {
    if (!url) return null;
    try {
      const file = url.split("/").pop();
      return file.split(".")[0];
    } catch {
      return null;
    }
  };

  if (user.profileAvatar) {
    const pid = extractPid(user.profileAvatar);
    console.log("🔎 Avatar PID:", pid);

    if (pid) {
      try {
        await cloudinary.api.delete_resources([pid]);
        deleteCount++;
        console.log("✔ Cloudinary deleted:", pid);
      } catch (err) {
        console.error("❌ Cloudinary deletion failed:", err.message);
      }
    }
  }

  console.log("🎉 ALL STEPS COMPLETE");

  return res.status(200).json({
    message: "User deleted successfully",
    cloudinaryMediaDeleted: deleteCount,
  });
};







exports.getUpcomingBirthdays = async (req, res) => {
  try {
    const userId = req.Id; // Logged-in user

    // -----------------------------
    // 1️⃣ Find all users current user follows
    // -----------------------------
    const following = await Followers.find({ followerId: userId }).select("creatorId");

    const followingUserIds = following.map(f => f.creatorId);

    if (followingUserIds.length === 0) {
      return res.status(200).json({
        success: true,
        birthdays: [],
        message: "No followed users"
      });
    }

    // -----------------------------
    // 2️⃣ Get current and next month
    // -----------------------------
    const now = new Date();
    const currentMonth = now.getMonth() + 1; // 1-12
    const nextMonth = currentMonth === 12 ? 1 : currentMonth + 1;

    // -----------------------------
    // 3️⃣ Query profiles with birthday in current or next month
    // -----------------------------
    const profiles = await ProfileSettings.aggregate([
      {
        $match: {
          userId: { $in: followingUserIds },
          dateOfBirth: { $ne: null }
        }
      },
      {
        $project: {
          userId: 1,
          name: 1,
          lastName: 1,
          profileAvatar: 1,
          dateOfBirth: 1,
          month: { $month: "$dateOfBirth" },
          day: { $dayOfMonth: "$dateOfBirth" }
        }
      },
      {
        $match: {
          month: { $in: [currentMonth, nextMonth] }
        }
      },
      {
        $sort: { month: 1, day: 1 } // Upcoming order
      }
    ]);

    return res.status(200).json({
      success: true,
      birthdays: profiles
    });

  } catch (error) {
    console.error("❌ Error fetching upcoming birthdays:", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message
    });
  }
};









