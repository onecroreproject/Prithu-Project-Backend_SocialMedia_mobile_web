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

        // 0. Check Redis cache first for instant response (1ms)
        const cacheKey = `ml_recos_v2:${userId || 'guest'}`;
        const excludeSet = new Set((excludeIds || []).map(id => id.toString()));

        if (redisClient && redisClient.status === "ready") {
            try {
                const cachedRaw = await redisClient.get(cacheKey);
                if (cachedRaw) {
                    const cachedList = JSON.parse(cachedRaw);
                    const available = cachedList.filter(r => !excludeSet.has(r.feed_id));
                    if (available.length >= limit) {
                        console.log(`[Python ML 1/3: Recommend] ⚡ Served ${limit} recommendations from Redis cache in 1ms for user: ${userId || 'guest'}`);
                        return available.slice(0, limit);
                    }
                }
            } catch (cacheErr) {
                console.warn("⚠️ Redis reco cache error:", cacheErr.message);
            }
        }

        // 1. Call FastAPI Recommendation Engine (requesting 30 items buffer)
        const fetchLimit = Math.max(limit, 30);
        const startTime = Date.now();
        console.log(`[Python ML 1/3: Recommend] 🚀 Calling ${ML_SERVICE_URL}/recommend for user: ${userId || 'guest'} (limit: ${fetchLimit}, v2: ${isV2Enabled})`);
        
        const response = await axios.post(`${ML_SERVICE_URL}/recommend`, {
            userId: userId,
            feedId: feedId,
            excludeIds: excludeIds, // Pass the exclusion list to Python
            limit: fetchLimit,
            v2: isV2Enabled,
            diversityBoost: diversityBoost,
            preferShort: preferShort
        }, {
            timeout: 15000
        });

        const recommendations = response.data.recommended_reels || response.data.recommended_feeds || [];
        const duration = Date.now() - startTime;
        console.log(`[Python ML 1/3: Recommend] ✅ Received ${recommendations.length} recommendations in ${duration}ms from Python ML`);

        // Cache the buffer in Redis for 2 minutes (120s)
        if (redisClient && redisClient.status === "ready" && recommendations.length > 0) {
            try {
                await redisClient.set(cacheKey, JSON.stringify(recommendations), "EX", 120);
            } catch (setErr) {
                console.warn("⚠️ Failed to store recommendations in Redis:", setErr.message);
            }
        }

        return recommendations.slice(0, limit);

    } catch (error) {
        console.error(`[Python ML 1/3: Recommend] ❌ Failed to call Python ML (${ML_SERVICE_URL}/recommend):`, error.message);
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
        const startTime = Date.now();
        console.log(`[Python ML 3/3: Refresh] 🔄 Triggering Python ML cache & score refresh (${ML_SERVICE_URL}/refresh)...`);
        const res = await axios.post(`${ML_SERVICE_URL}/refresh`);
        const duration = Date.now() - startTime;
        console.log(`[Python ML 3/3: Refresh] ✅ Python ML refresh completed in ${duration}ms:`, res.data?.message || "Success");
        return { success: true, data: res.data };
    } catch (error) {
        console.error(`[Python ML 3/3: Refresh] ❌ Python ML Refresh Error (${ML_SERVICE_URL}/refresh):`, error.message);
        return { success: false, error: error.message };
    }
};

module.exports = {
    getRecommendations,
    trackShownFeeds,
    getShownFeeds,
    triggerRefresh
};
