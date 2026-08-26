const mongoose = require("mongoose");
const { prithuDB } = require("../database");

const userSeenHistorySchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    contentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Feed', required: true },
    viewedAt: { type: Date, default: Date.now }
});

userSeenHistorySchema.index({ userId: 1, contentId: 1 }, { unique: true });

module.exports = prithuDB.model("UserSeenHistory", userSeenHistorySchema, "UserSeenHistory");
