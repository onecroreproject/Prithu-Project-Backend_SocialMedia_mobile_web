const createQueue = require("../queue");
const Hashtag = require("../models/hashTagModel");
const redisClient = require("../Config/redisConfig");

// Create queue
const hashtagTrendingQueue = createQueue("hashtag-trending");

// Worker / Processor
hashtagTrendingQueue.process(async (job) => {
  try {
    console.log("🔄 Syncing hashtags from Redis → MongoDB");

    const redisData = await redisClient.hgetall("hashtag_counts");

    if (!redisData || Object.keys(redisData).length === 0) {
      console.log("⚠️ No hashtags to sync.");
      return;
    }

    // 1️⃣ Sync Redis → MongoDB
    for (const [tag, count] of Object.entries(redisData)) {
      await Hashtag.findOneAndUpdate(
        { tag },
        { $inc: { count: Number(count) }, updatedAt: new Date() },
        { upsert: true }
      );
    }

    // 2️⃣ After syncing → Clear Redis counters
    await redisClient.del("hashtag_counts");

    // 3️⃣ Fetch top trending hashtags
    const trending = await Hashtag.find()
      .sort({ count: -1, updatedAt: -1 })
      .limit(50)
      .lean();

    // 4️⃣ Save trending list in Redis (cache)
    await redisClient.set(
      "trending_hashtags",
      JSON.stringify(trending),
      "EX",
      3600 // cache for 1 hour
    );

    console.log("🔥 Trending hashtags updated successfully");
  } catch (error) {
    console.error("❌ Error syncing hashtags:", error);
    throw error;
  }
});

// Export queue instance
module.exports = hashtagTrendingQueue;
