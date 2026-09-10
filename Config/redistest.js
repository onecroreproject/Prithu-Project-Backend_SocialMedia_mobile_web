const Redis = require("ioredis");

// Use your Render Key Value URL
const REDIS_URL = "redis://red-d3li7q8gjchc73ce7jl0:D7OpD8AiQlFK0VKoGkm6sKD3byreCF6k@red-d3li7q8gjchc73ce7jl0:6379";

// Create ioredis client
const redis = new Redis(REDIS_URL);

redis.on("connect", () => console.log("✅ Connected to Redis!"));
redis.on("error", (err) => console.error("❌ Redis error:", err));

(async () => {
  try {
    // Set a key
    await redis.set("testKey", "Hello Render Redis!");
    
    // Get the key
    const value = await redis.get("testKey");
    console.log("Value from Redis:", value);

    // Delete the key
    await redis.del("testKey");
    
    console.log("✅ Redis test completed");
  } catch (err) {
    console.error(err);
  } finally {
    // Quit connection
    redis.quit();
  }
})();
