const mongoose = require("mongoose");
const {prithuDB}=require("../database");

const ReportLogSchema = new mongoose.Schema(
  {
    reportId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Report",
      required: true,
      index: true, // ⚡ Logs are usually fetched by reportId
    },

    action: {
      type: String,
      required: true,
      enum: ["Created", "Reviewed", "Action Taken", "Rejected", "Reopened", "Answered"],
      index: true, // ⚡ Useful for filtering logs by action type
      trim: true,
    },

    note: {
      type: String,
      default: null,
      maxlength: 500, // Avoids huge payload
      trim: true,
    },

    performedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      index: true, // ⚡ Often used in audit filtering
    },

    performedAt: {
      type: Date,
      default: Date.now,
      index: true, // ⚡ Useful for sorting/filtering logs
    },

    // Only used when action = "Answered"
    answer: {
      questionId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "ReportQuestion",
      },

      questionText: {
        type: String,
        trim: true,
      },

      selectedOption: {
        type: String,
        trim: true,
      },
    },
  },
  {
    timestamps: true,
    versionKey: false,  // ⚡ Remove __v
    minimize: true,     // ⚡ Remove empty objects
  }
);

// ⚡ Compound index (most common query pattern)
ReportLogSchema.index({ reportId: 1, performedAt: -1 });

module.exports = prithuDB.model("ReportLog", ReportLogSchema, "ReportLogs");
