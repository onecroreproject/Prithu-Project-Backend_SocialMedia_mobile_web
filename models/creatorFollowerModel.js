const mongoose = require("mongoose");
const {prithuDB}=require("../database");

const followSchema = new mongoose.Schema({
  creatorId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: "User",
    index: true,
    required: true 
  },

  followerId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: "User",
    index: true,
    required: true
  },

  createdAt: { type: Date, default: Date.now }
});

// 🌟 Unique index — prevents duplicate follow
followSchema.index({ creatorId: 1, followerId: 1 }, { unique: true });

module.exports = prithuDB.model("Follow", followSchema, "Follows");
