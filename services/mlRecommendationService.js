const axios = require("axios");
const redisClient = require("../Config/redisConfig");

const ML_SERVICE_URL = process.env.ML_SERVICE_URL || "http://localhost:8001";
const SHOWN_PREFIX = "shown_feeds:";
const SHOWN_TTL = 86400; // 24 hours

/**
 * Fetch personalized recommendations from the Python ML service.
 * @param {string} userId - The unique identifier for the user.
 * @param {Array} excludeIds - List of IDs to exclude (watched, hidden, already shown).
 * @param {string} [feedId] - Optional feed ID the user is currently viewing.
 * @param {number} [limit=10] - Number of recommendations to fetch.
 */
const getRecommendations = async (userId, excludeIds = [], feedId = null, limit = 10) => {
    try {
        // Fetch user learning preferences from Redis if userId is present
        let diversityBoost = false;
        let preferShort = false;
        if (redisClient && redisClient.status === "ready" && userId) {
            try {
                const [divVal, shortVal] = await Promise.all([
                    redisClient.get(`user_diversity_boost:${userId}`),
                    redisClient.get(`user_prefer_short:${userId}`)
                ]);
                diversityBoost = divVal === "true";
                preferShort = shortVal === "true";
            } catch (redisErr) {
                console.warn("⚠️ Failed to load user preferences from Redis:", redisErr.message);
            }
        }

        // V2 toggle check
        const isV2Enabled = process.env.RECOMMENDATION_V2 !== "false";

        // 1. Call FastAPI Recommendation Engine
        const startTime = Date.now();
        
        const response = await axios.post(`${ML_SERVICE_URL}/recommend`, {
            userId: userId,
            feedId: feedId,
            excludeIds: excludeIds, // Pass the exclusion list to Python
            limit: limit,
            v2: isV2Enabled,
            diversityBoost: diversityBoost,
            preferShort: preferShort
        }, {
            timeout: 5000
        });

        const recommendations = response.data.recommended_reels || [];
        const duration = Date.now() - startTime;
        


        return recommendations;

    } catch (error) {
        console.error("❌ ML Service Error:", error.message);
        return [];
    }
};

/**
 * Track IDs that have been served to the user to avoid immediate repetition.
 * Uses a Redis SET for efficient storage and lookup.
 */
const trackShownFeeds = async (userId, feedIds) => {
    if (!redisClient || redisClient.status !== "ready" || !feedIds.length) return;
    
    const key = `${SHOWN_PREFIX}${userId}`;
    try {
        await redisClient.sadd(key, ...feedIds);
        await redisClient.expire(key, SHOWN_TTL);
    } catch (err) {
        console.warn("⚠️ Redis Track Error:", err.message);
    }
};

/**
 * Get the list of feeds already shown to the user from Redis.
 */
const getShownFeeds = async (userId) => {
    if (!redisClient || redisClient.status !== "ready") return [];
    
    const key = `${SHOWN_PREFIX}${userId}`;
    try {
        return await redisClient.smembers(key);
    } catch (err) {
        console.warn("⚠️ Redis Get Shown Error:", err.message);
        return [];
    }
};

const triggerRefresh = async () => {
    try {
        await axios.post(`${ML_SERVICE_URL}/refresh`);
        return { success: true };
    } catch (error) {
        console.error("❌ ML Refresh Error:", error.message);
        return { success: false, error: error.message };
    }
};

module.exports = {
    getRecommendations,
    trackShownFeeds,
    getShownFeeds,
    triggerRefresh
};
