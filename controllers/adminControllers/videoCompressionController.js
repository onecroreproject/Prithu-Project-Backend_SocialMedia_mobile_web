const Feed = require("../../models/feedModel");
const videoCompressionQueue = require("../../queues/videoCompressionQueue");

/**
 * Get overall compression statistics
 */
exports.getCompressionStats = async (req, res) => {
  try {
    const totalVideos = await Feed.countDocuments({ postType: "video", isDeleted: false });
    const compressed = await Feed.countDocuments({ postType: "video", isCompressed: true, isDeleted: false });
    const pending = await Feed.countDocuments({ postType: "video", isCompressed: false, compressionStatus: "pending", isDeleted: false });
    const processing = await Feed.countDocuments({ postType: "video", compressionStatus: "processing", isDeleted: false });
    const failed = await Feed.countDocuments({ postType: "video", compressionStatus: "failed", isDeleted: false });

    // Get recent failures
    const recentFailures = await Feed.find({ compressionStatus: "failed", isDeleted: false })
      .select("_id compressionError compressionCompletedAt mediaUrl")
      .sort({ compressionCompletedAt: -1 })
      .limit(5)
      .lean();

    const isPaused = await videoCompressionQueue.isPaused();
    const waitingCount = await videoCompressionQueue.getWaitingCount();

    return res.status(200).json({
      success: true,
      stats: {
        totalVideos,
        compressed,
        uncompressed: totalVideos - compressed,
        pending,
        processing,
        failed,
        percentage: totalVideos > 0 ? Math.round((compressed / totalVideos) * 100) : 0,
        isPaused,
        waitingCount
      },
      recentFailures
    });
  } catch (error) {
    console.error("Error fetching compression stats:", error);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};

/**
 * Trigger bulk compression for all uncompressed videos
 */
exports.triggerBulkCompression = async (req, res) => {
  try {
    const feeds = await Feed.find({
      postType: "video",
      isCompressed: { $ne: true },
      isDeleted: false
    }).select("_id");

    if (feeds.length === 0) {
      return res.status(200).json({ success: true, message: "All videos are already compressed" });
    }

    let queuedCount = 0;
    console.log(`🚀 [Bulk Compression] Found ${feeds.length} uncompressed videos. Queuing...`);
    for (const feed of feeds) {
      await videoCompressionQueue.add("compress", { feedId: feed._id });
      queuedCount++;
    }
    console.log(`✅ [Bulk Compression] Successfully queued ${queuedCount} jobs.`);

    return res.status(200).json({
      success: true,
      message: `Successfully queued ${queuedCount} videos for compression`,
      queuedCount
    });
  } catch (error) {
    console.error("Error triggering bulk compression:", error);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};

/**
 * Retry a specific failed compression
 */
exports.retryCompression = async (req, res) => {
  try {
    const { feedId } = req.params;
    const feed = await Feed.findById(feedId);

    if (!feed) {
      return res.status(404).json({ success: false, message: "Feed not found" });
    }

    // Reset status and queue
    await Feed.updateOne(
      { _id: feedId },
      { compressionStatus: "pending", compressionError: null, compressionLocked: false }
    );

    await videoCompressionQueue.add("compress", { feedId });

    return res.status(200).json({ success: true, message: "Compression job retried" });
  } catch (error) {
    console.error("Error retrying compression:", error);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};
/**
 * Pause or Resume the compression queue
 */
exports.toggleQueue = async (req, res) => {
  try {
    const isPaused = await videoCompressionQueue.isPaused();
    if (isPaused) {
      await videoCompressionQueue.resume();
      return res.status(200).json({ success: true, message: "Compression queue resumed", isPaused: false });
    } else {
      await videoCompressionQueue.pause();
      return res.status(200).json({ success: true, message: "Compression queue paused", isPaused: true });
    }
  } catch (error) {
    console.error("Error toggling queue:", error);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};

/**
 * Stop all and clear queue
 */
exports.stopAllCompression = async (req, res) => {
  try {
    // 1. Drain the queue (remove waiting jobs)
    await videoCompressionQueue.drain();
    
    // 2. Clear all failed/completed jobs if needed (optional)
    await videoCompressionQueue.clean(0, 1000, 'wait');
    await videoCompressionQueue.clean(0, 1000, 'active'); // Note: cleaning active won't kill the process, just remove the job from redis tracking
    
    // 3. Reset processing feeds in DB
    await Feed.updateMany(
      { compressionStatus: "processing" },
      { compressionStatus: "pending", compressionLocked: false }
    );

    return res.status(200).json({ success: true, message: "All compression jobs stopped and queue cleared" });
  } catch (error) {
    console.error("Error stopping compression:", error);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};
