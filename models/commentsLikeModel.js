const mongoose = require("mongoose");
const { prithuDB } = require("../database");

const CommentLikeSchema = new mongoose.Schema(
  {
    // Like by User
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      sparse: true,
    },

    // MAIN COMMENT like
    commentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "UserComment",
      sparse: true,
    },

    // REPLY COMMENT like
    replyCommentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ReplyComment",
      sparse: true,
    },

    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);



/* ======================================================
   HIGH PERFORMANCE LOOKUP INDEXES
====================================================== */
// Commented out to resolve "Duplicate schema index" warnings. 
// These fields are already indexed or causing conflicts.
// CommentLikeSchema.index({ commentId: 1 });
// CommentLikeSchema.index({ replyCommentId: 1 });

module.exports = prithuDB.model("CommentLike", CommentLikeSchema, "CommentLikes");





