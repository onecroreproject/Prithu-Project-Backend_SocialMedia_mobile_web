const Hidden = require("../../models/userModels/hiddenPostSchema")
const Feed = require("../../models/feedModel")
const ProfileSettings = require('../../models/profileSettingModel');
const mongoose = require("mongoose");
const { getMediaUrl } = require("../../utils/storageEngine");
const { feedTimeCalculator } = require("../../middlewares/feedTimeCalculator");
const UserFeedActions = require("../../models/userFeedInterSectionModel.js");




exports.getHiddenPosts = async (req, res) => {
  const userId = req.Id || req.body.userId; // assuming auth middleware

  if (!userId) return res.status(400).json({ message: "userId is required" });

  try {
    const userIdObj = new mongoose.Types.ObjectId(userId);
    const { page = 1, limit = 20 } = req.query;
    const skip = (page - 1) * Number(limit);

    // 1️⃣ FETCH VIEWER PROFILE (LOGGED-IN USER)
    const viewerProfile = await ProfileSettings.findOne({ userId: userIdObj })
      .select("name userName profileAvatar phoneNumber socialLinks privacy modifyAvatar visibility")
      .lean();

    const viewer = {
      id: userIdObj,
      name: viewerProfile?.name || "User",
      userName: viewerProfile?.userName || "user",
      profileAvatar: getMediaUrl(viewerProfile?.modifyAvatar || viewerProfile?.profileAvatar) || "https://via.placeholder.com/150",
    };

    // 2️⃣ AGGREGATION PIPELINE
    const hiddenPostsData = await Hidden.aggregate([
      { $match: { userId: userIdObj } },
      { $sort: { hiddenAt: -1 } },
      { $skip: skip },
      { $limit: Number(limit) },

      // Join feed data
      {
        $lookup: {
          from: "Feeds",
          localField: "postId",
          foreignField: "_id",
          as: "feed",
        },
      },
      { $unwind: "$feed" },

      // Join ProfileSettings for latest avatar/name
      {
        $lookup: {
          from: "ProfileSettings",
          let: {
            adminId: { $cond: [{ $eq: ["$feed.roleRef", "Admin"] }, "$feed.postedBy.userId", null] },
            userId: { $cond: [{ $eq: ["$feed.roleRef", "User"] }, "$feed.postedBy.userId", null] },
            childAdminId: { $cond: [{ $eq: ["$feed.roleRef", "Child_Admin"] }, "$feed.postedBy.userId", null] }
          },
          pipeline: [
            {
              $match: {
                $expr: {
                  $or: [
                    { $eq: ["$adminId", { $cond: [{ $eq: [{ $type: "$$adminId" }, "string"] }, { $toObjectId: "$$adminId" }, "$$adminId"] }] },
                    { $eq: ["$childAdminId", { $cond: [{ $eq: [{ $type: "$$childAdminId" }, "string"] }, { $toObjectId: "$$childAdminId" }, "$$childAdminId"] }] },
                    { $eq: ["$userId", { $cond: [{ $eq: [{ $type: "$$userId" }, "string"] }, { $toObjectId: "$$userId" }, "$$userId"] }] }
                  ]
                }
              }
            },
            { $limit: 1 },
            { $project: { name: 1, userName: 1, profileAvatar: 1, modifyAvatar: 1 } }
          ],
          as: "creatorProfile"
        }
      },
      { $unwind: { path: "$creatorProfile", preserveNullAndEmptyArrays: true } },

      // Join for Likes Count (current user interaction)
      {
        $lookup: {
          from: "UserFeedActions",
          let: { feedId: "$postId", userId: userIdObj },
          pipeline: [
            { $match: { $expr: { $eq: ["$userId", "$$userId"] } } },
            {
              $project: {
                isLiked: {
                  $in: ["$$feedId", { $ifNull: [{ $map: { input: "$likedFeeds", as: "f", in: "$$f.feedId" } }, []] }]
                },
                isSaved: {
                  $in: ["$$feedId", { $ifNull: [{ $map: { input: "$savedFeeds", as: "f", in: "$$f.feedId" } }, []] }]
                }
              }
            }
          ],
          as: "userActions"
        }
      },
      { $unwind: { path: "$userActions", preserveNullAndEmptyArrays: true } },

      // Final Projection
      {
        $project: {
          _id: "$feed._id",
          hiddenId: "$_id",
          postId: "$feed._id",
          reason: 1,
          hiddenAt: 1,
          type: "$feed.postType",
          caption: "$feed.caption",
          uploadMode: "$feed.uploadMode",
          mediaUrl: "$feed.mediaUrl",
          contentUrl: "$feed.mediaUrl",
          designMetadata: "$feed.designMetadata",
          postedBy: {
            id: "$feed.postedBy.userId",
            name: { $ifNull: ["$creatorProfile.name", { $ifNull: ["$creatorProfile.userName", "$feed.postedBy.name"] }] },
            userName: { $ifNull: ["$creatorProfile.userName", "$feed.postedBy.name"] },
            avatar: {
              $ifNull: [
                "$creatorProfile.modifyAvatar",
                { $ifNull: ["$creatorProfile.profileAvatar", "$feed.postedBy.profilePicture"] }
              ]
            },
            role: "$feed.postedBy.role"
          },
          stats: {
            likes: { $ifNull: ["$feed.likesCount", 0] },
            shares: { $ifNull: ["$feed.shareCount", 0] },
            downloads: { $ifNull: ["$feed.downloadCount", 0] },
            comments: { $ifNull: ["$feed.commentCount", 0] }
          },
          isSaved: { $ifNull: ["$userActions.isSaved", false] },
          isLiked: { $ifNull: ["$userActions.isLiked", false] },
          isHidden: { $literal: true }
        }
      }
    ]);

    const total = await Hidden.countDocuments({ userId: userIdObj });

    return res.status(200).json({
      success: true,
      message: "Hidden posts fetched successfully",
      total,
      page: Number(page),
      limit: Number(limit),
      data: {
        viewer,
        hidden: hiddenPostsData.map(f => ({
          ...f,
          thumbnailUrl: getMediaUrl(f.contentUrl),
          contentUrl: getMediaUrl(f.contentUrl),
          timeAgo: feedTimeCalculator(f.hiddenAt || f.createdAt),
          postedBy: {
            ...f.postedBy,
            avatar: getMediaUrl(f.postedBy?.avatar) || "https://cdn-icons-png.flaticon.com/512/149/149071.png"
          }
        }))
      }
    });

  } catch (err) {
    console.error("❌ Error fetching hidden posts:", err);
    return res.status(500).json({
      message: "Server error",
      error: err.message,
    });
  }
};




exports.removeHiddenPost = async (req, res) => {
  try {
    const userId = req.Id;   // from auth middleware
    const { postId } = req.body;

    if (!postId) {
      return res.status(400).json({
        message: "postId is required",
      });
    }

    // Delete only user's own hidden entry
    const deleted = await Hidden.findOneAndDelete({ userId, postId });

    if (!deleted) {
      return res.status(404).json({
        message: "This post is not in your hidden list",
      });
    }

    return res.status(200).json({
      message: "Post removed from hidden list successfully",
      postId,
    });

  } catch (err) {
    console.error("❌ Error removing hidden post:", err);
    return res.status(500).json({
      message: "Server error",
      error: err.message,
    });
  }
};




