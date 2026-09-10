const mongoose = require("mongoose");
const {prithuDB}=require("../database");

const followingSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    }, // the user who follows others

    // Users that THIS user is following
    followingIds: [
      {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
        createdAt: { type: Date, default: Date.now },
      },
    ],

    // Users that THIS user explicitly does NOT follow
    nonFollowingIds: [
      {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
        createdAt: { type: Date, default: Date.now },
      },
    ],

    // Users blocked by THIS user
    blockedIds: [
      {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
        createdAt: { type: Date, default: Date.now },
      },
    ],

    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

/* ----------------------------------------------------
   🚀 PERFORMANCE INDEXES
---------------------------------------------------- */

// Ensure single following document per user
followingSchema.index({ userId: 1 }, { unique: true });

/**
 * Used for checking:
 * - if user A follows user B
 * - if user A blocked user B
 * - if user A unfollowed user B earlier
 */
followingSchema.index({ "followingIds.userId": 1 });
followingSchema.index({ "blockedIds.userId": 1 });
followingSchema.index({ "nonFollowingIds.userId": 1 });

/**
 * 🔥 Reverse index: Which users follow THIS creator?
 * Useful for:
 * - Creator followers list
 * - Feed "isFollowing" checks
 * - Notification sending
 */
followingSchema.index({ "followingIds.userId": 1, userId: 1 });

module.exports = prithuDB.model("Follower", followingSchema, "UserFollowings");
