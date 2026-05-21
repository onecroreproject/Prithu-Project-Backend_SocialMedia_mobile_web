require("dotenv").config();
const { prithuDB } = require("./database");
const Feed = require("./models/feedModel");

async function check() {
    try {
        if (prithuDB.readyState !== 1) {
            await new Promise(r => prithuDB.once('open', r));
        }
        const feed = await Feed.findOne({ 
            caption: { $exists: true, $ne: "" },
            "mlMetadata.aiVersion": 2
        }).lean();

        if (feed) {
            console.log("✅ Found v2 Feed with Caption!");
            console.log("Caption:", feed.caption);
            console.log("Metadata:", JSON.stringify(feed.mlMetadata, null, 2));
        } else {
            console.log("❌ No v2 feeds with captions found.");
            // Find any v2 feed to see what we have
            const anyV2 = await Feed.findOne({ "mlMetadata.aiVersion": 2 }).lean();
            if(anyV2) console.log("Sample v2 (No Caption):", JSON.stringify(anyV2.mlMetadata, null, 2));
        }
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}
check();
