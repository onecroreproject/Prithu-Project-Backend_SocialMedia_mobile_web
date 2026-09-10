const mongoose = require("mongoose");
const { prithuDB } = require("../database");

const UserFeedActionsSchema = new mongoose.Schema(
  {
    // Either userId OR accountId will be present
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    accountId: { type: mongoose.Schema.Types.ObjectId, ref: "Account" },

    // Track Likes
    likedFeeds: [
      {
        feedId: { type: mongoose.Schema.Types.ObjectId, ref: "Feed" },
        likedAt: { type: Date, default: Date.now },
      }
    ],

    // Track Saved
    savedFeeds: [
      {
        feedId: { type: mongoose.Schema.Types.ObjectId, ref: "Feed" },
        savedAt: { type: Date, default: Date.now },
      },
    ],

    // Track Downloads
    downloadedFeeds: [
      {
        feedId: { type: mongoose.Schema.Types.ObjectId, ref: "Feed" },
        downloadedAt: { type: Date, default: Date.now },
      },
    ],

    // Track Dislikes
    disLikeFeeds: [
      {
        feedId: { type: mongoose.Schema.Types.ObjectId, ref: "Feed" },
        dislikedAt: { type: Date, default: Date.now },
      },
    ],

    // Track Shares
    sharedFeeds: [
      {
        feedId: { type: mongoose.Schema.Types.ObjectId, ref: "Feed" },
        shareChannel: {
          type: String,
          enum: [
            "whatsapp",
            "facebook",
            "twitter",
            "instagram",
            "linkedin",
            "email",
            "copy_link",
            "other",
          ],
        },
        shareTarget: String,
        sharedAt: { type: Date, default: Date.now },
      },
    ],

    // Track Watched (Fully Completed)
    watchedFeeds: [
      {
        feedId: { type: mongoose.Schema.Types.ObjectId, ref: "Feed" },
        watchedAt: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true }
);

/**
 * UNIQUE INDEXES — ensures 1 document per user
 */
UserFeedActionsSchema.index({ userId: 1 }, { unique: true, sparse: true });
UserFeedActionsSchema.index({ accountId: 1 }, { unique: true, sparse: true });

/**
 * HIGH-PERFORMANCE INDEXES FOR FAST QUERIES
 * Needed for $lookup performance in feed aggregation
 */
UserFeedActionsSchema.index({ "likedFeeds.feedId": 1 });
UserFeedActionsSchema.index({ "savedFeeds.feedId": 1 });
UserFeedActionsSchema.index({ "downloadedFeeds.feedId": 1 });
UserFeedActionsSchema.index({ "disLikeFeeds.feedId": 1 });
UserFeedActionsSchema.index({ "sharedFeeds.feedId": 1 });
UserFeedActionsSchema.index({ "watchedFeeds.feedId": 1 });

module.exports = prithuDB.model(
  "UserFeedActions",
  UserFeedActionsSchema,
  "UserFeedActions"
);
