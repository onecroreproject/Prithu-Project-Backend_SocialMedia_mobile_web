const ChildAdmin = require("../models/childAdminModel");
const ChildAdminActivity = require("../models/childAdminActivityModel");

const cleanupInactiveSessions = async () => {
    try {
        const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);

        // Find child admins who are online but haven't been active for 2 hours
        const inactiveAdmins = await ChildAdmin.find({
            isOnline: true,
            lastActivityTime: { $lt: twoHoursAgo }
        });

        for (const child of inactiveAdmins) {
            const now = new Date();

            // Create new offline record starting now
            await ChildAdminActivity.create({
                childAdminId: child._id,
                date: now.toISOString().split('T')[0],
                offlineFrom: now,
                loginTime: now,
                status: "Offline"
            });

            child.isOnline = false;
            child.lastLogoutTime = now;
            child.currentSessionId = null;
            await child.save();

            console.log(`[Session Cleanup] Auto-logged out child admin: ${child.userName} due to inactivity.`);
        }
    } catch (error) {
        console.error("[Session Cleanup] Error during inactive session cleanup:", error);
    }
};

module.exports = cleanupInactiveSessions;
