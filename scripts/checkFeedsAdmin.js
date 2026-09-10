const mongoose = require("mongoose");
const { prithuDB } = require("../database");
const Feed = require("../models/feedModel");

async function check() {
    try {
        console.log("Connecting to DB...");
        
        const feeds = await Feed.find({}).sort({ createdAt: -1 }).limit(20).lean();
        
        for (const feed of feeds) {
            console.log(`Feed ID: ${feed._id}`);
            console.log(`postType: ${feed.postType}`);
            console.log(`mediaUrl: ${feed.mediaUrl}`);
            console.log(`files[0].url: ${feed.files?.[0]?.url}`);
            console.log(`files[0].thumbnail: ${feed.files?.[0]?.thumbnail}`);
            console.log("---");
        }
        
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}
check();
