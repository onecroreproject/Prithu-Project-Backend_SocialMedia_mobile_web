const Feed = require("../models/feedModel");
const VideoStats = require("../models/userModels/MediaSchema/videoViewStatusModel");
const ImageStats = require("../models/userModels/MediaSchema/imageViewModel");
const UserFeedActions = require("../models/userFeedInterSectionModel");
const Follow = require("../models/creatorFollowerModel"); // Matches your Follows schema
const ProfileSettings = require("../models/profileSettingModel");
const TrendingCreators = require("../models/treandingCreators");

async function computeTrendingCreators() {
  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const trendingCreators = await Feed.aggregate([
      // 1️⃣ Filter only recent posts (7 days)
      { $match: { createdAt: { $gte: sevenDaysAgo } } },

      // 2️⃣ Group posts by user
      {
        $group: {
          _id: "$createdByAccount", // creatorId from your schema
          feedIds: { $push: "$_id" },
        },
      },

      // 3️⃣ Video stats lookup
      {
        $lookup: {
          from: "VideoStats",
          localField: "feedIds",
          foreignField: "videoId",
          as: "videoStats",
        },
      },
      {
        $addFields: {
          totalVideoViews: { $sum: "$videoStats.totalViews" },
        },
      },

      // 4️⃣ Image stats lookup
      {
        $lookup: {
          from: "ImageStats",
          localField: "feedIds",
          foreignField: "imageId",
          as: "imageStats",
        },
      },
      {
        $addFields: {
          totalImageViews: { $sum: "$imageStats.totalViews" },
        },
      },

      // 5️⃣ Likes + Shares in **one lookup**
      {
        $lookup: {
          from: "UserFeedActions",
          let: { feedIds: "$feedIds" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $or: [
                    { $gt: [{ $size: "$likedFeeds" }, 0] },
                    { $gt: [{ $size: "$sharedFeeds" }, 0] },
                  ],
                },
              },
            },
            {
              $project: {
                liked: {
                  $size: {
                    $filter: {
                      input: "$likedFeeds",
                      cond: { $in: ["$$this.feedId", "$$feedIds"] },
                    },
                  },
                },
                shared: {
                  $size: {
                    $filter: {
                      input: "$sharedFeeds",
                      cond: { $in: ["$$this.feedId", "$$feedIds"] },
                    },
                  },
                },
              },
            },
          ],
          as: "engagement",
        },
      },
      {
        $addFields: {
          totalLikes: { $sum: "$engagement.liked" },
          totalShares: { $sum: "$engagement.shared" },
        },
      },

      // 6️⃣ Followers lookup
      {
        $lookup: {
          from: "CreatorFollowers",
          localField: "_id",
          foreignField: "creatorId",
          as: "followers",
        },
      },
      {
        $addFields: {
          followerCount: { $size: "$followers" },
        },
      },

      // 7️⃣ Profile (get username + avatar)
      {
        $lookup: {
          from: "ProfileSettings",
          localField: "_id",
          foreignField: "userId",
          as: "profile",
        },
      },
      {
        $addFields: {
          userName: { $arrayElemAt: ["$profile.userName", 0] },
          profileAvatar: {
            $arrayElemAt: ["$profile.profileAvatar", 0],
          },
        },
      },

      // 8️⃣ Trending score calculation
      {
        $addFields: {
          trendingScore: {
            $round: [
              {
                $add: [
                  { $multiply: [{ $ifNull: ["$totalVideoViews", 0] }, 0.3] },
                  { $multiply: [{ $ifNull: ["$totalImageViews", 0] }, 0.2] },
                  { $multiply: [{ $ifNull: ["$totalLikes", 0] }, 0.2] },
                  { $multiply: [{ $ifNull: ["$totalShares", 0] }, 0.2] },
                  { $multiply: [{ $ifNull: ["$followerCount", 0] }, 0.1] },
                ],
              },
              0,
            ],
          },
        },
      },

      // 9️⃣ Sort and limit
      { $sort: { trendingScore: -1 } },
      { $limit: 50 },
    ]);

    // 9️⃣ Save results
    for (const creator of trendingCreators) {
      await TrendingCreators.findOneAndUpdate(
        { userId: creator._id },
        {
          userName: creator.userName || "",
          profileAvatar: creator.profileAvatar || "",
          trendingScore: creator.trendingScore || 0,
          totalVideoViews: creator.totalVideoViews || 0,
          totalImageViews: creator.totalImageViews || 0,
          totalLikes: creator.totalLikes || 0,
          totalShares: creator.totalShares || 0,
          followerCount: creator.followerCount || 0,
          lastUpdated: new Date(),
        },
        { upsert: true }
      );
    }

    console.log("Trending creators updated.");
  } catch (err) {
    console.error("Error computing trending creators:", err);
  }
}

module.exports = computeTrendingCreators;
