const User = require("../models/userModels/userModel");
const Feed = require("../models/feedModel");
const UserFeedActions = require("../models/userFeedInterSectionModel");
const redisClient = require("../Config/redisConfig");
const STATS_CACHE_KEY = "prithu_promo_stats";
const CACHE_TTL = 3600; // 1 hour

/**
 * Get aggregated community stats with Redis caching.
 */
const getPromotionalStats = async () => {
    try {
        // 1. Try to get from cache
        const cached = await redisClient.get(STATS_CACHE_KEY);
        if (cached) {
            return JSON.parse(cached);
        }

        // 2. Aggregate if not cached


        const [userCount, feedCount] = await Promise.all([
            User.countDocuments({}),
            Feed.countDocuments({ status: "published", isApproved: true })
        ]);

        // Aggregate Downloads & Shares from UserFeedActions
        const actionsAgg = await UserFeedActions.aggregate([
            {
                $project: {
                    downloadCount: { $size: { $ifNull: ["$downloadedFeeds", []] } },
                    shareCount: { $size: { $ifNull: ["$sharedFeeds", []] } }
                }
            },
            {
                $group: {
                    _id: null,
                    totalDownloads: { $sum: "$downloadCount" },
                    totalShares: { $sum: "$shareCount" }
                }
            }
        ]);

        const stats = {
            totalUsers: formatNumber(userCount),
            totalFeeds: formatNumber(feedCount),
            totalDownloads: formatNumber(actionsAgg[0]?.totalDownloads || 0),
            totalShares: formatNumber(actionsAgg[0]?.totalShares || 0)
        };

        // 3. Cache the result
        await redisClient.set(STATS_CACHE_KEY, JSON.stringify(stats), "EX", CACHE_TTL);

        return stats;
    } catch (error) {
        console.error("❌ Error fetching promotional stats:", error);
        // Fallback to static numbers if DB/Redis fail
        return {
            totalUsers: "1,000+",
            totalFeeds: "5,000+",
            totalDownloads: "10,000+",
            totalShares: "50,000+"
        };
    }
};

/**
 * Format large numbers for display (e.g., 1200 -> 1.2K)
 */
function formatNumber(num) {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + "M";
    if (num >= 1000) return (num / 1000).toFixed(1) + "K+";
    return num.toString();
}

module.exports = { getPromotionalStats };
