// utils/fcmHelper.js
const admin = require("../../Config/firebaseAdmin"); 

/**
 * Send a push notification using Firebase Cloud Messaging (FCM)
 * Works for Web + Android
 */
exports.sendFCMNotification = async (token, title, body, image = "") => {
  try {
    if (!token) throw new Error("Missing FCM token");

    const message = {
      token,
      notification: { title, body, image },
      android: {
        priority: "high",
        notification: { sound: "default" },
      },
      webpush: {
        headers: { Urgency: "high" },
        notification: {
          icon: image || "/logo192.png",
          vibrate: [100, 50, 100],
        },
      },
      apns: { payload: { aps: { sound: "default" } } },
    };

    const response = await admin.messaging().send(message);
    console.log("📨 Notification sent successfully:", response);
    return response;
  } catch (err) {
    if (err.code === 'messaging/registration-token-not-registered' || err.message.includes("Requested entity was not found")) {
      console.warn("⚠️ FCM Token is no longer valid (Requested entity not found). Consider removing it from the user's profile.");
    } else {
      console.error("❌ FCM Send Error:", err.message);
    }
  }
};
