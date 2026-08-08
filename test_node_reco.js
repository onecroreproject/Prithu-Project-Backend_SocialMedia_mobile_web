require('dotenv').config({ path: './.env' });
const { prithuDB } = require('./database');
const { getRecommendedFeeds } = require('./services/analytics/recommendationService');

async function testNodeRecommendation() {
  const userId = "690054c6fb26e417408f72a7";

  try {
    console.log("🔌 Waiting for PRITHU DB to connect...");
    
    await new Promise((resolve, reject) => {
      if (prithuDB.readyState === 1) resolve();
      prithuDB.once('connected', resolve);
      prithuDB.once('error', reject);
      setTimeout(() => reject(new Error("DB connection timeout")), 10000);
    });

    console.log("✅ DB Connected");

    console.log(`🔍 Fetching Recommendations for User: ${userId}`);
    const feeds = await getRecommendedFeeds(userId, 1, 10);
    
    console.log("✅ Recommendations Result:");
    console.log("Count:", feeds.length);
    if (feeds.length > 0) {
      console.log("First Feed ID:", feeds[0]._id);
      console.log("First Feed Caption:", feeds[0].caption || "(No Caption)");
      console.log("First Feed Category:", feeds[0].category);
    } else {
      console.log("⚠️ No feeds returned. Check if the logic is filtering everything out.");
    }

  } catch (error) {
    console.error("❌ Node Recommendation Test Failed:", error.message);
  } finally {
    await prithuDB.close();
    process.exit(0);
  }
}

testNodeRecommendation();
