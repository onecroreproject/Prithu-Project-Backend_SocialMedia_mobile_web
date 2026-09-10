const mongoose = require("mongoose");
const { prithuDB } = require("../../../database");
const dbTimer = require("../../../middlewares/dbTimer");



const SessionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  deviceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Device",
    required: true,
  },
  refreshToken: {
    type: String,
    required: true,
  },
  isOnline: {
    type: Boolean,
    default: false,
  },
  lastSeenAt: {
    type: Date,
    default: null,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  expiredAt: {
    type: Date,
    default: null, // optional, can set based on refreshToken expiry
  },
},
  { timestamps: true } // adds updatedAt automatically
);
SessionSchema.plugin(dbTimer);

// Index for auto-expiry (30 days inactivity)
SessionSchema.index({ lastSeenAt: 1 }, { expireAfterSeconds: 2592000 }); // 30 days in seconds



module.exports = mongoose.models.Session || prithuDB.model("Session", SessionSchema, "Session");





