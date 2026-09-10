const mongoose = require("mongoose");
const {prithuDB}=require("../../../database");


const ReportTypeSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      minlength: 2,
      maxlength: 50,

    },

    description: {
      type: String,
      maxlength: 200,
      default: "",
      trim: true
    },

    isActive: {
      type: Boolean,
      default: true,

    }
  },
  {
    timestamps: true,
    versionKey: false,          // ⚡ removes __v field (saves space)
    minimize: true              // ⚡ removes empty objects
  }
);

// ⚡ Create compound indexes for heavy queries (optional)
ReportTypeSchema.index({ isActive: 1, name: 1 });

module.exports = prithuDB.model("ReportType", ReportTypeSchema, "ReportTypes");
