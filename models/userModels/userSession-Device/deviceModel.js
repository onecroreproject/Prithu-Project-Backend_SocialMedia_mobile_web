const mongoose = require("mongoose");
const {prithuDB}=require("../../../database");


const DeviceSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // 🔹 Persistent unique device fingerprint (UUID stored in localStorage)
    deviceId: { type: String, required: true, index: true },

    // 🔹 Type of device (web, mobile, tablet)
    deviceType: {
      type: String,
      enum: ["web", "mobile", "tablet", "desktop"],
      default: "web",
    },

    // 🔹 Human-readable name (e.g., "Windows 11 Chrome", "iPhone 14 Safari")
    deviceName: { type: String, default: "Unknown Device" },

    // 🔹 Operating system (Windows 10, Android 14, iOS 17, etc.)
    os: { type: String, default: "Unknown OS" },

    // 🔹 Browser info (Chrome 118, Safari 17, etc.)
    browser: { type: String, default: "Unknown Browser" },

    // 🔹 IP address of device
    ipAddress: { type: String, default: null },

    // 🔹 Status tracking
    isOnline: { type: Boolean, default: false },

    // 🔹 Last active timestamp
    lastActiveAt: { type: Date, default: Date.now },

    // 🔹 Link to session (optional)
    sessionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Session",
      default: null,
    },
  },
  { timestamps: true, collection: "Devices" }
);

// ✅ Create compound index for performance
DeviceSchema.index({ userId: 1, deviceId: 1 }, { unique: true });

module.exports = prithuDB.model("Device", DeviceSchema,"Devices");
