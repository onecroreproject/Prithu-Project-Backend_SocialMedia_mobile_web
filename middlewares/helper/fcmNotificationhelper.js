// utils/fcmHelper.js
const admin = require("../../Config/firebaseAdmin"); 
const axios = require("axios");

/**
 * Send a push notification using Firebase Cloud Messaging (FCM) or Expo Push API
 * Works for Web + Android (including Expo Go)
 */
exports.sendFCMNotification = async (token, title, body, image = "") => {
  try {
    if (!token) throw new Error("Missing push token");

    // 1. Handle Expo Push Tokens (Used for testing in Expo Go)
    if (token.startsWith("ExponentPushToken") || token.startsWith("ExpoPushToken")) {
      const message = {
        to: token,
        sound: 'default',
        title: title,
        body: body,
        data: { image },
      };

      const response = await axios.post('https://exp.host/--/api/v2/push/send', message, {
        headers: {
          'Accept': 'application/json',
          'Accept-encoding': 'gzip, deflate',
          'Content-Type': 'application/json',
        }
      });
      console.log("📨 Expo Notification sent successfully:", response.data);
      return response.data;
    }

    // 2. Handle Native FCM Tokens (Used for Production / Dev builds)
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
    console.log("📨 FCM Notification sent successfully:", response);
    return response;
  } catch (err) {
    if (err.code === 'messaging/registration-token-not-registered' || err.message?.includes("Requested entity was not found")) {
      console.warn("⚠️ FCM Token is no longer valid (Requested entity not found). Consider removing it from the user's profile.");
    } else {
      console.error("❌ Push Send Error:", err.message);
    }
  }
};
