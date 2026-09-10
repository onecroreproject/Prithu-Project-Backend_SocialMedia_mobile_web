const mongoose = require("mongoose");
const { prithuDB } = require("../../../database");


const UserEarningSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  fromUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  level: { type: Number, required: true },
  amount: { type: Number, required: true },
  isPartial: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now }
});

UserEarningSchema.index({ userId: 1, tier: 1 });

module.exports = prithuDB.model("UserEarning", UserEarningSchema, "UserEarnings");
