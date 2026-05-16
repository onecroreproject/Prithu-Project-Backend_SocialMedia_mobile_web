require('dotenv').config({ path: './.env' });
const { prithuDB } = require('./database');
const Feed = require('./models/feedModel');

async function checkFeeds() {
  try {
    await new Promise((resolve, reject) => {
      if (prithuDB.readyState === 1) resolve();
      prithuDB.once('connected', resolve);
      prithuDB.once('error', reject);
    });

    const count = await Feed.countDocuments({ isApproved: true, status: "published" });
    console.log(`📊 Approved & Published Feeds: ${count}`);
    
    if (count > 0) {
      const sample = await Feed.findOne({ isApproved: true, status: "published" }).select("caption category").lean();
      console.log("Sample Feed:", sample);
    }

  } catch (error) {
    console.error("❌ Error:", error.message);
  } finally {
    await prithuDB.close();
    process.exit(0);
  }
}

checkFeeds();
