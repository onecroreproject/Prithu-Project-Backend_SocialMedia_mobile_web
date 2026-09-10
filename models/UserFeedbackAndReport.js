const mongoose = require("mongoose");
const { prithuDB } = require("../database");

const userFeedbackSchema = new mongoose.Schema(
  {
    // Who submitted
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: false, // allow guest feedback
    },
    guestName: {
      type: String,
      trim: true
    },
    guestEmail: {
      type: String,
      trim: true,
      lowercase: true
    },

    // Section where feedback/report is submitted
    section: {
      type: String,
      required: true,
      enum: [
        "post",
        "comment",
        "portfolio",
        "profile",
        "help",
        "referral",
        "notification",
        "app",
        "other",
      ],
    },

    // Feedback or Report
    type: {
      type: String,
      enum: ["feedback", "report"],
      required: true,
    },

    // If related to a specific entity (post, comment, job, etc.)
    entityId: {
      type: mongoose.Schema.Types.ObjectId,
      required: false,
    },

    entityType: {
      type: String,
      required: false, // Post, Comment, Job, User, etc.
    },

    // User input
    title: {
      type: String,
      trim: true,
    },

    message: {
      type: String,
      required: true,
      trim: true,
    },

    // Optional category
    category: {
      type: String,
      enum: [
        "bug",
        "spam",
        "abuse",
        "harassment",
        "misinformation",
        "feature_request",
        "performance",
        "ui_ux",
        "other",
      ],
      default: "other",
    },

    // Admin handling
    status: {
      type: String,
      enum: ["pending", "in_review", "resolved", "rejected"],
      default: "pending",
    },

    adminNote: {
      type: String,
    },

    // Metadata
    device: String,
    platform: String, // web / android / ios
    ipAddress: String,
  },
  { timestamps: true }
);

module.exports = prithuDB.model("UserFeedback", userFeedbackSchema, "UserFeedback");
