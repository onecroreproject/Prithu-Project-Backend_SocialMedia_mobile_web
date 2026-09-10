const { Worker } = require("bullmq");
const path = require("path");
const fs = require("fs");
const ffmpeg = require("fluent-ffmpeg");
// Import the global FFmpeg configuration so we don't accidentally override the system binary path
require("../Config/ffmpegConfig");

const Feed = require("../models/feedModel");
const { urlToPath } = require("../utils/storageEngine");
const connection = require("../Config/redisConfig");

const TEMP_DIR = path.join(__dirname, "../media/feed/temp");

// Ensure temp directory exists
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

console.log("🛠️ Video Compression Worker Initializing...");

const worker = new Worker(
  "videoCompression",
  async (job) => {
    const { feedId } = job.data;
    console.log(`🎬 [Worker] Received job for Feed: ${feedId}`);


    const feed = await Feed.findById(feedId);
    if (!feed) {
      console.error(`❌ [Worker] Feed ${feedId} not found`);
      return;
    }

    // 1. Double Check: Skip if already compressed
    if (feed.isCompressed) {
      console.log(`✅ [Worker] Feed ${feedId} is already compressed. Skipping.`);
      return;
    }

    // 2. Lock Check
    if (feed.compressionLocked) {
      console.warn(`⏳ [Worker] Feed ${feedId} is already being processed. Skipping.`);
      return;
    }

    // 2. Lock & Status Set
    await Feed.updateOne(
      { _id: feedId },
      {
        compressionLocked: true,
        compressionStatus: "processing",
        compressionStartedAt: new Date(),
      }
    );
    console.log(`🔒 [Worker] Feed ${feedId} locked and status set to processing.`);

    let originalPath = feed.files[0]?.path;
    if (!originalPath || !fs.existsSync(originalPath)) {
      // Fallback to mediaUrl resolution
      originalPath = urlToPath(feed.mediaUrl);
    }

    if (!originalPath || !fs.existsSync(originalPath)) {
      await Feed.updateOne(
        { _id: feedId },
        {
          compressionLocked: false,
          compressionStatus: "failed",
          compressionError: "Original file not found on disk",
        }
      );
      console.error(`❌ [Worker] Original file not found for Feed ${feedId}: ${originalPath}`);
      return;
    }

    const fileName = path.basename(originalPath);
    const tempFilePath = path.join(TEMP_DIR, `${Date.now()}_${fileName}`);
    const backupFilePath = path.join(path.dirname(originalPath), `${path.parse(fileName).name}_backup${path.extname(fileName)}`);

    try {
      console.log(`🎥 [Worker] Starting compression: ${fileName}`);
      console.log(`📂 [Worker] Original path: ${originalPath}`);
      console.log(`📁 [Worker] Temp path: ${tempFilePath}`);

      // 3. Compress
      await new Promise((resolve, reject) => {
        let command = ffmpeg(originalPath)
          .videoCodec("libx264")
          .audioCodec("aac")
          .audioBitrate("96k")
          .outputOptions([
            "-crf 24",
            "-preset medium",
            "-movflags +faststart"
          ]);

        // 720p only if source > 720p
        command.ffprobe((err, data) => {
          if (err) return reject(err);

          const videoStream = data.streams.find(s => s.codec_type === "video");
          if (videoStream && videoStream.height > 720) {
            command.size("?x720");
          }

          command
            .on("progress", (progress) => {
              if (progress.percent) {
                console.log(`⏳ [Worker] Feed ${feedId}: ${Math.round(progress.percent)}%`);
              }
            })
            .on("end", () => {
              console.log(`✅ [Worker] FFmpeg finished for Feed: ${feedId}`);
              resolve();
            })
            .on("error", (err) => {
              console.error(`❌ [Worker] FFmpeg error for Feed ${feedId}:`, err.message);
              reject(err);
            })
            .save(tempFilePath);
        });
      });

      // 4. Verify temp
      if (!fs.existsSync(tempFilePath) || fs.statSync(tempFilePath).size === 0) {
        throw new Error("Compressed file is empty or missing");
      }

      // 5. Backup Original
      fs.renameSync(originalPath, backupFilePath);
      console.log(`📂 [Worker] Original backed up to: ${backupFilePath}`);


      // 6. Move Temp to Original Path
      fs.renameSync(tempFilePath, originalPath);
      console.log(`🚚 [Worker] Compressed file moved to: ${originalPath}`);


      // 7. Success - Delete Backup & Update DB
      if (fs.existsSync(backupFilePath)) {
        fs.unlinkSync(backupFilePath);
      }

      await Feed.updateOne(
        { _id: feedId },
        {
          isCompressed: true,
          compressionLocked: false,
          compressionStatus: "completed",
          compressionCompletedAt: new Date(),
        }
      );
      console.log(`🎊 [Worker] Compression completed and DB updated for Feed: ${feedId}`);


    } catch (error) {
      console.error(`❌ [Worker] Compression failed for Feed ${feedId}:`, error.message);

      // 7. Failure - Restore from Backup
      if (fs.existsSync(backupFilePath)) {
        console.log(`🔄 [Worker] Restoring original from backup...`);
        if (fs.existsSync(originalPath)) fs.unlinkSync(originalPath); // Remove failed replacement if any
        fs.renameSync(backupFilePath, originalPath);
      }

      // Clean up temp file if exists
      if (fs.existsSync(tempFilePath)) {
        fs.unlinkSync(tempFilePath);
      }

      await Feed.updateOne(
        { _id: feedId },
        {
          compressionLocked: false,
          compressionStatus: "failed",
          compressionError: error.message,
        }
      );
    }
  },
  {
    connection,
    concurrency: 2,
  }
);

worker.on("active", (job) => {
  console.log(`🎬 Job ${job.id} is now active (Feed: ${job.data.feedId})`);
});

worker.on("completed", (job) => {
  console.log(`✅ Job ${job.id} completed`);
});

worker.on("failed", (job, err) => {
  console.error(`❌ Job ${job.id} failed:`, err.message);
});

module.exports = worker;
