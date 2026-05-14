const mongoose = require("mongoose");
require("dotenv").config({ path: "r:/Suriya.DLK/newProject/be/.env" });
const { prithuDB } = require("../database");
const Feed = require("../models/feedModel");

async function checkOldTrending() {
    try {
        await new Promise(resolve => {
            if (prithuDB.readyState === 1) resolve();
            else prithuDB.once("open", resolve);
        });

        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const oneYearAgo = new Date();
        oneYearAgo.setDate(oneYearAgo.getDate() - 365);

        const oldFeedsCount = await Feed.countDocuments({
            createdAt: { $gte: oneYearAgo, $lt: thirtyDaysAgo },
            isApproved: true,
            status: "published"
        });

        console.log(`Feeds between 30 and 365 days old: ${oldFeedsCount}`);

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

checkOldTrending();
