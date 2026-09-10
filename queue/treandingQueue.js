const computeTrendingCreators = require("../middlewares/computeTreandingCreators");
const createQueue =require("../queue.js")



const trendingQueue = createQueue("trending-creators")

trendingQueue.process(async (job) => { // <-- include job
  console.log("🔹 Processing trending creators job...", job.id);
  await computeTrendingCreators();
  console.log("✅ Trending creators job finished");
});

trendingQueue.on("completed", (job) => {
  console.log(`✅ Job completed: ${job.id}`);
});

trendingQueue.on("failed", (job, err) => {
  console.error(`❌ Job failed: ${job.id}`, err);
});

module.exports = trendingQueue;
