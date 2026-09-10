const mongoose = require("mongoose");
const { prithuDB } = require("../database");

const ReplySchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  accountId: { type: mongoose.Schema.Types.ObjectId, ref: "Account" },

  // Link back to feed and comment
  parentCommentId: { type: mongoose.Schema.Types.ObjectId, ref: "UserComment", required: true },

  // NEW: For nested replies - track which reply this is replying to
  parentReplyId: { type: mongoose.Schema.Types.ObjectId, ref: "Reply" },

  replyText: { type: String, required: true },

  // For likes functionality
  likes: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  likeCount: {
    type: Number,
    default: 0
  },

  createdAt: { type: Date, default: Date.now }
}, { timestamps: true });

// Performance indexes
ReplySchema.index({ parentCommentId: 1, createdAt: -1 });
ReplySchema.index({ parentReplyId: 1, createdAt: -1 });
ReplySchema.index({ userId: 1, createdAt: -1 });

module.exports = prithuDB.model("Reply", ReplySchema, "Replies");