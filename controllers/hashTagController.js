const Hashtag = require("../models/hashTagModel");
const redisClient = require("../Config/redisConfig");
const mongoose = require("mongoose");


// Optimized: Trending Hashtags + Feed IDs
exports.getTrendingHashtags = async (req, res) => {
  try {
    // 1️⃣ Redis check
    const cached = await redisClient.get("trending_hashtags_with_feeds");
    if (cached) {
      return res.status(200).json({
        source: "redis",
        data: JSON.parse(cached),
      });
    }

    // 2️⃣ MongoDB Aggregation (SUPER FAST)
    const results = await Hashtag.aggregate([
      // Sort trending first
      { $sort: { count: -1, updatedAt: -1 } },

      // Limit to top 50 hashtags
      { $limit: 50 },

      // Lookup feeds with matching hashtag
      {
        $lookup: {
          from: "Feeds", // your collection name
          localField: "tag",
          foreignField: "hashtags",
          pipeline: [
            {
              $project: {
                _id: 1,
                contentUrl: 1,
                type: 1,
                createdAt: 1,
                createdByAccount: 1,
                hashtags: 1,
              }
            }
          ],
          as: "feeds"
        }
      }
    ]);

    // 3️⃣ Store in Redis for fast reuse
    await redisClient.set(
      "trending_hashtags_with_feeds",
      JSON.stringify(results),
      "EX",
      3600
    );

    return res.status(200).json({
      source: "database",
      data: results,
    });

  } catch (error) {
    console.error("❌ Trending Hashtags Error:", error);
    return res.status(500).json({
      message: "Server error",
      error: error.message,
    });
  }
};
