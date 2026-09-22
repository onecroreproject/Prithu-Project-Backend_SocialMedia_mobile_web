const FeedService = require("../../middlewares/services/AdminServices/adminUploadfileService");
const ChildAdmin = require("../../models/childAdminModel");
const Category = require('../../models/categorySchema');
const Feed = require("../../models/feedModel");
const ProfileSettings = require("../../models/profileSettingModel");
const Account = require("../../models/accountSchemaModel");
const User = require("../../models/userModels/userModel");
const { saveFile, getMediaUrl } = require("../../utils/storageEngine");
const mongoose = require("mongoose");
const { prithuDB } = require("../../database");
const notificationQueue = require("../../queue/notificationQueue");
const feedPostQueue = require("../../queue/feedPostQueue");
const fs = require("fs");
const redisClient = require("../../Config/redisConfig");
const { clearFeedsCache } = require("../feedControllers/feedsController");
const UserView = require("../../models/userModels/userViewFeedsModel");

// ✅ Helper delete local file
const deleteLocalAdminFile = (filePath) => {
    try {
        if (filePath && fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
    } catch (err) {
        console.error("❌ Local file delete failed:", err.message);
    }
};

// ✅ DB Connection checker
const checkDBConnection = () => {
    return prithuDB.readyState === 1;
};

exports.adminFeedUpload = async (req, res) => {
    try {
        const adminId = req.Id || "68edd60dff4c9aa0a69663ba";
        const roleRef = req.role || "Admin";
        const mediaFiles = req.localFilesArr || [];
        const audioFile = req.localAudioFile || null;
        const { 
            categoryId: globalCategoryId, 
            categoryIds: globalCategoryIds, 
            subCategory: globalSubCategory, 
            language = "en", 
            title: globalTitle,
            description: globalDescription,
            tags: globalTags,
            caption: globalCaption, 
            designData: globalDesignData, 
            scheduleTime: globalScheduleTime, 
            audience = "public", 
            perFileMetadata 
        } = req.body;

        if (!mediaFiles.length) {
            console.error("❌ Admin Feed Upload Failed: No media files detected in req.localFilesArr");
            console.log("Req Body Keys:", Object.keys(req.body));
            // console.log("Req Files:", req.files);
            return res.status(400).json({ success: false, message: "No media files provided" });
        }

        let fileMetadataMap = {};
        if (perFileMetadata) {
            try {
                fileMetadataMap = typeof perFileMetadata === "string" ? JSON.parse(perFileMetadata) : perFileMetadata;
            } catch (e) {
                console.error("Per-file metadata parsing failed", e);
            }
        }

        const { getIO } = require("../../middlewares/webSocket");
        const io = getIO();

        // 1. Upload Shared Audio (if any)
        let uploadedAudio = null;
        if (audioFile) {
            console.log("Processing audio file locally...");
            const audioSave = await saveFile(audioFile, {
                type: 'feed',
                categorySlug: 'shared-audio',
                subType: 'audio'
            });

            if (audioSave?.dbPath) {
                uploadedAudio = {
                    url: audioSave.dbPath, // Relative path for DB
                    path: audioSave.path,
                    mimeType: audioFile.mimetype
                };
            }
        }

        const uploadedFeeds = [];
        const uploadErrors = [];

        // 2. Process Media Files
        for (const file of mediaFiles) {
            try {
                const specificMetadata = fileMetadataMap[file.originalname] || {};
                const categoryIdInput = specificMetadata.categoryId || specificMetadata.categoryIds || globalCategoryId || globalCategoryIds;

                // Ensure categoryIds is always an array
                const categoryIds = Array.isArray(categoryIdInput) ? categoryIdInput : (categoryIdInput ? [categoryIdInput] : []);

                const rawSubCategory = specificMetadata.subCategory || specificMetadata.god || specificMetadata.scheduling?.god || globalSubCategory || req.body.god || null;
                const resolvedSubCategory = rawSubCategory && String(rawSubCategory).trim() ? String(rawSubCategory).trim() : null;

                const title = (specificMetadata.title || globalTitle || req.body.title || "").trim();
                const description = (specificMetadata.description || specificMetadata.caption || globalDescription || globalCaption || req.body.description || req.body.caption || "").trim();
                const caption = (specificMetadata.caption || specificMetadata.description || globalCaption || globalDescription || req.body.caption || req.body.description || "").trim();

                // Parse tags
                let tags = [];
                const rawTags = specificMetadata.tags || globalTags || req.body.tags;
                if (Array.isArray(rawTags)) {
                    tags = rawTags.map(t => String(t).trim()).filter(Boolean);
                } else if (typeof rawTags === 'string' && rawTags.trim()) {
                    tags = rawTags.split(/[\s,]+/).map(t => t.replace(/^#/, '').trim()).filter(Boolean);
                }
                const hashtags = tags.map(t => t.toLowerCase());

                const scheduleTime = specificMetadata.scheduleTime || globalScheduleTime;
                const designData = specificMetadata.designData || globalDesignData;

                if (!categoryIds.length) throw new Error("Category ID(s) are required");

                const categoryDoc = await Category.findById(categoryIds[0]).lean();
                if (!categoryDoc) throw new Error("Primary category not found");

                const categorySlug = categoryDoc.name.toLowerCase().replace(/\s+/g, '-');
                const isImage = file.mimetype.startsWith("image/");

                // ✅ Validate and resolve schedule time
                let resolvedScheduleTime = null;
                let isScheduledFeed = false;
                if (scheduleTime) {
                    const parsed = new Date(scheduleTime);
                    if (isNaN(parsed.getTime())) {
                        throw new Error(`Invalid scheduleTime format: ${scheduleTime}`);
                    }
                    // If scheduleDate is in the past → publish immediately
                    if (parsed <= new Date()) {
                        console.info(`⚠️ scheduleTime is in the past for ${file.originalname} — publishing immediately.`);
                    } else {
                        resolvedScheduleTime = parsed;
                        isScheduledFeed = true;
                    }
                }

                if (io) io.to(adminId).emit("upload_progress", { filename: file.originalname, percent: 10 });

                // Save file locally using storageEngine
                const fileSave = await saveFile(file, {
                    type: 'feed',
                    categorySlug: categorySlug,
                    subType: isImage ? 'image' : 'video'
                });

                if (io) io.to(adminId).emit("upload_progress", { filename: file.originalname, percent: 80 });

                const mediaUrl = fileSave.url; // Full absolute URL for DB

                let fileDesignMetadata = { isTemplate: false, uploadType: 'normal', overlayElements: [] };
                try {
                    if (designData) {
                        const parsed = typeof designData === "string" ? JSON.parse(designData) : designData;
                        fileDesignMetadata = { ...fileDesignMetadata, ...parsed };
                    }
                } catch (e) {
                    console.error(`Design parsing failed for ${file.originalname}`, e);
                }

                if (fileDesignMetadata.uploadType === 'template') {
                    fileDesignMetadata.isTemplate = true;
                }

                const currentUploadType = fileDesignMetadata.isTemplate ? 'template' : 'normal';
                const currentPostType = isImage ? (uploadedAudio ? 'image+audio' : 'image') : 'video';

                const feedDoc = {
                    uploadType: currentUploadType,
                    postType: currentPostType,
                    uploadMode: currentUploadType,
                    language,
                    category: categoryIds,
                    subCategory: resolvedSubCategory,
                    god: resolvedSubCategory,
                    title,
                    description,
                    caption,
                    dec: description || caption,
                    tags,
                    hashtags,
                    duration: file.duration, // Top-level duration
                    mediaUrl,
                    files: [{
                        url: mediaUrl,
                        path: fileSave.path,
                        type: isImage ? 'image' : 'video',
                        uploadMode: currentUploadType,
                        mimeType: file.mimetype,
                        size: file.size,
                        dimensions: file.dimensions,
                        duration: file.duration
                    }],
                    audioFile: uploadedAudio,
                    fileHash: file.fileHash,
                    createdByAccount: adminId,
                    postedBy: { userId: adminId, role: roleRef },
                    roleRef,
                    designMetadata: {
                        ...fileDesignMetadata,
                        isTemplate: fileDesignMetadata.isTemplate,
                        uploadType: currentUploadType,
                        postType: currentPostType,
                        audioConfig: {
                            ...(fileDesignMetadata.audioConfig || {}),
                            enabled: !!uploadedAudio,
                            audioUrl: uploadedAudio?.url
                        }
                    },
                    editMetadata: fileDesignMetadata.editMetadata || {
                        crop: { ratio: "original", zoomLevel: 1, position: { x: 0, y: 0 } },
                        filters: { preset: "original", adjustments: {} }
                    },
                    audience,
                    storage: {
                        type: 'local',
                        urls: { media: mediaUrl, audio: uploadedAudio?.url },
                        paths: { media: fileSave.path, audio: uploadedAudio?.path }
                    },
                    isScheduled: isScheduledFeed,
                    scheduleDate: resolvedScheduleTime,
                    status: isScheduledFeed ? 'scheduled' : 'published',
                    isApproved: true
                };

                const savedFeed = await new Feed(feedDoc).save();

                // Update all categories
                await Category.updateMany(
                    { _id: { $in: categoryIds } },
                    { 
                        $addToSet: { 
                            feedIds: savedFeed._id,
                            ...(resolvedSubCategory ? { subcategories: resolvedSubCategory } : {})
                        } 
                    }
                );

                // ✅ SCHEDULED FEED: Add a Bull job with delay instead of broadcasting immediately
                if (isScheduledFeed && resolvedScheduleTime) {
                    const delayMs = resolvedScheduleTime.getTime() - Date.now();
                    await feedPostQueue.add(
                        { feedId: savedFeed._id.toString() },
                        {
                            delay: Math.max(0, delayMs),
                            jobId: `feed-publish-${savedFeed._id}`, // Unique jobId prevents duplicates
                            removeOnComplete: true,
                            attempts: 3,
                            backoff: { type: 'exponential', delay: 5000 }
                        }
                    );
                    console.log(`⏰ Scheduled feed ${savedFeed._id} queued for ${resolvedScheduleTime.toISOString()} (delay: ${Math.round(delayMs / 1000)}s)`);
                } else {
                    // ✅ IMMEDIATE PUBLISH: Real-time broadcast and notification
                    // ✅ REAL-TIME BROADCAST: Fetch creator profile to enrich the feed data for users
                    let creatorProfile = null;
                    if (roleRef === "Admin") {
                        creatorProfile = await ProfileSettings.findOne({ adminId }).select("userName profileAvatar modifyAvatar").lean();
                    } else if (roleRef === "Child_Admin") {
                        creatorProfile = await ProfileSettings.findOne({ childAdminId: adminId }).select("userName profileAvatar modifyAvatar").lean();
                    }

                    if (creatorProfile) {
                        creatorProfile.profileAvatar = getMediaUrl(creatorProfile.profileAvatar);
                        creatorProfile.modifyAvatar = getMediaUrl(creatorProfile.modifyAvatar);
                    }

                    if (io) {
                        const broadcastData = {
                            ...savedFeed.toObject(),
                            creatorData: creatorProfile || { userName: "Admin", profileAvatar: null }
                        };
                        io.emit("new_feed_published", broadcastData);
                    }

                    notificationQueue.add("BROADCAST_NEW_FEED", {
                        feedId: savedFeed._id,
                        senderId: adminId,
                        title: "New Fresh Content! 🔥",
                        message: `Hi \${username}, check out this new feed! Download it and share 🔥❤️`,
                        image: isImage ? getMediaUrl(mediaUrl) : (file.dimensions?.thumbnail ? getMediaUrl(`/media/${file.dimensions.thumbnail}`) : getMediaUrl('/default-video-thumbnail.png')),
                    }, {
                        removeOnComplete: true,
                        attempts: 3,
                        backoff: { type: 'exponential', delay: 5000 }
                    });
                }

                uploadedFeeds.push({ id: savedFeed._id, url: mediaUrl, filename: file.originalname });

                if (io) io.to(adminId).emit("upload_progress", { filename: file.originalname, percent: 100 });

            } catch (err) {
                uploadErrors.push({ file: file.originalname, error: err.message });
            }
        }

        // 🟢 Invalidate User Feeds Cache
        await clearFeedsCache();

        res.status(201).json({ success: true, uploaded: uploadedFeeds, errors: uploadErrors.length ? uploadErrors : undefined });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.bulkFeedUpload = async (req, res) => {
    try {
        const adminId = req.Id;
        const files = req.localFilesArr || [];

        if (files.length === 0) {
            return res.status(400).json({ success: false, message: "No files to process" });
        }

        const results = {
            total: files.length,
            successful: 0,
            failed: 0,
            details: []
        };

        for (const [index, file] of files.entries()) {
            try {
                const feedType = file.mimetype.startsWith('image/') ? 'image' :
                    file.mimetype.startsWith('video/') ? 'video' : 'audio';

                const categoryIdInput = req.body.categoryId || req.body.categoryIds;
                const categoryIds = Array.isArray(categoryIdInput) ? categoryIdInput : (categoryIdInput ? [categoryIdInput] : []);
                const rawBulkSub = req.body.subCategory || req.body.god || null;
                const resolvedBulkSub = rawBulkSub && String(rawBulkSub).trim() ? String(rawBulkSub).trim() : null;

                let categorySlug = 'bulk-upload';
                if (categoryIds.length) {
                    const category = await Category.findById(categoryIds[0]).lean();
                    if (category) categorySlug = category.name.toLowerCase().replace(/\s+/g, '-');
                }

                const fileSave = await saveFile(file, {
                    type: 'feed',
                    categorySlug: categorySlug,
                    subType: feedType
                });

                const bulkTitle = (req.body.title || "").trim();
                const bulkDesc = (req.body.description || req.body.caption || "").trim();
                const bulkCaption = (req.body.caption || req.body.description || "").trim();
                let bulkTags = [];
                if (Array.isArray(req.body.tags)) {
                    bulkTags = req.body.tags.map(t => String(t).trim()).filter(Boolean);
                } else if (typeof req.body.tags === 'string' && req.body.tags.trim()) {
                    bulkTags = req.body.tags.split(/[\s,]+/).map(t => t.replace(/^#/, '').trim()).filter(Boolean);
                }
                const bulkHashtags = bulkTags.map(t => t.toLowerCase());

                const feedData = {
                    postType: feedType,
                    language: "en",
                    category: categoryIds,
                    subCategory: resolvedBulkSub,
                    god: resolvedBulkSub,
                    title: bulkTitle,
                    description: bulkDesc,
                    caption: bulkCaption,
                    dec: bulkDesc || bulkCaption,
                    tags: bulkTags,
                    hashtags: bulkHashtags,
                    mediaUrl: fileSave.url,
                    files: [{
                        url: fileSave.url,
                        path: fileSave.path,
                        type: feedType,
                        mimeType: file.mimetype,
                        size: file.size || 0,
                        dimensions: file.dimensions,
                        duration: file.duration,
                        order: 0,
                        storageType: "local"
                    }],
                    duration: file.duration,
                    fileHash: file.fileHash,
                    createdByAccount: adminId,
                    postedBy: { userId: adminId, role: req.role },
                    roleRef: req.role,
                    storage: {
                        type: "local",
                        urls: { media: fileSave.url },
                        paths: { media: fileSave.path }
                    },
                    status: "published"
                };

                const feed = new Feed(feedData);
                await feed.save();

                // Update all categories
                if (categoryIds.length) {
                    await Category.updateMany(
                        { _id: { $in: categoryIds } },
                        { 
                            $addToSet: { 
                                feedIds: feed._id,
                                ...(resolvedBulkSub ? { subcategories: resolvedBulkSub } : {})
                            } 
                        }
                    );
                }

                // ✅ REAL-TIME BROADCAST (Bulk)
                const { getIO } = require("../../middlewares/webSocket");
                const io = getIO();
                if (io) {
                    const ProfileSettings = require("../../models/profileSettingModel");
                    let creatorProfile = null;
                    if (req.role === "Admin") {
                        creatorProfile = await ProfileSettings.findOne({ adminId: adminId }).select("userName profileAvatar").lean();
                    } else if (req.role === "Child_Admin") {
                        creatorProfile = await ProfileSettings.findOne({ childAdminId: adminId }).select("userName profileAvatar").lean();
                    }

                    const broadcastData = {
                        ...feed.toObject(),
                        creatorData: creatorProfile || { userName: "Admin", profileAvatar: null }
                    };
                    io.emit("new_feed_published", broadcastData);
                }

                results.details.push({
                    success: true,
                    feedId: feed._id,
                    filename: file.filename,
                    type: feedType,
                    storageType: "local"
                });
                results.successful++;
            } catch (error) {
                results.details.push({
                    success: false,
                    filename: file.filename,
                    error: error.message
                });
                results.failed++;
            }
        }

        // 🟢 Invalidate User Feeds Cache
        await clearFeedsCache();

        return res.status(200).json({
            success: true,
            message: "Bulk upload to local storage completed",
            data: results
        });

    } catch (error) {
        console.error("Bulk upload error:", error);
        return res.status(500).json({
            success: false,
            message: "Bulk upload failed",
            error: error.message
        });
    }
};

exports.getFeedWithDesign = async (req, res) => {
    try {
        const { feedId } = req.params;
        const userId = req.Id;

        const query = { _id: feedId };
        if (req.role !== "Admin" && req.role !== "Child_Admin") {
            query.$or = [
                { audience: "public" },
                { audience: "followers" },
                { createdByAccount: userId },
                { allowedUsers: userId }
            ];
        }

        const feed = await Feed.findOne(query)
            .populate('category', 'name icon color')
            .populate('createdByAccount', 'username name profilePic')
            .lean();

        if (!feed) {
            return res.status(404).json({ success: false, message: "Feed not found or access denied" });
        }

        feed.formattedUrl = getMediaUrl(feed.contentUrl || (feed.files && feed.files[0]?.url));
        feed.thumbnailUrl = feed.type === 'video' && feed.files && feed.files[0]?.thumbnail
            ? getMediaUrl(feed.files[0].thumbnail)
            : feed.formattedUrl;

        if (feed.designMetadata?.audioConfig?.audioUrl) {
            feed.audioUrl = getMediaUrl(feed.designMetadata.audioConfig.audioUrl);
        }

        let elements = feed.designMetadata?.overlayElements || [];
        if (!elements.some(el => el.type === 'calendar')) {
            elements = [...elements, {
                id: 'calendar', type: 'calendar', visible: true,
                xPercent: 70, yPercent: 20, wPercent: 20, hPercent: 15, zIndex: 10,
                calendarConfig: { headerColor: "#E54B35", bodyColor: "#F9F9F9" }
            }];
        }

        feed.designState = {
            elements,
            footer: feed.designMetadata?.footerConfig || { visible: true, colors: { primary: '#1e5a78', secondary: '#0f3a4d' } },
            mediaDimensions: feed.designMetadata?.canvasSettings || { width: 355, height: 400 },
            audioConfig: feed.designMetadata?.audioConfig || null,
            themeColors: feed.themeColor
        };

        feed.storageInfo = {
            type: feed.storageType || "local",
            paths: feed.storage?.paths
        };

        return res.status(200).json({ success: true, data: feed });
    } catch (error) {
        console.error("Get feed with design error:", error);
        return res.status(500).json({ success: false, message: "Failed to fetch feed" });
    }
};

exports.updateFeedDesign = async (req, res) => {
    try {
        const { feedId } = req.params;
        const userId = req.Id;
        const { designMetadata, editMetadata } = req.body;

        if (!designMetadata && !editMetadata) {
            return res.status(400).json({ success: false, message: "Design or Edit metadata is required" });
        }

        const query = { _id: feedId };
        if (req.role !== "Admin" && req.role !== "Child_Admin") {
            query.createdByAccount = userId;
        }

        const feed = await Feed.findOne(query);

        if (!feed) {
            return res.status(404).json({ success: false, message: "Feed not found or access denied" });
        }

        if (designMetadata) {
            const existingMeta = feed.designMetadata ? (feed.designMetadata.toObject ? feed.designMetadata.toObject() : feed.designMetadata) : {};
            feed.designMetadata = { ...existingMeta, ...designMetadata };
            feed.markModified('designMetadata');
        }
        if (editMetadata) {
            const existingEdit = feed.editMetadata ? (feed.editMetadata.toObject ? feed.editMetadata.toObject() : feed.editMetadata) : {};
            feed.editMetadata = { ...existingEdit, ...editMetadata };
            feed.markModified('editMetadata');
        }

        await feed.saveEditHistory(userId, 'Feed design/edit metadata updated');
        await feed.save();

        // 🟢 Invalidate User Feeds Cache
        await clearFeedsCache();

        // 2. Reschedule Bull Job
        return res.status(200).json({
            success: true,
            message: "Design updated successfully",
            data: {
                feedId: feed._id,
                storageType: feed.storageType
            }
        });
    } catch (error) {
        console.error("Update feed design error:", error);
        return res.status(500).json({ success: false, message: "Failed to update design" });
    }
};

exports.getFeedsWithDesign = async (req, res) => {
    try {
        const userId = req.Id;
        const { page = 1, limit = 20, categoryId, type, hasDesign = true } = req.query;
        const skip = (page - 1) * limit;

        const query = {
            $or: [
                { audience: "public" },
                { audience: "followers" },
                { createdByAccount: userId },
                { allowedUsers: userId }
            ],
            isDeleted: false,
            status: { $in: ["published", "scheduled"] }
        };

        if (categoryId) query.category = categoryId;
        if (type) query.type = type;

        if (hasDesign === 'true') {
            query.$or = [
                { 'designMetadata.overlayElements.0': { $exists: true } },
                { 'designMetadata.audioConfig.audioUrl': { $exists: true } }
            ];
        }

        const feeds = await Feed.find(query)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(parseInt(limit))
            .populate('category', 'name icon color')
            .populate('createdByAccount', 'username name profilePic')
            .lean();

        const enrichedFeeds = feeds.map(feed => ({
            ...feed,
            formattedUrl: getMediaUrl(feed.contentUrl || (feed.files && feed.files[0]?.url)),
            storageInfo: {
                type: feed.storageType || "local"
            }
        }));

        const total = await Feed.countDocuments(query);

        return res.status(200).json({
            success: true,
            data: {
                feeds: enrichedFeeds,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total,
                    pages: Math.ceil(total / limit)
                }
            }
        });
    } catch (error) {
        console.error("Get feeds with design error:", error);
        return res.status(500).json({ success: false, message: "Failed to fetch feeds" });
    }
};

exports.duplicateFeedWithDesign = async (req, res) => {
    try {
        const { feedId } = req.params;
        const userId = req.Id;

        const originalFeed = await Feed.findOne({
            _id: feedId,
            $or: [{ createdByAccount: userId }, { audience: "public" }]
        });

        if (!originalFeed) {
            return res.status(404).json({ success: false, message: "Feed not found or access denied" });
        }

        const duplicateData = originalFeed.toObject();
        delete duplicateData._id;
        delete duplicateData.createdAt;
        delete duplicateData.updatedAt;
        delete duplicateData.statsId;

        duplicateData.createdByAccount = userId;
        duplicateData.status = "published";
        duplicateData.isScheduled = false;
        duplicateData.scheduleDate = null;
        duplicateData.version = 1;
        duplicateData.previousVersions = [];
        duplicateData.dec = `[Duplicate] ${duplicateData.dec}`;

        const duplicateFeed = new Feed(duplicateData);
        await duplicateFeed.save();

        // 🟢 Invalidate User Feeds Cache
        await clearFeedsCache();

        if (duplicateFeed.category && duplicateFeed.category.length) {
            await Category.updateMany(
                { _id: { $in: duplicateFeed.category } },
                { $addToSet: { feedIds: duplicateFeed._id } }
            );
        }

        return res.status(201).json({
            success: true,
            message: "Feed duplicated successfully",
            data: { feedId: duplicateFeed._id }
        });
    } catch (error) {
        console.error("Duplicate feed error:", error);
        return res.status(500).json({ success: false, message: "Failed to duplicate feed" });
    }
};

exports.getUploadProgress = (req, res) => {
    const uploadId = req.params.uploadId;
    res.json({ uploadId, progress: 100, status: 'completed' });
};

exports.getAllFeedAdmin = async (req, res) => {
    try {
        let matchQuery = {};
        const { fromDate, toDate } = req.query;

        if (fromDate && toDate) {
            matchQuery.createdAt = {
                $gte: new Date(fromDate),
                $lte: new Date(new Date(toDate).setHours(23, 59, 59, 999))
            };
        }

        // Today date boundary
        const now = new Date();
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
        const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

        // Fast parallel count queries + View analytics queries
        const [
            totalFeeds, 
            totalImages, 
            totalVideos, 
            totalPostsWatched,
            todayPostsWatched,
            todayUniqueUsersList,
            todayCategoryAgg,
            feeds
        ] = await Promise.all([
            Feed.countDocuments(matchQuery).catch(() => 0),
            Feed.countDocuments({ ...matchQuery, $or: [{ postType: "image" }, { "files.type": "image" }] }).catch(() => 0),
            Feed.countDocuments({ ...matchQuery, $or: [{ postType: "video" }, { "files.type": "video" }] }).catch(() => 0),
            UserView.countDocuments({}).catch(() => 0),
            UserView.countDocuments({ createdAt: { $gte: startOfDay, $lte: endOfDay } }).catch(() => 0),
            UserView.distinct("userId", { createdAt: { $gte: startOfDay, $lte: endOfDay }, userId: { $ne: null } }).catch(() => []),
            UserView.aggregate([
                { $match: { createdAt: { $gte: startOfDay, $lte: endOfDay } } },
                {
                    $lookup: {
                        from: "Feeds",
                        localField: "feedId",
                        foreignField: "_id",
                        as: "feed"
                    }
                },
                { $unwind: { path: "$feed", preserveNullAndEmptyArrays: false } },
                { $unwind: { path: "$feed.category", preserveNullAndEmptyArrays: false } },
                {
                    $lookup: {
                        from: "Categories",
                        localField: "feed.category",
                        foreignField: "_id",
                        as: "catInfo"
                    }
                },
                { $unwind: { path: "$catInfo", preserveNullAndEmptyArrays: true } },
                {
                    $group: {
                        _id: { $ifNull: ["$catInfo.categoriesName", { $ifNull: ["$catInfo.name", "Uncategorized"] }] },
                        categoryId: { $first: "$feed.category" },
                        viewsToday: { $sum: 1 }
                    }
                },
                { $sort: { viewsToday: -1 } },
                { $limit: 8 }
            ]).catch(() => []),
            Feed.find(matchQuery)
                .select("-designMetadata -editMetadata")
                .sort({ createdAt: -1 })
                .lean()
        ]);

        const todayUniqueUsersWatched = todayUniqueUsersList.length;
        const todayCategoryWatched = todayCategoryAgg.map(item => ({
            categoryName: item._id,
            categoryId: item.categoryId,
            viewsToday: item.viewsToday
        }));

        // --- OPTIMIZATION: Bulk lookups to prevent N+1 queries ---
        
        // 1. Gather unique creator IDs
        const adminIds = new Set();
        const childAdminIds = new Set();
        const userIds = new Set();
        const categoryIds = new Set();

        for (const feed of feeds) {
            const creatorId = feed.createdByAccount || feed.postedBy?.userId;
            if (creatorId) {
                if (feed.roleRef === "Admin") adminIds.add(creatorId.toString());
                else if (feed.roleRef === "Child_Admin") childAdminIds.add(creatorId.toString());
                else if (feed.roleRef === "User") userIds.add(creatorId.toString());
            }
            if (feed.category && Array.isArray(feed.category)) {
                feed.category.forEach(c => c && categoryIds.add(c.toString()));
            }
        }

        // 2. Perform bulk queries
        const [admins, childAdmins, users, categories] = await Promise.all([
            adminIds.size ? ProfileSettings.find({ adminId: { $in: Array.from(adminIds) } }).select("adminId userName profileAvatar").lean().catch(() => []) : [],
            childAdminIds.size ? ProfileSettings.find({ childAdminId: { $in: Array.from(childAdminIds) } }).select("childAdminId userName profileAvatar").lean().catch(() => []) : [],
            userIds.size ? ProfileSettings.find({ userId: { $in: Array.from(userIds) } }).select("userId userName profileAvatar").lean().catch(() => []) : [],
            categoryIds.size ? Category.find({ _id: { $in: Array.from(categoryIds) } }).select("name").lean().catch(() => []) : []
        ]);

        // 3. Build maps for O(1) lookup
        const profileMap = {};
        admins.forEach(p => { if (p && p.adminId) profileMap[`Admin_${p.adminId}`] = p; });
        childAdmins.forEach(p => { if (p && p.childAdminId) profileMap[`Child_Admin_${p.childAdminId}`] = p; });
        users.forEach(p => { if (p && p.userId) profileMap[`User_${p.userId}`] = p; });
        
        const categoryMap = {};
        categories.forEach(c => { if (c && c._id) categoryMap[c._id.toString()] = { id: c._id, name: c.name }; });

        // 4. Map feeds
        const results = feeds.map(feed => {
            const creatorId = feed.createdByAccount || feed.postedBy?.userId;
            let profile = null;
            if (creatorId) {
                profile = profileMap[`${feed.roleRef}_${creatorId.toString()}`];
            }
            
            // Create a clone to safely modify profileAvatar
            let profileData = profile ? { ...profile } : null;
            if (profileData && profileData.profileAvatar) {
                profileData.profileAvatar = getMediaUrl(profileData.profileAvatar);
            }

            const feedCategories = (feed.category || [])
                .map(c => c ? categoryMap[c.toString()] : null)
                .filter(Boolean);

            const contentUrl = getMediaUrl(feed.mediaUrl || (feed.files && feed.files[0]?.url));
            const thumbnailUrl = (feed.postType === 'video' && feed.files && feed.files[0]?.thumbnail)
                ? getMediaUrl(feed.files[0].thumbnail)
                : contentUrl;

            return {
                ...feed,
                title: feed.title || "",
                description: feed.description || feed.caption || "",
                caption: feed.caption || feed.description || "",
                tags: (feed.tags && feed.tags.length > 0) ? feed.tags : (feed.hashtags || []),
                hashtags: feed.hashtags || feed.tags || [],
                contentUrl,
                thumbnailUrl,
                type: feed.postType || "image",
                creator: profileData ? { userName: profileData.userName || "Unknown", profileAvatar: profileData.profileAvatar || null } : { userName: "Unknown", profileAvatar: null },
                categories: feedCategories,
                subCategory: feed.subCategory || feed.god || null,
            };
        });

        return res.status(200).json({ 
            success: true, 
            totalFeeds,
            totalImages,
            totalVideos,
            totalPostsWatched,
            todayPostsWatched,
            todayUniqueUsersWatched,
            todayCategoryWatched,
            feeds: results 
        });
    } catch (err) {
        console.error("Error in getAllFeedAdmin:", err);
        return res.status(500).json({ success: false, message: "Server error", error: err.message });
    }
};

exports.getWatchAnalyticsAdmin = async (req, res) => {
    try {
        const now = new Date();
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
        const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

        // 1. Parallel Counts & Durations
        const [
            totalPostsWatched, 
            todayPostsWatched, 
            todayUniqueUsersList,
            totalWatchDurationAgg,
            todayWatchDurationAgg
        ] = await Promise.all([
            UserView.countDocuments({}).catch(() => 0),
            UserView.countDocuments({ createdAt: { $gte: startOfDay, $lte: endOfDay } }).catch(() => 0),
            UserView.distinct("userId", { createdAt: { $gte: startOfDay, $lte: endOfDay }, userId: { $ne: null } }).catch(() => []),
            UserView.aggregate([
                { $group: { _id: null, totalSeconds: { $sum: "$watchDuration" } } }
            ]).catch(() => []),
            UserView.aggregate([
                { $match: { createdAt: { $gte: startOfDay, $lte: endOfDay } } },
                { $group: { _id: null, totalSeconds: { $sum: "$watchDuration" } } }
            ]).catch(() => [])
        ]);

        const todayUniqueUsersWatched = todayUniqueUsersList.length;
        const totalWatchHours = ((totalWatchDurationAgg[0]?.totalSeconds || 0) / 3600).toFixed(1);
        const todayWatchHours = ((todayWatchDurationAgg[0]?.totalSeconds || 0) / 3600).toFixed(1);

        // 2. Category watched today aggregation
        const todayCategoryAgg = await UserView.aggregate([
            { $match: { createdAt: { $gte: startOfDay, $lte: endOfDay } } },
            {
                $lookup: {
                    from: "Feeds",
                    localField: "feedId",
                    foreignField: "_id",
                    as: "feed"
                }
            },
            { $unwind: { path: "$feed", preserveNullAndEmptyArrays: true } },
            {
                $project: {
                    categoryId: { 
                        $ifNull: [
                            "$categoryId", 
                            { $arrayElemAt: ["$feed.category", 0] }
                        ] 
                    }
                }
            },
            {
                $lookup: {
                    from: "Categories",
                    localField: "categoryId",
                    foreignField: "_id",
                    as: "catInfo"
                }
            },
            { $unwind: { path: "$catInfo", preserveNullAndEmptyArrays: true } },
            {
                $group: {
                    _id: { $ifNull: ["$catInfo.categoriesName", { $ifNull: ["$catInfo.name", "Uncategorized"] }] },
                    categoryId: { $first: "$categoryId" },
                    viewsToday: { $sum: 1 }
                }
            },
            { $sort: { viewsToday: -1 } },
            { $limit: 12 }
        ]).catch(() => []);

        const todayCategoryWatched = todayCategoryAgg.map(item => ({
            categoryName: item._id,
            categoryId: item.categoryId,
            viewsToday: item.viewsToday,
            percentage: todayPostsWatched > 0 ? Math.round((item.viewsToday / todayPostsWatched) * 100) : 0
        }));

        // 3. All-time Category aggregation
        const allTimeCategoryAgg = await UserView.aggregate([
            {
                $lookup: {
                    from: "Feeds",
                    localField: "feedId",
                    foreignField: "_id",
                    as: "feed"
                }
            },
            { $unwind: { path: "$feed", preserveNullAndEmptyArrays: true } },
            {
                $project: {
                    categoryId: { 
                        $ifNull: [
                            "$categoryId", 
                            { $arrayElemAt: ["$feed.category", 0] }
                        ] 
                    }
                }
            },
            {
                $lookup: {
                    from: "Categories",
                    localField: "categoryId",
                    foreignField: "_id",
                    as: "catInfo"
                }
            },
            { $unwind: { path: "$catInfo", preserveNullAndEmptyArrays: true } },
            {
                $group: {
                    _id: { $ifNull: ["$catInfo.categoriesName", { $ifNull: ["$catInfo.name", "Uncategorized"] }] },
                    categoryId: { $first: "$categoryId" },
                    totalViews: { $sum: 1 }
                }
            },
            { $sort: { totalViews: -1 } },
            { $limit: 12 }
        ]).catch(() => []);

        const allTimeCategoryWatched = allTimeCategoryAgg.map(item => ({
            categoryName: item._id,
            categoryId: item.categoryId,
            totalViews: item.totalViews,
            percentage: totalPostsWatched > 0 ? Math.round((item.totalViews / totalPostsWatched) * 100) : 0
        }));

        // 4. Hourly Views Today (0 to 23)
        const hourlyViewsAgg = await UserView.aggregate([
            { $match: { createdAt: { $gte: startOfDay, $lte: endOfDay } } },
            {
                $group: {
                    _id: { $hour: { date: "$createdAt", timezone: "+05:30" } },
                    count: { $sum: 1 }
                }
            },
            { $sort: { _id: 1 } }
        ]).catch(() => []);

        const hourlyMap = {};
        hourlyViewsAgg.forEach(h => { hourlyMap[h._id] = h.count; });
        const todayHourlyViews = Array.from({ length: 24 }, (_, i) => ({
            hour: `${i.toString().padStart(2, "0")}:00`,
            hourNum: i,
            views: hourlyMap[i] || 0
        }));

        // 5. Top watched posts today
        const topWatchedPostsAgg = await UserView.aggregate([
            { $match: { createdAt: { $gte: startOfDay, $lte: endOfDay } } },
            {
                $group: {
                    _id: "$feedId",
                    viewsToday: { $sum: 1 },
                    totalDuration: { $sum: "$watchDuration" }
                }
            },
            { $sort: { viewsToday: -1 } },
            { $limit: 8 },
            {
                $lookup: {
                    from: "Feeds",
                    localField: "_id",
                    foreignField: "_id",
                    as: "feed"
                }
            },
            { $unwind: { path: "$feed", preserveNullAndEmptyArrays: true } },
            {
                $lookup: {
                    from: "Categories",
                    localField: "feed.category",
                    foreignField: "_id",
                    as: "feedCategories"
                }
            }
        ]).catch(() => []);

        const topWatchedPostsToday = topWatchedPostsAgg.map(item => ({
            feedId: item._id,
            viewsToday: item.viewsToday,
            watchDuration: item.totalDuration || 0,
            title: item.feed?.title || item.feed?.caption || "Untitled Post",
            type: item.feed?.postType || "image",
            category: item.feedCategories && item.feedCategories[0]?.name ? item.feedCategories[0].name : "General",
            mediaUrl: getMediaUrl(item.feed?.mediaUrl || (item.feed?.files && item.feed?.files[0]?.url))
        }));

        // 6. Top watched posts all-time
        const topWatchedAllTimeAgg = await UserView.aggregate([
            {
                $group: {
                    _id: "$feedId",
                    totalViews: { $sum: 1 },
                    totalDuration: { $sum: "$watchDuration" }
                }
            },
            { $sort: { totalViews: -1 } },
            { $limit: 8 },
            {
                $lookup: {
                    from: "Feeds",
                    localField: "_id",
                    foreignField: "_id",
                    as: "feed"
                }
            },
            { $unwind: { path: "$feed", preserveNullAndEmptyArrays: true } },
            {
                $lookup: {
                    from: "Categories",
                    localField: "feed.category",
                    foreignField: "_id",
                    as: "feedCategories"
                }
            }
        ]).catch(() => []);

        const topWatchedPostsAllTime = topWatchedAllTimeAgg.map(item => ({
            feedId: item._id,
            totalViews: item.totalViews,
            watchDuration: item.totalDuration || 0,
            title: item.feed?.title || item.feed?.caption || "Untitled Post",
            type: item.feed?.postType || "image",
            category: item.feedCategories && item.feedCategories[0]?.name ? item.feedCategories[0].name : "General",
            mediaUrl: getMediaUrl(item.feed?.mediaUrl || (item.feed?.files && item.feed?.files[0]?.url))
        }));

        return res.status(200).json({
            success: true,
            totalPostsWatched,
            todayPostsWatched,
            todayUniqueUsersWatched,
            totalWatchHours: Number(totalWatchHours) || 0,
            todayWatchHours: Number(todayWatchHours) || 0,
            todayCategoryWatched,
            allTimeCategoryWatched,
            todayHourlyViews,
            topWatchedPostsToday,
            topWatchedPostsAllTime
        });
    } catch (err) {
        console.error("Error in getWatchAnalyticsAdmin:", err);
        return res.status(500).json({ success: false, message: "Error fetching watch analytics", error: err.message });
    }
};

/**
 * 📊 GET /api/admin/analytics/view-logs
 * Paginated stream/log of user feed views with search & category filtering
 */
exports.getUserViewFeedsLog = async (req, res) => {
    try {
        const {
            page = 1,
            limit = 20,
            search = "",
            categoryId,
            postType,
            dateRange = "all",
            startDate,
            endDate
        } = req.query;

        const skip = (parseInt(page) - 1) * parseInt(limit);
        const matchQuery = {};

        // Date range filter
        const now = new Date();
        if (dateRange === "today") {
            const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
            const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
            matchQuery.createdAt = { $gte: startOfDay, $lte: endOfDay };
        } else if (dateRange === "yesterday") {
            const yStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 0, 0, 0, 0);
            const yEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 23, 59, 59, 999);
            matchQuery.createdAt = { $gte: yStart, $lte: yEnd };
        } else if (dateRange === "7days") {
            const past7 = new Date();
            past7.setDate(past7.getDate() - 7);
            matchQuery.createdAt = { $gte: past7 };
        } else if (dateRange === "30days") {
            const past30 = new Date();
            past30.setDate(past30.getDate() - 30);
            matchQuery.createdAt = { $gte: past30 };
        } else if (startDate || endDate) {
            matchQuery.createdAt = {};
            if (startDate) matchQuery.createdAt.$gte = new Date(startDate);
            if (endDate) matchQuery.createdAt.$lte = new Date(endDate);
        }

        if (postType && postType !== "all") {
            matchQuery.postType = postType;
        }

        if (categoryId && categoryId !== "all") {
            matchQuery.categoryId = new mongoose.Types.ObjectId(categoryId);
        }

        // Pipeline with lookups for search across user & feed
        const pipeline = [
            { $match: matchQuery },
            { $sort: { createdAt: -1 } },
            {
                $lookup: {
                    from: "Users",
                    localField: "userId",
                    foreignField: "_id",
                    as: "user"
                }
            },
            { $unwind: { path: "$user", preserveNullAndEmptyArrays: true } },
            {
                $lookup: {
                    from: "ProfileSettings",
                    localField: "userId",
                    foreignField: "userId",
                    as: "profileSettings"
                }
            },
            { $unwind: { path: "$profileSettings", preserveNullAndEmptyArrays: true } },
            {
                $lookup: {
                    from: "Feeds",
                    localField: "feedId",
                    foreignField: "_id",
                    as: "feed"
                }
            },
            { $unwind: { path: "$feed", preserveNullAndEmptyArrays: true } },
            {
                $lookup: {
                    from: "Categories",
                    localField: "categoryId",
                    foreignField: "_id",
                    as: "categoryDoc"
                }
            },
            { $unwind: { path: "$categoryDoc", preserveNullAndEmptyArrays: true } }
        ];

        // If search query is provided
        if (search && search.trim()) {
            const regex = new RegExp(search.trim(), "i");
            pipeline.push({
                $match: {
                    $or: [
                        { "user.userName": regex },
                        { "user.email": regex },
                        { "profileSettings.name": regex },
                        { "feed.title": regex },
                        { "feed.caption": regex },
                        { "categoryDoc.name": regex },
                        { "categoryDoc.categoriesName": regex }
                    ]
                }
            });
        }

        // Count total matching records
        const countPipeline = [...pipeline, { $count: "total" }];
        const countResult = await UserView.aggregate(countPipeline).catch(() => []);
        const totalRecords = countResult[0]?.total || 0;

        // Paginate and project
        pipeline.push({ $skip: skip });
        pipeline.push({ $limit: parseInt(limit) });
        pipeline.push({
            $project: {
                _id: 1,
                viewId: "$_id",
                watchDuration: { $ifNull: ["$watchDuration", 0] },
                postType: { $ifNull: ["$postType", "$feed.postType", "image"] },
                deviceType: { $ifNull: ["$deviceType", "web"] },
                ipAddress: 1,
                viewedAt: "$createdAt",
                user: {
                    _id: "$user._id",
                    userName: { $ifNull: ["$user.userName", "$profileSettings.name", "Anonymous Viewer"] },
                    email: { $ifNull: ["$user.email", "N/A"] },
                    profileAvatar: "$profileSettings.profileAvatar"
                },
                feed: {
                    _id: "$feed._id",
                    title: { $ifNull: ["$feed.title", "$feed.caption", "Post"] },
                    postType: { $ifNull: ["$feed.postType", "$postType", "image"] },
                    mediaUrl: {
                        $ifNull: [
                            "$feed.mediaUrl",
                            { $arrayElemAt: ["$feed.files.url", 0] }
                        ]
                    }
                },
                category: {
                    _id: "$categoryDoc._id",
                    name: { $ifNull: ["$categoryDoc.categoriesName", { $ifNull: ["$categoryDoc.name", "General"] }] }
                }
            }
        });

        const rawViews = await UserView.aggregate(pipeline);

        const views = rawViews.map(v => ({
            ...v,
            feed: {
                ...v.feed,
                mediaUrl: getMediaUrl(v.feed?.mediaUrl)
            },
            user: {
                ...v.user,
                profileAvatar: getMediaUrl(v.user?.profileAvatar)
            }
        }));

        return res.status(200).json({
            success: true,
            total: totalRecords,
            page: parseInt(page),
            totalPages: Math.ceil(totalRecords / parseInt(limit)),
            limit: parseInt(limit),
            views
        });
    } catch (err) {
        console.error("Error in getUserViewFeedsLog:", err);
        return res.status(500).json({ success: false, message: "Error fetching view logs", error: err.message });
    }
};

/**
 * 📊 GET /api/admin/analytics/category-views
 * Detailed category view distribution & statistics
 */
exports.getCategoryViewsAnalytics = async (req, res) => {
    try {
        const now = new Date();
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
        const past7Days = new Date();
        past7Days.setDate(past7Days.getDate() - 7);
        const past30Days = new Date();
        past30Days.setDate(past30Days.getDate() - 30);

        const categoryStats = await Category.aggregate([
            {
                $lookup: {
                    from: "UserViews",
                    localField: "_id",
                    foreignField: "categoryId",
                    as: "allViews"
                }
            },
            {
                $lookup: {
                    from: "Feeds",
                    localField: "_id",
                    foreignField: "category",
                    as: "feeds"
                }
            },
            {
                $project: {
                    _id: 1,
                    name: { $ifNull: ["$categoriesName", "$name"] },
                    totalFeeds: { $size: "$feeds" },
                    totalViews: { $size: "$allViews" },
                    todayViews: {
                        $size: {
                            $filter: {
                                input: "$allViews",
                                as: "v",
                                cond: { $gte: ["$$v.createdAt", startOfDay] }
                            }
                        }
                    },
                    past7DaysViews: {
                        $size: {
                            $filter: {
                                input: "$allViews",
                                as: "v",
                                cond: { $gte: ["$$v.createdAt", past7Days] }
                            }
                        }
                    },
                    past30DaysViews: {
                        $size: {
                            $filter: {
                                input: "$allViews",
                                as: "v",
                                cond: { $gte: ["$$v.createdAt", past30Days] }
                            }
                        }
                    },
                    totalWatchDuration: {
                        $sum: "$allViews.watchDuration"
                    }
                }
            },
            { $sort: { totalViews: -1 } }
        ]).catch(() => []);

        return res.status(200).json({
            success: true,
            categories: categoryStats
        });
    } catch (err) {
        console.error("Error in getCategoryViewsAnalytics:", err);
        return res.status(500).json({ success: false, message: "Error fetching category views analytics", error: err.message });
    }
};

exports.getUsersWillingToPost = async (req, res) => {
    try {
        const users = await User.aggregate([
            { $match: { allowToPost: { $in: ["interest", "allow"] }, isActive: true, isBlocked: false } },
            { $lookup: { from: "ProfileSettings", localField: "_id", foreignField: "userId", as: "profileSettings" } },
            { $unwind: { path: "$profileSettings", preserveNullAndEmptyArrays: true } },
            {
                $project: {
                    _id: 1,
                    userName: 1,
                    email: 1,
                    roles: 1,
                    allowToPost: 1,
                    isActive: 1,
                    createdAt: 1,
                    lastActiveAt: 1,
                    subscription: { isActive: "$subscription.isActive" },
                    profile: {
                        name: "$profileSettings.name",
                        profileAvatar: "$profileSettings.profileAvatar",
                        isPublished: "$profileSettings.isPublished"
                    },
                },
            },
            { $sort: { createdAt: -1 } },
        ]);
        return res.status(200).json({ success: true, total: users.length, users });
    } catch (error) {
        console.error("❌ GET USERS WILLING TO POST ERROR:", error);
        return res.status(500).json({ success: false, message: "Failed to fetch users" });
    }
};

exports.updateUserPostPermission = async (req, res) => {
    try {
        const { userId } = req.params;
        const { allowToPost } = req.body;
        await User.findByIdAndUpdate(userId, { allowToPost });
        res.status(200).json({ success: true, message: "User post permission updated" });
    } catch (error) {
        res.status(500).json({ success: false, message: "Failed to update user post permission" });
    }
};

exports.removeFeedCategory = async (req, res) => {
    try {
        const { feedId, categoryId } = req.params;

        if (!feedId || !categoryId) {
            return res.status(400).json({ success: false, message: "feedId and categoryId are required" });
        }

        // Remove category from feed
        const updatedFeed = await Feed.findByIdAndUpdate(
            feedId,
            { 
              $pull: { category: categoryId },
              $unset: { subCategory: "" } 
            },
            { new: true }
        );

        if (!updatedFeed) {
            return res.status(404).json({ success: false, message: "Feed not found" });
        }

        // Remove feed from category's feedIds array
        await Category.findByIdAndUpdate(
            categoryId,
            { $pull: { feedIds: feedId } }
        );

        // 🟢 Invalidate User Feeds Cache
        await clearFeedsCache();

        res.status(200).json({ success: true, message: "Category removed from feed successfully" });
    } catch (error) {
        console.error("❌ REMOVE FEED CATEGORY ERROR:", error);
        res.status(500).json({ success: false, message: "Internal server error" });
    }
};

exports.updateFeedCategory = async (req, res) => {
    try {
        const { feedId } = req.params;
        const { categoryId, subCategory } = req.body;

        if (!feedId) {
            return res.status(400).json({ success: false, message: "feedId is required" });
        }

        const currentFeed = await Feed.findById(feedId);
        if (!currentFeed) {
            return res.status(404).json({ success: false, message: "Feed not found" });
        }

        const cleanSubCategory = subCategory !== undefined 
            ? (subCategory && String(subCategory).trim() ? String(subCategory).trim() : null)
            : undefined;

        const updateData = {};
        if (categoryId) {
            updateData.category = [categoryId]; // Assuming one main category is selected for simplicity, or we replace the array
        }
        if (cleanSubCategory !== undefined) {
            updateData.subCategory = cleanSubCategory;
        }

        const updatedFeed = await Feed.findByIdAndUpdate(
            feedId,
            { $set: updateData },
            { new: true }
        );

        if (!updatedFeed) {
            return res.status(404).json({ success: false, message: "Feed not found" });
        }

        if (categoryId) {
            const oldCategoryIds = (currentFeed.category || []).map(id => id.toString());
            const newCatIdStr = categoryId.toString();
            const catsToRemoveFrom = oldCategoryIds.filter(id => id !== newCatIdStr);

            if (catsToRemoveFrom.length > 0) {
                await Category.updateMany(
                    { _id: { $in: catsToRemoveFrom } },
                    { $pull: { feedIds: feedId } }
                );
            }

            const catUpdate = { $addToSet: { feedIds: feedId } };
            if (cleanSubCategory) {
                catUpdate.$addToSet.subcategories = cleanSubCategory;
            }

            await Category.findByIdAndUpdate(categoryId, catUpdate);
        }

        await clearFeedsCache();

        res.status(200).json({ success: true, message: "Feed category updated successfully", feed: updatedFeed });
    } catch (error) {
        console.error("❌ UPDATE FEED CATEGORY ERROR:", error);
        res.status(500).json({ success: false, message: "Internal server error" });
    }
};

exports.updateFeedSchedule = async (req, res) => {
    try {
        const { feedId } = req.params;
        const { scheduleTime } = req.body;

        if (!scheduleTime) {
            return res.status(400).json({ success: false, message: "scheduleTime is required" });
        }

        const parsedDate = new Date(scheduleTime);
        if (isNaN(parsedDate.getTime())) {
            return res.status(400).json({ success: false, message: "Invalid date format" });
        }

        const feed = await Feed.findById(feedId);
        if (!feed) {
            return res.status(404).json({ success: false, message: "Feed not found" });
        }

        // 1. Update Feed Record
        feed.scheduleDate = parsedDate;
        feed.isScheduled = true;
        feed.status = "scheduled"; // Ensure it's marked as scheduled
        await feed.save();

        // 🟢 Invalidate User Feeds Cache
        await clearFeedsCache();

        // 2. Reschedule Bull Job
        const jobId = `feed-publish-${feedId}`;
        const oldJob = await feedPostQueue.getJob(jobId);
        if (oldJob) {
            await oldJob.remove();
            console.log(`🗑️ Removed old publish job for feed ${feedId}`);
        }

        const delayMs = parsedDate.getTime() - Date.now();
        await feedPostQueue.add(
            { feedId: feed._id.toString() },
            {
                delay: Math.max(0, delayMs),
                jobId: jobId,
                removeOnComplete: true,
                attempts: 3,
                backoff: { type: 'exponential', delay: 5000 }
            }
        );

        console.log(`⏰ Rescheduled feed ${feedId} for ${parsedDate.toISOString()} (delay: ${Math.round(delayMs / 1000)}s)`);

        return res.status(200).json({
            success: true,
            message: "Feed schedule updated successfully",
            newSchedule: parsedDate
        });
    } catch (error) {
        console.error("❌ UPDATE FEED SCHEDULE ERROR:", error);
        return res.status(500).json({ success: false, message: "Failed to update schedule" });
    }
};
