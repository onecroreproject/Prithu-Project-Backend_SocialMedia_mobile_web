const mongoose = require("mongoose");
const { prithuDB } = require("../database");

const dailyFeedSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    date: { type: String, required: true }, // Format: YYYY-MM-DD
    contentIds: [{
        feedId: { type: mongoose.Schema.Types.ObjectId, ref: 'Feed', required: true },
        slotName: { type: String, required: true },
        type: { type: String, required: true }, // Time-Specific, God, General, Fallback
        score: { type: Number, default: 1.0 }
    }],
    createdAt: { type: Date, default: Date.now }
});

dailyFeedSchema.index({ userId: 1, date: 1 }, { unique: true });

module.exports = prithuDB.model("DailyFeed", dailyFeedSchema, "DailyFeeds");
