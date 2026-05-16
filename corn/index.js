const cron = require("node-cron");

// Queues
const deactivateQueue = require("../queue/deactivateSubscriptionQueue");
const deleteQueue = require("../queue/deleteReportQueue");
const feedQueue = require("../queue/feedPostQueue");
const trendingQueue = require("../queue/treandingQueue");
const dailyAnalyticsQueue = require("../queue/salesMetricksUpdate");
const notificationQueue = require("../queue/notificationQueue");
const subscriptionReminderQueue = require("../queue/subscriptionReminderQueue");
const hashtagTrendingQueue = require("../queue/hashTagTrendingQueue");
const promotionalEmailQueue = require("../queue/promotionalEmailQueue");
const cleanupInactiveSessions = require("../scripts/sessionCleanup");
const redisClient = require("../Config/redisConfig");
const { recalculateAllScores } = require("../scripts/recalculateRecommendations");
const mlMetadataQueue = require("../queue/mlMetadataQueue");
require("../workers/mlMetadataWorker"); // Start the worker

const CAMPAIGN_PAUSE_KEY = "promo_campaign_paused";

const User = require("../models/userModels/userModel");
const UserSubscription = require("../models/subscriptionModels/userSubscriptionModel");
const { getPromotionalStats } = require("../services/statsService");

// Registry to track tasks for Admin UI
const taskRegistry = [
  {
    id: "deactivate_subscriptions",
    name: "Deactivate Subscriptions",
    schedule: "0 0 * * *",
    description: "Processes subscription deactivations (Midnight)",
    action: () => deactivateQueue.add({})
  },
  {
    id: "cleanup_reports",
    name: "Cleanup Reports",
    schedule: "0 2 * * *",
    description: "Deletes old reports (2 AM)",
    action: () => deleteQueue.add({})
  },
  {
    id: "scheduled_feeds",
    name: "Scheduled Feeds",
    schedule: "*/15 * * * *",
    description: "Processes scheduled feed posts (Every 15 mins)",
    action: () => feedQueue.add({})
  },
  {
    id: "trending_creators",
    name: "Trending Creators",
    schedule: "0 */6 * * *",
    description: "Updates trending rankings (Every 6 hours)",
    action: () => trendingQueue.add({})
  },
  {
    id: "hashtag_trending",
    name: "Hashtag Trending",
    schedule: "*/5 * * * *",
    description: "Calculates trending hashtags (Every 5 mins)",
    action: () => hashtagTrendingQueue.add({})
  },
  {
    id: "daily_analytics",
    name: "Daily Analytics",
    schedule: "0 0 * * *",
    description: "Updates sales and user metrics (Midnight)",
    action: () => dailyAnalyticsQueue.add({})
  },
  {
    id: "session_cleanup",
    name: "Session Cleanup",
    schedule: "*/15 * * * *",
    description: "Cleans up inactive admin sessions (Every 15 mins)",
    action: () => cleanupInactiveSessions()
  },
  {
    id: "subscription_expiry_reminder",
    name: "Subscription Expiry Reminder",
    schedule: "0 9 * * *", // 9 AM daily
    description: "Sends expiry notifications 10 days before (Daily)",
    action: async () => {
      console.log("🔹 Scanning for subscriptions expiring in <= 10 days...");
      const now = new Date();
      const tenDaysFromNow = new Date();
      tenDaysFromNow.setDate(now.getDate() + 10);
      const todayStr = now.toISOString().split('T')[0];

      // Find active subscriptions ending in the next 10 days
      // and NOT already reminded today
      const eligible = await UserSubscription.find({
        isActive: true,
        endDate: { $gt: now, $lte: tenDaysFromNow },
        lastExpiryReminderDate: { $ne: todayStr }
      }).lean();

      console.log(`🔹 Found ${eligible.length} eligible subscriptions for expiry reminder.`);

      for (const sub of eligible) {
        // Calculate remaining days
        const diffTime = sub.endDate - now;
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays >= 1 && diffDays <= 10) {
          await subscriptionReminderQueue.add({
            subId: sub._id,
            remainingDays: diffDays,
            todayStr
          });
        }
      }
      return { count: eligible.length };
    }
  },
  {
    id: "promotional_campaign",
    name: "Promotional Campaign",
    schedule: "0 10 * * *", // 10 AM daily
    description: "Sends promotional emails to non-subscribed users (Every 3 days per user)",
    action: async () => {
      // Check if paused
      const isPaused = await redisClient.get(CAMPAIGN_PAUSE_KEY);
      if (isPaused === "true") {
        console.log("⏸️ Promotional Campaign is currently PAUSED. Skipping run.");
        return { processed: 0, status: "paused" };
      }

      console.log("🚀 Starting Promotional Campaign...");
      const threeDaysAgo = new Date();
      threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

      // Find users who:
      // 1. Are NOT subscribed
      // 2. Haven't received a promo in the last 3 days
      const eligibleUsers = await User.find({
        "subscription.isActive": { $ne: true },
        $or: [
          { lastPromotionalEmailDate: { $exists: false } },
          { lastPromotionalEmailDate: { $lte: threeDaysAgo } }
        ]
      })
        .select("userName email promoTemplateIndex")
        .limit(1000) // Batch of 1000 per day to manage load
        .lean();

      console.log(`📊 Found ${eligibleUsers.length} users eligible for promotional emails.`);

      for (const user of eligibleUsers) {
        // Add to queue for processing template & sending
        await promotionalEmailQueue.add({
          userId: user._id,
          userName: user.userName,
          email: user.email,
          templateIndex: user.promoTemplateIndex || 0
        });

        // Update tracking fields immediately to prevent double-send in next run
        await User.updateOne(
          { _id: user._id },
          {
            $set: { lastPromotionalEmailDate: new Date() },
            $inc: { promoTemplateIndex: 1 } // Increment for next time (1-10 cycle)
          }
        );

        // Note: promoTemplateIndex will be used with modulo 10 in the queue worker
      }

      return { processed: eligibleUsers.length };
    }
  },
  {
    id: "recalculate_recommendations",
    name: "Recalculate Recommendations",
    schedule: "0 */1 * * *", // Every hour
    description: "Recalculates personalized recommendation scores for active users (Hourly)",
    action: async () => {
      await recalculateAllScores();
      const mlRecommendationService = require("../services/mlRecommendationService");
      await mlRecommendationService.triggerRefresh();
    }
  },
  {
    id: "ml_metadata_generation",
    name: "ML Metadata Intelligence (v2)",
    schedule: "0 2 * * *", // 2 AM daily (Low Traffic)
    description: "Deep AI content analysis & metadata upgrade (v2)",
    action: async () => {
      console.log("🚀 Starting Deep AI Metadata Generation (v2)...");
      const Feed = require("../models/feedModel");

      // Find feeds that:
      // 1. Are published & not deleted
      // 2. Are NOT currently being processed
      // 3. EITHER never analyzed OR analyzed with old version (v1)
      const query = {
        status: "published",
        isDeleted: false,
        "mlMetadata.processingStatus": { $ne: "processing" },
        $or: [
          { "mlMetadata.analyzed": { $ne: true } },
          { "mlMetadata.aiVersion": { $lt: 2 } },
          { "mlMetadata": { $exists: false } }
        ]
      };

      // DYNAMIC BATCHING STRATEGY
      // Image feeds: ~50 feeds
      // Short videos: ~10 feeds
      // Long videos: ~3 feeds
      
      const [images, shortVideos, longVideos] = await Promise.all([
        Feed.find({ ...query, postType: "image" }).select("_id").limit(50).sort({ "mlMetadata.aiVersion": 1 }).lean(),
        Feed.find({ ...query, postType: "video" }).select("_id").limit(10).sort({ "mlMetadata.aiVersion": 1 }).lean(),
        Feed.find({ ...query, postType: "video" }).select("_id").skip(10).limit(3).sort({ "mlMetadata.aiVersion": 1 }).lean() // Simple proxy for "Longer"
      ]);

      const allFeeds = [...images, ...shortVideos, ...longVideos];
      console.log(`📊 Batching ${allFeeds.length} feeds (Images: ${images.length}, Videos: ${shortVideos.length + longVideos.length})`);

      for (const feed of allFeeds) {
        await mlMetadataQueue.add({ feedId: feed._id }, {
          attempts: 3,
          backoff: { type: 'exponential', delay: 60000 },
          removeOnComplete: true
        });
      }

      return { 
        totalBatched: allFeeds.length,
        images: images.length,
        videos: shortVideos.length + longVideos.length
      };
    }
  }
];

const scheduledTasks = {};

const startCrons = ({ timezone = "Asia/Kolkata" } = {}) => {
  taskRegistry.forEach(task => {
    scheduledTasks[task.id] = cron.schedule(
      task.schedule,
      () => {
        console.log(`[CRON] Starting task: ${task.name}`);
        task.action();
      },
      { timezone }
    );
  });

  console.log("✅ All cron jobs scheduled successfully (timezone:", timezone, ")");
};

module.exports = startCrons;
module.exports.taskRegistry = taskRegistry;
module.exports.triggerTaskManually = async (taskId) => {
  const task = taskRegistry.find(t => t.id === taskId);
  if (!task) throw new Error("Task not found");
  console.log(`[MANUAL] Triggering task: ${task.name}`);
  return await task.action();
};








