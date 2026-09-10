const mongoose = require("mongoose");
const {prithuDB}=require("../database");

const HashtagSchema = new mongoose.Schema({
  tag: { type: String, unique: true, index: true },
  count: { type: Number, default: 0 },
  updatedAt: { type: Date, default: Date.now },
});
HashtagSchema.index({ count: -1 });
HashtagSchema.index({ updatedAt: -1 });

module.exports = prithuDB.model("Hashtag", HashtagSchema,"Hashtag");
