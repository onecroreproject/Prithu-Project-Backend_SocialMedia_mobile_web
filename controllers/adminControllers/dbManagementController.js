const { prithuDB } = require('../../database');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const AdminAuditLog = require('../../models/adminModels/AdminAuditLog');

/**
 * Get MongoDB Statistics
 */
exports.getDatabaseStats = async (req, res) => {
    try {
        if (!prithuDB.db) {
            return res.status(500).json({ success: false, message: "Database connection not fully initialized" });
        }
        const db = prithuDB.db;
        const stats = await db.stats();

        // Get collection-wise stats for more detail using collStats command
        const collections = await db.listCollections().toArray();
        const collectionStats = await Promise.all(collections.map(async (col) => {
            try {
                const cStats = await db.command({ collStats: col.name });
                return {
                    name: col.name,
                    count: cStats.count,
                    size: (cStats.size / (1024 * 1024)).toFixed(2) + " MB",
                    storageSize: (cStats.storageSize / (1024 * 1024)).toFixed(2) + " MB"
                };
            } catch (err) {
                // Some collections might not support stats (e.g., system collections in some states)
                return { name: col.name, count: 0, size: "0 MB", storageSize: "0 MB" };
            }
        }));

        res.status(200).json({
            success: true,
            data: {
                dbName: stats.db,
                collections: stats.collections,
                objects: stats.objects,
                avgObjSize: (stats.avgObjSize / 1024).toFixed(2) + " KB",
                dataSize: (stats.dataSize / (1024 * 1024)).toFixed(2) + " MB",
                storageSize: (stats.storageSize / (1024 * 1024)).toFixed(2) + " MB",
                indexes: stats.indexes,
                indexSize: (stats.indexSize / (1024 * 1024)).toFixed(2) + " MB",
                collectionDetails: collectionStats.sort((a, b) => parseFloat(b.size) - parseFloat(a.size)).slice(0, 10) // Top 10
            }
        });
    } catch (err) {
        console.error("❌ DB Stats Error:", err);
        res.status(500).json({ success: false, message: "Error fetching database stats" });
    }
};

/**
 * Trigger Database Backup
 */
exports.triggerBackup = async (req, res) => {
    const admin = req.admin || req.user; // Depends on auth middleware
    const backupDir = path.resolve(__dirname, '../../../backups');

    if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `backup-${timestamp}`;
    const filePath = path.join(backupDir, fileName);

    // Command: mongodump --uri="connectionString" --out=filePath
    // We'll use a simplified version assuming mongodump is in PATH
    const dbUri = process.env.MONGODB_URI || mongoose.connection.client.s.url;
    const cmd = `mongodump --uri="${dbUri}" --out="${filePath}"`;

    exec(cmd, async (error, stdout, stderr) => {
        const status = error ? 'Failure' : 'Success';

        // Log the action
        await AdminAuditLog.create({
            adminId: admin._id,
            adminModel: admin.role === 'Admin' ? 'Admin' : 'Child_Admin',
            action: 'DB_BACKUP',
            target: `database:${mongoose.connection.name}`,
            description: error ? `Backup failed: ${error.message}` : `Manual backup created: ${fileName}`,
            status: status,
            ipAddress: req.ip,
            metadata: { fileName, path: filePath }
        });

        if (error) {
            console.error("❌ Backup Error:", error);
            return res.status(500).json({ success: false, message: "Backup failed", error: stderr });
        }

        res.status(200).json({
            success: true,
            message: "Backup completed successfully",
            data: { fileName, location: "/backups" }
        });
    });
};
