require('dotenv').config({ path: './.env' });
const { prithuDB } = require('./database');
const Feed = require('./models/feedModel');
const axios = require('axios');

async function calculateCompressionSavings() {
  try {
    await new Promise((resolve, reject) => {
      if (prithuDB.readyState === 1) resolve();
      prithuDB.once('connected', resolve);
      prithuDB.once('error', reject);
    });

    console.log("📊 Analyzing Video Compression Savings (Fetching remote sizes)...");

    const compressedFeeds = await Feed.find({
      postType: "video",
      isCompressed: true,
      isDeleted: false
    }).select("files mediaUrl").lean();

    let totalOriginalSize = 0;
    let totalCompressedSize = 0;
    let count = 0;
    let missingFiles = 0;

    // Use a small batch to avoid overloading the server or hitting rate limits
    const batchSize = 10;
    for (let i = 0; i < compressedFeeds.length; i += batchSize) {
      const batch = compressedFeeds.slice(i, i + batchSize);
      
      const promises = batch.map(async (feed) => {
        const dbSize = feed.files[0]?.size || 0; // Original size from DB
        const url = feed.files[0]?.url || feed.mediaUrl;

        if (dbSize > 0 && url) {
          try {
            // Use HEAD request to get file size without downloading
            const response = await axios.head(url, { timeout: 5000 });
            const actualSize = parseInt(response.headers['content-length'], 10);
            
            if (!isNaN(actualSize)) {
              return { original: dbSize, compressed: actualSize };
            }
          } catch (err) {
            // Fallback to GET if HEAD is not supported, but only for headers
            try {
               const response = await axios.get(url, { 
                 headers: { Range: 'bytes=0-0' },
                 timeout: 5000 
               });
               // Note: Content-Range or a custom header might be needed here depending on server config
               // But usually Content-Length for the whole file is still sent if not using chunked encoding
               const actualSize = parseInt(response.headers['content-length'], 10);
               if (!isNaN(actualSize)) {
                 return { original: dbSize, compressed: actualSize };
               }
            } catch (innerErr) {
               return null;
            }
          }
        }
        return null;
      });

      const results = await Promise.all(promises);
      
      for (const res of results) {
        if (res) {
          totalOriginalSize += res.original;
          totalCompressedSize += res.compressed;
          count++;
        } else {
          missingFiles++;
        }
      }
      
      console.log(`⏳ Progress: ${Math.min(i + batchSize, compressedFeeds.length)}/${compressedFeeds.length} feeds checked...`);
    }

    if (count === 0) {
      console.log("⚠️ No compressed feeds found with reachable files.");
    } else {
      const savedBytes = totalOriginalSize - totalCompressedSize;
      const savedGB = (savedBytes / (1024 * 1024 * 1024)).toFixed(2);
      const originalGB = (totalOriginalSize / (1024 * 1024 * 1024)).toFixed(2);
      const compressedGB = (totalCompressedSize / (1024 * 1024 * 1024)).toFixed(2);
      const efficiency = ((savedBytes / totalOriginalSize) * 100).toFixed(1);

      console.log(`\n✅ Analyzed ${count} videos:`);
      console.log(`📦 Total Original Size: ${originalGB} GB`);
      console.log(`📉 Total Compressed Size: ${compressedGB} GB`);
      console.log(`✨ Total Space Saved: ${savedGB} GB (${efficiency}% reduction)`);
      if (missingFiles > 0) {
        console.log(`ℹ️ Note: ${missingFiles} files were unreachable or missing size data.`);
      }
    }

  } catch (error) {
    console.error("❌ Error:", error.message);
  } finally {
    await prithuDB.close();
    process.exit(0);
  }
}

calculateCompressionSavings();
