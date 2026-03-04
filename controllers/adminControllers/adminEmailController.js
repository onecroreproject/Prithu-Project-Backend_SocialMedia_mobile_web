const fs = require("fs");
const path = require("path");
const User = require("../../models/userModels/userModel");
const promotionalEmailQueue = require("../../queue/promotionalEmailQueue");
const { triggerTaskManually } = require("../../corn/index");
const redisClient = require("../../config/redisConfig");

const BASE_TEMPLATE_DIR = path.join(__dirname, "../../utils/templates");
const CAMPAIGN_PAUSE_KEY = "promo_campaign_paused";

/**
 * Utility to get all files recursively
 */
const getAllFiles = (dirPath, arrayOfFiles) => {
    const files = fs.readdirSync(dirPath);
    arrayOfFiles = arrayOfFiles || [];

    files.forEach(file => {
        if (fs.statSync(dirPath + "/" + file).isDirectory()) {
            arrayOfFiles = getAllFiles(dirPath + "/" + file, arrayOfFiles);
        } else if (file.endsWith(".html")) {
            const fullPath = path.join(dirPath, file);
            const relativePath = path.relative(BASE_TEMPLATE_DIR, fullPath);
            const stats = fs.statSync(fullPath);
            arrayOfFiles.push({
                name: file,
                path: relativePath.replace(/\\/g, "/"),
                lastModified: stats.mtime,
                size: stats.size
            });
        }
    });

    return arrayOfFiles;
};

/**
 * Get stats for the Promotional Email Dashboard
 */
exports.getPromoDashboardStats = async (req, res) => {
    try {
        const threeDaysAgo = new Date();
        threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

        const [jobCounts, eligibleCount, isPaused] = await Promise.all([
            promotionalEmailQueue.getJobCounts(),
            User.countDocuments({
                "subscription.isActive": { $ne: true },
                $or: [
                    { lastPromotionalEmailDate: { $exists: false } },
                    { lastPromotionalEmailDate: { $lte: threeDaysAgo } }
                ]
            }),
            redisClient.get(CAMPAIGN_PAUSE_KEY)
        ]);

        res.status(200).json({
            success: true,
            data: {
                queue: jobCounts,
                eligibleUsers: eligibleCount,
                campaignWindowDays: 3,
                isPaused: isPaused === "true"
            }
        });
    } catch (error) {
        console.error("❌ Error fetching promo dashboard stats:", error);
        res.status(500).json({ success: false, message: "Internal Server Error" });
    }
};

/**
 * List all email templates (promotion and general)
 */
exports.getPromotionTemplates = async (req, res) => {
    try {
        if (!fs.existsSync(BASE_TEMPLATE_DIR)) {
            return res.status(200).json({ success: true, data: [] });
        }

        const templates = getAllFiles(BASE_TEMPLATE_DIR);
        res.status(200).json({ success: true, data: templates });
    } catch (error) {
        console.error("❌ Error listing templates:", error);
        res.status(500).json({ success: false, message: "Internal Server Error" });
    }
};

/**
 * Get contents of a specific template
 */
exports.getTemplateContent = async (req, res) => {
    try {
        const { fileName } = req.params; // This will actually be a relative path encoded
        const filePath = path.join(BASE_TEMPLATE_DIR, decodeURIComponent(fileName));

        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ success: false, message: "Template not found" });
        }

        const content = fs.readFileSync(filePath, "utf-8");
        res.status(200).json({ success: true, data: content });
    } catch (error) {
        console.error("❌ Error reading template:", error);
        res.status(500).json({ success: false, message: "Internal Server Error" });
    }
};

/**
 * Save template (Create or Update)
 */
exports.saveTemplate = async (req, res) => {
    try {
        const { fileName, content } = req.body; // fileName is relative path
        if (!fileName || !content) {
            return res.status(400).json({ success: false, message: "Missing fileName or content" });
        }

        const filePath = path.join(BASE_TEMPLATE_DIR, fileName);
        const dirPath = path.dirname(filePath);

        // Ensure directory exists
        if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath, { recursive: true });
        }

        fs.writeFileSync(filePath, content, "utf-8");

        res.status(200).json({ success: true, message: "Template saved successfully" });
    } catch (error) {
        console.error("❌ Error saving template:", error);
        res.status(500).json({ success: false, message: "Internal Server Error" });
    }
};

/**
 * Delete template
 */
exports.deleteTemplate = async (req, res) => {
    try {
        const { fileName } = req.params; // relative path
        const filePath = path.join(BASE_TEMPLATE_DIR, decodeURIComponent(fileName));

        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }

        res.status(200).json({ success: true, message: "Template deleted successfully" });
    } catch (error) {
        console.error("❌ Error deleting template:", error);
        res.status(500).json({ success: false, message: "Internal Server Error" });
    }
};

/**
 * Trigger Promotional Batch Manually
 */
exports.triggerManualBatch = async (req, res) => {
    try {
        const result = await triggerTaskManually("promotional_campaign");
        res.status(200).json({
            success: true,
            message: "Promotional campaign batch triggered",
            processed: result.processed
        });
    } catch (error) {
        console.error("❌ Error triggering campaign:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Toggle Campaign Paused Status
 */
exports.toggleCampaignStatus = async (req, res) => {
    try {
        const { pause } = req.body;
        await redisClient.set(CAMPAIGN_PAUSE_KEY, pause ? "true" : "false");

        res.status(200).json({
            success: true,
            message: `Campaign ${pause ? 'paused' : 'resumed'} successfully`,
            isPaused: pause
        });
    } catch (error) {
        console.error("❌ Error toggling campaign status:", error);
        res.status(500).json({ success: false, message: "Internal Server Error" });
    }
};
