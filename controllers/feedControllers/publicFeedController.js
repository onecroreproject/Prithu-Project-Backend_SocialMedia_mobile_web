const Feed = require('../../models/feedModel');
const mongoose = require("mongoose");
const { getMediaUrl } = require("../../utils/storageEngine");
const redisClient = require('../../Config/redisConfig');


/**
 * Get feeds for public landing page (unauthenticated)
 */
exports.getAllPublicFeeds = async (req, res) => {
    try {
        const page = Math.max(1, Number(req.query.page || 1));
        const limit = Math.max(1, Math.min(50, Number(req.query.limit || 10)));
        const { categoryId, postType, random } = req.query;

        // 🟢 Caching Logic (Only for non-random, standardized requests)
        const cacheKey = `public_feeds:${categoryId || 'all'}:${postType || 'all'}:${page}:${limit}`;
        if (random !== 'true' && redisClient && redisClient.status === 'ready') {
            try {
                const cachedData = await redisClient.get(cacheKey);
                if (cachedData) {
                    return res.status(200).json(JSON.parse(cachedData));
                }
            } catch (err) {
                console.warn("⚠️ Redis Get Error:", err.message);
            }
        }


        const now = new Date();
        const matchStage = {
            isApproved: true,
            isDeleted: false,
            audience: "public", // 🔒 Only public-intent posts
            // ✅ Visibility rule: only return feeds that are currently live
            //   • status='published' + not scheduled → always visible
            //   • status='published' + scheduled + scheduleDate elapsed → visible
            //   • status='scheduled' + future date → HIDDEN (never returned to users)
            $or: [
                { status: "published", isScheduled: { $ne: true } },
                {
                    status: "published",
                    isScheduled: true,
                    scheduleDate: { $lte: now }
                }
            ]
        };

        if (categoryId) {
            matchStage.category = new mongoose.Types.ObjectId(categoryId);
        }

        if (postType) {
            if (postType === 'image') {
                matchStage.postType = { $in: ['image', 'image+audio'] };
            } else {
                matchStage.postType = postType;
            }
        }

        let pipeline = [
            { $match: matchStage },
        ];

        // 🟢 Randomization Logic
        if (random === 'true') {
            pipeline.push({ $sample: { size: limit } });
        }

        // Add remaining stages to pipeline
        pipeline.push(
            // Basic lookup for creator info
            { $addFields: { effectiveCreatorId: { $ifNull: ["$postedBy.userId", "$createdByAccount"] } } },
            {
                $lookup: {
                    from: "ProfileSettings",
                    let: { creatorId: "$effectiveCreatorId", role: "$roleRef" },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $or: [
                                        { $and: [{ $eq: ["$$role", "Admin"] }, { $eq: ["$adminId", "$$creatorId"] }] },
                                        { $and: [{ $eq: ["$$role", "Child_Admin"] }, { $eq: ["$childAdminId", "$$creatorId"] }] },
                                        { $and: [{ $eq: ["$$role", "User"] }, { $eq: ["$userId", "$$creatorId"] }] }
                                    ]
                                }
                            }
                        },
                        { $project: { name: 1, userName: 1, profileAvatar: 1, modifyAvatar: 1, privacy: 1, visibility: 1 } }
                    ],
                    as: "creatorProfile"
                }
            },
            { $unwind: { path: "$creatorProfile", preserveNullAndEmptyArrays: true } },

            // 🔒 Join with ProfileVisibility for detailed field-level privacy
            {
                $lookup: {
                    from: "ProfileVisibility",
                    localField: "creatorProfile.visibility",
                    foreignField: "_id",
                    as: "fieldVisibility"
                }
            },
            { $unwind: { path: "$fieldVisibility", preserveNullAndEmptyArrays: true } },

            // 🔒 Privacy Guard: If account is private, omit their content from public landing
            {
                $match: {
                    $or: [
                        { "creatorProfile.privacy": { $exists: false } },
                        { "creatorProfile.privacy": "public" },
                        { roleRef: { $in: ["Admin", "Child_Admin"] } } // Admins/ChildAdmins are always public for landing
                    ]
                }
            }
        );

        // Only use skip/limit if NOT in random mode (aggregate $sample already handles size)
        if (random !== 'true') {
            pipeline.push(
                { $sort: { createdAt: -1 } },
                { $skip: (page - 1) * limit },
                { $limit: limit }
            );
        }

        pipeline.push(
            {
                $addFields: {
                    creatorData: {
                        userName: { $ifNull: ["$creatorProfile.userName", "unknown"] },
                        name: { $ifNull: ["$creatorProfile.name", "User"] },
                        avatar: {
                            $cond: {
                                if: { $eq: ["$fieldVisibility.profileAvatar", "private"] },
                                then: "https://via.placeholder.com/150", // Mask if private
                                else: {
                                    $ifNull: [
                                        "$creatorProfile.modifyAvatar",
                                        "$creatorProfile.profileAvatar",
                                        "https://via.placeholder.com/150"
                                    ]
                                }
                            }
                        }
                    }
                }
            },
            {
                $project: {
                    _id: 1,
                    postType: 1,
                    mediaUrl: 1,
                    caption: 1,
                    creatorData: 1,
                    category: 1,
                    createdAt: 1
                }
            }
        );

        const feeds = await Feed.aggregate(pipeline);


        const enrichedFeeds = feeds.map(feed => ({
            ...feed,
            feedId: feed._id,
            mediaUrl: getMediaUrl(feed.mediaUrl),
            creatorData: {
                ...feed.creatorData,
                avatar: getMediaUrl(feed.creatorData.avatar)
            }
        }));

        const responseData = {
            success: true,
            data: {
                feeds: enrichedFeeds,
                pagination: {
                    page,
                    limit,
                    total: await Feed.countDocuments(matchStage)
                }
            }
        };

        // 🟢 Store in Redis for 5 minutes
        if (random !== 'true' && redisClient && redisClient.status === 'ready') {
            try {
                await redisClient.setex(cacheKey, 300, JSON.stringify(responseData));
            } catch (err) {
                console.warn("⚠️ Redis Set Error:", err.message);
            }
        }

        res.status(200).json(responseData);

    } catch (err) {
        console.error("❌ Public Feed Error:", err.message);
        res.status(500).json({ success: false, message: "Server error" });
    }
};
