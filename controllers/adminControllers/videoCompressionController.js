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

    return res.status(200).json({
      success: true,
      stats: {
        totalVideos,
        compressed,
        uncompressed: totalVideos - compressed,
        pending,
        processing,
        failed,
        percentage: totalVideos > 0 ? Math.round((compressed / totalVideos) * 100) : 0
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
    for (const feed of feeds) {
      await videoCompressionQueue.add("compress", { feedId: feed._id });
      queuedCount++;
    }

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
