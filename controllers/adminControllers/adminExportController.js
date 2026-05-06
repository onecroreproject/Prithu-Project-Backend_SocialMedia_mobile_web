const UserFeedActions = require("../../models/userFeedInterSectionModel");
const UserVideoView   = require("../../models/userModels/MediaSchema/userVideoViewModel");
const UserImageView   = require("../../models/userModels/MediaSchema/userImageViewsModel");
const VideoStats      = require("../../models/userModels/MediaSchema/videoViewStatusModel");
const ImageStats      = require("../../models/userModels/MediaSchema/imageViewModel");
const Feed            = require("../../models/feedModel");
const { Parser }      = require("json2csv");

/**
 * Export Feed Interactions to CSV
 *
 * Sources merged into one row per (userId, feedId):
 *  1. UserFeedActions  → liked, shared, watched (from feed actions arrays)
 *  2. UserVideoView    → viewed = Yes, watchedSeconds (actual watch time)
 *  3. UserImageView    → viewed = Yes (image impressions)
 *  4. VideoStats       → totalVideoViews aggregate per feed
 *
 * Columns:
 *  userId | feedId | postType | category | liked | shared | viewed | watchTime (sec) | totalFeedViews | createdAt
 */
exports.exportFeedInteractionsCSV = async (req, res) => {
    try {
        console.log("📊 Starting enhanced CSV Export...");

        // ─── 1. Load all data sources in parallel ────────────────────────────
        const [allActions, videoViews, imageViews, videoStats] = await Promise.all([
            UserFeedActions.find({}).lean(),
            UserVideoView.find({}).lean(),
            UserImageView.find({}).lean(),
            VideoStats.find({}).lean(),
        ]);

        const totalSources =
            allActions.length + videoViews.length + imageViews.length;
        if (totalSources === 0) {
            return res.status(404).json({
                success: false,
                message: "No interaction data found to export",
            });
        }

        // ─── 2. Collect all unique feedIds ───────────────────────────────────
        const feedIdSet = new Set();

        for (const doc of allActions) {
            for (const arr of ["likedFeeds", "sharedFeeds", "watchedFeeds", "savedFeeds"]) {
                if (Array.isArray(doc[arr])) {
                    doc[arr].forEach((item) => item?.feedId && feedIdSet.add(item.feedId.toString()));
                }
            }
        }
        videoViews.forEach((v) => v.videoId && feedIdSet.add(v.videoId.toString()));
        imageViews.forEach((v) => v.imageId && feedIdSet.add(v.imageId.toString()));

        // ─── 3. Fetch Feed metadata (category ids + postType) ────────────────
        const feeds = await Feed.find({ _id: { $in: Array.from(feedIdSet) } })
            .select("category postType")
            .lean();

        // Collect all category ObjectIds from feeds
        const catIdSet = new Set();
        for (const feed of feeds) {
            if (Array.isArray(feed.category)) {
                feed.category.forEach((c) => c && catIdSet.add(c.toString()));
            }
        }

        // Fetch category names using the Category model (ensures schema is registered)
        const Category = require("../../models/categorySchema");
        const categories = await Category.find({ _id: { $in: Array.from(catIdSet) } })
            .select("name")
            .lean();

        const catNameMap = {};
        for (const cat of categories) {
            catNameMap[cat._id.toString()] = cat.name;
        }

        const feedMeta = {};
        for (const feed of feeds) {
            const catNames = Array.isArray(feed.category)
                ? feed.category.map((c) => catNameMap[c.toString()]).filter(Boolean).join(", ")
                : "Uncategorized";
            feedMeta[feed._id.toString()] = {
                category: catNames || "Uncategorized",
                postType: feed.postType || "unknown",
            };
        }

        // ─── 4. Build VideoStats lookup: feedId → totalViews ─────────────────
        const videoStatsMap = {};
        for (const vs of videoStats) {
            if (vs.videoId) videoStatsMap[vs.videoId.toString()] = vs.totalViews || 0;
        }

        // ─── 5. Helper – get or create a row in the map ───────────────────────
        const interactionMap = {};
        const getKey = (userId, feedId) => `${userId}__${feedId}`;
        const ensure = (userId, feedId, createdAt) => {
            const key = getKey(userId, feedId);
            if (!interactionMap[key]) {
                const meta = feedMeta[feedId.toString()] || {};
                interactionMap[key] = {
                    userId:          userId.toString(),
                    feedId:          feedId.toString(),
                    postType:        meta.postType    || "unknown",
                    category:        meta.category    || "Uncategorized",
                    liked:           "No",
                    shared:          "No",
                    viewed:          "No",
                    watchTime:       0,
                    totalFeedViews:  videoStatsMap[feedId.toString()] || 0,
                    createdAt:       createdAt
                        ? new Date(createdAt).toISOString().replace("T", " ").slice(0, 19)
                        : "",
                };
            }
            return interactionMap[key];
        };

        // ─── 6. Process UserFeedActions ───────────────────────────────────────
        for (const doc of allActions) {
            const userId = doc.userId || doc.accountId;
            if (!userId) continue;

            if (Array.isArray(doc.likedFeeds)) {
                for (const item of doc.likedFeeds) {
                    if (!item?.feedId) continue;
                    ensure(userId, item.feedId, item.likedAt || doc.createdAt).liked = "Yes";
                }
            }
            if (Array.isArray(doc.sharedFeeds)) {
                for (const item of doc.sharedFeeds) {
                    if (!item?.feedId) continue;
                    ensure(userId, item.feedId, item.sharedAt || doc.createdAt).shared = "Yes";
                }
            }
            if (Array.isArray(doc.watchedFeeds)) {
                for (const item of doc.watchedFeeds) {
                    if (!item?.feedId) continue;
                    const row = ensure(userId, item.feedId, item.watchedAt || doc.createdAt);
                    row.viewed = "Yes";
                }
            }
            if (Array.isArray(doc.savedFeeds)) {
                for (const item of doc.savedFeeds) {
                    if (!item?.feedId) continue;
                    ensure(userId, item.feedId, item.savedAt || doc.createdAt);
                }
            }
        }

        // ─── 7. Process UserVideoView (overwrites watched with actual seconds) ─
        for (const v of videoViews) {
            if (!v.videoId || !v.userId) continue;
            const row = ensure(v.userId, v.videoId, v.viewedAt || v.createdAt);
            row.viewed    = "Yes";
            row.watchTime = (row.watchTime || 0) + (v.watchedSeconds || 0);
            // Keep the earliest timestamp for sorting
            if (v.viewedAt && (!row.createdAt || new Date(v.viewedAt) < new Date(row.createdAt))) {
                row.createdAt = new Date(v.viewedAt).toISOString().replace("T", " ").slice(0, 19);
            }
        }

        // ─── 8. Process UserImageView ─────────────────────────────────────────
        for (const v of imageViews) {
            if (!v.imageId || !v.userId) continue;
            const row = ensure(v.userId, v.imageId, v.viewedAt || v.createdAt);
            row.viewed = "Yes";
            if (v.viewedAt && (!row.createdAt || new Date(v.viewedAt) < new Date(row.createdAt))) {
                row.createdAt = new Date(v.viewedAt).toISOString().replace("T", " ").slice(0, 19);
            }
        }

        // ─── 9. Build sorted rows ─────────────────────────────────────────────
        const rows = Object.values(interactionMap);
        rows.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        if (rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "No interaction data found to export",
            });
        }

        console.log(`✅ Exporting ${rows.length} rows (merged from all sources)...`);

        // ─── 10. Generate CSV ────────────────────────────────────────────────
        const fields = [
            { label: "User ID",             value: "userId"         },
            { label: "Feed ID",             value: "feedId"         },
            { label: "Post Type",           value: "postType"       },
            { label: "Category",            value: "category"       },
            { label: "Liked",               value: "liked"          },
            { label: "Shared",              value: "shared"         },
            { label: "Viewed",              value: "viewed"         },
            { label: "Watch Time (sec)",    value: "watchTime"      },
            { label: "Total Feed Views",    value: "totalFeedViews" },
            { label: "Created At",          value: "createdAt"      },
        ];

        const parser  = new Parser({ fields });
        const csv     = parser.parse(rows);
        const fileName = `feed_interactions_export_${new Date().toISOString().split("T")[0]}.csv`;

        res.header("Content-Type", "text/csv");
        res.attachment(fileName);
        return res.status(200).send(csv);

    } catch (error) {
        console.error("❌ Export CSV Error:", error);
        return res.status(500).json({
            success: false,
            message: "Internal server error during CSV export",
            error: error.message,
        });
    }
};
