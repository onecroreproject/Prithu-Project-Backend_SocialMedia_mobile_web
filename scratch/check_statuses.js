const mongoose = require("mongoose");
require("dotenv").config({ path: "r:/Suriya.DLK/newProject/be/.env" });
const { prithuDB } = require("../database");
const Feed = require("../models/feedModel");

async function checkFeeds() {
    try {
        await new Promise(resolve => {
            if (prithuDB.readyState === 1) resolve();
            else prithuDB.once("open", resolve);
        });

        const statuses = await Feed.aggregate([
            { $group: { _id: "$status", count: { $sum: 1 } } }
        ]);
        console.log("Statuses:", JSON.stringify(statuses, null, 2));

        const approvalStatus = await Feed.aggregate([
            { $group: { _id: "$isApproved", count: { $sum: 1 } } }
        ]);
        console.log("Approval Statuses:", JSON.stringify(approvalStatus, null, 2));

        const totalFeeds = await Feed.countDocuments({});
        console.log("Total Feeds:", totalFeeds);

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

checkFeeds();
