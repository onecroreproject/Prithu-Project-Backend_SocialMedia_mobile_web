const mongoose = require("mongoose");
const {prithuDB}=require("../../database");


const UserViewSchema = new mongoose.Schema({
  // Either userId or accountId (or both in some cases)
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true },
  accountId: { type: mongoose.Schema.Types.ObjectId, ref: "Account", index: true },

  feedId: { type: mongoose.Schema.Types.ObjectId, ref: "Feed", required: true, index: true },
  watchDuration: { type: Number, default: 0 }, // seconds watched

  createdAt: { type: Date, default: Date.now }
}, { timestamps: true });

// Index for analytics (fast aggregations by feed + time)
UserViewSchema.index({ feedId: 1, createdAt: -1 });

module.exports = prithuDB.model("UserView", UserViewSchema, "UserViews");
