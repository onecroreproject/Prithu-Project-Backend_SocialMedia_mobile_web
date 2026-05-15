const { Queue } = require("bullmq");
const connection = require("../Config/redisConfig");

const videoCompressionQueue = new Queue("videoCompression", {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 5000,
    },
    removeOnComplete: true,
    removeOnFail: false,
  },
});

console.log("✅ Video Compression Queue Initialized");

module.exports = videoCompressionQueue;
