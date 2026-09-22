const mongoose = require("mongoose");
const {prithuDB}=require("../../database");


const UserViewSchema = new mongoose.Schema({
  // Either userId or accountId (or both in some cases)
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true },
  accountId: { type: mongoose.Schema.Types.ObjectId, ref: "Account", index: true },

  feedId: { type: mongoose.Schema.Types.ObjectId, ref: "Feed", required: true, index: true },
  categoryId: { type: mongoose.Schema.Types.ObjectId, ref: "Categories", index: true },
  
  postType: { type: String, enum: ["image", "video"], default: "image" },
  watchDuration: { type: Number, default: 0 }, // seconds watched
  deviceType: { type: String, default: "web" },
  ipAddress: { type: String, default: null },

  createdAt: { type: Date, default: Date.now, index: true }
}, { timestamps: true });

// Optimized indexes for analytics (aggregations by feed, user, category + time)
UserViewSchema.index({ feedId: 1, createdAt: -1 });
UserViewSchema.index({ userId: 1, createdAt: -1 });
UserViewSchema.index({ categoryId: 1, createdAt: -1 });
UserViewSchema.index({ userId: 1, feedId: 1 });
UserViewSchema.index({ userId: 1, categoryId: 1 });
UserViewSchema.index({ createdAt: -1 });

module.exports =
  mongoose.models.UserView ||
  prithuDB.model("UserView", UserViewSchema, "UserViews");

