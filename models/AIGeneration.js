const mongoose = require("mongoose");
const { prithuDB } = require("../database");

const AIGenerationSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    promptId: { type: mongoose.Schema.Types.ObjectId, ref: "Prompt" },
    sourceImages: { type: [String], default: [] },
    generatedImages: { type: [String], default: [] },
    imageCount: { type: Number, required: true },
    creditsUsed: { type: Number, required: true },
    status: { type: String, enum: ["PENDING", "SUCCESS", "FAILED"], default: "PENDING" },
  },
  { timestamps: true, versionKey: false }
);

module.exports = prithuDB.model("AIGeneration", AIGenerationSchema, "AIGenerations");
