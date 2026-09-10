const mongoose = require("mongoose");
const { prithuDB } = require("../../database");

const SearchHistorySchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    query: { type: String, trim: true },
    hashtag: { type: String, trim: true }, // If searching or clicking a hashtag
    type: { type: String, enum: ["search", "hashtag_click"], default: "search" },
    timestamp: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

SearchHistorySchema.index({ userId: 1, timestamp: -1 });

module.exports = prithuDB.model("SearchHistory", SearchHistorySchema, "SearchHistory");
