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

        console.log("Connected to database");

        const totalFeeds = await Feed.countDocuments({});
        const approvedFeeds = await Feed.countDocuments({ isApproved: true });
        const statuses = await Feed.aggregate([
            { $group: { _id: "$status", count: { $sum: 1 } } }
        ]);

        console.log("Statuses:", JSON.stringify(statuses, null, 2));

        const approvalStatus = await Feed.aggregate([
            { $group: { _id: "$isApproved", count: { $sum: 1 } } }
        ]);
        console.log("Approval Statuses:", JSON.stringify(approvalStatus, null, 2));

        const categories = await Feed.aggregate([
            { $unwind: "$category" },
            { $group: { _id: "$category", count: { $sum: 1 } } }
        ]);

        console.log("Categories:", JSON.stringify(categories, null, 2));

        const last30Days = new Date();
        last30Days.setDate(last30Days.getDate() - 30);
        const recentFeeds = await Feed.countDocuments({ createdAt: { $gte: last30Days } });
        console.log("Feeds in last 30 days:", recentFeeds);

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

checkFeeds();
