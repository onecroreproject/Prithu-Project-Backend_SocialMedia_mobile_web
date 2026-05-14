const mongoose = require("mongoose");
require("dotenv").config({ path: "r:/Suriya.DLK/newProject/be/.env" });
const { prithuDB } = require("../database");
const Feed = require("../models/feedModel");
const Category = require("../models/categorySchema");

async function checkLoveCategory() {
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

        console.log("Love Category ID:", loveCat._id);
        
        const feedCount = await Feed.countDocuments({ category: loveCat._id });
        console.log("Total feeds in Love:", feedCount);

        const approvedFeedCount = await Feed.countDocuments({ category: loveCat._id, isApproved: true, status: "published" });
        console.log("Approved/Published feeds in Love:", approvedFeedCount);

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

checkLoveCategory();
