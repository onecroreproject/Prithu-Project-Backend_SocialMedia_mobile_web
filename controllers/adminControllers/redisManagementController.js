const redisClient = require('../../Config/redisConfig');
const AdminAuditLog = require('../../models/adminModels/AdminAuditLog');

/**
 * Get Redis Statistics
 * GET /api/admin/redis/stats
 */
exports.getRedisStats = async (req, res) => {
    try {
        const info = await redisClient.info();
        const dbsize = await redisClient.dbsize();

        // Parse INFO output into structured data
        const stats = {};
        const lines = info.split('\r\n');

        lines.forEach(line => {
            if (line && !line.startsWith('#')) {
                const [key, value] = line.split(':');
                if (key && value) stats[key] = value;
            }
        });

        // Calculate Hit Ratio
        const hits = parseInt(stats.keyspace_hits) || 0;
        const misses = parseInt(stats.keyspace_misses) || 0;
        const total = hits + misses;
        const hitRatio = total > 0 ? ((hits / total) * 100).toFixed(2) : 0;

        const data = {
            status: redisClient.status, // 'connect', 'ready', 'end', etc.
            version: stats.redis_version,
            uptime: stats.uptime_in_seconds,
            memory: {
                used: stats.used_memory_human,
                peak: stats.used_memory_peak_human,
                rss: stats.used_memory_rss_human,
                max: stats.maxmemory_human || 'Unlimited',
                fragmentation: stats.mem_fragmentation_ratio,
                usagePercent: stats.maxmemory > 0 ? ((stats.used_memory / stats.maxmemory) * 100).toFixed(2) : 'N/A'
            },
            clients: stats.connected_clients,
            keys: {
                total: dbsize,
                expired: stats.expired_keys,
                evicted: stats.evicted_keys
            },
            performance: {
                commandsProcessed: stats.total_commands_processed,
                hitRatio: `${hitRatio}%`,
                hits,
                misses
            }
        };

        res.status(200).json({ success: true, data });
    } catch (err) {
        console.error("Redis Stats Error:", err);
        res.status(500).json({ success: false, message: "Failed to gather Redis metrics" });
    }
};

/**
 * Flush Redis Cache (Whitelisted DB)
 * POST /api/admin/redis/flush
 */
exports.flushRedis = async (req, res) => {
    const admin = req.admin || req.user;
    try {
        await redisClient.flushdb();

        await AdminAuditLog.create({
            adminId: admin._id,
            adminModel: admin.role === 'Admin' ? 'Admin' : 'Child_Admin',
            action: 'REDIS_FLUSH',
            target: 'redis:current_db',
            description: 'Flushed current Redis database',
            status: 'Success',
            ipAddress: req.ip
        });

        res.status(200).json({ success: true, message: "Cache cleared successfully" });
    } catch (err) {
        res.status(500).json({ success: false, message: "Flush failed" });
    }
};

/**
 * Delete keys by prefix
 * POST /api/admin/redis/delete-by-prefix
 */
exports.deleteByPrefix = async (req, res) => {
    const { prefix } = req.body;
    const admin = req.admin || req.user;

    if (!prefix || prefix.length < 3) {
        return res.status(400).json({ success: false, message: "Prefix too short or missing" });
    }

    try {
        // Production safe: Use SCAN instead of KEYS
        let cursor = '0';
        let deletedCount = 0;
        const pattern = `${prefix}*`;

        do {
            const [nextCursor, keys] = await redisClient.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
            cursor = nextCursor;
            if (keys.length > 0) {
                await redisClient.del(...keys);
                deletedCount += keys.length;
            }
        } while (cursor !== '0');

        await AdminAuditLog.create({
            adminId: admin._id,
            adminModel: admin.role === 'Admin' ? 'Admin' : 'Child_Admin',
            action: 'REDIS_DELETE_PREFIX',
            target: `redis:prefix:${prefix}`,
            description: `Deleted ${deletedCount} keys with prefix ${prefix}`,
            status: 'Success',
            ipAddress: req.ip,
            metadata: { deletedCount, prefix }
        });

        res.status(200).json({ success: true, message: `Deleted ${deletedCount} keys`, count: deletedCount });
    } catch (err) {
        res.status(500).json({ success: false, message: "Bulk deletion failed" });
    }
};

/**
 * Get Key TTL
 * GET /api/admin/redis/key-info
 */
exports.getKeyInfo = async (req, res) => {
    const { key } = req.query;
    if (!key) return res.status(400).json({ success: false, message: "Key required" });

    try {
        const ttl = await redisClient.ttl(key);
        const type = await redisClient.type(key);
        const exists = await redisClient.exists(key);

        res.status(200).json({
            success: true,
            data: {
                key,
                exists: exists === 1,
                ttl: ttl === -1 ? 'No Expiry' : ttl === -2 ? 'Expired/Not Found' : `${ttl}s`,
                type
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: "Failed to fetch key info" });
    }
};
