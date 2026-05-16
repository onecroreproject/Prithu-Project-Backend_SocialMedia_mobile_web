require('dotenv').config({ path: './.env' });
const { prithuDB } = require('./database');
const { getAllFeedsByUserId } = require('./controllers/feedControllers/feedsController');
const mongoose = require('mongoose');

async function testHomeFeed() {
  const userId = "690054c6fb26e417408f72a7";
  const req = {
    Id: userId,
    query: { page: 1, limit: 10 },
    body: {}
  };
  
  const res = {
    setHeader: () => {},
    status: function(s) { this.statusCode = s; return this; },
    json: function(data) { this.data = data; return this; }
  };

  try {
    console.log("🔌 Connecting to DB...");
    await new Promise((resolve, reject) => {
      if (prithuDB.readyState === 1) resolve();
      prithuDB.once('connected', resolve);
      prithuDB.once('error', reject);
    });
    console.log("✅ DB Connected");

    console.log(`🔍 Fetching Home Feed for User: ${userId}`);
    await getAllFeedsByUserId(req, res);
    
    console.log("✅ API Response Code:", res.statusCode || 200);
    if (res.data) {
      console.log("Success:", res.data.success);
      if (res.data.data && res.data.data.feeds) {
        console.log("Feeds Count:", res.data.data.feeds.length);
        if (res.data.data.feeds.length > 0) {
          console.log("First Feed ID:", res.data.data.feeds[0].feedId);
        } else {
          console.log("⚠️ FEEDS ARRAY IS EMPTY!");
          // Let's investigate WHY it's empty
        }
      } else {
        console.log("⚠️ No feeds object in response:", res.data);
      }
    }

  } catch (error) {
    console.error("❌ Test Failed:", error.message);
  } finally {
    await prithuDB.close();
    process.exit(0);
  }
}

testHomeFeed();
