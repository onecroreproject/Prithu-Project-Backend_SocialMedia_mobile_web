const Feed = require('../../models/feedModel');
const redisClient = require("../../Config/redisConfig");
const User = require('../../models/userModels/userModel');
const { feedTimeCalculator } = require('../../middlewares/feedTimeCalculator');
const UserFeedActions = require('../../models/userFeedInterSectionModel.js');
const Account = require("../../models/accountSchemaModel.js");
const mongoose = require("mongoose");
const UserComment = require("../../models/userCommentModel.js");
const UserView = require("../../models/userModels/userViewFeedsModel.js");
const UserLanguage = require('../../models/userModels/userLanguageModel.js');
const UserCategory = require('../../models/userModels/userCategotyModel.js');
const ProfileSettings = require('../../models/profileSettingModel');

const { extractThemeColor } = require("../../middlewares/helper/extractThemeColor.js");
const ImageStats = require("../../models/userModels/MediaSchema/imageViewModel.js");
const VideoStats = require("../../models/userModels/MediaSchema/videoViewStatusModel");
const cloudinary = require("cloudinary").v2;
const HiddenPost = require("../../models/userModels/hiddenPostSchema.js")
const { deleteFeedFile } = require("../../middlewares/services/feedUploadSpydy.js");
const Categories = require("../../models/categorySchema.js");
const path = require("path");
// const { google } = require("googleapis");
// const { oAuth2Client } = require("../../middlewares/services/googleDriveMedia/googleDriverAuth");
const ProfileVisibility = require("../../models/profileVisibilitySchema.js")
const { getMediaUrl } = require("../../utils/storageEngine");



exports.getAllFeedsByUserId = async (req, res) => {
  console.log("🔵 START: getAllFeedsByUserId");

  let hiddenPostIds = [];
  let notInterestedCategoryIds = [];

  // Helper function for visibility check
  const canShow = (rule) => rule === "public"; // ONLY public visible

  try {
    const rawUserId = req.Id || req.body.userId;
    if (!rawUserId) return res.status(404).json({ message: "User ID Required" });
    const userId = new mongoose.Types.ObjectId(rawUserId);
    const page = Math.max(1, Number(req.query.page || 1));
    const limit = Math.max(1, Math.min(50, Number(req.query.limit || 10)));
    const { categoryId, postType } = req.query;

    /* -----------------------------------------------------
       ✅ 1️⃣ FETCH VIEWER PROFILE (LOGGED-IN USER)
    ------------------------------------------------------*/
    const viewerProfile = await ProfileSettings.findOne({ userId })
      .select("name userName profileAvatar phoneNumber socialLinks privacy modifyAvatar visibility")
      .lean();

    let viewerVisibility = null;

    if (viewerProfile?.visibility) {
      viewerVisibility = await ProfileVisibility.findById(viewerProfile.visibility).lean();
    }

    const viewerUser = await User.findById(userId).select("email").lean();


    // Format viewer social icons safely
    let viewerSocialIcons = [];

    if (viewerProfile?.socialLinks && typeof viewerProfile.socialLinks === "object") {
      viewerSocialIcons = Object.entries(viewerProfile.socialLinks)
        .map(([platform, url]) => ({
          platform,
          url: typeof url === "string" ? url.trim() : "",
          visible: true,
        }))
        .filter((i) => i.url); // ✅ keep only valid links
    }


    // ✅ Social Icons Filter based on visibility rules
    const safeSocialLinks = viewerSocialIcons.filter((icon) => {
      const rule = viewerVisibility?.socialLinks || "private";
      return canShow(rule) && icon.visible !== false && !!icon.url;
    });


    // ✅ Footer visibility config
    const footerVisibilityConfig = {
      showElements: {
        name: canShow(viewerVisibility?.name || "public"),
        userName: canShow(viewerVisibility?.userName || "public"),
        email: canShow(viewerVisibility?.email || "private"),
        phone: canShow(viewerVisibility?.phoneNumber || "private"),
        socialIcons: safeSocialLinks.length > 0
      },
      socialIcons: safeSocialLinks.map((icon) => ({
        platform: icon.platform,
        visible: true,
        urlTemplate: icon.url
      }))
    };




    const viewer = {
      id: userId,
      name: canShow(viewerVisibility?.name || "public")
        ? viewerProfile?.name || "User"
        : "Private User",
      userName: canShow(viewerVisibility?.userName || "public")
        ? viewerProfile?.userName || "user"
        : "private_user",
      email: canShow(viewerVisibility?.email || "private")
        ? viewerUser?.email || null
        : null,

      phoneNumber: canShow(viewerVisibility?.phoneNumber || "private")
        ? viewerProfile?.phoneNumber || null
        : null,

      profileAvatar: getMediaUrl(viewerProfile?.modifyAvatar) || "https://via.placeholder.com/150",
      socialLinks: safeSocialLinks // Use filtered social links
    };


    /* -----------------------------------------------------
       ✅ 2️⃣ FETCH HIDDEN POSTS & BLOCKED CATEGORIES & WATCHED FEEDS
    ------------------------------------------------------*/
    const hiddenPosts = await HiddenPost.find({ userId }).select("postId -_id").lean();
    hiddenPostIds = hiddenPosts.map(h => h.postId);

    const userCategories = await UserCategory.findOne({ userId }).select("nonInterestedCategories").lean();
    notInterestedCategoryIds = userCategories?.nonInterestedCategories || [];

    // 🆕 FETCH WATCHED FEEDS
    const userActions = await UserFeedActions.findOne({ userId }).select("watchedFeeds.feedId").lean();
    const watchedFeedIds = (userActions?.watchedFeeds || []).map(w => w.feedId);

    // Combine hidden and watched
    // const excludeIds = [...hiddenPostIds, ...watchedFeedIds];
    const excludeIds = [...hiddenPostIds];

    const EXCLUDED_CATEGORY_IDS = [
      new mongoose.Types.ObjectId("699ee0e420120ebc1d3e7725"),
      new mongoose.Types.ObjectId("699ee86c20120ebc1d3e929b"),
      new mongoose.Types.ObjectId("6990071590a65cd9632b2327")
    ];

    /* -----------------------------------------------------
       ✅ 3️⃣ AGGREGATION PIPELINE
    ------------------------------------------------------*/
    const feeds = await Feed.aggregate([
      {
        $match: {
          _id: { $nin: excludeIds },
          category: categoryId
            ? new mongoose.Types.ObjectId(categoryId)
            : { $nin: [...notInterestedCategoryIds, ...EXCLUDED_CATEGORY_IDS] },
          // ✅ Filter 1: Only the user's own feeds (creator match)
          // ✅ Filter 2: Visibility — only published feeds where schedule has elapsed
          // ✅ Using $and to avoid duplicate $or keys (JS object key overwrite bug)
          $and: [
            // Creator filter — feeds belonging to this user
            {
              $or: [
                { createdByAccount: userId },
                { "postedBy.userId": userId }
              ]
            },
            // Schedule visibility filter
            // • Non-scheduled published feeds: always visible
            // • Scheduled + published + scheduleDate already passed: visible
            // • Scheduled + future scheduleDate: HIDDEN
            {
              $or: [
                { status: "published", isScheduled: { $ne: true } },
                {
                  status: "published",
                  isScheduled: true,
                  scheduleDate: { $lte: new Date() }
                }
              ]
            }
          ],
          isApproved: true,
          isDeleted: false,
          ...(postType === 'image' ? { postType: { $in: ['image', 'image+audio'] } } :
            postType ? { postType } : {})
        },
      },
      { $sort: { createdAt: -1 } },
      { $skip: (page - 1) * limit },
      { $limit: limit },

      // 🛑 OPTIMIZED LOOKUPS: Only project needed fields to keep pipeline memory low
      { $addFields: { effectiveCreatorId: { $ifNull: ["$postedBy.userId", "$createdByAccount"] } } },
      { $lookup: { from: "Admin", localField: "effectiveCreatorId", foreignField: "_id", pipeline: [{ $project: { userName: 1, name: 1 } }], as: "admin" } },
      { $lookup: { from: "Child_Admin", localField: "effectiveCreatorId", foreignField: "_id", pipeline: [{ $project: { userName: 1, name: 1 } }], as: "childAdmin" } },
      { $lookup: { from: "User", localField: "effectiveCreatorId", foreignField: "_id", pipeline: [{ $project: { userName: 1, name: 1 } }], as: "userAccount" } },

      // 🔄 DYNAMIC PROFILE JOIN: Match based on roleRef
      {
        $lookup: {
          from: "ProfileSettings",
          let: { creatorId: "$effectiveCreatorId", role: "$roleRef" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $or: [
                    { $and: [{ $eq: ["$$role", "Admin"] }, { $eq: ["$adminId", "$$creatorId"] }] },
                    { $and: [{ $eq: ["$$role", "Child_Admin"] }, { $eq: ["$childAdminId", "$$creatorId"] }] },
                    { $and: [{ $eq: ["$$role", "User"] }, { $eq: ["$userId", "$$creatorId"] }] }
                  ]
                }
              }
            },
            { $project: { name: 1, userName: 1, profileAvatar: 1, modifyAvatar: 1, visibility: 1 } }
          ],
          as: "creatorProfile"
        }
      },
      { $unwind: { path: "$creatorProfile", preserveNullAndEmptyArrays: true } },

      // 🔒 Field-level Visibility lookup
      {
        $lookup: {
          from: "ProfileVisibility",
          localField: "creatorProfile.visibility",
          foreignField: "_id",
          as: "fieldVisibility"
        }
      },
      { $unwind: { path: "$fieldVisibility", preserveNullAndEmptyArrays: true } },

      // 📊 COUNTS AGGREGATION: Dynamically calculate interaction counts
      {
        $lookup: {
          from: "UserFeedActions",
          let: { fid: "$_id" },
          pipeline: [
            { $unwind: "$likedFeeds" },
            { $match: { $expr: { $eq: ["$likedFeeds.feedId", "$$fid"] } } },
            { $count: "count" }
          ],
          as: "likesCountArr"
        }
      },
      {
        $lookup: {
          from: "UserFeedActions",
          let: { fid: "$_id" },
          pipeline: [
            { $unwind: "$sharedFeeds" },
            { $match: { $expr: { $eq: ["$sharedFeeds.feedId", "$$fid"] } } },
            { $count: "count" }
          ],
          as: "sharesCountArr"
        }
      },
      {
        $lookup: {
          from: "UserFeedActions",
          let: { fid: "$_id" },
          pipeline: [
            { $unwind: "$downloadedFeeds" },
            { $match: { $expr: { $eq: ["$downloadedFeeds.feedId", "$$fid"] } } },
            { $count: "count" }
          ],
          as: "downloadsCountArr"
        }
      },
      {
        $lookup: {
          from: "UserComments",
          let: { fid: "$_id" },
          pipeline: [
            { $match: { $expr: { $eq: ["$feedId", "$$fid"] } } },
            { $count: "count" }
          ],
          as: "commentsCountArr"
        }
      },
      {
        $lookup: {
          from: "ImageStats",
          localField: "_id",
          foreignField: "imageId",
          as: "imageStats"
        }
      },
      {
        $lookup: {
          from: "VideoStats",
          localField: "_id",
          foreignField: "videoId",
          as: "videoStats"
        }
      },
      {
        $addFields: {
          viewsCountArr: {
            $cond: {
              if: { $eq: ["$postType", "image"] },
              then: [{ count: { $ifNull: [{ $arrayElemAt: ["$imageStats.totalViews", 0] }, 0] } }],
              else: [{ count: { $ifNull: [{ $arrayElemAt: ["$videoStats.totalViews", 0] }, 0] } }]
            }
          }
        }
      },
      // 📊 USER INTERACTIONS: Check if current user liked/saved/followed
      {
        $lookup: {
          from: "UserFeedActions",
          let: { fid: "$_id" },
          pipeline: [
            { $match: { $expr: { $eq: ["$userId", userId] } } },
            {
              $project: {
                isLiked: { $in: ["$$fid", { $map: { input: "$likedFeeds", as: "i", in: "$$i.feedId" } }] },
                isSaved: { $in: ["$$fid", { $map: { input: "$savedFeeds", as: "i", in: "$$i.feedId" } }] },
                isDisliked: { $in: ["$$fid", { $map: { input: "$disLikeFeeds", as: "i", in: "$$i.feedId" } }] },
              }
            }
          ],
          as: "userActions"
        }
      },
      {
        $lookup: {
          from: "Follows",
          let: { creatorId: "$effectiveCreatorId" },
          pipeline: [
            { $match: { $expr: { $and: [{ $eq: ["$creatorId", "$$creatorId"] }, { $eq: ["$followerId", userId] }] } } },
            { $limit: 1 }
          ],
          as: "followInfo"
        }
      },
      {
        $addFields: {
          likesCount: { $ifNull: [{ $arrayElemAt: ["$likesCountArr.count", 0] }, 0] },
          shareCount: { $ifNull: [{ $arrayElemAt: ["$sharesCountArr.count", 0] }, 0] },
          downloadCount: { $ifNull: [{ $arrayElemAt: ["$downloadsCountArr.count", 0] }, 0] },
          commentsCount: { $ifNull: [{ $arrayElemAt: ["$commentsCountArr.count", 0] }, 0] },
          viewsCount: { $ifNull: [{ $arrayElemAt: ["$viewsCountArr.count", 0] }, 0] },
          isLiked: { $arrayElemAt: ["$userActions.isLiked", 0] },
          isSaved: { $arrayElemAt: ["$userActions.isSaved", 0] },
          isDisliked: { $arrayElemAt: ["$userActions.isDisliked", 0] },
          isFollowing: { $gt: [{ $size: "$followInfo" }, 0] },
          creatorData: {
            $let: {
              vars: {
                rawAccount: {
                  $switch: {
                    branches: [
                      { case: { $eq: ["$roleRef", "Admin"] }, then: { $arrayElemAt: ["$admin", 0] } },
                      { case: { $eq: ["$roleRef", "Child_Admin"] }, then: { $arrayElemAt: ["$childAdmin", 0] } },
                      { case: { $eq: ["$roleRef", "User"] }, then: { $arrayElemAt: ["$userAccount", 0] } }
                    ],
                    default: null
                  }
                }
              },
              in: {
                id: "$effectiveCreatorId",
                // Prefer data from ProfileSettings, fallback to Account info
                userName: { $ifNull: ["$creatorProfile.userName", "$$rawAccount.userName", "unknown"] },
                name: { $ifNull: ["$creatorProfile.name", "$$rawAccount.name", "User"] },
                // 🔒 Privacy-Aware Avatar Priority:
                avatar: {
                  $cond: {
                    if: {
                      $or: [
                        { $eq: ["$effectiveCreatorId", userId] }, // Always show to owner
                        { $eq: ["$fieldVisibility.profileAvatar", "public"] }, // Show if public
                        { $and: [{ $eq: ["$fieldVisibility.profileAvatar", "followers"] }, { $eq: ["$isFollowing", true] }] }, // Show if following
                        { $eq: ["$roleRef", "Admin"] }, // Admins are always public
                        { $eq: ["$roleRef", "Child_Admin"] }
                      ]
                    },
                    then: {
                      $ifNull: [
                        "$creatorProfile.modifyAvatar",
                        "$creatorProfile.profileAvatar",
                        "https://via.placeholder.com/150"
                      ]
                    },
                    else: "https://via.placeholder.com/150" // Mask if private/not-following
                  }
                },
                role: "$roleRef"
              }
            }
          }
        }
      },
      // FINAL CLEANUP: Remove lookup artifacts
      {
        $project: {
          admin: 0,
          childAdmin: 0,
          userAccount: 0,
          creatorProfile: 0,
          postedBy: 0,
          createdByAccount: 0,
          effectiveCreatorId: 0,
          fileHash: 0,
          __v: 0
        }
      }
    ]);

    /* -----------------------------------------------------
       ✅ 4️⃣ POST-PROCESSING (Normal vs Template Logic)
    ------------------------------------------------------*/
    const enrichedFeeds = feeds.map(feed => {
      const isTemplateMode = feed.uploadType === 'template';
      const themeColor = feed.themeColor || { primary: "#2563eb", secondary: "#1e40af", accent: "#ffffff", text: "#000000" };

      // Simplified designState for Template feeds
      let designState = null;
      if (isTemplateMode && feed.designMetadata) {
        designState = {
          elements: feed.designMetadata.overlayElements || [],
          mediaDimensions: feed.designMetadata.canvasSettings || { width: 1080, height: 1920 },
          audioConfig: feed.designMetadata.audioConfig || null,
          themeColors: themeColor
        };
      }

      return {
        ...feed,
        feedId: feed._id,
        uploadType: feed.uploadType || 'normal',
        mediaUrl: getMediaUrl(feed.mediaUrl),

        creatorData: {
          ...feed.creatorData,
          avatar: getMediaUrl(feed.creatorData?.avatar)
        },

        // ✅ Footer Configuration with Privacy-Aware Social Icons
        footerDisplay: isTemplateMode
          ? {
            ...(feed.designMetadata?.footerConfig || {}),
            ...footerVisibilityConfig,
            colors: themeColor
          }
          : { enabled: false },

        designState,

        // Final Interaction Stats
        stats: {
          likes: feed.likesCount || 0,
          views: feed.viewsCount || 0,
          comments: feed.commentsCount || 0,
          shares: feed.shareCount || 0,
          downloads: feed.downloadCount || 0
        }
      };
    });

    res.status(200).json({
      success: true,
      data: {
        viewer,
        feeds: enrichedFeeds,
        pagination: {
          page,
          limit,
          total: await Feed.countDocuments({
            _id: { $nin: excludeIds },
            ...(categoryId
              ? { category: new mongoose.Types.ObjectId(categoryId) }
              : { category: { $nin: [...notInterestedCategoryIds, ...EXCLUDED_CATEGORY_IDS] } }
            ),
            $and: [
              {
                $or: [
                  { isScheduled: { $ne: true } },
                  { $and: [{ isScheduled: true }, { scheduleDate: { $lte: new Date() } }] }
                ]
              }
            ],
            isApproved: true,
            isDeleted: false,
            status: { $in: ["Published", "Scheduled", "published", "scheduled"] },
            ...(postType === 'image' ? { postType: { $in: ['image', 'image+audio'] } } :
              postType ? { postType } : {})
          })
        }
      }
    });
  } catch (err) {
    console.error("❌ ERROR:", err.message);
    res.status(500).json({ success: false, message: "Server error" });
  }
};


/* ------------------------------------------------
   🎂 GET BIRTHDAY FEEDS
   GET /web/api/get/feeds/birthday?page=1&limit=10
   Category ID: 6990071590a65cd9632b2327
--------------------------------------------------- */
exports.getBirthdayFeeds = async (req, res) => {
  console.log("🎂 START: getBirthdayFeeds");

  const BIRTHDAY_CATEGORY_ID = new mongoose.Types.ObjectId("6990071590a65cd9632b2327");

  let hiddenPostIds = [];
  const canShow = (rule) => rule === "public";

  try {
    const rawUserId = req.Id || req.body.userId;
    if (!rawUserId) return res.status(404).json({ message: "User ID Required" });
    const userId = new mongoose.Types.ObjectId(rawUserId);
    const page = Math.max(1, Number(req.query.page || 1));
    const limit = Math.max(1, Math.min(50, Number(req.query.limit || 10)));
    const { postType } = req.query;

    /* ── 1. VIEWER PROFILE ────────────────────────────── */
    const viewerProfile = await ProfileSettings.findOne({ userId })
      .select("name userName profileAvatar phoneNumber socialLinks privacy modifyAvatar visibility")
      .lean();

    let viewerVisibility = null;
    if (viewerProfile?.visibility) {
      viewerVisibility = await ProfileVisibility.findById(viewerProfile.visibility).lean();
    }

    const viewerUser = await User.findById(userId).select("email").lean();

    let viewerSocialIcons = [];
    if (viewerProfile?.socialLinks && typeof viewerProfile.socialLinks === "object") {
      viewerSocialIcons = Object.entries(viewerProfile.socialLinks)
        .map(([platform, url]) => ({ platform, url: typeof url === "string" ? url.trim() : "", visible: true }))
        .filter((i) => i.url);
    }

    const safeSocialLinks = viewerSocialIcons.filter((icon) => {
      const rule = viewerVisibility?.socialLinks || "private";
      return canShow(rule) && icon.visible !== false && !!icon.url;
    });

    const footerVisibilityConfig = {
      showElements: {
        name: canShow(viewerVisibility?.name || "public"),
        userName: canShow(viewerVisibility?.userName || "public"),
        email: canShow(viewerVisibility?.email || "private"),
        phone: canShow(viewerVisibility?.phoneNumber || "private"),
        socialIcons: safeSocialLinks.length > 0,
      },
      socialIcons: safeSocialLinks.map((icon) => ({ platform: icon.platform, visible: true, urlTemplate: icon.url })),
    };

    const viewer = {
      id: userId,
      name: canShow(viewerVisibility?.name || "public") ? viewerProfile?.name || "User" : "Private User",
      userName: canShow(viewerVisibility?.userName || "public") ? viewerProfile?.userName || "user" : "private_user",
      email: canShow(viewerVisibility?.email || "private") ? viewerUser?.email || null : null,
      phoneNumber: canShow(viewerVisibility?.phoneNumber || "private") ? viewerProfile?.phoneNumber || null : null,
      profileAvatar: getMediaUrl(viewerProfile?.modifyAvatar) || "https://via.placeholder.com/150",
      socialLinks: safeSocialLinks,
    };

    /* ── 2. HIDDEN POSTS & NOT-INTERESTED CATEGORIES ─── */
    const hiddenPosts = await HiddenPost.find({ userId }).select("postId -_id").lean();
    hiddenPostIds = hiddenPosts.map((h) => h.postId);

    /* ── 3. AGGREGATION (Birthday category hardcoded) ── */
    const feeds = await Feed.aggregate([
      {
        $match: {
          _id: { $nin: hiddenPostIds },
          category: BIRTHDAY_CATEGORY_ID,
          $or: [
            { isScheduled: { $ne: true } },
            { $and: [{ isScheduled: true }, { scheduleDate: { $lte: new Date() } }] },
          ],
          isApproved: true,
          isDeleted: false,
          status: { $in: ["Published", "Scheduled", "published", "scheduled"] },
          ...(postType === "image"
            ? { postType: { $in: ["image", "image+audio"] } }
            : postType
              ? { postType }
              : {}),
        },
      },
      { $sort: { createdAt: -1 } },
      { $skip: (page - 1) * limit },
      { $limit: limit },

      { $addFields: { effectiveCreatorId: { $ifNull: ["$postedBy.userId", "$createdByAccount"] } } },
      { $lookup: { from: "Admin", localField: "effectiveCreatorId", foreignField: "_id", pipeline: [{ $project: { userName: 1, name: 1 } }], as: "admin" } },
      { $lookup: { from: "Child_Admin", localField: "effectiveCreatorId", foreignField: "_id", pipeline: [{ $project: { userName: 1, name: 1 } }], as: "childAdmin" } },
      { $lookup: { from: "User", localField: "effectiveCreatorId", foreignField: "_id", pipeline: [{ $project: { userName: 1, name: 1 } }], as: "userAccount" } },

      {
        $lookup: {
          from: "ProfileSettings",
          let: { creatorId: "$effectiveCreatorId", role: "$roleRef" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $or: [
                    { $and: [{ $eq: ["$$role", "Admin"] }, { $eq: ["$adminId", "$$creatorId"] }] },
                    { $and: [{ $eq: ["$$role", "Child_Admin"] }, { $eq: ["$childAdminId", "$$creatorId"] }] },
                    { $and: [{ $eq: ["$$role", "User"] }, { $eq: ["$userId", "$$creatorId"] }] },
                  ],
                },
              },
            },
            { $project: { name: 1, userName: 1, profileAvatar: 1, modifyAvatar: 1, visibility: 1 } },
          ],
          as: "creatorProfile",
        },
      },
      { $unwind: { path: "$creatorProfile", preserveNullAndEmptyArrays: true } },
      { $lookup: { from: "ProfileVisibility", localField: "creatorProfile.visibility", foreignField: "_id", as: "fieldVisibility" } },
      { $unwind: { path: "$fieldVisibility", preserveNullAndEmptyArrays: true } },

      { $lookup: { from: "UserFeedActions", let: { fid: "$_id" }, pipeline: [{ $unwind: "$likedFeeds" }, { $match: { $expr: { $eq: ["$likedFeeds.feedId", "$$fid"] } } }, { $count: "count" }], as: "likesCountArr" } },
      { $lookup: { from: "UserFeedActions", let: { fid: "$_id" }, pipeline: [{ $unwind: "$sharedFeeds" }, { $match: { $expr: { $eq: ["$sharedFeeds.feedId", "$$fid"] } } }, { $count: "count" }], as: "sharesCountArr" } },
      { $lookup: { from: "UserFeedActions", let: { fid: "$_id" }, pipeline: [{ $unwind: "$downloadedFeeds" }, { $match: { $expr: { $eq: ["$downloadedFeeds.feedId", "$$fid"] } } }, { $count: "count" }], as: "downloadsCountArr" } },
      { $lookup: { from: "UserComments", let: { fid: "$_id" }, pipeline: [{ $match: { $expr: { $eq: ["$feedId", "$$fid"] } } }, { $count: "count" }], as: "commentsCountArr" } },
      { $lookup: { from: "ImageStats", localField: "_id", foreignField: "imageId", as: "imageStats" } },
      { $lookup: { from: "VideoStats", localField: "_id", foreignField: "videoId", as: "videoStats" } },
      {
        $addFields: {
          viewsCountArr: {
            $cond: {
              if: { $eq: ["$postType", "image"] },
              then: [{ count: { $ifNull: [{ $arrayElemAt: ["$imageStats.totalViews", 0] }, 0] } }],
              else: [{ count: { $ifNull: [{ $arrayElemAt: ["$videoStats.totalViews", 0] }, 0] } }],
            },
          },
        },
      },
      {
        $lookup: {
          from: "UserFeedActions",
          let: { fid: "$_id" },
          pipeline: [
            { $match: { $expr: { $eq: ["$userId", userId] } } },
            {
              $project: {
                isLiked: { $in: ["$$fid", { $map: { input: "$likedFeeds", as: "i", in: "$$i.feedId" } }] },
                isSaved: { $in: ["$$fid", { $map: { input: "$savedFeeds", as: "i", in: "$$i.feedId" } }] },
                isDisliked: { $in: ["$$fid", { $map: { input: "$disLikeFeeds", as: "i", in: "$$i.feedId" } }] },
              },
            },
          ],
          as: "userActions",
        },
      },
      {
        $lookup: {
          from: "Follows",
          let: { creatorId: "$effectiveCreatorId" },
          pipeline: [{ $match: { $expr: { $and: [{ $eq: ["$creatorId", "$$creatorId"] }, { $eq: ["$followerId", userId] }] } } }, { $limit: 1 }],
          as: "followInfo",
        },
      },
      {
        $addFields: {
          likesCount: { $ifNull: [{ $arrayElemAt: ["$likesCountArr.count", 0] }, 0] },
          shareCount: { $ifNull: [{ $arrayElemAt: ["$sharesCountArr.count", 0] }, 0] },
          downloadCount: { $ifNull: [{ $arrayElemAt: ["$downloadsCountArr.count", 0] }, 0] },
          commentsCount: { $ifNull: [{ $arrayElemAt: ["$commentsCountArr.count", 0] }, 0] },
          viewsCount: { $ifNull: [{ $arrayElemAt: ["$viewsCountArr.count", 0] }, 0] },
          isLiked: { $arrayElemAt: ["$userActions.isLiked", 0] },
          isSaved: { $arrayElemAt: ["$userActions.isSaved", 0] },
          isDisliked: { $arrayElemAt: ["$userActions.isDisliked", 0] },
          isFollowing: { $gt: [{ $size: "$followInfo" }, 0] },
          creatorData: {
            $let: {
              vars: {
                rawAccount: {
                  $switch: {
                    branches: [
                      { case: { $eq: ["$roleRef", "Admin"] }, then: { $arrayElemAt: ["$admin", 0] } },
                      { case: { $eq: ["$roleRef", "Child_Admin"] }, then: { $arrayElemAt: ["$childAdmin", 0] } },
                      { case: { $eq: ["$roleRef", "User"] }, then: { $arrayElemAt: ["$userAccount", 0] } },
                    ],
                    default: null,
                  },
                },
              },
              in: {
                id: "$effectiveCreatorId",
                userName: { $ifNull: ["$creatorProfile.userName", "$$rawAccount.userName", "unknown"] },
                name: { $ifNull: ["$creatorProfile.name", "$$rawAccount.name", "User"] },
                avatar: {
                  $cond: {
                    if: {
                      $or: [
                        { $eq: ["$effectiveCreatorId", userId] },
                        { $eq: ["$fieldVisibility.profileAvatar", "public"] },
                        { $and: [{ $eq: ["$fieldVisibility.profileAvatar", "followers"] }, { $eq: ["$isFollowing", true] }] },
                        { $eq: ["$roleRef", "Admin"] },
                        { $eq: ["$roleRef", "Child_Admin"] },
                      ],
                    },
                    then: { $ifNull: ["$creatorProfile.modifyAvatar", "$creatorProfile.profileAvatar", "https://via.placeholder.com/150"] },
                    else: "https://via.placeholder.com/150",
                  },
                },
                role: "$roleRef",
              },
            },
          },
        },
      },
      {
        $project: {
          admin: 0, childAdmin: 0, userAccount: 0, creatorProfile: 0,
          postedBy: 0, createdByAccount: 0, effectiveCreatorId: 0, fileHash: 0, __v: 0,
        },
      },
    ]);

    /* ── 4. POST-PROCESSING ─────────────────────────── */
    const enrichedFeeds = feeds.map((feed) => {
      const isTemplateMode = feed.uploadType === "template";
      const themeColor = feed.themeColor || { primary: "#2563eb", secondary: "#1e40af", accent: "#ffffff", text: "#000000" };

      let designState = null;
      if (isTemplateMode && feed.designMetadata) {
        designState = {
          elements: feed.designMetadata.overlayElements || [],
          mediaDimensions: feed.designMetadata.canvasSettings || { width: 1080, height: 1920 },
          audioConfig: feed.designMetadata.audioConfig || null,
          themeColors: themeColor,
        };
      }

      return {
        ...feed,
        feedId: feed._id,
        uploadType: feed.uploadType || "normal",
        mediaUrl: getMediaUrl(feed.mediaUrl),
        creatorData: { ...feed.creatorData, avatar: getMediaUrl(feed.creatorData?.avatar) },
        footerDisplay: isTemplateMode
          ? { ...(feed.designMetadata?.footerConfig || {}), ...footerVisibilityConfig, colors: themeColor }
          : { enabled: false },
        designState,
        stats: {
          likes: feed.likesCount || 0,
          views: feed.viewsCount || 0,
          comments: feed.commentsCount || 0,
          shares: feed.shareCount || 0,
          downloads: feed.downloadCount || 0,
        },
      };
    });

    const total = await Feed.countDocuments({
      _id: { $nin: hiddenPostIds },
      category: BIRTHDAY_CATEGORY_ID,
      $or: [
        { isScheduled: { $ne: true } },
        { $and: [{ isScheduled: true }, { scheduleDate: { $lte: new Date() } }] },
      ],
      isApproved: true,
      isDeleted: false,
      status: { $in: ["Published", "Scheduled", "published", "scheduled"] },
      ...(postType === "image" ? { postType: { $in: ["image", "image+audio"] } } : postType ? { postType } : {}),
    });

    res.status(200).json({
      success: true,
      data: {
        viewer,
        feeds: enrichedFeeds,
        pagination: { page, limit, total },
      },
    });
  } catch (err) {
    console.error("❌ getBirthdayFeeds ERROR:", err.message);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

/* ------------------------------------------------
   💍 GET ANNIVERSARY FEEDS
   GET /web/api/get/feeds/anniversary?page=1&limit=10
   Category ID: 699ee86c20120ebc1d3e929b
--------------------------------------------------- */
exports.getAnniversaryFeeds = async (req, res) => {
  console.log("💍 START: getAnniversaryFeeds");

  const ANNIVERSARY_CATEGORY_ID = new mongoose.Types.ObjectId("699ee86c20120ebc1d3e929b");

  let hiddenPostIds = [];
  const canShow = (rule) => rule === "public";

  try {
    const rawUserId = req.Id || req.body.userId;
    if (!rawUserId) return res.status(404).json({ message: "User ID Required" });
    const userId = new mongoose.Types.ObjectId(rawUserId);
    const page = Math.max(1, Number(req.query.page || 1));
    const limit = Math.max(1, Math.min(50, Number(req.query.limit || 10)));
    const { postType } = req.query;

    /* ── 1. VIEWER PROFILE ────────────────────────────── */
    const viewerProfile = await ProfileSettings.findOne({ userId })
      .select("name userName profileAvatar phoneNumber socialLinks privacy modifyAvatar visibility")
      .lean();

    let viewerVisibility = null;
    if (viewerProfile?.visibility) {
      viewerVisibility = await ProfileVisibility.findById(viewerProfile.visibility).lean();
    }

    const viewerUser = await User.findById(userId).select("email").lean();

    let viewerSocialIcons = [];
    if (viewerProfile?.socialLinks && typeof viewerProfile.socialLinks === "object") {
      viewerSocialIcons = Object.entries(viewerProfile.socialLinks)
        .map(([platform, url]) => ({ platform, url: typeof url === "string" ? url.trim() : "", visible: true }))
        .filter((i) => i.url);
    }

    const safeSocialLinks = viewerSocialIcons.filter((icon) => {
      const rule = viewerVisibility?.socialLinks || "private";
      return canShow(rule) && icon.visible !== false && !!icon.url;
    });

    const footerVisibilityConfig = {
      showElements: {
        name: canShow(viewerVisibility?.name || "public"),
        userName: canShow(viewerVisibility?.userName || "public"),
        email: canShow(viewerVisibility?.email || "private"),
        phone: canShow(viewerVisibility?.phoneNumber || "private"),
        socialIcons: safeSocialLinks.length > 0,
      },
      socialIcons: safeSocialLinks.map((icon) => ({ platform: icon.platform, visible: true, urlTemplate: icon.url })),
    };

    const viewer = {
      id: userId,
      name: canShow(viewerVisibility?.name || "public") ? viewerProfile?.name || "User" : "Private User",
      userName: canShow(viewerVisibility?.userName || "public") ? viewerProfile?.userName || "user" : "private_user",
      email: canShow(viewerVisibility?.email || "private") ? viewerUser?.email || null : null,
      phoneNumber: canShow(viewerVisibility?.phoneNumber || "private") ? viewerProfile?.phoneNumber || null : null,
      profileAvatar: getMediaUrl(viewerProfile?.modifyAvatar) || "https://via.placeholder.com/150",
      socialLinks: safeSocialLinks,
    };

    /* ── 2. HIDDEN POSTS & NOT-INTERESTED CATEGORIES ─── */
    const hiddenPosts = await HiddenPost.find({ userId }).select("postId -_id").lean();
    hiddenPostIds = hiddenPosts.map((h) => h.postId);

    /* ── 3. AGGREGATION (Anniversary category hardcoded) ── */
    const feeds = await Feed.aggregate([
      {
        $match: {
          _id: { $nin: hiddenPostIds },
          category: ANNIVERSARY_CATEGORY_ID,
          $or: [
            { isScheduled: { $ne: true } },
            { $and: [{ isScheduled: true }, { scheduleDate: { $lte: new Date() } }] },
          ],
          isApproved: true,
          isDeleted: false,
          status: { $in: ["Published", "Scheduled", "published", "scheduled"] },
          ...(postType === "image"
            ? { postType: { $in: ["image", "image+audio"] } }
            : postType
              ? { postType }
              : {}),
        },
      },
      { $sort: { createdAt: -1 } },
      { $skip: (page - 1) * limit },
      { $limit: limit },

      { $addFields: { effectiveCreatorId: { $ifNull: ["$postedBy.userId", "$createdByAccount"] } } },
      { $lookup: { from: "Admin", localField: "effectiveCreatorId", foreignField: "_id", pipeline: [{ $project: { userName: 1, name: 1 } }], as: "admin" } },
      { $lookup: { from: "Child_Admin", localField: "effectiveCreatorId", foreignField: "_id", pipeline: [{ $project: { userName: 1, name: 1 } }], as: "childAdmin" } },
      { $lookup: { from: "User", localField: "effectiveCreatorId", foreignField: "_id", pipeline: [{ $project: { userName: 1, name: 1 } }], as: "userAccount" } },

      {
        $lookup: {
          from: "ProfileSettings",
          let: { creatorId: "$effectiveCreatorId", role: "$roleRef" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $or: [
                    { $and: [{ $eq: ["$$role", "Admin"] }, { $eq: ["$adminId", "$$creatorId"] }] },
                    { $and: [{ $eq: ["$$role", "Child_Admin"] }, { $eq: ["$childAdminId", "$$creatorId"] }] },
                    { $and: [{ $eq: ["$$role", "User"] }, { $eq: ["$userId", "$$creatorId"] }] },
                  ],
                },
              },
            },
            { $project: { name: 1, userName: 1, profileAvatar: 1, modifyAvatar: 1, visibility: 1 } },
          ],
          as: "creatorProfile",
        },
      },
      { $unwind: { path: "$creatorProfile", preserveNullAndEmptyArrays: true } },
      { $lookup: { from: "ProfileVisibility", localField: "creatorProfile.visibility", foreignField: "_id", as: "fieldVisibility" } },
      { $unwind: { path: "$fieldVisibility", preserveNullAndEmptyArrays: true } },

      { $lookup: { from: "UserFeedActions", let: { fid: "$_id" }, pipeline: [{ $unwind: "$likedFeeds" }, { $match: { $expr: { $eq: ["$likedFeeds.feedId", "$$fid"] } } }, { $count: "count" }], as: "likesCountArr" } },
      { $lookup: { from: "UserFeedActions", let: { fid: "$_id" }, pipeline: [{ $unwind: "$sharedFeeds" }, { $match: { $expr: { $eq: ["$sharedFeeds.feedId", "$$fid"] } } }, { $count: "count" }], as: "sharesCountArr" } },
      { $lookup: { from: "UserFeedActions", let: { fid: "$_id" }, pipeline: [{ $unwind: "$downloadedFeeds" }, { $match: { $expr: { $eq: ["$downloadedFeeds.feedId", "$$fid"] } } }, { $count: "count" }], as: "downloadsCountArr" } },
      { $lookup: { from: "UserComments", let: { fid: "$_id" }, pipeline: [{ $match: { $expr: { $eq: ["$feedId", "$$fid"] } } }, { $count: "count" }], as: "commentsCountArr" } },
      { $lookup: { from: "ImageStats", localField: "_id", foreignField: "imageId", as: "imageStats" } },
      { $lookup: { from: "VideoStats", localField: "_id", foreignField: "videoId", as: "videoStats" } },
      {
        $addFields: {
          viewsCountArr: {
            $cond: {
              if: { $eq: ["$postType", "image"] },
              then: [{ count: { $ifNull: [{ $arrayElemAt: ["$imageStats.totalViews", 0] }, 0] } }],
              else: [{ count: { $ifNull: [{ $arrayElemAt: ["$videoStats.totalViews", 0] }, 0] } }],
            },
          },
        },
      },
      {
        $lookup: {
          from: "UserFeedActions",
          let: { fid: "$_id" },
          pipeline: [
            { $match: { $expr: { $eq: ["$userId", userId] } } },
            {
              $project: {
                isLiked: { $in: ["$$fid", { $map: { input: "$likedFeeds", as: "i", in: "$$i.feedId" } }] },
                isSaved: { $in: ["$$fid", { $map: { input: "$savedFeeds", as: "i", in: "$$i.feedId" } }] },
                isDisliked: { $in: ["$$fid", { $map: { input: "$disLikeFeeds", as: "i", in: "$$i.feedId" } }] },
              },
            },
          ],
          as: "userActions",
        },
      },
      {
        $lookup: {
          from: "Follows",
          let: { creatorId: "$effectiveCreatorId" },
          pipeline: [{ $match: { $expr: { $and: [{ $eq: ["$creatorId", "$$creatorId"] }, { $eq: ["$followerId", userId] }] } } }, { $limit: 1 }],
          as: "followInfo",
        },
      },
      {
        $addFields: {
          likesCount: { $ifNull: [{ $arrayElemAt: ["$likesCountArr.count", 0] }, 0] },
          shareCount: { $ifNull: [{ $arrayElemAt: ["$sharesCountArr.count", 0] }, 0] },
          downloadCount: { $ifNull: [{ $arrayElemAt: ["$downloadsCountArr.count", 0] }, 0] },
          commentsCount: { $ifNull: [{ $arrayElemAt: ["$commentsCountArr.count", 0] }, 0] },
          viewsCount: { $ifNull: [{ $arrayElemAt: ["$viewsCountArr.count", 0] }, 0] },
          isLiked: { $arrayElemAt: ["$userActions.isLiked", 0] },
          isSaved: { $arrayElemAt: ["$userActions.isSaved", 0] },
          isDisliked: { $arrayElemAt: ["$userActions.isDisliked", 0] },
          isFollowing: { $gt: [{ $size: "$followInfo" }, 0] },
          creatorData: {
            $let: {
              vars: {
                rawAccount: {
                  $switch: {
                    branches: [
                      { case: { $eq: ["$roleRef", "Admin"] }, then: { $arrayElemAt: ["$admin", 0] } },
                      { case: { $eq: ["$roleRef", "Child_Admin"] }, then: { $arrayElemAt: ["$childAdmin", 0] } },
                      { case: { $eq: ["$roleRef", "User"] }, then: { $arrayElemAt: ["$userAccount", 0] } },
                    ],
                    default: null,
                  },
                },
              },
              in: {
                id: "$effectiveCreatorId",
                userName: { $ifNull: ["$creatorProfile.userName", "$$rawAccount.userName", "unknown"] },
                name: { $ifNull: ["$creatorProfile.name", "$$rawAccount.name", "User"] },
                avatar: {
                  $cond: {
                    if: {
                      $or: [
                        { $eq: ["$effectiveCreatorId", userId] },
                        { $eq: ["$fieldVisibility.profileAvatar", "public"] },
                        { $and: [{ $eq: ["$fieldVisibility.profileAvatar", "followers"] }, { $eq: ["$isFollowing", true] }] },
                        { $eq: ["$roleRef", "Admin"] },
                        { $eq: ["$roleRef", "Child_Admin"] },
                      ],
                    },
                    then: { $ifNull: ["$creatorProfile.modifyAvatar", "$creatorProfile.profileAvatar", "https://via.placeholder.com/150"] },
                    else: "https://via.placeholder.com/150",
                  },
                },
                role: "$roleRef",
              },
            },
          },
        },
      },
      {
        $project: {
          admin: 0, childAdmin: 0, userAccount: 0, creatorProfile: 0,
          postedBy: 0, createdByAccount: 0, effectiveCreatorId: 0, fileHash: 0, __v: 0,
        },
      },
    ]);

    /* ── 4. POST-PROCESSING ─────────────────────────── */
    const enrichedFeeds = feeds.map((feed) => {
      const isTemplateMode = feed.uploadType === "template";
      const themeColor = feed.themeColor || { primary: "#2563eb", secondary: "#1e40af", accent: "#ffffff", text: "#000000" };

      let designState = null;
      if (isTemplateMode && feed.designMetadata) {
        designState = {
          elements: feed.designMetadata.overlayElements || [],
          mediaDimensions: feed.designMetadata.canvasSettings || { width: 1080, height: 1920 },
          audioConfig: feed.designMetadata.audioConfig || null,
          themeColors: themeColor,
        };
      }

      return {
        ...feed,
        feedId: feed._id,
        uploadType: feed.uploadType || "normal",
        mediaUrl: getMediaUrl(feed.mediaUrl),
        creatorData: { ...feed.creatorData, avatar: getMediaUrl(feed.creatorData?.avatar) },
        footerDisplay: isTemplateMode
          ? { ...(feed.designMetadata?.footerConfig || {}), ...footerVisibilityConfig, colors: themeColor }
          : { enabled: false },
        designState,
        stats: {
          likes: feed.likesCount || 0,
          views: feed.viewsCount || 0,
          comments: feed.commentsCount || 0,
          shares: feed.shareCount || 0,
          downloads: feed.downloadCount || 0,
        },
      };
    });

    const total = await Feed.countDocuments({
      _id: { $nin: hiddenPostIds },
      category: ANNIVERSARY_CATEGORY_ID,
      $or: [
        { isScheduled: { $ne: true } },
        { $and: [{ isScheduled: true }, { scheduleDate: { $lte: new Date() } }] },
      ],
      isApproved: true,
      isDeleted: false,
      status: { $in: ["Published", "Scheduled", "published", "scheduled"] },
      ...(postType === "image" ? { postType: { $in: ["image", "image+audio"] } } : postType ? { postType } : {}),
    });

    res.status(200).json({
      success: true,
      data: {
        viewer,
        feeds: enrichedFeeds,
        pagination: { page, limit, total },
      },
    });
  } catch (err) {
    console.error("❌ getAnniversaryFeeds ERROR:", err.message);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

/* ------------------------------------------------
   🗳️ GET POLITICS FEEDS
   GET /web/api/get/feeds/politics?page=1&limit=10
   Category ID: 699ee0e420120ebc1d3e7725
--------------------------------------------------- */
exports.getPoliticsFeeds = async (req, res) => {
  console.log("🗳️ START: getPoliticsFeeds");

  const POLITICS_CATEGORY_ID = new mongoose.Types.ObjectId("699ee0e420120ebc1d3e7725");

  let hiddenPostIds = [];
  const canShow = (rule) => rule === "public";

  try {
    const rawUserId = req.Id || req.body.userId;
    if (!rawUserId) return res.status(404).json({ message: "User ID Required" });
    const userId = new mongoose.Types.ObjectId(rawUserId);
    const page = Math.max(1, Number(req.query.page || 1));
    const limit = Math.max(1, Math.min(50, Number(req.query.limit || 10)));
    const { postType } = req.query;

    /* ── 1. VIEWER PROFILE ────────────────────────────── */
    const viewerProfile = await ProfileSettings.findOne({ userId })
      .select("name userName profileAvatar phoneNumber socialLinks privacy modifyAvatar visibility")
      .lean();

    let viewerVisibility = null;
    if (viewerProfile?.visibility) {
      viewerVisibility = await ProfileVisibility.findById(viewerProfile.visibility).lean();
    }

    const viewerUser = await User.findById(userId).select("email").lean();

    let viewerSocialIcons = [];
    if (viewerProfile?.socialLinks && typeof viewerProfile.socialLinks === "object") {
      viewerSocialIcons = Object.entries(viewerProfile.socialLinks)
        .map(([platform, url]) => ({ platform, url: typeof url === "string" ? url.trim() : "", visible: true }))
        .filter((i) => i.url);
    }

    const safeSocialLinks = viewerSocialIcons.filter((icon) => {
      const rule = viewerVisibility?.socialLinks || "private";
      return canShow(rule) && icon.visible !== false && !!icon.url;
    });

    const footerVisibilityConfig = {
      showElements: {
        name: canShow(viewerVisibility?.name || "public"),
        userName: canShow(viewerVisibility?.userName || "public"),
        email: canShow(viewerVisibility?.email || "private"),
        phone: canShow(viewerVisibility?.phoneNumber || "private"),
        socialIcons: safeSocialLinks.length > 0,
      },
      socialIcons: safeSocialLinks.map((icon) => ({ platform: icon.platform, visible: true, urlTemplate: icon.url })),
    };

    const viewer = {
      id: userId,
      name: canShow(viewerVisibility?.name || "public") ? viewerProfile?.name || "User" : "Private User",
      userName: canShow(viewerVisibility?.userName || "public") ? viewerProfile?.userName || "user" : "private_user",
      email: canShow(viewerVisibility?.email || "private") ? viewerUser?.email || null : null,
      phoneNumber: canShow(viewerVisibility?.phoneNumber || "private") ? viewerProfile?.phoneNumber || null : null,
      profileAvatar: getMediaUrl(viewerProfile?.modifyAvatar) || "https://via.placeholder.com/150",
      socialLinks: safeSocialLinks,
    };

    /* ── 2. HIDDEN POSTS & NOT-INTERESTED CATEGORIES ─── */
    const hiddenPosts = await HiddenPost.find({ userId }).select("postId -_id").lean();
    hiddenPostIds = hiddenPosts.map((h) => h.postId);

    /* ── 3. AGGREGATION (Politics category hardcoded) ── */
    const feeds = await Feed.aggregate([
      {
        $match: {
          _id: { $nin: hiddenPostIds },
          category: POLITICS_CATEGORY_ID,
          $or: [
            { isScheduled: { $ne: true } },
            { $and: [{ isScheduled: true }, { scheduleDate: { $lte: new Date() } }] },
          ],
          isApproved: true,
          isDeleted: false,
          status: { $in: ["Published", "Scheduled", "published", "scheduled"] },
          ...(postType === "image"
            ? { postType: { $in: ["image", "image+audio"] } }
            : postType
              ? { postType }
              : {}),
        },
      },
      { $sort: { createdAt: -1 } },
      { $skip: (page - 1) * limit },
      { $limit: limit },

      { $addFields: { effectiveCreatorId: { $ifNull: ["$postedBy.userId", "$createdByAccount"] } } },
      { $lookup: { from: "Admin", localField: "effectiveCreatorId", foreignField: "_id", pipeline: [{ $project: { userName: 1, name: 1 } }], as: "admin" } },
      { $lookup: { from: "Child_Admin", localField: "effectiveCreatorId", foreignField: "_id", pipeline: [{ $project: { userName: 1, name: 1 } }], as: "childAdmin" } },
      { $lookup: { from: "User", localField: "effectiveCreatorId", foreignField: "_id", pipeline: [{ $project: { userName: 1, name: 1 } }], as: "userAccount" } },

      {
        $lookup: {
          from: "ProfileSettings",
          let: { creatorId: "$effectiveCreatorId", role: "$roleRef" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $or: [
                    { $and: [{ $eq: ["$$role", "Admin"] }, { $eq: ["$adminId", "$$creatorId"] }] },
                    { $and: [{ $eq: ["$$role", "Child_Admin"] }, { $eq: ["$childAdminId", "$$creatorId"] }] },
                    { $and: [{ $eq: ["$$role", "User"] }, { $eq: ["$userId", "$$creatorId"] }] },
                  ],
                },
              },
            },
            { $project: { name: 1, userName: 1, profileAvatar: 1, modifyAvatar: 1, visibility: 1 } },
          ],
          as: "creatorProfile",
        },
      },
      { $unwind: { path: "$creatorProfile", preserveNullAndEmptyArrays: true } },
      { $lookup: { from: "ProfileVisibility", localField: "creatorProfile.visibility", foreignField: "_id", as: "fieldVisibility" } },
      { $unwind: { path: "$fieldVisibility", preserveNullAndEmptyArrays: true } },

      { $lookup: { from: "UserFeedActions", let: { fid: "$_id" }, pipeline: [{ $unwind: "$likedFeeds" }, { $match: { $expr: { $eq: ["$likedFeeds.feedId", "$$fid"] } } }, { $count: "count" }], as: "likesCountArr" } },
      { $lookup: { from: "UserFeedActions", let: { fid: "$_id" }, pipeline: [{ $unwind: "$sharedFeeds" }, { $match: { $expr: { $eq: ["$sharedFeeds.feedId", "$$fid"] } } }, { $count: "count" }], as: "sharesCountArr" } },
      { $lookup: { from: "UserFeedActions", let: { fid: "$_id" }, pipeline: [{ $unwind: "$downloadedFeeds" }, { $match: { $expr: { $eq: ["$downloadedFeeds.feedId", "$$fid"] } } }, { $count: "count" }], as: "downloadsCountArr" } },
      { $lookup: { from: "UserComments", let: { fid: "$_id" }, pipeline: [{ $match: { $expr: { $eq: ["$feedId", "$$fid"] } } }, { $count: "count" }], as: "commentsCountArr" } },
      { $lookup: { from: "ImageStats", localField: "_id", foreignField: "imageId", as: "imageStats" } },
      { $lookup: { from: "VideoStats", localField: "_id", foreignField: "videoId", as: "videoStats" } },
      {
        $addFields: {
          viewsCountArr: {
            $cond: {
              if: { $eq: ["$postType", "image"] },
              then: [{ count: { $ifNull: [{ $arrayElemAt: ["$imageStats.totalViews", 0] }, 0] } }],
              else: [{ count: { $ifNull: [{ $arrayElemAt: ["$videoStats.totalViews", 0] }, 0] } }],
            },
          },
        },
      },
      {
        $lookup: {
          from: "UserFeedActions",
          let: { fid: "$_id" },
          pipeline: [
            { $match: { $expr: { $eq: ["$userId", userId] } } },
            {
              $project: {
                isLiked: { $in: ["$$fid", { $map: { input: "$likedFeeds", as: "i", in: "$$i.feedId" } }] },
                isSaved: { $in: ["$$fid", { $map: { input: "$savedFeeds", as: "i", in: "$$i.feedId" } }] },
                isDisliked: { $in: ["$$fid", { $map: { input: "$disLikeFeeds", as: "i", in: "$$i.feedId" } }] },
              },
            },
          ],
          as: "userActions",
        },
      },
      {
        $lookup: {
          from: "Follows",
          let: { creatorId: "$effectiveCreatorId" },
          pipeline: [{ $match: { $expr: { $and: [{ $eq: ["$creatorId", "$$creatorId"] }, { $eq: ["$followerId", userId] }] } } }, { $limit: 1 }],
          as: "followInfo",
        },
      },
      {
        $addFields: {
          likesCount: { $ifNull: [{ $arrayElemAt: ["$likesCountArr.count", 0] }, 0] },
          shareCount: { $ifNull: [{ $arrayElemAt: ["$sharesCountArr.count", 0] }, 0] },
          downloadCount: { $ifNull: [{ $arrayElemAt: ["$downloadsCountArr.count", 0] }, 0] },
          commentsCount: { $ifNull: [{ $arrayElemAt: ["$commentsCountArr.count", 0] }, 0] },
          viewsCount: { $ifNull: [{ $arrayElemAt: ["$viewsCountArr.count", 0] }, 0] },
          isLiked: { $arrayElemAt: ["$userActions.isLiked", 0] },
          isSaved: { $arrayElemAt: ["$userActions.isSaved", 0] },
          isDisliked: { $arrayElemAt: ["$userActions.isDisliked", 0] },
          isFollowing: { $gt: [{ $size: "$followInfo" }, 0] },
          creatorData: {
            $let: {
              vars: {
                rawAccount: {
                  $switch: {
                    branches: [
                      { case: { $eq: ["$roleRef", "Admin"] }, then: { $arrayElemAt: ["$admin", 0] } },
                      { case: { $eq: ["$roleRef", "Child_Admin"] }, then: { $arrayElemAt: ["$childAdmin", 0] } },
                      { case: { $eq: ["$roleRef", "User"] }, then: { $arrayElemAt: ["$userAccount", 0] } },
                    ],
                    default: null,
                  },
                },
              },
              in: {
                id: "$effectiveCreatorId",
                userName: { $ifNull: ["$creatorProfile.userName", "$$rawAccount.userName", "unknown"] },
                name: { $ifNull: ["$creatorProfile.name", "$$rawAccount.name", "User"] },
                avatar: {
                  $cond: {
                    if: {
                      $or: [
                        { $eq: ["$effectiveCreatorId", userId] },
                        { $eq: ["$fieldVisibility.profileAvatar", "public"] },
                        { $and: [{ $eq: ["$fieldVisibility.profileAvatar", "followers"] }, { $eq: ["$isFollowing", true] }] },
                        { $eq: ["$roleRef", "Admin"] },
                        { $eq: ["$roleRef", "Child_Admin"] },
                      ],
                    },
                    then: { $ifNull: ["$creatorProfile.modifyAvatar", "$creatorProfile.profileAvatar", "https://via.placeholder.com/150"] },
                    else: "https://via.placeholder.com/150",
                  },
                },
                role: "$roleRef",
              },
            },
          },
        },
      },
      {
        $project: {
          admin: 0, childAdmin: 0, userAccount: 0, creatorProfile: 0,
          postedBy: 0, createdByAccount: 0, effectiveCreatorId: 0, fileHash: 0, __v: 0,
        },
      },
    ]);

    /* ── 4. POST-PROCESSING ─────────────────────────── */
    const enrichedFeeds = feeds.map((feed) => {
      const isTemplateMode = feed.uploadType === "template";
      const themeColor = feed.themeColor || { primary: "#2563eb", secondary: "#1e40af", accent: "#ffffff", text: "#000000" };

      let designState = null;
      if (isTemplateMode && feed.designMetadata) {
        designState = {
          elements: feed.designMetadata.overlayElements || [],
          mediaDimensions: feed.designMetadata.canvasSettings || { width: 1080, height: 1920 },
          audioConfig: feed.designMetadata.audioConfig || null,
          themeColors: themeColor,
        };
      }

      return {
        ...feed,
        feedId: feed._id,
        uploadType: feed.uploadType || "normal",
        mediaUrl: getMediaUrl(feed.mediaUrl),
        creatorData: { ...feed.creatorData, avatar: getMediaUrl(feed.creatorData?.avatar) },
        footerDisplay: isTemplateMode
          ? { ...(feed.designMetadata?.footerConfig || {}), ...footerVisibilityConfig, colors: themeColor }
          : { enabled: false },
        designState,
        stats: {
          likes: feed.likesCount || 0,
          views: feed.viewsCount || 0,
          comments: feed.commentsCount || 0,
          shares: feed.shareCount || 0,
          downloads: feed.downloadCount || 0,
        },
      };
    });

    const total = await Feed.countDocuments({
      _id: { $nin: hiddenPostIds },
      category: POLITICS_CATEGORY_ID,
      $or: [
        { isScheduled: { $ne: true } },
        { $and: [{ isScheduled: true }, { scheduleDate: { $lte: new Date() } }] },
      ],
      isApproved: true,
      isDeleted: false,
      status: { $in: ["Published", "Scheduled", "published", "scheduled"] },
      ...(postType === "image" ? { postType: { $in: ["image", "image+audio"] } } : postType ? { postType } : {}),
    });

    res.status(200).json({
      success: true,
      data: {
        viewer,
        feeds: enrichedFeeds,
        pagination: { page, limit, total },
      },
    });
  } catch (err) {
    console.error("❌ getPoliticsFeeds ERROR:", err.message);
    res.status(500).json({ success: false, message: "Server error" });
  }
};



/* ------------------------------------------------
   CLEAN TAG VALUE (“#Music” → “music”)
--------------------------------------------------- */
function normalizeTag(str) {
  if (!str) return "";
  return str.trim().replace(/^#+/, "").toLowerCase();
}



/* ------------------------------------------------
   MAIN FUNCTION
--------------------------------------------------- */

exports.getFeedsByHashtag = async (req, res) => {
  try {
    const rawUserId = req.Id || req.body.userId;
    const tagRaw = req.params.tag;

    if (!rawUserId)
      return res.status(400).json({ message: "User ID required" });

    const tag = normalizeTag(tagRaw);
    if (!tag) return res.status(400).json({ message: "Hashtag required" });

    const userId = new mongoose.Types.ObjectId(rawUserId);

    const page = Math.max(1, Number(req.query.page || 1));
    const limit = Math.max(5, Math.min(50, Number(req.query.limit || 10)));
    const skip = (page - 1) * limit;

    /* -------------------------------------------------
       1) Hidden Posts
    -------------------------------------------------- */
    const hiddenPosts = await HiddenPost.find({ userId })
      .select("postId -_id")
      .lean();
    const hiddenPostIds = hiddenPosts.map((x) => x.postId);

    /* -------------------------------------------------
       2) User "Not Interested" Categories
    -------------------------------------------------- */
    const userCat = await UserCategory.findOne({ userId }).lean();
    const notCats = userCat?.nonInterestedCategories || [];

    /* -------------------------------------------------
       3) AGGREGATION PIPELINE
    -------------------------------------------------- */
    const pipeline = [
      {
        $match: {
          _id: { $nin: hiddenPostIds },
          category: { $nin: notCats },
          hashtags: { $in: [tag] },
          $or: [
            { isScheduled: { $ne: true } },
            { $and: [{ isScheduled: true }, { scheduleDate: { $lte: new Date() } }] }
          ],
          isApproved: true,
          status: { $in: ["Published", "published"] }
        }
      },

      { $sort: { createdAt: -1 } },
      { $skip: skip },
      { $limit: limit },

      /* -------------------------------------------------
         ACCOUNT LOOKUP (Admin / Child_Admin / User)
      -------------------------------------------------- */
      { $addFields: { effectiveCreatorId: { $ifNull: ["$postedBy.userId", "$createdByAccount"] } } },
      { $lookup: { from: "Admin", localField: "effectiveCreatorId", foreignField: "_id", as: "admin" } },
      { $lookup: { from: "Child_Admin", localField: "effectiveCreatorId", foreignField: "_id", as: "childAdmin" } },
      { $lookup: { from: "User", localField: "effectiveCreatorId", foreignField: "_id", as: "user" } },

      {
        $addFields: {
          accountData: {
            $switch: {
              branches: [
                { case: { $eq: ["$roleRef", "Admin"] }, then: { $arrayElemAt: ["$admin", 0] } },
                { case: { $eq: ["$roleRef", "Child_Admin"] }, then: { $arrayElemAt: ["$childAdmin", 0] } },
                { case: { $eq: ["$roleRef", "User"] }, then: { $arrayElemAt: ["$user", 0] } }
              ],
              default: null
            }
          }
        }
      },

      /* -------------------------------------------------
         PROFILE SETTINGS
      -------------------------------------------------- */
      {
        $lookup: {
          from: "ProfileSettings",
          let: {
            adminId: { $cond: [{ $eq: ["$roleRef", "Admin"] }, "$effectiveCreatorId", null] },
            childAdminId: { $cond: [{ $eq: ["$roleRef", "Child_Admin"] }, "$effectiveCreatorId", null] },
            userId: { $cond: [{ $eq: ["$roleRef", "User"] }, "$effectiveCreatorId", null] },
          },
          pipeline: [
            {
              $match: {
                $expr: {
                  $or: [
                    { $eq: ["$adminId", "$$adminId"] },
                    { $eq: ["$childAdminId", "$$childAdminId"] },
                    { $eq: ["$userId", "$$userId"] }
                  ]
                }
              }
            },
            { $project: { userName: 1, profileAvatar: 1, modifyAvatar: 1, visibility: 1 } },
            { $limit: 1 }
          ],
          as: "profile"
        }
      },

      { $unwind: { path: "$profile", preserveNullAndEmptyArrays: true } },

      // 🔒 Join with ProfileVisibility
      {
        $lookup: {
          from: "ProfileVisibility",
          localField: "profile.visibility",
          foreignField: "_id",
          as: "fieldVisibility"
        }
      },
      { $unwind: { path: "$fieldVisibility", preserveNullAndEmptyArrays: true } },

      /* -------------------------------------------------
         LIKE / DISLIKE / SAVE / VIEW / COMMENT COUNTS
      -------------------------------------------------- */
      {
        $lookup: {
          from: "UserFeedActions",
          let: { fid: "$_id" },
          pipeline: [
            { $unwind: "$likedFeeds" },
            { $match: { $expr: { $eq: ["$likedFeeds.feedId", "$$fid"] } } },
            { $count: "count" }
          ],
          as: "likesCount"
        }
      },

      {
        $lookup: {
          from: "UserFeedActions",
          let: { fid: "$_id" },
          pipeline: [
            { $unwind: "$sharedFeeds" },
            { $match: { $expr: { $eq: ["$sharedFeeds.feedId", "$$fid"] } } },
            { $count: "count" }
          ],
          as: "sharesCount"
        }
      },
      {
        $lookup: {
          from: "UserFeedActions",
          let: { fid: "$_id" },
          pipeline: [
            { $unwind: "$downloadedFeeds" },
            { $match: { $expr: { $eq: ["$downloadedFeeds.feedId", "$$fid"] } } },
            { $count: "count" }
          ],
          as: "downloadsCount"
        }
      },
      {
        $lookup: {
          from: "UserComments",
          let: { fid: "$_id" },
          pipeline: [{ $match: { $expr: { $eq: ["$feedId", "$$fid"] } } }, { $count: "count" }],
          as: "commentsCount"
        }
      },

      {
        $lookup: {
          from: "UserViews",
          let: { fid: "$_id" },
          pipeline: [{ $match: { $expr: { $eq: ["$feedId", "$$fid"] } } }, { $count: "count" }],
          as: "viewsCount"
        }
      },

      /* -------------------------------------------------
         CURRENT USER ACTION FLAGS
      -------------------------------------------------- */
      {
        $lookup: {
          from: "UserFeedActions",
          let: { fid: "$_id" },
          pipeline: [
            { $match: { $expr: { $eq: ["$userId", userId] } } },
            {
              $project: {
                isLiked: { $in: ["$$fid", { $map: { input: "$likedFeeds", as: "i", in: "$$i.feedId" } }] },
                isSaved: { $in: ["$$fid", { $map: { input: "$savedFeeds", as: "i", in: "$$i.feedId" } }] },
                isDisliked: { $in: ["$$fid", { $map: { input: "$disLikeFeeds", as: "i", in: "$$i.feedId" } }] },
              }
            }
          ],
          as: "userActions"
        }
      },

      /* -------------------------------------------------
         FOLLOW CHECK
      -------------------------------------------------- */
      {
        $lookup: {
          from: "Follows",
          let: { creatorId: "$createdByAccount" },
          pipeline: [
            { $match: { $expr: { $and: [{ $eq: ["$creatorId", "$$creatorId"] }, { $eq: ["$followerId", userId] }] } } },
            { $limit: 1 }
          ],
          as: "followInfo"
        }
      },

      /* -------------------------------------------------
         FINAL PROJECTION
      -------------------------------------------------- */
      {
        $project: {
          isFollowing: { $gt: [{ $size: "$followInfo" }, 0] },

          // 🔒 Masked Avatar logic
          profileAvatar: {
            $cond: {
              if: {
                $or: [
                  { $eq: ["$effectiveCreatorId", userId] },
                  { $eq: ["$fieldVisibility.profileAvatar", "public"] },
                  { $and: [{ $eq: ["$fieldVisibility.profileAvatar", "followers"] }, { $eq: [{ $gt: [{ $size: "$followInfo" }, 0] }, true] }] },
                  { $eq: ["$roleRef", "Admin"] },
                  { $eq: ["$roleRef", "Child_Admin"] }
                ]
              },
              then: "$profile.profileAvatar",
              else: null
            }
          },
          modifyAvatarFromProfile: {
            $cond: {
              if: {
                $or: [
                  { $eq: ["$effectiveCreatorId", userId] },
                  { $eq: ["$fieldVisibility.profileAvatar", "public"] },
                  { $and: [{ $eq: ["$fieldVisibility.profileAvatar", "followers"] }, { $eq: [{ $gt: [{ $size: "$followInfo" }, 0] }, true] }] },
                  { $eq: ["$roleRef", "Admin"] },
                  { $eq: ["$roleRef", "Child_Admin"] }
                ]
              },
              then: "$profile.modifyAvatar",
              else: null
            }
          },

          themeColor: 1
        }
      },
    ];

    /* -------------------------------------------------
       EXECUTE PIPELINE
    -------------------------------------------------- */
    const feeds = await Feed.aggregate(pipeline);

    /* -------------------------------------------------
       CLEAN FINAL FEED FORMAT
    -------------------------------------------------- */
    const finalFeeds = feeds.map((f) => ({
      avatarToUse: getMediaUrl(
        f.modifyAvatarFromProfile ||
        f.profileAvatar ||
        process.env.DEFAULT_AVATAR
      ),

      contentUrl: getMediaUrl(f.contentUrl),

      timeAgo: feedTimeCalculator(f.createdAt),
      stats: {
        likes: f.likesCount || 0,
        views: f.viewsCount || 0,
        comments: f.commentsCount || 0,
        shares: f.shareCount || 0,
        downloads: f.downloadCount || 0
      },
      themeColor:
        f.themeColor ||
        {
          primary: "#fff",
          secondary: "#ccc",
          accent: "#999",
          text: "#000",
          gradient: "linear-gradient(135deg,#fff,#ccc,#999)"
        }
    }));

    return res.json({
      success: true,
      tag,
      page,
      limit,
      feeds: finalFeeds
    });
  } catch (error) {
    console.error("🔥 Hashtag Feed Error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};


/**
 * ✅ Get a single feed by feedId
 * Used when navigating from notifications
 */
exports.getSingleFeedById = async (req, res) => {
  try {
    const rawUserId = req.Id || req.body.userId;
    const feedId = req.params.feedId;
    console.log("userid", rawUserId)
    console.log("feedid", feedId)
    if (!rawUserId)
      return res.status(404).json({ message: "User ID Required" });

    if (!feedId)
      return res.status(400).json({ message: "Feed ID is required" });

    const userId = new mongoose.Types.ObjectId(rawUserId);

    // Filter check: If this feed is hidden or in a non-interested category, don't show it.
    const [hiddenPost, userCat] = await Promise.all([
      HiddenPost.findOne({ userId, postId: feedId }).lean(),
      UserCategory.findOne({ userId }).select("nonInterestedCategories").lean()
    ]);

    if (hiddenPost) {
      return res.status(403).json({ message: "This post is hidden by you" });
    }

    const notCats = (userCat?.nonInterestedCategories || []).map(id => id.toString());
    const feedCheck = await Feed.findById(feedId).select("category").lean();
    if (feedCheck && feedCheck.category && notCats.includes(feedCheck.category.toString())) {
      return res.status(403).json({ message: "This post belongs to a non-interested category" });
    }

    if (!mongoose.Types.ObjectId.isValid(rawUserId))
      return res.status(400).json({ message: "Invalid User ID format" });

    if (!mongoose.Types.ObjectId.isValid(feedId))
      return res.status(400).json({ message: "Invalid Feed ID format" });

    const feedObjectId = new mongoose.Types.ObjectId(feedId);

    // SAME PIPELINE AS getAllFeedsByUserId BUT MATCH ONE FEED
    const result = await Feed.aggregate([
      { $match: { _id: feedObjectId } },

      // ----- SAME LOOKUPS -----
      { $addFields: { effectiveCreatorId: { $ifNull: ["$postedBy.userId", "$createdByAccount"] } } },
      { $lookup: { from: "Admin", localField: "effectiveCreatorId", foreignField: "_id", as: "admin" } },
      { $lookup: { from: "Child_Admin", localField: "effectiveCreatorId", foreignField: "_id", as: "childAdmin" } },
      { $lookup: { from: "User", localField: "effectiveCreatorId", foreignField: "_id", as: "user" } },

      {
        $addFields: {
          accountData: {
            $switch: {
              branches: [
                { case: { $eq: ["$roleRef", "Admin"] }, then: { $arrayElemAt: ["$admin", 0] } },
                { case: { $eq: ["$roleRef", "Child_Admin"] }, then: { $arrayElemAt: ["$childAdmin", 0] } },
                { case: { $eq: ["$roleRef", "User"] }, then: { $arrayElemAt: ["$user", 0] } }
              ],
              default: null
            }
          }
        }
      },

      {
        $lookup: {
          from: "ProfileSettings",
          let: {
            adminId: { $cond: [{ $eq: ["$roleRef", "Admin"] }, "$createdByAccount", null] },
            userId: { $cond: [{ $eq: ["$roleRef", "User"] }, "$createdByAccount", null] },
            childAdminId: { $cond: [{ $eq: ["$roleRef", "Child_Admin"] }, "$createdByAccount", null] }
          },
          pipeline: [
            {
              $match: {
                $expr: {
                  $or: [
                    { $eq: ["$adminId", "$$adminId"] },
                    { $eq: ["$childAdminId", "$$childAdminId"] },
                    { $eq: ["$userId", "$$userId"] }
                  ]
                }
              }
            },
            { $limit: 1 },
            { $project: { userName: 1, profileAvatar: 1, modifyAvatar: 1, visibility: 1 } }
          ],
          as: "profile"
        }
      },

      { $unwind: { path: "$profile", preserveNullAndEmptyArrays: true } },
      // ---------- FOLLOW CHECK ----------
      {
        $lookup: {
          from: "Follows",
          let: { creatorId: "$effectiveCreatorId" },
          pipeline: [
            { $match: { $expr: { $and: [{ $eq: ["$creatorId", "$$creatorId"] }, { $eq: ["$followerId", userId] }] } } },
            { $limit: 1 }
          ],
          as: "followInfo"
        }
      },


      // ---------- COUNTS ----------
      {
        $lookup: {
          from: "UserFeedActions",
          let: { feedId: "$_id" },
          pipeline: [
            { $unwind: { path: "$likedFeeds", preserveNullAndEmptyArrays: true } },
            { $match: { $expr: { $eq: ["$likedFeeds.feedId", "$$feedId"] } } },
            { $count: "count" }
          ],
          as: "likesCount"
        }
      },
      {
        $lookup: {
          from: "UserFeedActions",
          let: { feedId: "$_id" },
          pipeline: [
            { $unwind: { path: "$sharedFeeds", preserveNullAndEmptyArrays: true } },
            { $match: { $expr: { $eq: ["$sharedFeeds.feedId", "$$feedId"] } } },
            { $count: "count" }
          ],
          as: "sharesCount"
        }
      },
      {
        $lookup: {
          from: "UserFeedActions",
          let: { feedId: "$_id" },
          pipeline: [
            { $unwind: { path: "$downloadedFeeds", preserveNullAndEmptyArrays: true } },
            { $match: { $expr: { $eq: ["$downloadedFeeds.feedId", "$$feedId"] } } },
            { $count: "count" }
          ],
          as: "downloadsCount"
        }
      },
      {
        $lookup: {
          from: "UserComments",
          let: { feedId: "$_id" },
          pipeline: [{ $match: { $expr: { $eq: ["$feedId", "$$feedId"] } } }, { $count: "count" }],
          as: "commentsCount"
        }
      },
      {
        $lookup: {
          from: "UserViews",
          let: { feedId: "$_id" },
          pipeline: [
            { $match: { $expr: { $eq: ["$feedId", "$$feedId"] } } },
            { $count: "count" }
          ],
          as: "viewsCount"
        }
      },

      // ---------- ACTIONS ----------
      {
        $lookup: {
          from: "UserFeedActions",
          let: { feedId: "$_id" },
          pipeline: [
            { $match: { $expr: { $eq: ["$userId", userId] } } },
            {
              $project: {
                isLiked: {
                  $in: ["$$feedId", { $map: { input: "$likedFeeds", in: "$$this.feedId" } }]
                },
                isSaved: {
                  $in: ["$$feedId", { $map: { input: "$savedFeeds", in: "$$this.feedId" } }]
                }
              }
            }
          ],
          as: "userActions"
        }
      },

      {
        $project: {
          feedId: "$_id",
          type: 1,
          contentUrl: 1,
          createdByAccount: 1,
          createdAt: 1,
          dec: 1,
          category: 1,
          language: 1,

          userName: "$profile.userName",
          // 🔒 Masked Avatar logic
          profileAvatar: {
            $cond: {
              if: {
                $or: [
                  { $eq: ["$effectiveCreatorId", userId] },
                  { $eq: ["$fieldVisibility.profileAvatar", "public"] },
                  { $and: [{ $eq: ["$fieldVisibility.profileAvatar", "followers"] }, { $eq: [{ $gt: [{ $size: "$followInfo" }, 0] }, true] }] },
                  { $eq: ["$roleRef", "Admin"] },
                  { $eq: ["$roleRef", "Child_Admin"] }
                ]
              },
              then: { $ifNull: ["$profile.modifyAvatar", "$profile.profileAvatar"] },
              else: null
            }
          },

          likesCount: { $ifNull: [{ $arrayElemAt: ["$likesCount.count", 0] }, 0] },
          commentsCount: { $ifNull: [{ $arrayElemAt: ["$commentsCount.count", 0] }, 0] },

          isLiked: { $arrayElemAt: ["$userActions.isLiked", 0] },
          isSaved: { $arrayElemAt: ["$userActions.isSaved", 0] },
          stats: {
            likes: { $ifNull: [{ $arrayElemAt: ["$likesCount.count", 0] }, 0] },
            views: { $ifNull: [{ $arrayElemAt: ["$viewsCount.count", 0] }, 0] },
            comments: { $ifNull: [{ $arrayElemAt: ["$commentsCount.count", 0] }, 0] },
            shares: { $ifNull: [{ $arrayElemAt: ["$sharesCount.count", 0] }, 0] },
            downloads: { $ifNull: [{ $arrayElemAt: ["$downloadsCount.count", 0] }, 0] }
          }
        }
      }
    ]);

    if (!result.length) {
      return res.status(404).json({ message: "Feed not found" });
    }

    const enrichedFeed = {
      ...result[0],
      contentUrl: getMediaUrl(result[0].contentUrl),
      profileAvatar: result[0].profileAvatar ? getMediaUrl(result[0].profileAvatar) : "https://via.placeholder.com/150"
    };

    console.log("✅ [getSingleFeedById] Feed retrieved successfully:", enrichedFeed._id);

    res.status(200).json({
      success: true,
      data: enrichedFeed
    });

  } catch (err) {
    console.error("❌ [getSingleFeedById] Error:", err);
    console.error("❌ [getSingleFeedById] Error message:", err.message);
    res.status(500).json({ success: false, message: "Server error", error: err.message });
  }
};




exports.singleFeedById = async (req, res) => {
  try {
    const feedId = req.params.feedId;

    if (!feedId)
      return res.status(400).json({ message: "Feed ID is required" });

    const feedObjectId = new mongoose.Types.ObjectId(feedId);

    const feed = await Feed.findById(feedObjectId).lean();

    if (!feed) {
      return res.status(404).json({ message: "Feed not found" });
    }

    res.status(200).json({
      message: "Feed retrieved successfully",
      feed
    });

  } catch (err) {
    console.error("Error in getSingleFeedById:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};





exports.getFeedsByAccountId = async (req, res) => {
  try {
    const accountId = req.accountId || req.body.accountId;
    if (!accountId) return res.status(400).json({ message: "accountId required" });

    // 1️ Find corresponding userId from Account
    const account = await Account.findById(accountId).lean();
    if (!account) return res.status(404).json({ message: "Account not found" });
    const userId = account.userId;

    // 2️ Get user's feed language preference
    const userLang = await UserLanguage.findOne({ userId }).lean();
    const feedLangCode = userLang?.feedLanguageCode || null;

    // 3️ Get user's category preferences
    const userCat = await UserCategory.findOne({ userId }).lean();
    const excludedCategories = (userCat?.nonInterestedCategories || []).map(c => c.toString());

    // 4️ Filter feeds based on language and category
    const feedFilter = {
      isApproved: true,
      status: { $in: ["Published", "published"] },
      isDeleted: false
    };
    if (feedLangCode) feedFilter.language = feedLangCode;
    if (excludedCategories.length) feedFilter.category = { $nin: excludedCategories };

    const feeds = await Feed.find(feedFilter).sort({ createdAt: -1 }).lean();
    if (!feeds.length) return res.status(404).json({ message: "No feeds found" });

    const feedIds = feeds.map(f => f._id);
    const accountIds = feeds.map(f => f.createdByAccount);

    // 5️ Aggregate total likes, shares, downloads
    const actionsAgg = await UserFeedActions.aggregate([
      { $project: { likedFeeds: 1, downloadedFeeds: 1, sharedFeeds: 1 } },
      {
        $facet: {
          likes: [
            { $unwind: { path: "$likedFeeds", preserveNullAndEmptyArrays: true } },
            { $group: { _id: "$likedFeeds.feedId", count: { $sum: 1 } } }
          ],
          downloads: [
            { $unwind: { path: "$downloadedFeeds", preserveNullAndEmptyArrays: true } },
            { $group: { _id: "$downloadedFeeds.feedId", count: { $sum: 1 } } }
          ],
          shares: [
            { $unwind: { path: "$sharedFeeds", preserveNullAndEmptyArrays: true } },
            { $group: { _id: "$sharedFeeds.feedId", count: { $sum: 1 } } }
          ]
        }
      }
    ]);

    const likesCount = {};
    const downloadsCount = {};
    const sharesCount = {};
    if (actionsAgg[0]) {
      (actionsAgg[0].likes || []).forEach(l => {
        if (l._id) likesCount[l._id.toString()] = l.count;
      });
      (actionsAgg[0].downloads || []).forEach(d => {
        if (d._id) downloadsCount[d._id.toString()] = d.count;
      });
      (actionsAgg[0].shares || []).forEach(s => {
        if (s._id) sharesCount[s._id.toString()] = s.count;
      });
    }

    // 6️ Get current account actions (Liked, Saved, Disliked)
    const userActionsDoc = await UserFeedActions.findOne({ accountId }).lean();
    const likedFeedIds = (userActionsDoc?.likedFeeds || []).map(f => f.feedId.toString());
    const savedFeedIds = (userActionsDoc?.savedFeeds || []).map(f => f.feedId.toString());
    const dislikedFeedIds = (userActionsDoc?.disLikeFeeds || []).map(f => f.feedId.toString());

    // 7️ Get views count
    const viewsAgg = await UserView.aggregate([
      { $match: { feedId: { $in: feedIds } } },
      { $group: { _id: "$feedId", count: { $sum: 1 } } }
    ]);
    const viewsCount = {};
    viewsAgg.forEach(v => {
      viewsCount[v._id.toString()] = v.count;
    });

    // 8️ Get comment counts
    const commentsAgg = await UserComment.aggregate([
      { $match: { feedId: { $in: feedIds } } },
      { $group: { _id: "$feedId", count: { $sum: 1 } } }
    ]);
    const commentsCount = {};
    commentsAgg.forEach(c => {
      commentsCount[c._id.toString()] = c.count;
    });

    // 9️ Get Accounts → Profile Settings
    const accountsList = await Account.find(
      { _id: { $in: accountIds } },
      { _id: 1, userId: 1 }
    ).lean();

    const userIds = accountsList.map(a => a.userId);
    const profiles = await ProfileSettings.find(
      { userId: { $in: userIds } },
      { userName: 1, profileAvatar: 1, userId: 1, visibility: 1 }
    ).lean();

    const accountToUserId = {};
    accountsList.forEach(acc => {
      accountToUserId[acc._id.toString()] = acc.userId.toString();
    });

    const userIdToProfile = {};
    profiles.forEach(p => {
      userIdToProfile[p.userId.toString()] = p;
    });

    //  Build final response
    const enrichedFeeds = feeds.map(feed => {
      const fid = feed._id.toString();
      const contentUrl = feed.contentUrl;
      const creatorUserId = accountToUserId[feed.createdByAccount?.toString()] || null;
      const profile = creatorUserId ? userIdToProfile[creatorUserId] : null;

      return {
        feedId: fid,
        type: feed.type,
        language: feed.language,
        category: feed.category,
        contentUrl: getMediaUrl(contentUrl),
        likesCount: likesCount[fid] || 0,
        downloadsCount: downloadsCount[fid] || 0,
        shareCount: sharesCount[fid] || 0,
        viewsCount: viewsCount[fid] || 0,
        commentsCount: commentsCount[fid] || 0,
        isLiked: likedFeedIds.includes(fid),
        isSaved: savedFeedIds.includes(fid),
        isDisliked: dislikedFeedIds.includes(fid),
        stats: {
          likes: likesCount[fid] || 0,
          downloads: downloadsCount[fid] || 0,
          shares: sharesCount[fid] || 0,
          views: viewsCount[fid] || 0,
          comments: commentsCount[fid] || 0
        },
        userName: profile?.userName || "Unknown",
        profileAvatar: canShowAvatar ? getMediaUrl(profile?.modifyAvatar || profile?.profileAvatar) : "https://via.placeholder.com/150",
      };
    });

    res.status(200).json({
      message: "Filtered feeds retrieved successfully",
      feeds: enrichedFeeds,
    });

  } catch (err) {
    console.error("Error fetching filtered feeds by accountId:", err);
    res.status(500).json({ message: "Internal server error" });
  }
};



exports.getFeedsByCreator = async (req, res) => {
  try {
    const feedId = req.params.feedId;
    const rawUserId = req.Id || req.body.userId;

    if (!feedId) return res.status(400).json({ message: "Feed ID required" });
    if (!rawUserId) return res.status(404).json({ message: "User ID Required" });

    const userId = new mongoose.Types.ObjectId(rawUserId);

    /* -----------------------------------------------------
       1️⃣ Get feed → extract creator ID
    ------------------------------------------------------*/
    const feed = await Feed.findById(feedId).lean();
    if (!feed) return res.status(404).json({ message: "Feed not found" });

    const creatorId = feed.createdByAccount;

    /* -----------------------------------------------------
       2️⃣ Fetch hidden posts & uninterested categories of logged user
    ------------------------------------------------------*/
    const hiddenPosts = await HiddenPost.find({ userId })
      .select("postId -_id")
      .lean();

    const hiddenPostIds = hiddenPosts.map((h) => h.postId);

    const userCategories = await UserCategory.findOne({ userId })
      .select("nonInterestedCategories")
      .lean();

    const notInterestedCategoryIds =
      userCategories?.nonInterestedCategories || [];

    /* -----------------------------------------------------
       3️⃣ MAIN PIPELINE (same as home feed, only changed match)
    ------------------------------------------------------*/
    const feeds = await Feed.aggregate([
      {
        $match: {
          createdByAccount: new mongoose.Types.ObjectId(creatorId),
          _id: { $nin: hiddenPostIds },
          category: { $nin: notInterestedCategoryIds },
          $or: [
            { isScheduled: { $ne: true } },
            {
              $and: [
                { isScheduled: true },
                { scheduleDate: { $lte: new Date() } },
              ],
            },
          ],
          isApproved: true,
          isDeleted: false,
          status: { $in: ["Published", "published", "Scheduled", "scheduled"] }
        },
      },
      { $sort: { createdAt: -1 } },

      /* ========================= PROFILE (Admin / User / ChildAdmin) ========================= */
      { $lookup: { from: "Admin", localField: "createdByAccount", foreignField: "_id", as: "admin" } },
      { $lookup: { from: "Child_Admin", localField: "createdByAccount", foreignField: "_id", as: "childAdmin" } },
      { $lookup: { from: "User", localField: "createdByAccount", foreignField: "_id", as: "user" } },

      {
        $addFields: {
          accountData: {
            $switch: {
              branches: [
                { case: { $eq: ["$roleRef", "Admin"] }, then: { $arrayElemAt: ["$admin", 0] } },
                { case: { $eq: ["$roleRef", "Child_Admin"] }, then: { $arrayElemAt: ["$childAdmin", 0] } },
                { case: { $eq: ["$roleRef", "User"] }, then: { $arrayElemAt: ["$user", 0] } }
              ],
              default: null
            }
          }
        }
      },

      /* ========================= PROFILE SETTINGS ========================= */
      {
        $lookup: {
          from: "ProfileSettings",
          let: {
            adminId: { $cond: [{ $eq: ["$roleRef", "Admin"] }, "$createdByAccount", null] },
            userId: { $cond: [{ $eq: ["$roleRef", "User"] }, "$createdByAccount", null] },
            childAdminId: { $cond: [{ $eq: ["$roleRef", "Child_Admin"] }, "$createdByAccount", null] }
          },
          pipeline: [
            {
              $match: {
                $expr: {
                  $or: [
                    { $eq: ["$adminId", "$$adminId"] },
                    { $eq: ["$childAdminId", "$$childAdminId"] },
                    { $eq: ["$userId", "$$userId"] }
                  ]
                }
              }
            },
            { $limit: 1 },
            { $project: { userName: 1, profileAvatar: 1, modifyAvatar: 1, visibility: 1 } }
          ],
          as: "profile"
        }
      },

      { $unwind: { path: "$profile", preserveNullAndEmptyArrays: true } },

      /* ========================= LIKES COUNT ========================= */
      {
        $lookup: {
          from: "UserFeedActions",
          let: { feedId: "$_id" },
          pipeline: [
            { $unwind: { path: "$likedFeeds", preserveNullAndEmptyArrays: true } },
            { $match: { $expr: { $eq: ["$likedFeeds.feedId", "$$feedId"] } } },
            { $count: "count" }
          ],
          as: "likesCount"
        }
      },

      /* ========================= DISLIKE COUNT ========================= */
      {
        $lookup: {
          from: "UserFeedActions",
          let: { feedId: "$_id" },
          pipeline: [
            { $unwind: { path: "$disLikeFeeds", preserveNullAndEmptyArrays: true } },
            { $match: { $expr: { $eq: ["$disLikeFeeds.feedId", "$$feedId"] } } },
            { $count: "count" }
          ],
          as: "dislikesCount"
        }
      },

      /* ========================= DOWNLOAD COUNT ========================= */
      {
        $lookup: {
          from: "UserFeedActions",
          let: { feedId: "$_id" },
          pipeline: [
            { $unwind: { path: "$downloadedFeeds", preserveNullAndEmptyArrays: true } },
            { $match: { $expr: { $eq: ["$downloadedFeeds.feedId", "$$feedId"] } } },
            { $count: "count" }
          ],
          as: "downloadsCount"
        }
      },

      /* ========================= SHARES COUNT ========================= */
      {
        $lookup: {
          from: "UserFeedActions",
          let: { feedId: "$_id" },
          pipeline: [
            { $unwind: { path: "$sharedFeeds", preserveNullAndEmptyArrays: true } },
            { $match: { $expr: { $eq: ["$sharedFeeds.feedId", "$$feedId"] } } },
            { $count: "count" }
          ],
          as: "sharesCount"
        }
      },

      /* ========================= VIEWS & COMMENTS COUNT ========================= */
      {
        $lookup: {
          from: "UserViews",
          let: { feedId: "$_id" },
          pipeline: [{ $match: { $expr: { $eq: ["$feedId", "$$feedId"] } } }, { $count: "count" }],
          as: "viewsCount"
        }
      },

      {
        $lookup: {
          from: "UserComments",
          let: { feedId: "$_id" },
          pipeline: [{ $match: { $expr: { $eq: ["$feedId", "$$feedId"] } } }, { $count: "count" }],
          as: "commentsCount"
        }
      },

      /* ========================= USER ACTIONS ========================= */
      {
        $lookup: {
          from: "UserFeedActions",
          let: { feedId: "$_id" },
          pipeline: [
            { $match: { $expr: { $eq: ["$userId", userId] } } },
            {
              $project: {
                isLiked: {
                  $in: ["$$feedId", { $map: { input: "$likedFeeds", as: "f", in: "$$f.feedId" } }]
                },
                isSaved: {
                  $in: ["$$feedId", { $map: { input: "$savedFeeds", as: "f", in: "$$f.feedId" } }]
                },
                isDisliked: {
                  $in: ["$$feedId", { $map: { input: "$disLikeFeeds", as: "f", in: "$$f.feedId" } }]
                }
              }
            }
          ],
          as: "userActions"
        }
      },

      /* ========================= FOLLOW STATUS CHECK ========================= */
      {
        $lookup: {
          from: "Follows",
          let: { creatorId: "$createdByAccount" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$creatorId", "$$creatorId"] },
                    { $eq: ["$followerId", userId] }
                  ]
                }
              }
            },
            { $limit: 1 }
          ],
          as: "followInfo"
        }
      },

      {
        $addFields: {
          isFollowing: { $gt: [{ $size: "$followInfo" }, 0] }
        }
      },

      /* ========================= FINAL PROJECTION ========================= */
      {
        $project: {
          feedId: "$_id",
          type: 1,
          language: 1,
          category: 1,
          contentUrl: 1,
          roleRef: 1,
          createdByAccount: 1,
          createdAt: 1,
          dec: 1,

          userName: "$profile.userName",
          // 🔒 Masked Avatar logic
          profileAvatar: {
            $cond: {
              if: {
                $or: [
                  { $eq: ["$createdByAccount", userId] },
                  { $eq: ["$fieldVisibility.profileAvatar", "public"] },
                  { $and: [{ $eq: ["$fieldVisibility.profileAvatar", "followers"] }, { $eq: ["$isFollowing", true] }] },
                  { $eq: ["$roleRef", "Admin"] },
                  { $eq: ["$roleRef", "Child_Admin"] }
                ]
              },
              then: "$profile.profileAvatar",
              else: null
            }
          },
          modifyAvatarFromProfile: {
            $cond: {
              if: {
                $or: [
                  { $eq: ["$createdByAccount", userId] },
                  { $eq: ["$fieldVisibility.profileAvatar", "public"] },
                  { $and: [{ $eq: ["$fieldVisibility.profileAvatar", "followers"] }, { $eq: ["$isFollowing", true] }] },
                  { $eq: ["$roleRef", "Admin"] },
                  { $eq: ["$roleRef", "Child_Admin"] }
                ]
              },
              then: "$profile.modifyAvatar",
              else: null
            }
          },

          likesCount: { $ifNull: [{ $arrayElemAt: ["$likesCount.count", 0] }, 0] },
          dislikesCount: { $ifNull: [{ $arrayElemAt: ["$dislikesCount.count", 0] }, 0] },
          downloadsCount: { $ifNull: [{ $arrayElemAt: ["$downloadsCount.count", 0] }, 0] },
          shareCount: { $ifNull: [{ $arrayElemAt: ["$sharesCount.count", 0] }, 0] },
          viewsCount: { $ifNull: [{ $arrayElemAt: ["$viewsCount.count", 0] }, 0] },
          commentsCount: { $ifNull: [{ $arrayElemAt: ["$commentsCount.count", 0] }, 0] },

          isLiked: { $arrayElemAt: ["$userActions.isLiked", 0] },
          isSaved: { $arrayElemAt: ["$userActions.isSaved", 0] },
          isDisliked: { $arrayElemAt: ["$userActions.isDisliked", 0] },

          isFollowing: 1,
          themeColor: 1
        }
      }
    ]);

    /* ========================= POST PROCESSING ========================= */
    const enrichedFeeds = await Promise.all(
      feeds.map(async (feed) => {
        const avatarToUse =
          feed.modifyAvatarFromProfile ||
          feed.profileAvatar ||
          process.env.DEFAULT_AVATAR;

        const themeColor = feed.themeColor || {
          primary: "#fff",
          secondary: "#ccc",
          accent: "#999",
          text: "#000",
          gradient: "linear-gradient(135deg,#fff,#ccc,#999)"
        };

        return {
          ...feed,
          contentUrl: getMediaUrl(feed.contentUrl),
          avatarToUse: getMediaUrl(avatarToUse),
          themeColor,
          timeAgo: feedTimeCalculator(feed.createdAt)
        };
      })
    );

    res.status(200).json({
      message: "Creator feeds loaded",
      creatorId,
      feeds: enrichedFeeds
    });

  } catch (err) {
    console.error("Error in getFeedsByCreator:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};





exports.getUserHidePost = async (req, res) => {
  try {
    const userId = req.Id || req.body.userId;

    if (!userId) {
      return res.status(400).json({ message: "userId is required" });
    }

    // 1️⃣ Fetch only the hiddenPostIds (super lightweight)
    const user = await User.findById(userId)
      .select("hiddenPostIds")
      .lean();

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const hiddenIds = user.hiddenPostIds || [];

    // 2️⃣ If empty → return early (faster)
    if (hiddenIds.length === 0) {
      return res.status(200).json({
        message: "No hidden posts found",
        count: 0,
        data: [],
      });
    }

    // 3️⃣ Fetch hidden posts (optimized with projection + lean)
    const hiddenPosts = await Feed.find(
      { _id: { $in: hiddenIds } },
      {
        _id: 1,
        title: 1,
        content: 1,
        contentUrl: 1,
        createdAt: 1,
        createdByAccount: 1,
      }
    )
      .populate("createdByAccount", "_id userName profileImage")
      .lean();

    return res.status(200).json({
      message: "Hidden posts fetched successfully",
      count: hiddenPosts.length,
      data: hiddenPosts,
    });

  } catch (err) {
    console.error("Error fetching hidden posts:", err);
    return res.status(500).json({
      message: "Error fetching hidden posts",
      error: err.message,
    });
  }
};







exports.getUserInfoAssociatedFeed = async (req, res) => {
  try {
    let feedId = req.params.feedId || req.body.feedId;
    const userId = req.Id || req.body.userId;

    if (!feedId) {
      return res.status(400).json({ message: "feedId is required" });
    }
    feedId = feedId.trim();

    const feedWithCreator = await mongoose.connection
      .collection("Feeds")
      .aggregate([
        // 1️⃣ Match feed by ID
        { $match: { _id: new mongoose.Types.ObjectId(feedId) } },

        // 2️⃣ Lookup Account
        {
          $lookup: {
            from: "Accounts",
            localField: "createdByAccount",
            foreignField: "_id",
            as: "account",
          },
        },
        { $unwind: "$account" },

        // 3️⃣ Lookup ProfileSettings
        {
          $lookup: {
            from: "ProfileSettings",
            let: { userId: "$account.userId" },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $eq: [
                      "$userId",
                      {
                        $cond: [
                          { $eq: [{ $type: "$$userId" }, "string"] },
                          { $toObjectId: "$$userId" },
                          "$$userId",
                        ],
                      },
                    ],
                  },
                },
              },
              {
                $project: {
                  bio: 1,
                  displayName: 1,
                  profileAvatar: 1,
                  userName: 1,
                  visibility: 1,
                },
              },
            ],
            as: "profile",
          },
        },
        { $unwind: { path: "$profile", preserveNullAndEmptyArrays: true } },

        // 4️⃣ Lookup total posts by this account
        {
          $lookup: {
            from: "Feeds",
            let: { accId: "$createdByAccount" },
            pipeline: [
              { $match: { $expr: { $eq: ["$createdByAccount", "$$accId"] } } },
              { $count: "totalPosts" },
            ],
            as: "postStats",
          },
        },
        {
          $addFields: {
            totalPosts: {
              $ifNull: [{ $arrayElemAt: ["$postStats.totalPosts", 0] }, 0],
            },
          },
        },

        // 5️⃣ Lookup Followers (count + ids)
        {
          $lookup: {
            from: "CreatorFollowers",
            let: { accId: "$createdByAccount" },
            pipeline: [
              {
                $match: { $expr: { $eq: ["$creatorId", "$$accId"] } }
              },
              {
                $project: {
                  _id: 0,
                  followerIds: 1,
                  followersCount: { $size: { $ifNull: ["$followerIds", []] } }
                }
              }
            ],
            as: "followersData"
          }
        },
        {
          $addFields: {
            followersCount: {
              $ifNull: [{ $arrayElemAt: ["$followersData.followersCount", 0] }, 0]
            },
            followerIds: {
              $ifNull: [{ $arrayElemAt: ["$followersData.followerIds", 0] }, []]
            }
          }
        },

        // 6️⃣ Final response fields
        {
          $project: {
            _id: 1,
            accountId: "$createdByAccount",
            totalPosts: 1,
            followersCount: 1,
            followerIds: 1,
            "profile.displayName": 1,
            "profile.bio": 1,
            "profile.profileAvatar": 1,
            "profile.userName": 1,
          },
        },
      ])
      .toArray();

    if (!feedWithCreator || feedWithCreator.length === 0) {
      return res.status(404).json({ message: "Feed not found" });
    }

    let data = feedWithCreator[0];

    // ✅ Add host to profileAvatar if needed
    if (data.profile && data.profile.profileAvatar) {
      data.profile.profileAvatar = data.profile.profileAvatar; // adjust with full URL if required
    }

    // ✅ Add isFollowing (check if current userId is in followerIds)
    let isFollowing = false;
    if (userId && data.followerIds) {
      isFollowing = data.followerIds.some(
        (id) => id.toString() === userId.toString()
      );
    }
    data.isFollowing = isFollowing;

    res.status(200).json({
      message: "Feed with creator details fetched successfully",
      data,
    });
  } catch (err) {
    console.error("Error fetching feed with user profile:", err);
    res.status(500).json({
      message: "Error fetching feed with user profile",
      error: err.message,
    });
  }
};








exports.getTrendingFeeds = async (req, res) => {
  try {
    const rawUserId = req.Id || req.body.userId;
    const userId = rawUserId ? new mongoose.Types.ObjectId(rawUserId) : null;

    if (!userId) {
      return res.status(400).json({ message: "userId is required" });
    }

    const page = Math.max(1, Number(req.query.page || 1));
    const limit = Math.max(1, Math.min(50, Number(req.query.limit || 10)));
    const { postType } = req.query;
    const redisKey = `feeds:trending:${userId}:${page}:${limit}:${postType || 'all'}`;

    // Try cache
    const cached = await redisClient.get(redisKey);
    if (cached) return res.status(200).json(JSON.parse(cached));

    const trendingStart = new Date();
    trendingStart.setDate(trendingStart.getDate() - 30);
    trendingStart.setHours(0, 0, 0, 0);

    // 1️⃣ Get exclusions (Hidden & Not Interested)
    const [hiddenPostDocs, userCat, viewerProfile] = await Promise.all([
      HiddenPost.find({ userId }).select("postId -_id").lean(),
      UserCategory.findOne({ userId }).select("nonInterestedCategories").lean(),
      ProfileSettings.findOne({ userId }).select("userName profileAvatar modifyAvatar").lean()
    ]);

    const hiddenPostIds = hiddenPostDocs.map(x => x.postId);
    const notInterestedCategoryIds = userCat?.nonInterestedCategories || [];

    // Construct viewer object
    const viewer = {
      id: userId,
      userName: viewerProfile?.userName || "user",
      profileAvatar: getMediaUrl(viewerProfile?.modifyAvatar || viewerProfile?.profileAvatar) || null,
    };

    const EXCLUDED_CATEGORY_IDS = [
      new mongoose.Types.ObjectId("699ee0e420120ebc1d3e7725"),
      new mongoose.Types.ObjectId("699ee86c20120ebc1d3e929b"),
      new mongoose.Types.ObjectId("6990071590a65cd9632b2327")
    ];

    // 2️⃣ Optimized Aggregation Pipeline
    const feeds = await Feed.aggregate([
      // A. Initial Filter
      {
        $match: {
          _id: { $nin: hiddenPostIds },
          category: { $nin: [...notInterestedCategoryIds, ...EXCLUDED_CATEGORY_IDS] },
          createdAt: { $gte: trendingStart },
          isApproved: true,
          status: { $in: ["Published", "published"] },
          isDeleted: false,
          ...(postType === 'image' ? { postType: { $in: ['image', 'image+audio'] } } :
            postType ? { postType } : {})
        }
      },

      // B. Lookup Action Counts (Likes, Shares, Downloads)
      // This part can be made even faster if you have a "Stats" collection already
      {
        $lookup: {
          from: "UserFeedActions",
          let: { feedId: "$_id" },
          pipeline: [
            { $match: { $expr: { $in: ["$$feedId", "$likedFeeds.feedId"] } } },
            { $count: "count" }
          ],
          as: "totalLikes"
        }
      },
      {
        $lookup: {
          from: "UserFeedActions",
          let: { feedId: "$_id" },
          pipeline: [
            { $match: { $expr: { $in: ["$$feedId", "$sharedFeeds.feedId"] } } },
            { $count: "count" }
          ],
          as: "totalShares"
        }
      },
      {
        $lookup: {
          from: "UserFeedActions",
          let: { feedId: "$_id" },
          pipeline: [
            { $match: { $expr: { $in: ["$$feedId", "$downloadedFeeds.feedId"] } } },
            { $count: "count" }
          ],
          as: "totalDownloads"
        }
      },

      // C. Lookup Views
      {
        $lookup: {
          from: "ImageStats",
          localField: "_id",
          foreignField: "imageId",
          as: "imgStats"
        }
      },
      {
        $lookup: {
          from: "VideoStats",
          localField: "_id",
          foreignField: "videoId",
          as: "vidStats"
        }
      },

      // D. Lookup Current User Action (Did I like it?)
      {
        $lookup: {
          from: "UserFeedActions",
          let: { feedId: "$_id" },
          pipeline: [
            { $match: { userId: userId } },
            {
              $project: {
                isLiked: { $in: ["$$feedId", "$likedFeeds.feedId"] },
                isSaved: { $in: ["$$feedId", "$savedFeeds.feedId"] },
                isDisliked: { $in: ["$$feedId", "$disLikeFeeds.feedId"] }
              }
            }
          ],
          as: "currentUserActions"
        }
      },

      // E. Lookup Creator Profile
      {
        $lookup: {
          from: "ProfileSettings",
          let: { creatorId: "$createdByAccount", role: "$roleRef" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $or: [
                    { $and: [{ $eq: ["$role", "Admin"] }, { $eq: ["$adminId", "$$creatorId"] }] },
                    { $and: [{ $eq: ["$role", "User"] }, { $eq: ["$userId", "$$creatorId"] }] },
                    { $and: [{ $eq: ["$role", "Child_Admin"] }, { $eq: ["$childAdminId", "$$creatorId"] }] }
                  ]
                }
              }
            },
            { $project: { userName: 1, profileAvatar: 1, modifyAvatar: 1, visibility: 1 } }
          ],
          as: "creatorProfile"
        }
      },
      { $unwind: { path: "$creatorProfile", preserveNullAndEmptyArrays: true } },

      // F. Calculate Final Scores & Enriched Fields
      {
        $addFields: {
          likesCount: { $ifNull: [{ $arrayElemAt: ["$totalLikes.count", 0] }, 0] },
          shareCount: { $ifNull: [{ $arrayElemAt: ["$totalShares.count", 0] }, 0] },
          downloadCount: { $ifNull: [{ $arrayElemAt: ["$totalDownloads.count", 0] }, 0] },
          viewsCount: {
            $add: [
              { $ifNull: [{ $arrayElemAt: ["$imgStats.totalViews", 0] }, 0] },
              { $ifNull: [{ $arrayElemAt: ["$vidStats.totalViews", 0] }, 0] }
            ]
          },
          isLiked: { $ifNull: [{ $arrayElemAt: ["$currentUserActions.isLiked", 0] }, false] },
          isSaved: { $ifNull: [{ $arrayElemAt: ["$currentUserActions.isSaved", 0] }, false] },
          isDisliked: { $ifNull: [{ $arrayElemAt: ["$currentUserActions.isDisliked", 0] }, false] },
          // Time decay score calculation
          score: {
            $multiply: [
              {
                $add: [
                  { $multiply: [{ $ifNull: [{ $arrayElemAt: ["$totalLikes.count", 0] }, 0] }, 3] },
                  { $multiply: [{ $ifNull: [{ $arrayElemAt: ["$totalShares.count", 0] }, 0] }, 5] },
                  { $add: [{ $ifNull: [{ $arrayElemAt: ["$imgStats.totalViews", 0] }, 0] }, { $ifNull: [{ $arrayElemAt: ["$vidStats.totalViews", 0] }, 0] }] },
                  { $multiply: [{ $ifNull: [{ $arrayElemAt: ["$totalDownloads.count", 0] }, 0] }, 4] }
                ]
              },
              1 // Simplified decay for aggregation (could use exp decay with complex $math)
            ]
          }
        }
      },

      // G. Final Sort & Pagination
      { $sort: { score: -1, createdAt: -1 } },
      { $skip: (page - 1) * limit },
      { $limit: limit },

      // H. Final Projection
      {
        $project: {
          _id: 1, feedId: "$_id", type: 1, mediaUrl: 1, contentUrl: 1, category: 1, postType: 1, createdAt: 1,
          uploadType: 1, uploadMode: 1, caption: 1, hasFooter: { $ifNull: ["$hasFooter", false] },
          designMetadata: 1,
          likesCount: 1, shareCount: 1, downloadCount: 1, viewsCount: 1,
          isLiked: 1, isSaved: 1, isDisliked: 1,
          creatorData: {
            _id: "$createdByAccount",
            userName: "$creatorProfile.userName",
            profileAvatar: "$creatorProfile.profileAvatar",
            modifyAvatar: "$creatorProfile.modifyAvatar"
          },
          trendingScore: { $literal: 0 } // Computed post-aggregate for simplicity
        }
      }
    ]);

    // Handle empty state
    if (!feeds.length && page === 1) {
      return res.status(404).json({ message: "No trending feeds for today" });
    }

    // Map media URLs
    const finalFeeds = feeds.map((f, index) => ({
      ...f,
      contentUrl: getMediaUrl(f.mediaUrl || f.contentUrl),
      type: f.postType || f.type || 'image',
      postedBy: {
        id: f.creatorData?._id,
        name: f.creatorData?.userName || "user",
        avatar: getMediaUrl(f.creatorData?.modifyAvatar || f.creatorData?.profileAvatar)
      },
      stats: {
        likes: f.likesCount || 0,
        shares: f.shareCount || 0,
        downloads: f.downloadCount || 0,
        views: f.viewsCount || 0
      },
      userInteractions: {
        isLiked: f.isLiked || false,
        isSaved: f.isSaved || false,
        isDisliked: f.isDisliked || false
      },
      timeAgo: feedTimeCalculator(f.createdAt),
      rank: ((page - 1) * limit) + index + 1
    }));

    const response = {
      success: true,
      message: "Trending Feeds",
      data: {
        viewer,
        feeds: finalFeeds,
        pagination: { currentPage: page, limit }
      }
    };

    // Cache for 1 minute (Trending updates frequently)
    await redisClient.set(redisKey, JSON.stringify(response), "EX", 60);

    res.status(200).json(response);

  } catch (err) {
    console.error("💥 ERROR in getTrendingFeeds:", err);
    res.status(500).json({ success: false, message: "Error loading trending", error: err.message });
  }
};






exports.getFeedById = async (req, res) => {
  try {
    const { feedId } = req.params;

    // 🧩 Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(feedId)) {
      return res.status(400).json({ message: "Invalid feed ID" });
    }

    // 🔍 Find feed by ID and populate optional references
    const feed = await Feed.findById(feedId)
      .populate("category", "name")
      .populate("createdByAccount", "userName profileAvatar roleRef")
      .lean();

    if (!feed) {
      return res.status(404).json({ message: "Feed not found" });
    }

    // ✅ Normalize response
    res.status(200).json({
      _id: feed._id,
      type: feed.type,
      language: feed.language,
      category: feed.category?.name || "Uncategorized",
      contentUrl: feed.contentUrl,
      caption: feed.dec || "",
      duration: feed.duration || null,
      status: feed.status,
      createdAt: feed.createdAt,
      createdBy: feed.createdByAccount?.userName || "Unknown",
      profileAvatar: feed.createdByAccount?.profileAvatar || null,
    });
  } catch (err) {
    console.error("Error fetching feed:", err);
    res.status(500).json({ message: "Server error fetching feed" });
  }
};





exports.deleteFeed = async (req, res) => {
  try {
    const { feedId } = req.body;
    // const drive = google.drive({
    //   version: "v3",
    //   auth: oAuth2Client
    // });


    if (!feedId) {
      return res.status(400).json({
        success: false,
        message: "feedId is required in body",
      });
    }

    // 1️⃣ Fetch feed
    const feed = await Feed.findById(feedId).lean();
    if (!feed) {
      return res.status(404).json({
        success: false,
        message: "Feed not found",
      });
    }

    const deleteTasks = [];

    /* --------------------------------------------------
       2️⃣ DELETE GOOGLE DRIVE FILE (NEW)
    -------------------------------------------------- */
    /* --------------------------------------------------
       2️⃣ DELETE GOOGLE DRIVE FILE (DISABLED)
    -------------------------------------------------- */
    // if (feed.storageType === "gdrive" && feed.driveFileId) {
    //   console.log("⚠️ Drive deletion skipped (Drive disabled via cleanup)");
    // }

    /* --------------------------------------------------
       3️⃣ DELETE LOCAL FILE (BACKWARD COMPAT)
    -------------------------------------------------- */
    if (feed.localPath) {
      deleteFeedFile(feed.localPath);
    } else if (feed.localFilename) {
      const typeFolder = feed.type === "video" ? "videos" : "images";
      const filePath = path.join(
        __dirname,
        "../../media/feed/user",
        String(feed.createdByAccount),
        typeFolder,
        feed.localFilename
      );
      deleteFeedFile(filePath);
    }

    /* --------------------------------------------------
       4️⃣ DB CLEANUP TASKS
    -------------------------------------------------- */
    deleteTasks.push(Feed.findByIdAndDelete(feedId));

    deleteTasks.push(
      UserComment.deleteMany({ feedId })
    );

    deleteTasks.push(
      UserFeedActions.updateMany(
        {},
        {
          $pull: {
            likedFeeds: { feedId },
            savedFeeds: { feedId },
            downloadedFeeds: { feedId },
            disLikeFeeds: { feedId },
            sharedFeeds: { feedId },
          },
        }
      )
    );

    deleteTasks.push(
      UserView.deleteMany({ feedId })
    );

    if (feed.category) {
      deleteTasks.push(
        Categories.findByIdAndUpdate(feed.category, {
          $pull: { feedIds: feedId },
        })
      );
    }

    /* --------------------------------------------------
       5️⃣ EXECUTE ALL
    -------------------------------------------------- */
    await Promise.all(deleteTasks);

    return res.status(200).json({
      success: true,
      message: "Feed and all related data deleted successfully",
    });

  } catch (error) {
    console.error("❌ Delete Feed Error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while deleting feed",
      error: error.message,
    });
  }
};






































