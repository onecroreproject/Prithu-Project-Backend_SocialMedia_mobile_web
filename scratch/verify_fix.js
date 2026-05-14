const mongoose = require("mongoose");
require("dotenv").config({ path: "r:/Suriya.DLK/newProject/be/.env" });
const { prithuDB } = require("../database");
const Feed = require("../models/feedModel");
const Category = require("../models/categorySchema");

async function verifyLoveFeed() {
    try {
        await new Promise(resolve => {
            if (prithuDB.readyState === 1) resolve();
            else prithuDB.once("open", resolve);
        });

        const loveCat = await Category.findOne({ name: /love/i }).lean();
        if (!loveCat) {
            console.log("Love category not found");
            process.exit(0);
        }

        const categoryId = loveCat._id.toString();
        console.log("Testing Category ID:", categoryId);

        // Simulate the query in getAllFeedsByUserId
        const query = {
            isApproved: true,
            isDeleted: false,
            status: "published",
            category: new mongoose.Types.ObjectId(categoryId)
        };

        const feeds = await Feed.find(query).limit(10).lean();
        console.log(`Found ${feeds.length} feeds for Love category.`);
        
        if (feeds.length > 0) {
            console.log("Sample Feed ID:", feeds[0]._id);
        }

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

verifyLoveFeed();
