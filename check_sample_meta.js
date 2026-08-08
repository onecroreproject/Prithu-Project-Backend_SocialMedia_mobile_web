require("dotenv").config();
const mongoose = require("mongoose");
const { prithuDB } = require("./database");
const Feed = require("./models/feedModel");

async function checkOneFeed() {
    try {
        console.log("🔍 Fetching an analyzed feed for verification...");
        
        // Wait for DB
        if (prithuDB.readyState !== 1) {
            await new Promise((resolve) => prithuDB.once('open', resolve));
        }

        const feed = await Feed.findOne({ "mlMetadata.aiVersion": { $gte: 2 } }).lean();

        if (!feed) {
            console.log("❌ No analyzed feeds found in the database.");
        } else {
            console.log("✅ Found Analyzed Feed!");
            console.log("------------------------------------------");
            console.log("ID:", feed._id);
            console.log("Caption:", feed.caption || "No caption");
            console.log("ML Metadata:", JSON.stringify(feed.mlMetadata, null, 2));
            console.log("------------------------------------------");
        }

        process.exit(0);
    } catch (error) {
        console.error("❌ Error checking feed:", error);
        process.exit(1);
    }
}

checkOneFeed();
