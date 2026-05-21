require("dotenv").config();
const { prithuDB } = require("./database");
const Feed = require("./models/feedModel");
const Category = require("./models/categorySchema");

async function find() {
    try {
        if (prithuDB.readyState !== 1) {
            await new Promise(r => prithuDB.once('open', r));
        }
        
        // Find any feed with a caption to test quality
        const feed = await Feed.findOne({ 
            caption: { $exists: true, $ne: "" }
        }).sort({ createdAt: -1 }).lean();

        if (feed) {
            const catNames = await Category.find({ _id: { $in: feed.category } }).lean();
            console.log("------------------------------------------");
            console.log("TEST FEED CANDIDATE FOUND");
            console.log("ID:", feed._id);
            console.log("Caption:", feed.caption);
            console.log("Categories:", catNames.map(c => c.name));
            console.log("Current ML Status:", feed.mlMetadata?.analyzed ? "Analyzed (v1)" : "Not Analyzed");
            console.log("------------------------------------------");
        } else {
            console.log("❌ No suitable test feed found.");
        }
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}
find();
