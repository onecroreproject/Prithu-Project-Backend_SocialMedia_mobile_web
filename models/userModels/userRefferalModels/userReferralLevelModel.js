const mongoose = require("mongoose");
const {prithuDB}=require("../../../database");


const UserLevelSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  tier: { type: Number, required: true, default: 0 },
  level: { type: Number, required: true, default: 1 },
  leftUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  rightUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  holdingUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  threshold: { type: Number, required: true }, // 2^level
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

UserLevelSchema.pre("save", function(next) {
  this.updatedAt = Date.now();
  next();
});

UserLevelSchema.index({ userId: 1, tier: 1, level: 1 }, { unique: true });

module.exports = prithuDB.model("UserLevel", UserLevelSchema,"UserLevels");





