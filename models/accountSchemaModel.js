const mongoose = require("mongoose");
const {prithuDB}=require("../database");

const AccountSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,          // ⚡ common lookup
    },

    type: {
      type: String,
      enum: ["User", "Business", "Creator"],
      required: true,
      index: true,
    },

    profileData: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ProfileSetting",
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: false,   // removes __v  → lighter document
    minimize: true,       // removes empty objects
  }
);

// ⚡ Ensure each user can have ONLY one of each account type
AccountSchema.index({ userId: 1, type: 1 }, { unique: true });

// ⚡ Optional: Speed up admin/user dashboard
AccountSchema.index({ type: 1, createdAt: -1 });

module.exports = prithuDB.model("Account", AccountSchema, "Accounts");
