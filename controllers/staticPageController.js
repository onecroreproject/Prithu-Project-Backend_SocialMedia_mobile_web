const StaticPage = require("../models/StaticPage");
const { getIO } = require("../middlewares/webSocket");

exports.getPageBySlug = async (req, res) => {
    try {
        const { slug } = req.params;
        const page = await StaticPage.findOne({ slug });

        if (!page) {
            return res.status(404).json({
                success: false,
                message: "Page not found"
            });
        }

        res.status(200).json({
            success: true,
            data: page
        });
    } catch (err) {
        console.error("Get Static Page Error:", err);
        res.status(500).json({
            success: false,
            message: "Server error"
        });
    }
};

exports.updatePageBySlug = async (req, res) => {
    try {
        const { slug } = req.params;
        const { title, content } = req.body;
        const adminId = req.userId;

        let page = await StaticPage.findOne({ slug });

        if (!page) {
            page = new StaticPage({ slug });
        }

        page.title = title || page.title;
        page.content = content || page.content;
        page.lastUpdatedBy = adminId;

        await page.save();

        // Emit socket event for real-time update
        const io = getIO();
        if (io) {
            io.emit("staticPageUpdated", page);
        }

        res.status(200).json({
            success: true,
            message: "Page updated successfully",
            data: page
        });
    } catch (err) {
        console.error("Update Static Page Error:", err);
        res.status(500).json({
            success: false,
            message: "Server error"
        });
    }
};
