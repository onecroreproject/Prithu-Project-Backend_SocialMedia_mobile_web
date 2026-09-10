const mongoose = require("mongoose");
const { prithuDB } = require("../database");

const PromptUnlockSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    promptId: { type: mongoose.Schema.Types.ObjectId, ref: "Prompt", required: true, index: true },
    creditsUsed: { type: Number, required: true },
    unlockedAt: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

// Prevent duplicate unlocks
PromptUnlockSchema.index({ userId: 1, promptId: 1 }, { unique: true });

module.exports = prithuDB.model("PromptUnlock", PromptUnlockSchema, "PromptUnlocks");
