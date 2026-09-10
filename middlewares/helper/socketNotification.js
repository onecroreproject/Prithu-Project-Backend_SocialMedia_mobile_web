const { getIO } = require("../webSocket");
const { sendFCMNotification } = require("./fcmNotificationhelper");
const Notification = require("../../models/notificationModel");
const User = require("../../models/userModels/userModel");
const ProfileSettings = require("../../models/profileSettingModel");

// 🔹 Emit socket event safely
exports.broadcastNotification = (receiverId, payload) => {
  try {
    const io = getIO();
    if (io) io.to(receiverId).emit("newNotification", payload);
  } catch (err) {
    console.error("Socket broadcast error:", err.message);
  }
};

// 🔹 Push notification to all registered devices
exports.pushFCMToUser = async (user, title, message, image) => {
  try {
    if (!user.fcmTokens?.length) return;
    await Promise.all(
      user.fcmTokens
        .filter(t => t?.token)
        .map(t => sendFCMNotification(t.token, title, message, image))
    );
  } catch (err) {
    console.error("FCM push error:", err.message);
  }
};

// 🔹 Create and send notification
// 🔹 Notify all users about a new feed (Admin/ChildAdmin)
exports.notifyAllUsersNewFeed = async (senderId, feedId, title, message, image) => {
  try {
    const users = await User.find({}, "_id fcmTokens platform");
    if (!users.length) return;

    // Bulk create notifications
    const notifications = users.map((u) => ({
      senderId,
      senderRoleRef: "Admin", // Assuming Admin for now, could be passed if needed
      receiverId: u._id,
      receiverRoleRef: "User",
      type: "NEW_FEED",
      title,
      message,
      image,
      entityId: feedId,
      entityType: "Feed",
      platform: u.platform || "WEB",
      isRead: false,
    }));

    await Notification.insertMany(notifications);

    // Delivery
    for (const u of users) {
      // Real-time socket
      exports.broadcastNotification(u._id.toString(), {
        type: "NEW_FEED",
        title,
        message,
        image,
        entityId: feedId,
        createdAt: new Date(),
      });

      // Push notification
      if (u.fcmTokens?.length) {
        await exports.pushFCMToUser(u, title, message, image);
      }
    }

    console.log(`✅ Bulk notifications sent for new feed: ${feedId}`);
  } catch (err) {
    console.error("❌ Error in notifyAllUsersNewFeed:", err);
  }
};

exports.createAndSendNotification = async ({
  senderId,
  receiverId,
  type,
  title,
  message,
  entityId,
  entityType,
  image = "",
  jobId,
  companyId,
  status,
}) => {
  try {
    if (!receiverId || senderId?.toString() === receiverId?.toString()) return; // Skip self notifications

    // Fetch sender profile info
    const senderProfile = await ProfileSettings.findOne({ userId: senderId })
      .select("userName profileAvatar")
      .lean();

    const notification = await Notification.create({
      senderId,
      receiverId,

      // ✅ ROLE REFERENCES (VERY IMPORTANT)
      senderRoleRef: "Admin",
      receiverRoleRef: "User",

      type,
      title,
      message,

      entityId,
      entityType,
      image,

      jobId,
      companyId,
      status,

      isRead: false,
    });

    // Get receiver (for FCM)
    const receiver = await User.findById(receiverId).lean();
    if (receiver) {
      await exports.pushFCMToUser(receiver, title, message, image);
    }

    // Real-time socket emit
    exports.broadcastNotification(receiverId.toString(), {
      _id: notification._id,
      senderId,
      receiverId,
      type,
      title,
      message,
      image,
      status,
      jobId,
      entityId,
      createdAt: notification.createdAt,
      senderProfile: {
        userName: senderProfile?.userName || "Company",
        avatar: senderProfile?.profileAvatar || "",
      },
    });

  } catch (err) {
    console.error("❌ Error creating notification:", err);
  }
};
