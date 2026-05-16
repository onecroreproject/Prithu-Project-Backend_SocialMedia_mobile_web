const Redis = require('ioredis');
require('dotenv').config({ path: './.env' });

async function checkRedis() {
  const redis = new Redis({
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: process.env.REDIS_PORT || 6379,
  });

  const userId = "690054c6fb26e417408f72a7";
  const key = `shown_feeds:${userId}`;

  try {
    const shown = await redis.smembers(key);
    console.log(`📍 Shown Feeds in Redis for user ${userId}: ${shown.length}`);
    if (shown.length > 0) {
      console.log("Sample ID:", shown[0]);
    }
    
    // Check if there are MANY shown feeds
    if (shown.length > 700) {
      console.log("⚠️ TOO MANY SHOWN FEEDS! This might be exhausting the pool.");
    }

  } catch (error) {
    console.error("❌ Redis Error:", error.message);
  } finally {
    redis.disconnect();
    process.exit(0);
  }
}

checkRedis();
