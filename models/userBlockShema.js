const {prithuDB}=require("../database");

const blockSchema = new mongoose.Schema({
  blockerId: { type: mongoose.ObjectId, required: true, index: true },
  blockedId: { type: mongoose.ObjectId, required: true, index: true },
  createdAt: { type: Date, default: Date.now }
});

// Ensure no duplicate blocks
blockSchema.index({ blockerId: 1, blockedId: 1 }, { unique: true });

module.exports = prithuDB.model("Block", blockSchema, "UserBlocks");
