// feedPostQueue.js — Scheduled Feed Publisher
// Processes Bull jobs that delay feed publishing to a future scheduled time.
// Each job is added with a delay = scheduleDate - now (in adminfeedController.js).

const Feed = require("../models/feedModel");
const createQueue = require("../queue.js");
const notificationQueue = require("./notificationQueue");
const { getMediaUrl } = require("../utils/storageEngine");

const feedQueue = createQueue("feed-posts");

feedQueue.process(async (job) => {
  const { feedId } = job.data;
  console.log(`🚀 Processing scheduled feed job: ${feedId}`);

  // ✅ Fetch the feed
  const feed = await Feed.findById(feedId);

  // 1. Feed deleted before its schedule — skip gracefully
  if (!feed) {
    console.warn(`⚠️ Feed not found (may have been deleted): ${feedId}`);
    return;
  }

  // 2. Idempotency guard — already published, skip to prevent duplicate publish
  if (feed.status === "published" && !feed.isScheduled) {
    console.info(`ℹ️ Feed ${feedId} already published — skipping duplicate job.`);
    return;
  }

  // 3. Only publish if it's in 'scheduled' status (correct enum)
  if (feed.status !== "scheduled") {
    console.warn(`⚠️ Feed ${feedId} is in unexpected status "${feed.status}" — aborting.`);
    return;
  }

  // ✅ Publisher — mark feed as published
  feed.status = "published";
  feed.isScheduled = false;
  await feed.save();

  console.log(`✅ Feed ${feedId} published successfully at ${new Date().toISOString()}`);

  // ✅ Real-time broadcast via WebSocket
  try {
    const { getIO } = require("../middlewares/webSocket");
    const io = getIO();
    if (io) {
      const ProfileSettings = require("../models/profileSettingModel");
      const adminId = feed.createdByAccount;
      const roleRef = feed.roleRef;

      let creatorProfile = null;
      if (roleRef === "Admin") {
        creatorProfile = await ProfileSettings.findOne({ adminId })
          .select("userName profileAvatar modifyAvatar").lean();
      } else if (roleRef === "Child_Admin") {
        creatorProfile = await ProfileSettings.findOne({ childAdminId: adminId })
          .select("userName profileAvatar modifyAvatar").lean();
      }

      if (creatorProfile) {
        creatorProfile.profileAvatar = getMediaUrl(creatorProfile.profileAvatar);
        creatorProfile.modifyAvatar = getMediaUrl(creatorProfile.modifyAvatar);
      }

      const broadcastData = {
        ...feed.toObject(),
        creatorData: creatorProfile || { userName: "Admin", profileAvatar: null }
      };

      io.emit("new_feed_published", broadcastData);
      console.log(`📡 Broadcasted new_feed_published for feed ${feedId}`);
    }
  } catch (broadcastErr) {
    console.error(`❌ Failed to broadcast feed ${feedId}:`, broadcastErr.message);
    // Don't throw — publish succeeded, broadcast is non-critical
  }

  // ✅ Push notification to users
  try {
    const isImage = feed.postType === "image" || feed.postType === "image+audio";
    notificationQueue.add(
      "BROADCAST_NEW_FEED",
      {
        feedId: feed._id,
        senderId: feed.createdByAccount,
        title: "New Fresh Content! 🔥",
        message: `Check out this new feed! Download it and share 🔥❤️`,
        image: getMediaUrl(feed.mediaUrl || (feed.files && feed.files[0]?.url))
      },
      {
        removeOnComplete: true,
        attempts: 3,
        backoff: { type: "exponential", delay: 5000 }
      }
    );
  } catch (notifErr) {
    console.error(`❌ Failed to queue notification for feed ${feedId}:`, notifErr.message);
  }

  // ✅ Invalidate Redis cache for public feeds after scheduled feed goes live
  try {
    const redisClient = require("../Config/redisConfig");
    if (redisClient && redisClient.status === "ready") {
      const keys = await redisClient.keys("public_feeds:*");
      if (keys.length > 0) {
        await redisClient.del(...keys);
        console.log(`🗑️ Invalidated ${keys.length} Redis cache keys for public feeds`);
      }
    }
  } catch (cacheErr) {
    console.warn(`⚠️ Redis cache invalidation failed for feed ${feedId}:`, cacheErr.message);
  }
});

feedQueue.on("completed", (job) =>
  console.log(`✅ Feed job ${job.id} completed (feedId: ${job.data.feedId})`)
);
feedQueue.on("failed", (job, err) =>
  console.error(`❌ Feed job ${job.id} failed (feedId: ${job.data.feedId}):`, err.message)
);
feedQueue.on("stalled", (job) =>
  console.warn(`⏳ Feed job ${job.id} stalled (feedId: ${job.data.feedId})`)
);

module.exports = feedQueue;
