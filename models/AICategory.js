const mongoose = require("mongoose");
const { prithuDB } = require("../database");

const aiCategorySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true
    }
  },
  { timestamps: true }
);

module.exports = prithuDB.model("AICategory", aiCategorySchema, "AICategories");
