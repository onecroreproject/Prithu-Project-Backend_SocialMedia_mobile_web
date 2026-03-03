const Update = require('../../models/Update');
const UserUpdateStatus = require('../../models/userModels/userUpdateStatusModel');
const mongoose = require('mongoose');

/**
 * Fetch updates for the current user based on their role
 */
exports.getUpdatesForUser = async (req, res) => {
    try {
        const userId = req.Id;
        const role = req.role || 'User';

        // 1. Fetch active updates matching user's role
        const updates = await Update.find({
            isActive: true,
            targetRole: { $in: ['all', role] }
        }).sort({ createdAt: -1 }).lean();

        // 2. Fetch read status for these updates
        const updateIds = updates.map(u => u._id);
        const readStatuses = await UserUpdateStatus.find({
            userId,
            updateId: { $in: updateIds },
            isRead: true
        }).select('updateId').lean();

        const readUpdateIds = new Set(readStatuses.map(s => s.updateId.toString()));

        // 3. Map read status back to updates
        const enrichedUpdates = updates.map(u => ({
            ...u,
            isRead: readUpdateIds.has(u._id.toString())
        }));

        res.status(200).json({
            success: true,
            updates: enrichedUpdates
        });
    } catch (error) {
        console.error("Get user updates error:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Dynamically calculate unread count
 */
exports.getUnreadCount = async (req, res) => {
    try {
        const userId = req.Id;
        const role = req.role || 'User';

        // Total active updates for this user's role
        const totalMatchingUpdates = await Update.countDocuments({
            isActive: true,
            targetRole: { $in: ['all', role] }
        });

        // Count of updates this user has already read
        const readCount = await UserUpdateStatus.countDocuments({
            userId,
            isRead: true,
            // Only count read records for updates that are still active and match the role
            // This ensures if an update is deactivated or role changed, it doesn't skew the math
            updateId: {
                $in: await Update.find({
                    isActive: true,
                    targetRole: { $in: ['all', role] }
                }).distinct('_id')
            }
        });

        const unreadCount = Math.max(0, totalMatchingUpdates - readCount);

        res.status(200).json({
            success: true,
            unreadCount
        });
    } catch (error) {
        console.error("Get unread count error:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Mark an update as read
 */
exports.markAsRead = async (req, res) => {
    try {
        const { updateId } = req.params;
        const userId = req.Id;

        await UserUpdateStatus.findOneAndUpdate(
            { userId, updateId },
            {
                isRead: true,
                readAt: new Date()
            },
            { upsert: true, new: true }
        );

        res.status(200).json({
            success: true,
            message: "Update marked as read"
        });
    } catch (error) {
        console.error("Mark as read error:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};
