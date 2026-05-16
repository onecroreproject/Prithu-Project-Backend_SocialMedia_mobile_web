require("dotenv").config();
const { prithuDB } = require("./database");
const Feed = require("./models/feedModel");

async function debug() {
    try {
        if (prithuDB.readyState !== 1) {
            await new Promise(r => prithuDB.once('open', r));
        }
        const total = await Feed.countDocuments({ isDeleted: false, status: "published" });
        const analyzed = await Feed.countDocuments({ isDeleted: false, status: "published", "mlMetadata.analyzed": true });
        const v2 = await Feed.countDocuments({ isDeleted: false, status: "published", "mlMetadata.aiVersion": { $gte: 2 } });
        const noMeta = await Feed.countDocuments({ isDeleted: false, status: "published", "mlMetadata": { $exists: false } });
        const analyzedNoV2 = await Feed.countDocuments({ isDeleted: false, status: "published", "mlMetadata.analyzed": true, "mlMetadata.aiVersion": { $exists: false } });

        console.log({ total, analyzed, v2, noMeta, analyzedNoV2 });
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}
debug();
