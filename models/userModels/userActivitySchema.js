const mongoose = require("mongoose");
const { prithuDB } = require("../../database");


const UserActivitySchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    actionType: {
      type: String,
      enum: [
        "LIKE_POST",
        "UNLIKE_POST",
        "COMMENT",
        "SHARE_POST",
        "FOLLOW_USER",
        "UNFOLLOW_USER",
        "CREATE_POST",
        "SCHEDULE_POST",
        "UPDATE_PROFILE",
        "VIEW_PORTFOLIO",
        "LOGIN",
        "LOGOUT",
        "DOWNLOAD_POST",
        "REMOVE_FOLLOWER",
        "DOWNLOAD_POST_REQUEST",
      ],
      required: true,
      index: true,
    },

    targetId: {
      type: mongoose.Schema.Types.ObjectId,
      refPath: "targetModel",
      default: null,
    },

    targetModel: {
      type: String,
      enum: ["User", "Feed", "UserCurricluam"],
      default: null,
    },

    metadata: {
      type: Object, // Extra info like title, device, IP, etc.
      default: {},
    },
  },
  { timestamps: true }
);

/* ✅ 1️⃣ Unique compound index
   Prevents duplicate activities for same user/action/target */
UserActivitySchema.index(
  { userId: 1, actionType: 1, targetId: 1, targetModel: 1 },
  { unique: true }
);

/* ✅ 2️⃣ Secondary index for recent activity sorting */
UserActivitySchema.index({ userId: 1, updatedAt: -1 });

module.exports =
  mongoose.models.UserActivity ||
  prithuDB.model("UserActivity", UserActivitySchema, "UserActivities");
