const User = require("../models/userModels/userModel"); // prithuDB
const Feed = require("../models/feedModel");
const UserFeedActions = require("../models/userFeedInterSectionModel.js");


exports.getMainBoardStats = async (req, res) => {
    try {
        const [
            totalUsers,
            totalTemplates,
            shareAgg
        ] = await Promise.all([
            // 👤 Users
            User.countDocuments({ isActive: true, isBlocked: false }),

            // 🎨 Templates
            Feed.countDocuments({ uploadType: 'template', status: 'published', isDeleted: false }),

            // 🚀 Total Shares
            UserFeedActions.aggregate([
                { $project: { shareCount: { $size: { $ifNull: ["$sharedFeeds", []] } } } },
                { $group: { _id: null, total: { $sum: "$shareCount" } } }
            ])
        ]);

        return res.status(200).json({
            success: true,
            data: {
                totalUsers: totalUsers || 0,
                totalTemplates: totalTemplates || 0,
                totalShares: shareAgg[0]?.total || 0
            },
        });
    } catch (error) {
        console.error("❌ Dashboard stats error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to fetch dashboard statistics",
        });
    }
};
