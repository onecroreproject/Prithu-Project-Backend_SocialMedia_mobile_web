require("dotenv").config();
const mongoose = require("mongoose");
const path = require("path");
const fs = require("fs");
// const { google } = require("googleapis");

// Import Database Connection
const { prithuDB } = require("../database");

// Import Models
const Feed = require("../models/feedModel");
const UserComment = require("../models/userCommentModel");
const Reply = require("../models/userRepliesModel");
const UserView = require("../models/userModels/userViewFeedsModel");
const Report = require("../models/feedReportModel");
const CommentLike = require("../models/commentsLikeModel");
const UserFeedActions = require("../models/userFeedInterSectionModel");
const Categories = require("../models/categorySchema");
const ImageStats = require("../models/userModels/MediaSchema/imageViewModel");
const VideoStats = require("../models/userModels/MediaSchema/videoViewStatusModel");
const HiddenPost = require("../models/userModels/hiddenPostSchema");

// Import Utilities
const { deleteFeedFile } = require("../middlewares/services/feedUploadSpydy");

/**
 * DELETION UTILITY: feedCleanup.js
 * 
 * This utility provides a comprehensive way to delete feeds and all their 
 * associated interaction data, comments, views, and physical files.
 */

async function deleteFeedsBatch(daysOld = null, specificIds = []) {
    try {
        let query = {};
        if (specificIds && specificIds.length > 0) {
            query = { _id: { $in: specificIds.map(id => new mongoose.Types.ObjectId(id)) } };
        } else if (daysOld !== null) {
            const cutoff = new Date();
            cutoff.setDate(cutoff.getDate() - daysOld);
            query = { createdAt: { $lt: cutoff } };
        } else {
            console.log("⚠️ No deletion criteria provided. Use daysOld or specificIds.");
            return { success: false, message: "No criteria provided" };
        }

        console.log(`🔍 [START] Searching for feeds to clean up...`);
        const feeds = await Feed.find(query).lean();

        if (feeds.length === 0) {
            console.log("✅ No matching feeds found.");
            return { success: true, count: 0 };
        }

        const feedIds = feeds.map(f => f._id);
        console.log(`🧨 Found ${feedIds.length} feeds. Starting cascade deletion...`);

        // --- 1. PHYSICAL FILE DELETION ---
        console.log("📂 Deleting files from storage...");
        for (const feed of feeds) {
            // A. Modern structure (storage.paths)
            if (feed.storage?.paths?.media) deleteFeedFile(feed.storage.paths.media);
            if (feed.storage?.paths?.audio) deleteFeedFile(feed.storage.paths.audio);

            // B. Files array (multiple files)
            if (feed.files && Array.isArray(feed.files)) {
                for (const f of feed.files) {
                    if (f.path) deleteFeedFile(f.path);
                }
            }

            // C. Legacy/Alternative paths
            if (feed.localPath) deleteFeedFile(feed.localPath);
            if (feed.localFilename) {
                const typeFolder = feed.type === "video" ? "videos" : "images";
                const legacyPath = path.join(__dirname, "../media/feed/user", String(feed.createdByAccount), typeFolder, feed.localFilename);
                deleteFeedFile(legacyPath);
            }

            // D. Google Drive (DISABLED)
            // if (feed.driveFileId) {
            //     console.log(`⚠️ Skipping Drive deletion for ${feed.driveFileId} (Drive disabled)`);
            // }
        }

        // --- 2. RELATED DATA IDENTIFICATION ---
        const comments = await UserComment.find({ feedId: { $in: feedIds } }).select("_id").lean();
        const commentIds = comments.map(c => c._id);

        const replies = await Reply.find({ parentCommentId: { $in: commentIds } }).select("_id").lean();
        const replyIds = replies.map(r => r._id);

        // --- 3. DATABASE CASCADE DELETION ---
        console.log("🚮 Clearing records across 10+ collections...");
        const operations = [
            Feed.deleteMany({ _id: { $in: feedIds } }),
            UserComment.deleteMany({ feedId: { $in: feedIds } }),
            Reply.deleteMany({ parentCommentId: { $in: commentIds } }),
            UserView.deleteMany({ feedId: { $in: feedIds } }),
            ImageStats.deleteMany({ imageId: { $in: feedIds } }),
            VideoStats.deleteMany({ videoId: { $in: feedIds } }),
            HiddenPost.deleteMany({ postId: { $in: feedIds } }),

            // Delete likes on comments and replies
            CommentLike.deleteMany({
                $or: [
                    { commentId: { $in: commentIds } },
                    { replyCommentId: { $in: replyIds } }
                ]
            }),

            // Delete reports targeting these feeds or comments
            Report.deleteMany({
                targetId: { $in: [...feedIds, ...commentIds] },
                targetType: { $in: ["Feed", "Comment"] }
            }),

            // Pull items from interaction arrays
            UserFeedActions.updateMany({}, {
                $pull: {
                    likedFeeds: { feedId: { $in: feedIds } },
                    savedFeeds: { feedId: { $in: feedIds } },
                    downloadedFeeds: { feedId: { $in: feedIds } },
                    disLikeFeeds: { feedId: { $in: feedIds } },
                    sharedFeeds: { feedId: { $in: feedIds } },
                }
            }),

            // Pull from Categories
            Categories.updateMany({}, {
                $pull: { feedIds: { $in: feedIds } }
            })
        ];

        await Promise.all(operations);
        console.log(`✅ [SUCCESS] Cleanup finished. Feeds deleted: ${feedIds.length}, Comments: ${commentIds.length}, Replies: ${replyIds.length}`);

        return {
            success: true,
            feedsDeleted: feedIds.length,
            commentsDeleted: commentIds.length,
            repliesDeleted: replyIds.length
        };

    } catch (error) {
        console.error("❌ [FATAL] Cleanup execution failed:", error);
        throw error;
    }
}

// 🟢 CLI RUNNER SUPPORT
if (require.main === module) {
    const arg = process.argv[2];
    if (!arg) {
        console.log("\nUsage: node scripts/feedCleanup.js <days_old | all>");
        console.log("Example: node scripts/feedCleanup.js 30");
        console.log("Example: node scripts/feedCleanup.js all\n");
        process.exit(1);
    }

    let criteriaLabel = "";
    let callArgs = [];

    if (arg.toLowerCase() === "all") {
        criteriaLabel = "ALL feeds";
        callArgs = [0]; // 0 days = everything up to now
    } else {
        const days = parseInt(arg);
        if (isNaN(days)) {
            console.log("❌ Error: Argument must be a number (days) or 'all'.");
            process.exit(1);
        }
        criteriaLabel = `feeds older than ${days} days`;
        callArgs = [days];
    }

    prithuDB.on('connected', async () => {
        console.log(`🔌 Connected to DB. Executing cleanup for ${criteriaLabel}...`);
        try {
            const summary = await deleteFeedsBatch(...callArgs);
            console.log("\nSummary:", JSON.stringify(summary, null, 2));
            process.exit(0);
        } catch (err) {
            console.error("Runner Error:", err);
            process.exit(1);
        }
    });
}

module.exports = { deleteFeedsBatch };
