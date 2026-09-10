const mongoose = require("mongoose");
const {prithuDB}=require("../../database");


const hiddenPostSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    postId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Feed",
      required: true,
    },
    reason: { type: String },
    hiddenAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

// ⭐ Important for speed + avoid duplicates
hiddenPostSchema.index({ userId: 1, postId: 1 }, { unique: true });

module.exports = prithuDB.model("HiddenPost", hiddenPostSchema, "HiddenPost");
