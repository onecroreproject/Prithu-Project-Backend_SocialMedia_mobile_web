const { taskRegistry, triggerTaskManually } = require('../../corn/index');
const AdminAuditLog = require('../../models/adminModels/AdminAuditLog');

/**
 * Get all Cron tasks metadata
 * GET /api/admin/cron/status
 */
exports.getCronStatus = async (req, res) => {
    try {
        // Enrich registry with dynamic status if needed (future: add last_run tracking)
        const crons = taskRegistry.map(task => ({
            id: task.id,
            name: task.name,
            schedule: task.schedule,
            description: task.description
        }));

        res.status(200).json({ success: true, data: crons });
    } catch (err) {
        res.status(500).json({ success: false, message: "Failed to fetch cron status" });
    }
};

/**
 * Manually trigger a cron task
 * POST /api/admin/cron/trigger
 */
exports.triggerCron = async (req, res) => {
    const { taskId } = req.body;
    const admin = req.admin || req.user;

    if (!taskId) return res.status(400).json({ success: false, message: "Task ID required" });

    try {
        const task = taskRegistry.find(t => t.id === taskId);
        if (!task) return res.status(404).json({ success: false, message: "Task not found" });

        // Trigger action
        await triggerTaskManually(taskId);

        // Audit Log
        await AdminAuditLog.create({
            adminId: admin._id,
            adminModel: admin.role === 'Admin' ? 'Admin' : 'Child_Admin',
            action: 'CRON_MANUAL_TRIGGER',
            target: `cron:${taskId}`,
            description: `Manually triggered cron task: ${task.name}`,
            status: 'Success',
            ipAddress: req.ip
        });

        res.status(200).json({ success: true, message: `Task '${task.name}' triggered successfully` });
    } catch (err) {
        console.error("Cron manual trigger error:", err);
        res.status(500).json({ success: false, message: err.message || "Failed to trigger task" });
    }
};

/**
 * Get ML Metadata Analysis stats
 * GET /api/admin/ml-metadata/stats
 */
exports.getMLMetadataStats = async (req, res) => {
    try {
        const Feed = require("../../models/feedModel");
        const mlMetadataQueue = require("../../queue/mlMetadataQueue");

        const [total, analyzed, pending, failed, processing] = await Promise.all([
            Feed.countDocuments({ isDeleted: false, status: "published" }),
            Feed.countDocuments({ isDeleted: false, status: "published", "mlMetadata.analyzed": true, "mlMetadata.aiVersion": { $gte: 2 } }),
            Feed.countDocuments({ isDeleted: false, status: "published", $or: [{ "mlMetadata.analyzed": { $ne: true } }, { "mlMetadata.aiVersion": { $lt: 2 } }, { "mlMetadata": { $exists: false } }] }),
            Feed.countDocuments({ isDeleted: false, status: "published", "mlMetadata.processingStatus": "failed" }),
            Feed.countDocuments({ isDeleted: false, status: "published", "mlMetadata.processingStatus": "processing" })
        ]);

        const waitingCount = await mlMetadataQueue.getWaitingCount();
        const activeCount = await mlMetadataQueue.getActiveCount();
        const isPaused = await mlMetadataQueue.isPaused();

        res.status(200).json({
            success: true,
            stats: {
                total,
                analyzed,
                pending,
                failed,
                processing,
                queue: {
                    waiting: waitingCount,
                    active: activeCount,
                    isPaused
                }
            }
        });
    } catch (err) {
        console.error("Get ML stats error:", err);
        res.status(500).json({ success: false, message: "Failed to fetch ML stats" });
    }
};

/**
 * Toggle ML Metadata Queue (Pause/Resume)
 * POST /api/admin/ml-metadata/toggle
 */
exports.toggleMLMetadataQueue = async (req, res) => {
    try {
        const mlMetadataQueue = require("../../queue/mlMetadataQueue");
        const isPaused = await mlMetadataQueue.isPaused();

        if (isPaused) {
            await mlMetadataQueue.resume();
        } else {
            await mlMetadataQueue.pause();
        }

        res.status(200).json({
            success: true,
            message: isPaused ? "ML Analysis service STARTED" : "ML Analysis service STOPPED",
            isPaused: !isPaused
        });
    } catch (err) {
        console.error("Toggle ML queue error:", err);
        res.status(500).json({ success: false, message: "Failed to toggle ML service" });
    }
};
