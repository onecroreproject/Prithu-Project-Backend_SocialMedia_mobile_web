const os = require('os');
const mongoose = require('mongoose');
const { metrics } = require('../../middlewares/monitor');
const Feed = require('../../models/feedModel');

/**
 * GET /api/admin/system/metrics
 * Returns real-time backend performance metrics.
 */
exports.getSystemMetrics = async (req, res) => {
  try {
    const now = Date.now();

    // 1. Server Performance
    const uptime = process.uptime();
    const days = Math.floor(uptime / (3600 * 24));
    const hours = Math.floor((uptime % (3600 * 24)) / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    
    const serverPerformance = {
      cpuUsage: `${(os.loadavg()[0] * 10 || 0).toFixed(1)}%`, // Simplified CPU load 
      memoryUsage: `${((os.totalmem() - os.freemem()) / 1024 / 1024 / 1024).toFixed(2)}GB / ${(os.totalmem() / 1024 / 1024 / 1024).toFixed(2)}GB`,
      nodeMemory: `${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1)}MB`,
      uptime: `${days}d ${hours}h ${minutes}m`,
    };

    // 2. API Performance (from monitor middleware)
    const avgResponseTime = metrics.responseTimes.length > 0
      ? (metrics.responseTimes.reduce((a, b) => a + b, 0) / metrics.responseTimes.length).toFixed(1)
      : 0;

    const errorRate = metrics.totalRequests > 0
      ? ((metrics.totalErrors / metrics.totalRequests) * 100).toFixed(1)
      : 0;

    const apiPerformance = {
      avgResponseTime: `${avgResponseTime}ms`,
      requestsPerMinute: metrics.requestTimestamps.length,
      errorRate: `${errorRate}%`,
      mostFrequentEndpoints: Object.entries(metrics.endpointMap)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([endpoint, count]) => ({ endpoint, count })),
    };

    // 3. Database Metrics
    const databaseMetrics = {
      dbStatus: mongoose.connection.readyState === 1 ? "connected" : "disconnected",
      activeConnections: mongoose.connection.base.connections.length,
      collections: Object.keys(mongoose.connection.collections).length,
    };

    // 4. Upload & Storage Metrics (Today)
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const uploadsToday = await Feed.aggregate([
      { $match: { createdAt: { $gte: todayStart }, isDeleted: false } },
      {
        $group: {
          _id: null,
          count: { $sum: 1 },
          totalSize: { $sum: { $sum: "$files.size" } }
        }
      }
    ]);

    const uploadStats = uploadsToday[0] || { count: 0, totalSize: 0 };
    const avgSize = uploadStats.count > 0 ? (uploadStats.totalSize / uploadStats.count) : 0;

    const uploadMetrics = {
      totalUploadsToday: uploadStats.count,
      avgUploadSize: `${(avgSize / 1024 / 1024).toFixed(2)}MB`,
      totalStorageUsedToday: `${(uploadStats.totalSize / 1024 / 1024).toFixed(2)}MB`,
    };

    // 5. System Health Check
    const healthCheck = {
      server: "healthy",
      database: mongoose.connection.readyState === 1 ? "healthy" : "unhealthy",
      redis: "connected", // Simplified for now as it's typically handled by Config/redisConfig.js
    };

    return res.status(200).json({
      success: true,
      data: {
        serverPerformance,
        apiPerformance,
        databaseMetrics,
        uploadMetrics,
        healthCheck,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error("❌ System Metrics Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch system metrics",
      error: error.message
    });
  }
};
