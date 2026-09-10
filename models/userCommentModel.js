const mongoose = require("mongoose");
const { prithuDB } = require("../database");

const UserCommentSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User"
    },

    accountId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Account"
    },

    feedId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Feed",
      required: true
    },

    commentText: { type: String, required: true },

    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

/* -------------------------------------------
    🚀 PERFORMANCE INDEXES FOR FEED SPEED
-------------------------------------------- */

// 1️⃣ Fast lookup of comments for feed (sorted by time)
UserCommentSchema.index({ feedId: 1, createdAt: -1 });

// 2️⃣ Fast count of comments for a feed
UserCommentSchema.index({ feedId: 1 });

// 3️⃣ Fast lookup of comments made by a specific user
UserCommentSchema.index({ userId: 1, createdAt: -1 });

// 4️⃣ Useful if accountId is used instead of userId
UserCommentSchema.index({ accountId: 1, createdAt: -1 });

module.exports = prithuDB.model("UserComment", UserCommentSchema, "UserComments");
