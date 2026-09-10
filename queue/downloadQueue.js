const createQueue = require("../queue");
const ffmpeg = require("fluent-ffmpeg");
const fs = require("fs");
const path = require("path");
const axios = require("axios");
const sharp = require("sharp");
const { getIO } = require("../middlewares/webSocket");
const { v4: uuidv4 } = require('uuid');

const downloadQueue = createQueue("download-queue");

// Ensure temp directory exists
const ensureDir = (dir) => {
    try {
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    } catch (err) {
        console.error(`[FS] Failed to create directory ${dir}:`, err.message);
    }
};

const { pipeline } = require('stream/promises');

// Helper: Download file from URL
const downloadFile = async (url, dest) => {
    let writer;
    try {
        writer = fs.createWriteStream(dest);
        const response = await axios({
            url,
            method: 'GET',
            responseType: 'stream',
            timeout: 30000 // 30s timeout
        });

        await pipeline(response.data, writer);
        console.log(`[FS] File downloaded successfully: ${dest}`);
        return true;
    } catch (err) {
        console.error(`[FS] Download failed for ${url}:`, err.message);
        if (writer) {
            writer.destroy();
            // Try to delete partial file if it exists and is not locked
            if (fs.existsSync(dest)) {
                try { fs.unlinkSync(dest); } catch (e) { /* ignore locked file */ }
            }
        }
        throw new Error(`Failed to download file from ${url}: ${err.message}`);
    }
};

// Helper: Get video duration/dimensions to calculate percentages
const getVideoMetadata = (filePath) => {
    return new Promise((resolve, reject) => {
        ffmpeg.ffprobe(filePath, (err, metadata) => {
            if (err) return reject(err);
            const stream = metadata.streams.find(s => s.codec_type === 'video');
            resolve({
                width: stream?.width || 0,
                height: stream?.height || 0,
                duration: metadata.format.duration
            });
        });
    });
};

// Helper: Extract dominant color using FFmpeg (scale to 1x1)
const extractDominantColor = (filePath) => {
    return new Promise((resolve) => {
        const tempPath = filePath + "_1x1.png";
        ffmpeg(filePath)
            .frames(1)
            .seekInput(0)
            .videoFilters('scale=1:1')
            .on('end', () => {
                try {
                    const data = fs.readFileSync(tempPath);
                    // Simple PNG parsing for 1x1 pixel (RGBA)
                    // Png signature (8) + IHDR (25) + IDAT ... 
                    // For a 1x1 pixel, we can just use a simpler method or a small lib
                    // But FFmpeg can also output raw data
                    ffmpeg(filePath)
                        .frames(1)
                        .seekInput(0)
                        .videoFilters('scale=1:1')
                        .format('rawvideo')
                        .pix_fmt('rgb24')
                        .on('end', () => { /* done */ })
                        .on('error', () => resolve("#1a1a1a"))
                        .pipe(require('stream').Writable({
                            write(chunk, enc, next) {
                                if (chunk.length >= 3) {
                                    const r = chunk[0].toString(16).padStart(2, '0');
                                    const g = chunk[1].toString(16).padStart(2, '0');
                                    const b = chunk[2].toString(16).padStart(2, '0');
                                    resolve(`#${r}${g}${b}`);
                                }
                                next();
                            }
                        }));
                    if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
                } catch (e) {
                    resolve("#1a1a1a");
                }
            })
            .on('error', (err) => {
                // Fallback to simpler method if pipe fails
                console.warn(`[FFmpeg] Dominant color extraction failed, falling back to default:`, err.message);
                resolve("#1a1a1a");
            })
            .save(tempPath);
    });
};

// Helper: Escape text for FFmpeg drawtext filter
const escapeDrawText = (txt = "") => {
    return String(txt)
        .replace(/\\/g, "\\\\")
        .replace(/:/g, "\\:")
        .replace(/'/g, "\\'")
        .replace(/,/g, "\\,")
        .replace(/\n/g, " ")
        .replace(/\[/g, "\\[")
        .replace(/\]/g, "\\]")
        .replace(/\{/g, "\\{")
        .replace(/\}/g, "\\}")
        .trim();
};

// Helper: Convert rgba() to ffmpeg color format
const normalizeFfmpegColor = (c) => {
    if (!c) return "black@0.6";

    // Already in ffmpeg format
    if (c.includes("@")) return c;

    // Check for rgba format: rgba(0,0,0,0.7) or rgb(0,0,0)
    const m = c.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/i);
    if (m) {
        const r = Number(m[1]);
        const g = Number(m[2]);
        const b = Number(m[3]);
        const a = m[4] !== undefined ? Number(m[4]) : 1;

        const hex = ((r << 16) | (g << 8) | b).toString(16).padStart(6, "0");
        return `0x${hex}@${a}`;
    }

    // Check for hex format: #RRGGBB or #RRGGBBAA
    const hexMatch = c.match(/^#?([A-Fa-f0-9]{6})([A-Fa-f0-9]{2})?$/);
    if (hexMatch) {
        const hex = hexMatch[1];
        const aVal = hexMatch[2] ? (parseInt(hexMatch[2], 16) / 255) : 1;
        if (aVal >= 0.99) return `0x${hex}`;
        return `0x${hex}@${aVal.toFixed(2)}`;
    }

    // Support named colors (white, red, etc.)
    if (/^[a-zA-Z]+$/.test(c)) return c;

    // Default fallback
    return "black@0.6";
};

const { processFeedMedia } = require("../utils/feedMediaProcessor");

downloadQueue.process(async (job) => {
    const { feed, userId, viewer, designMetadata, jobType = 'download' } = job.data;
    const jobId = job.id;

    console.log(`[Job ${jobId}] Starting ${jobType} processing for Feed ID: ${feed._id}`);
    job.progress(10);

    const isSharePreview = jobType === 'share-preview';
    const tempDir = path.join(__dirname, "../uploads/temp_processing", jobId);

    // Output paths depend on job type
    const shareDir = path.join(__dirname, "../uploads/shares");
    const downloadDir = path.join(__dirname, "../uploads");

    if (isSharePreview && !fs.existsSync(shareDir)) fs.mkdirSync(shareDir, { recursive: true });

    const isStaticImage = feed.postType === "image";
    const ext = isStaticImage ? "jpg" : "mp4";

    const finalOutputName = isSharePreview
        ? `${userId}_${feed._id}_direct.${ext}`
        : `processed_${jobId}.${ext}`;

    const finalOutputPath = isSharePreview
        ? path.join(shareDir, finalOutputName)
        : path.join(downloadDir, finalOutputName);

    const thumbFilename = isSharePreview ? `${userId}_${feed._id}_direct_thumb.jpg` : null;
    const BACKEND_URL = process.env.BACKEND_URL || (process.env.NODE_ENV === 'production' ? "" : "http://localhost:5000");

    try {
        const io = getIO();
        const emitEvent = isSharePreview ? "share-progress" : "download-progress";
        const completeEvent = isSharePreview ? "share-complete" : "download-complete";
        const failEvent = isSharePreview ? "share-failed" : "download-failed";

        if (io) io.to(userId).emit(emitEvent, { jobId, progress: 10, status: "processing" });

        const { ffmpegCommand, tempSourcePath } = await processFeedMedia({
            feed,
            viewer,
            designMetadata,
            tempDir,
            onProgress: (p) => {
                const jobProg = Math.floor(10 + (p * 0.4));
                job.progress(jobProg);
                if (io) io.to(userId).emit(emitEvent, { jobId, progress: jobProg, status: "processing" });
            }
        });

        // Run FFmpeg
        await new Promise((resolve, reject) => {
            ffmpegCommand
                .output(finalOutputPath)
                .on('start', (cmdLine) => console.log(`[Job ${jobId}] FFmpeg started: ${cmdLine}`))
                .on('progress', (p) => {
                    if (p.percent) {
                        const jobProg = Math.floor(50 + (p.percent * 0.4));
                        job.progress(jobProg);
                        if (io) io.to(userId).emit(emitEvent, { jobId, progress: jobProg, status: "processing" });
                    }
                })
                .on('error', (err) => reject(err))
                .on('end', () => resolve())
                .run();
        });

        // Special handling for Share Preview: Generate Thumbnail & Update DB
        if (isSharePreview) {
            console.log(`[Job ${jobId}] Generating thumbnail for share preview...`);
            await new Promise((resolve, reject) => {
                ffmpeg(finalOutputPath).screenshots({
                    timemarks: ['00:00:01'],
                    filename: thumbFilename,
                    folder: shareDir,
                    size: '1200x630'
                })
                    .on('end', resolve)
                    .on('error', reject);
            });

            const UserFeedActions = require("../models/userFeedInterSectionModel");
            await UserFeedActions.findOneAndUpdate(
                { userId },
                {
                    $push: {
                        sharedFeeds: {
                            feedId: feed._id,
                            type: 'direct',
                            processedUrl: finalOutputName,
                            thumbUrl: thumbFilename,
                            sharedAt: new Date()
                        }
                    }
                },
                { upsert: true }
            );
        }

        job.progress(100);

        // Cleanup temp dir
        try {
            if (fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true, force: true });
        } catch (cleanupErr) {
            console.warn(`[Job ${jobId}] Cleanup warning:`, cleanupErr.message);
        }

        const downloadUrl = isSharePreview
            ? `${BACKEND_URL}/uploads/shares/${finalOutputName}`
            : `${BACKEND_URL}/uploads/${finalOutputName}`;

        const thumbUrl = isSharePreview ? `${BACKEND_URL}/uploads/shares/${thumbFilename}` : null;

        console.log(`[Job ${jobId}] Processing complete. URL: ${downloadUrl}`);

        if (io) {
            const payload = { jobId, progress: 100, status: "ready", videoUrl: downloadUrl, thumbUrl, mediaType: isStaticImage ? 'image' : 'video', fileExt: ext };
            io.to(userId).emit(completeEvent, payload);
        }

        return { downloadUrl, thumbUrl, processedFilePath: finalOutputPath };

    } catch (err) {
        console.error(`[Job ${jobId}] Critical Failure:`, err.stack || err);
        const io = getIO();
        const failEvent = jobType === 'share-preview' ? "share-failed" : "download-failed";
        if (io) io.to(userId).emit(failEvent, { jobId, error: err.message });
        try {
            if (fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true, force: true });
        } catch (cleanupErr) { }
        throw err;
    }
});

// Event Listeners (Global)
downloadQueue.on('completed', (job, result) => {
    console.log(`[Queue] Job ${job.id} completed! Result: ${result.downloadUrl}`);
});

downloadQueue.on('failed', (job, err) => {
    console.error(`[Queue] Job ${job.id} failed: ${err.message}`);
});

downloadQueue.on('active', (job) => {
    console.log(`[Queue] Job ${job.id} is now active.`);
});

module.exports = downloadQueue;