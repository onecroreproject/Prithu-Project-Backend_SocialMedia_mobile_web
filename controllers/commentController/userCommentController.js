const UserComment = require("../models/UserComment");
const CommentLike = require("../models/CommentLike");
const { feedTimeCalculator } = require("../utils/time");


exports.getCommentsByFeed = async (req, res) => {
  try {
    const { feedId } = req.params;
    const userId = req.Id || req.body.userId;

    if (!feedId) return res.status(400).json({ message: "Feed ID required" });

    // 1. Get only parent comments
    const comments = await UserComment.find({ feedId, parentCommentId: null })
      .sort({ createdAt: -1 })
      .lean();

    if (!comments.length) return res.status(200).json({ comments: [] });

    const commentIds = comments.map(c => c._id);

    // 2. Likes for comments
    const commentLikesAgg = await CommentLike.aggregate([
      { $match: { commentId: { $in: commentIds } } },
      { $group: { _id: "$commentId", count: { $sum: 1 } } }
    ]);
    const commentLikeMap = {};
    commentLikesAgg.forEach(l => { commentLikeMap[l._id.toString()] = l.count; });

    // 3. User liked which comments
    const userLikedComments = await CommentLike.find({
      userId,
      commentId: { $in: commentIds }
    }).select("commentId -_id").lean();
    const userLikedCommentIds = userLikedComments.map(c => c.commentId.toString());

    // 4. Replies count for each comment
    const repliesAgg = await UserComment.aggregate([
      { $match: { parentCommentId: { $in: commentIds } } },
      { $group: { _id: "$parentCommentId", count: { $sum: 1 } } }
    ]);
    const repliesCountMap = {};
    repliesAgg.forEach(r => { repliesCountMap[r._id.toString()] = r.count; });

    // 5. Format response
    const formattedComments = comments.map(c => ({
      commentId: c._id,
      commentText: c.commentText,
      likeCount: commentLikeMap[c._id.toString()] || 0,
      isLiked: userLikedCommentIds.includes(c._id.toString()),
      repliesCount: repliesCountMap[c._id.toString()] || 0,
      timeAgo: feedTimeCalculator(c.createdAt)
    }));

    res.status(200).json({ comments: formattedComments });
  } catch (error) {
    console.error("Error in getCommentsByFeed:", error);
    res.status(500).json({ message: "Server error" });
  }
};







