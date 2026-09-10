const UserComment = require("../models/userCommentModel");
const Reply = require("../models/userRepliesModel");
const CommentLike = require("../models/commentsLikeModel");
const { feedTimeCalculator } = require("../middlewares/feedTimeCalculator");
const ProfileSettings=require('../models/profileSettingModel');
const mongoose=require("mongoose")
const idToString = (id) => (id ? id.toString() : null);




exports.getCommentsByFeed = async (req, res) => {
  try {
    const { feedId } = req.body;
    const userId = req.Id || req.body.userId;

    if (!feedId) return res.status(400).json({ message: "Feed ID required" });

    // 1. Get top-level comments
    const comments = await UserComment.find({ feedId })
      .sort({ createdAt: -1 })
      .lean();

    if (!comments.length) {
      return res.status(200).json({ comments: [] });
    }

    const commentIds = comments.map(c => c._id);
    const userIds = comments.map(c => c.userId);

    /* ======================================================
       2. Get like count for MAIN comments
       (Correct field → commentId)
    ======================================================= */
    const commentLikesAgg = await CommentLike.aggregate([
      { $match: { commentId: { $in: commentIds } } },
      { $group: { _id: "$commentId", count: { $sum: 1 } } }
    ]);

    const commentLikeMap = {};
    commentLikesAgg.forEach(l => {
      commentLikeMap[l._id.toString()] = l.count;
    });

    /* ======================================================
       3. Get which comments USER has liked
       (Correct field → commentId)
    ======================================================= */
    const userLikedComments = await CommentLike.find({
      userId,
      commentId: { $in: commentIds }
    }).select("commentId -_id");

    const userLikedCommentIds = new Set(
      userLikedComments.map(c => c.commentId.toString())
    );

    /* ======================================================
       4. Replies count
    ======================================================= */
    const replyAgg = await Reply.aggregate([
      { $match: { parentCommentId: { $in: commentIds } } },
      { $group: { _id: "$parentCommentId", count: { $sum: 1 } } }
    ]);

    const replyCountMap = {};
    replyAgg.forEach(r => { replyCountMap[r._id.toString()] = r.count; });

    /* ======================================================
       5. Fetch user profile info
    ======================================================= */
    const profiles = await ProfileSettings.find({
      userId: { $in: userIds }
    }).select("userId userName profileAvatar");

    const profileMap = {};
    profiles.forEach(p => {
      profileMap[p.userId.toString()] = {
        username: p.userName,
        avatar: p.profileAvatar,
        userId:p.userId
      };
    });

    /* ======================================================
       6. Format final response
    ======================================================= */
    const formattedComments = comments.map(c => {
      const profile = profileMap[c.userId?.toString()] || {};

      return {
        commentId: c._id,
        commentText: c.commentText,
        likeCount: commentLikeMap[c._id.toString()] || 0,
        isLiked: userLikedCommentIds.has(c._id.toString()),
        replyCount: replyCountMap[c._id.toString()] || 0,
        timeAgo: feedTimeCalculator(c.createdAt),
        username: profile.username || "Unknown User",
        userId:profile.userId,
        avatar: profile.avatar
      };
    });

    return res.status(200).json({ comments: formattedComments });

  } catch (error) {
    console.error("Error in getCommentsByFeed:", error);
    return res.status(500).json({ message: "Server error" });
  }
};



exports.getRepliesForComment = async (req, res) => {
  try {
    const { parentCommentId } = req.body;
    const userIdRaw = req.Id; // your middleware sets req.Id (string/object)
    if (!parentCommentId) {
      return res.status(400).json({ message: "parentCommentId is required" });
    }

    // Fetch all replies for this comment (including nested)
    const replies = await Reply.find({ parentCommentId: new mongoose.Types.ObjectId(parentCommentId) })
      .sort({ createdAt: 1 })
      .lean();

    if (!replies || replies.length === 0) {
      return res.json({ replies: [] });
    }

    // Batch fetch profiles
    const userIds = [...new Set(replies.map(r => idToString(r.userId)).filter(Boolean))];
    const profiles = await ProfileSettings.find({ userId: { $in: userIds.map(id =>new mongoose.Types.ObjectId(id)) } })
      .select("userId userName profileAvatar")
      .lean();

    const profileMap = {};
    profiles.forEach(p => {
      profileMap[idToString(p.userId)] = p;
    });

    // Build a quick parent->children map to compute nestedCount for immediate children
    const childrenMap = {};
    replies.forEach((r) => {
      const parentReplyKey = idToString(r.parentReplyId) || null;
      if (!childrenMap[parentReplyKey]) childrenMap[parentReplyKey] = [];
      childrenMap[parentReplyKey].push(r);
    });

    // userId string for checking likes
    const userIdStr = userIdRaw ? idToString(userIdRaw) : null;

    // Map replies to response shape
    const finalReplies = replies.map((reply) => {
      const uid = idToString(reply.userId);
      const profile = profileMap[uid] || {};
      const rIdStr = idToString(reply._id);
      const nestedCount = (childrenMap[rIdStr] || []).length;

      // compute isLiked (reply.likes is array of ObjectIds)
      const isLiked = userIdStr ? (Array.isArray(reply.likes) && reply.likes.map(idToString).includes(userIdStr)) : false;

      return {
        replyId: reply._id,
        parentReplyId: reply.parentReplyId || null,
        commentId: reply.parentCommentId,
        replyText: reply.replyText,
        username: profile?.userName || "Unknown User",
        avatar: profile?.profileAvatar || null,
        userId:profile?.userId || "Unknown",
        likeCount: reply.likeCount || (Array.isArray(reply.likes) ? reply.likes.length : 0),
        isLiked,
        timeAgo: feedTimeCalculator(reply.createdAt),
        nestedCount,
      };
    });

    return res.json({ replies: finalReplies });
  } catch (err) {
    console.error("Get replies error:", err);
    return res.status(500).json({ message: "Server error" });
  }
};







exports.getNestedReplies = async (req, res) => {
  try {
    const { parentReplyId } = req.body;
    const userIdRaw = req.Id;

    if (!parentReplyId) {
      return res.status(400).json({ message: "parentReplyId is required" });
    }

    const nestedReplies = await Reply.find({ parentReplyId:new mongoose.Types.ObjectId(parentReplyId) })
      .sort({ createdAt: 1 })
      .lean();

    if (!nestedReplies || nestedReplies.length === 0) {
      return res.json({ replies: [] });
    }

    // batch fetch profiles
    const userIds = [...new Set(nestedReplies.map(r => idToString(r.userId)).filter(Boolean))];
    const profiles = await ProfileSettings.find({ userId: { $in: userIds.map(id =>new mongoose.Types.ObjectId(id)) } })
      .select("userId userName profileAvatar")
      .lean();
    const profileMap = {};
    profiles.forEach(p => profileMap[idToString(p.userId)] = p);

    const userIdStr = userIdRaw ? idToString(userIdRaw) : null;

    const final = nestedReplies.map((reply) => {
      const uid = idToString(reply.userId);
      const profile = profileMap[uid] || {};
      const isLiked = userIdStr ? (Array.isArray(reply.likes) && reply.likes.map(idToString).includes(userIdStr)) : false;

      return {
        replyId: reply._id,
        parentReplyId: reply.parentReplyId || null,
        commentId: reply.parentCommentId,
        replyText: reply.replyText,
        username: profile?.userName || "Unknown User",
        avatar: profile?.profileAvatar || null,
        userId:profile?.userId || "Unknown",
        likeCount: reply.likeCount || (Array.isArray(reply.likes) ? reply.likes.length : 0),
        isLiked,
        timeAgo: feedTimeCalculator(reply.createdAt),
      };
    });

    return res.json({ replies: final });
  } catch (err) {
    console.error("Get nested replies error:", err);
    return res.status(500).json({ message: "Server error" });
  }
};








exports.deleteComment = async (req, res) => {
  try {
    const { commentId } = req.params;
    const userId = req.Id;

    if (!commentId) {
      return res.status(400).json({ message: "Comment ID required" });
    }

    const comment = await UserComment.findById(commentId);
    if (!comment) {
      return res.status(404).json({ message: "Comment not found" });
    }

    // Authorization check
    if (comment.userId.toString() !== userId.toString()) {
      return res.status(403).json({ message: "You are not allowed to delete this comment" });
    }

    // 1️⃣ Delete comment
    await UserComment.findByIdAndDelete(commentId);

    // 2️⃣ Delete main comment likes
    await CommentLike.deleteMany({ commentId });

    // 3️⃣ Delete all replies belonging to this comment
    const replies = await Reply.find({ parentCommentId: commentId }).select("_id");

    const replyIds = replies.map(r => r._id);

    if (replyIds.length > 0) {
      // Delete replies
      await Reply.deleteMany({ parentCommentId: commentId });

      // Delete reply likes
      await CommentLike.deleteMany({ replyId: { $in: replyIds } });
    }

    return res.status(200).json({ message: "Comment & all replies deleted successfully" });
  } catch (error) {
    console.error("Delete Comment Error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};


async function getAllNestedReplyIds(parentId) {
  const children = await Reply.find({ parentReplyId: parentId }).select("_id");
  let ids = children.map(c => c._id);

  for (let child of children) {
    const nested = await getAllNestedReplyIds(child._id);
    ids = ids.concat(nested);
  }

  return ids;
}

exports.deleteReply = async (req, res) => {
  try {
    const { replyId } = req.params;
    const userId = req.Id;

    if (!replyId) {
      return res.status(400).json({ message: "replyId is required" });
    }

    const reply = await Reply.findById(replyId);
    if (!reply) {
      return res.status(404).json({ message: "Reply not found" });
    }

    // Authorization check
    if (reply.userId.toString() !== userId.toString()) {
      return res.status(403).json({ message: "You are not allowed to delete this reply" });
    }

    // 1️⃣ Get all nested reply IDs
    const nestedIds = await getAllNestedReplyIds(replyId);

    const allDeleteIds = [replyId, ...nestedIds];

    // 2️⃣ Delete replies (this + nested)
    await Reply.deleteMany({ _id: { $in: allDeleteIds } });

    // 3️⃣ Delete likes for these replies
    await CommentLike.deleteMany({ replyId: { $in: allDeleteIds } });

    return res.status(200).json({ message: "Reply & nested replies deleted" });
  } catch (error) {
    console.error("Delete Reply Error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};






