const mongoose = require("mongoose");
const { prithuDB } = require("../../../database");


const UserReferralSchema = new mongoose.Schema({
  parentId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  childIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
}, { timestamps: true });

UserReferralSchema.index({ parentId: 1 }, { unique: true });

module.exports = prithuDB.model("UserReferral", UserReferralSchema, "UserReferral");


