const mongoose = require("mongoose");
const { prithuDB } = require("../database");

const notificationSchema = new mongoose.Schema(
  {
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      refPath: "senderRoleRef",
      required: false,
    },
    receiverId: {
      type: mongoose.Schema.Types.ObjectId,
      refPath: "receiverRoleRef",
      required: true,
    },

    // Role reference
    senderRoleRef: {
      type: String,
      enum: ["User", "Admin", "ChildAdmin"],
      default: "User",
    },
    receiverRoleRef: {
      type: String,
      enum: ["User", "Admin", "ChildAdmin"],
      default: "User",
    },

    // Notification Type
    type: {
      type: String,
      enum: [
        "FOLLOW",
        "UNFOLLOW",
        "LIKE_POST",
        "COMMENT",
        "MENTION",
        "ADMIN_ANNOUNCEMENT",
        "SYSTEM_ALERT",
        "REMOVED_FROM_FOLLOWERS",
        "NEW_FEED",
      ],
      required: true,
    },

    entityId: {
      type: mongoose.Schema.Types.ObjectId,
      refPath: "entityType",
      required: false,
    },
    entityType: {
      type: String,
      enum: ["Post", "Comment", "Follow", "Unfollow", null, "Feed", "RemoveFollower",],
      default: null,
    },

    title: { type: String, required: true },
    message: { type: String, required: true },
    image: { type: String, default: "" },
    isRead: { type: Boolean, default: false },

    meta: {
      postId: { type: mongoose.Schema.Types.ObjectId, ref: "Post" },
      commentId: { type: mongoose.Schema.Types.ObjectId, ref: "Comment" },
    },

    status: { type: String },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);



// ============================================================
// 🔹 VIRTUAL POPULATIONS
// ============================================================

// 🧩 1️⃣ For normal User sender
notificationSchema.virtual("senderUserProfile", {
  ref: "ProfileSettings",
  localField: "senderId",
  foreignField: "userId",
  justOne: true,
  select: "userName profileAvatar displayName",
});

// 🧩 2️⃣ For Admin sender
notificationSchema.virtual("senderAdminProfile", {
  ref: "ProfileSettings",
  localField: "senderId",
  foreignField: "adminId",
  justOne: true,
  select: "userName profileAvatar displayName",
});

// 🧩 3️⃣ For Child Admin sender
notificationSchema.virtual("senderChildAdminProfile", {
  ref: "ProfileSettings",
  localField: "senderId",
  foreignField: "childAdminId",
  justOne: true,
  select: "userName profileAvatar displayName",
});

// 🧩 4️⃣ Feed Content (for preview)
notificationSchema.virtual("feedInfo", {
  ref: "Feed",
  localField: "entityId",
  foreignField: "_id",
  justOne: true,
  select: "content contentUrl",
});

module.exports = prithuDB.model("Notification", notificationSchema, "UserNotifications");
