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
        const { categoryId: globalCategoryId, categoryIds: globalCategoryIds, language = "en", caption: globalCaption, designData: globalDesignData, scheduleTime: globalScheduleTime, audience = "public", perFileMetadata } = req.body;

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

                const caption = specificMetadata.caption || globalCaption || "";
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
                    caption,
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
                    { $addToSet: { feedIds: savedFeed._id } }
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

                const feedData = {
                    postType: feedType,
                    language: "en",
                    category: categoryIds,
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
                    caption: req.body.caption || "",
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
                        { $addToSet: { feedIds: feed._id } }
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
            feed.designMetadata = { ...feed.designMetadata, ...designMetadata };
        }
        if (editMetadata) {
            feed.editMetadata = { ...feed.editMetadata, ...editMetadata };
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

        // Aggregate statistics
        const statsAgg = await Feed.aggregate([
            { $match: matchQuery },
            {
                $facet: {
                    totalFeeds: [{ $count: "count" }],
                    totalImages: [
                        { $unwind: "$files" },
                        { $match: { "files.type": "image" } },
                        { $count: "count" }
                    ],
                    totalVideos: [
                        { $unwind: "$files" },
                        { $match: { "files.type": "video" } },
                        { $count: "count" }
                    ]
                }
            }
        ]);

        const totalFeeds = statsAgg[0]?.totalFeeds[0]?.count || 0;
        const totalImages = statsAgg[0]?.totalImages[0]?.count || 0;
        const totalVideos = statsAgg[0]?.totalVideos[0]?.count || 0;

        // Fetch feeds
        const feeds = await Feed.find(matchQuery).sort({ createdAt: -1 }).lean();
        
        const results = await Promise.all(
            feeds.map(async (feed) => {
                let profile = null;
                const creatorId = feed.createdByAccount || feed.postedBy?.userId;
                if (feed.roleRef === "Admin") {
                    profile = await ProfileSettings.findOne({ adminId: creatorId }).select("userName profileAvatar").lean();
                } else if (feed.roleRef === "Child_Admin") {
                    profile = await ProfileSettings.findOne({ childAdminId: creatorId }).select("userName profileAvatar").lean();
                } else if (feed.roleRef === "User") {
                    profile = await ProfileSettings.findOne({ userId: creatorId }).select("userName profileAvatar").lean();
                }

                if (profile) {
                    profile.profileAvatar = getMediaUrl(profile.profileAvatar);
                }

                // Fetch category names
                const categoryDetails = await Category.find({ _id: { $in: feed.category || [] } }).select("name").lean();
                const categories = categoryDetails.map(c => ({ id: c._id, name: c.name }));

                return {
                    ...feed,
                    contentUrl: getMediaUrl(feed.mediaUrl || (feed.files && feed.files[0]?.url)),
                    type: feed.postType || "image",
                    creator: profile ? { userName: profile.userName || "Unknown", profileAvatar: profile.profileAvatar || null } : { userName: "Unknown", profileAvatar: null },
                    categories: categories,
                    subCategory: feed.subCategory || null,
                };
            })
        );

        res.status(200).json({ 
            success: true, 
            totalFeeds,
            totalImages,
            totalVideos,
            feeds: results 
        });
    } catch (err) {
        console.error("Error in getAllFeedAdmin:", err);
        res.status(500).json({ success: false, message: "Server error" });
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

        const updateData = {};
        if (categoryId) {
            updateData.category = [categoryId]; // Assuming one main category is selected for simplicity, or we replace the array
        }
        if (subCategory !== undefined) {
            updateData.subCategory = subCategory;
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
            await Category.findByIdAndUpdate(
                categoryId,
                { $addToSet: { feedIds: feedId } }
            );
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
