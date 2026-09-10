const mongoose = require("mongoose");
const { prithuDB } = require("../../database");

const adminAuditLogSchema = new mongoose.Schema(
    {
        adminId: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
            refPath: 'adminModel',
        },
        adminModel: {
            type: String,
            required: true,
            enum: ['Admin', 'Child_Admin'],
        },
        action: {
            type: String,
            required: true, // e.g., "PM2_RESTART", "DB_BACKUP", "LOGS_FLUSH"
        },
        target: {
            type: String,
            required: true, // e.g., "process:main-api", "database:prithuDB"
        },
        description: {
            type: String,
        },
        ipAddress: {
            type: String,
        },
        status: {
            type: String,
            enum: ['Success', 'Failure'],
            default: 'Success',
        },
        metadata: {
            type: mongoose.Schema.Types.Mixed,
        }
    },
    { timestamps: true }
);

module.exports = prithuDB.model("Admin_Audit_Log", adminAuditLogSchema, "AdminAuditLogs");
