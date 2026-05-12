require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });
const mongoose = require("mongoose");
const { prithuDB } = require("../database");
const Feed = require("../models/feedModel");

const CATEGORIES = {
    Birthday: "6990071590a65cd9632b2327",
    Anniversary: "699ee86c20120ebc1d3e929b",
    Politics: "699ee0e420120ebc1d3e7725"
};

async function checkContent() {
    try {
        if (prithuDB.readyState !== 1) {
            await new Promise((resolve) => prithuDB.once("connected", resolve));
        }

        console.log("📊 Category Content Check:");
        
        for (const [name, id] of Object.entries(CATEGORIES)) {
            const count = await Feed.countDocuments({ 
                category: new mongoose.Types.ObjectId(id),
                isDeleted: false,
                isApproved: true
            });
            console.log(`  - ${name}: ${count} items`);
        }

        process.exit(0);
    } catch (error) {
        console.error("❌ Check failed:", error);
        process.exit(1);
    }
}

checkContent();
