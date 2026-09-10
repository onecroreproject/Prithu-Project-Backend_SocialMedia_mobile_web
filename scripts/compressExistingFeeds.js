require("dotenv").config();
const mongoose = require("mongoose");
const Feed = require("../models/feedModel");
const videoCompressionQueue = require("../queues/videoCompressionQueue");
const { prithuDB } = require("../database");

async function run() {
  try {
    console.log("🔗 Connecting to MongoDB...");
    // Wait for connection
    if (prithuDB.readyState !== 1) {
      await new Promise((resolve) => prithuDB.once("connected", resolve));
    }
    console.log("✅ Connected to MongoDB");

    console.log("🔍 Finding uncompressed video feeds...");
    const feeds = await Feed.find({
      postType: "video",
      isCompressed: { $ne: true },
      isDeleted: false
    }).select("_id");

    console.log(`📊 Found ${feeds.length} videos to compress.`);

    if (feeds.length === 0) {
      console.log("✅ All videos are already compressed.");
      process.exit(0);
    }

    let queuedCount = 0;
    for (const feed of feeds) {
      await videoCompressionQueue.add("compress", { feedId: feed._id });
      queuedCount++;
      if (queuedCount % 50 === 0) {
        console.log(`⏳ Queued ${queuedCount}/${feeds.length}...`);
      }
    }

    console.log(`✅ Successfully queued ${queuedCount} videos for compression.`);
    console.log("🚀 Workers will now process them in the background.");
    
    setTimeout(() => {
        process.exit(0);
    }, 5000);

  } catch (error) {
    console.error("❌ Migration failed:", error);
    process.exit(1);
  }
}

run();
