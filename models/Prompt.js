const mongoose = require("mongoose");
const { prithuDB } = require("../database");

const promptSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true
    },
    category: {
      type: String,
      required: true,
      trim: true,
      index: true
    },
    prompt: {
      type: String,
      required: true,
      trim: true
    },
    imageUrl: {
      type: String,
      required: true,
      trim: true
    },
    aspectRatio: {
      type: String,
      default: "1:1"
    },
    unlockCredits: {
      type: Number,
      default: 3
    },
    tags: {
      type: [String],
      default: []
    }
  },
  { timestamps: true }
);

module.exports = prithuDB.model("Prompt", promptSchema, "Prompts");
