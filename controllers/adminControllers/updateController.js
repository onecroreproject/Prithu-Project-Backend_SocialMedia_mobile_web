const Update = require('../../models/Update');
const { saveFile, getMediaUrl } = require('../../utils/storageEngine');
const fs = require('fs');
const path = require('path');
const { getIO } = require('../../middlewares/webSocket');

/**
 * Helper to delete old media file if it exists and is on the local filesystem
 */
const deleteMediaFile = (mediaUrl) => {
    if (!mediaUrl) return;
    try {
        const urlObj = new URL(mediaUrl);
        const relativePath = urlObj.pathname; // e.g. /media/updates/filename.png
        if (relativePath.startsWith('/media/')) {
            const fsPath = path.join(__dirname, '../../', relativePath);
            if (fs.existsSync(fsPath)) {
                fs.unlinkSync(fsPath);
            }
        }
    } catch (err) {
        console.error("Failed to delete media file:", err.message);
    }
};

exports.createUpdate = async (req, res) => {
    try {
        const { title, description, targetRole } = req.body;
        const adminId = req.Id;
        const file = req.file;

        let mediaUrl = null;
        if (file) {
            const savedMedia = await saveFile(file, { type: 'update' });
            mediaUrl = savedMedia.url;
        }

        const newUpdate = new Update({
            title,
            description,
            targetRole: targetRole || 'all',
            media: mediaUrl,
            createdBy: adminId
        });

        await newUpdate.save();

        // Real-time notification via Socket.io
        const io = getIO();
        if (io) {
            // targetRole could be 'all', 'User', 'Admin', 'Child_Admin'
            // Rooms are joined by role in webSocket.js (to be updated)
            const room = targetRole === 'all' ? null : targetRole;

            const payload = {
                updateId: newUpdate._id,
                title: newUpdate.title,
                targetRole: newUpdate.targetRole
            };

            if (room) {
                io.to(room).emit('new-update', payload);
            } else {
                io.emit('new-update', payload);
            }
        }

        res.status(201).json({
            success: true,
            message: "Update created successfully",
            update: newUpdate
        });
    } catch (error) {
        console.error("Create update error:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.getAllUpdatesAdmin = async (req, res) => {
    try {
        const updates = await Update.find().sort({ createdAt: -1 });
        res.status(200).json({ success: true, updates });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.updateUpdate = async (req, res) => {
    try {
        const { id } = req.params;
        const { title, description, targetRole, isActive } = req.body;
        const file = req.file;

        const update = await Update.findById(id);
        if (!update) {
            return res.status(404).json({ success: false, message: "Update not found" });
        }

        if (title) update.title = title;
        if (description) update.description = description;
        if (targetRole) update.targetRole = targetRole;
        if (isActive !== undefined) update.isActive = isActive;

        if (file) {
            // Delete old media if it exists
            if (update.media) {
                deleteMediaFile(update.media);
            }
            const savedMedia = await saveFile(file, { type: 'update' });
            update.media = savedMedia.url;
        }

        await update.save();

        res.status(200).json({
            success: true,
            message: "Update modified successfully",
            update
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.deleteUpdate = async (req, res) => {
    try {
        const { id } = req.params;
        const update = await Update.findById(id);
        if (!update) {
            return res.status(404).json({ success: false, message: "Update not found" });
        }

        if (update.media) {
            deleteMediaFile(update.media);
        }

        await Update.findByIdAndDelete(id);

        res.status(200).json({ success: true, message: "Update deleted successfully" });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
