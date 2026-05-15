require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });
const mongoose = require("mongoose");
const { prithuDB } = require("../database");
const Feed = require("../models/feedModel");
const Categories = require("../models/categorySchema");

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

        console.log("📂 All Categories in DB:");
        const allCats = await Categories.find().lean();
        allCats.forEach(c => console.log(`  - ${c.name}: ${c._id}`));

        console.log("\n📊 Targeted Category Content Check:");
        
        for (const [name, id] of Object.entries(CATEGORIES)) {
            const catId = new mongoose.Types.ObjectId(id);
            const total = await Feed.countDocuments({ category: catId });
            const approved = await Feed.countDocuments({ category: catId, isApproved: true });
            const published = await Feed.countDocuments({ 
                category: catId, 
                isApproved: true,
                isDeleted: false,
                status: { $in: ["Published", "published"] }
            });
            const images = await Feed.countDocuments({ category: catId, postType: "image", isApproved: true, isDeleted: false, status: { $in: ["Published", "published"] } });
            const videos = await Feed.countDocuments({ category: catId, postType: "video", isApproved: true, isDeleted: false, status: { $in: ["Published", "published"] } });
            console.log(`  - ${name}: Total=${total}, Approved=${approved}, Published=${published} (Images: ${images}, Videos: ${videos})`);
            if (name === "Birthday") {
                const samples = await Feed.find({ category: catId }).limit(5).lean();
                samples.forEach(s => console.log(`    * Feed ${s._id}: postType=${s.postType}, uploadType=${s.uploadType}`));
            }
        }

        process.exit(0);
    } catch (error) {
        console.error("❌ Check failed:", error);
        process.exit(1);
    }
}

checkContent();
