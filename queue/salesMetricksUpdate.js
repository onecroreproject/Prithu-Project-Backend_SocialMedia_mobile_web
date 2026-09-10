// queues/dailyAnalyticsQueue.js
const createQueue = require("../queue.js"); // your existing queue setup
const { updateDailyAnalytics } = require("../middlewares/helper/salesMetrics.js");

const dailyAnalyticsQueue = createQueue("daily-analytics");

// ✅ Process jobs in the queue
dailyAnalyticsQueue.process(async (job) => {
  console.log(`🔹 Processing daily analytics job... Job ID: ${job.id}`);
  await updateDailyAnalytics();
  console.log("✅ Daily analytics job finished");
});

// ✅ Event listeners
dailyAnalyticsQueue.on("completed", (job) => {
  console.log(`✅ Job completed: ${job.id}`);
});

dailyAnalyticsQueue.on("failed", (job, err) => {
  console.error(`❌ Job failed: ${job.id}`, err);
});

module.exports = dailyAnalyticsQueue;
