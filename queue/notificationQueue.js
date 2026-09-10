// r:\Suriya.DLK\newProject\be\queue\notificationQueue.js
const createQueue = require("../queue.js");
const User = require("../models/userModels/userModel");
const Notification = require("../models/notificationModel");
const { sendFCMNotification } = require("../middlewares/helper/fcmNotificationhelper");
const { getIO } = require("../middlewares/webSocket");

const notificationQueue = createQueue("notifications-broadcast");

notificationQueue.process("BROADCAST_NEW_FEED", async (job) => {
    const { feedId, title, message, image, senderId } = job.data;
    console.log(`🚀 Starting mass broadcast for feed: ${feedId}`);

    let processedCount = 0;
    let batchSize = 1000; // Efficient batch size for MongoDB and FCM
    let lastUserId = null;

    try {
        const io = getIO();

        while (true) {
            // 1. Fetch users in batches using a cursor-like approach for scale
            const query = lastUserId ? { _id: { $gt: lastUserId }, isActive: true, isBlocked: false } : { isActive: true, isBlocked: false };
            const users = await User.find(query)
                .sort({ _id: 1 })
                .limit(batchSize)
                .select("_id fcmTokens userName")
                .lean();

            if (!users.length) break;

            lastUserId = users[users.length - 1]._id;

            // 2. Prepare notifications for bulk insert
            const notificationsToInsert = users.map(user => ({
                senderId,
                receiverId: user._id,
                senderRoleRef: "Admin",
                receiverRoleRef: "User",
                type: "NEW_FEED",
                title,
                message: message.replace("${username}", user.userName || "user"),
                entityId: feedId,
                entityType: "Feed",
                image,
                isRead: false
            }));

            // 3. Batch DB insert
            await Notification.insertMany(notificationsToInsert);

            // 4. Batch FCM sending (Async to avoid blocking the loop)
            users.forEach(user => {
                if (user.fcmTokens?.length) {
                    user.fcmTokens.forEach(t => {
                        if (t?.token) {
                            sendFCMNotification(
                                t.token,
                                title,
                                message.replace("${username}", user.userName || "user"),
                                image
                            ).catch(err => console.error(`FCM failed for ${user._id}:`, err.message));
                        }
                    });
                }
            });

            // 5. Lean Socket "Pulse" (one per batch to start, or per user if online)
            // For massive scale, we'd only emit to online users.
            if (io) {
                users.forEach(user => {
                    // Check if user is in a socket room (if tracking online status)
                    // For now, simpler broadcast pulse to the user's specific room
                    io.to(user._id.toString()).emit("notification_pulse", {
                        type: "NEW_FEED",
                        increment: 1,
                        thumbnail: image
                    });
                });
            }

            processedCount += users.length;
            console.log(`⏳ Broadcast Progress: ${processedCount} users notified...`);
        }

        console.log(`✅ Broadcast complete. Notified ${processedCount} users for feed ${feedId}`);
    } catch (err) {
        console.error(`❌ Mass broadcast failed:`, err.message);
        throw err;
    }
});

notificationQueue.on("completed", (job) => console.log(`✅ Job ${job.id} completed`));
notificationQueue.on("failed", (job, err) => console.error(`❌ Job ${job.id} failed:`, err.message));

module.exports = notificationQueue;
