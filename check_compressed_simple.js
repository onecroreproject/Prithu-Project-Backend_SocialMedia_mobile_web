require('dotenv').config({ path: './.env' });
const { prithuDB } = require('./database');
const Feed = require('./models/feedModel');

async function checkCompressed() {
  try {
    await new Promise((resolve, reject) => {
      if (prithuDB.readyState === 1) resolve();
      prithuDB.once('connected', resolve);
      prithuDB.once('error', reject);
    });

    const total = await Feed.countDocuments({ postType: "video" });
    const compressed = await Feed.countDocuments({ isCompressed: true });
    console.log(`📹 Total Videos: ${total}`);
    console.log(`✅ Compressed Videos: ${compressed}`);

    if (compressed > 0) {
      const sample = await Feed.findOne({ isCompressed: true }).select("files").lean();
      console.log("📄 Sample compressed feed files:", JSON.stringify(sample.files, null, 2));
    }

  } catch (error) {
    console.error("❌ Error:", error.message);
  } finally {
    await prithuDB.close();
    process.exit(0);
  }
}

checkCompressed();
