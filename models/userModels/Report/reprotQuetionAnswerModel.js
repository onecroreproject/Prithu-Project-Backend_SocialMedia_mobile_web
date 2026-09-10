const mongoose = require("mongoose");
const {prithuDB}=require("../../../database");


const ReportOptionSchema = new mongoose.Schema(
  {
    text: {
      type: String,
      required: true,
      trim: true,
      maxlength: 150,
      minlength: 1,
    },

    // For branching logic → points to next question
    nextQuestion: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ReportQuestion",
      default: null,
      index: true, // ⚡ Faster branching lookups
    },
  },

);

const ReportQuestionSchema = new mongoose.Schema(
  {
    typeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ReportType",
      required: true,
      index: true, // ⚡ Speeds up fetching all questions under a type
    },

    questionText: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },

    options: {
      type: [ReportOptionSchema],
      validate: {
        validator: function (val) {
          return val.length > 0; // question must have at least 1 option
        },
        message: "Question must contain at least 1 option.",
      },
    },

    isActive: {
      type: Boolean,
      default: true,
      index: true, // ⚡ Improves filtering on active questions
    },
  },
  {
    timestamps: true,
    versionKey: false, // ⚡ Remove __v
    minimize: true, // ⚡ Save space by removing empty fields
  }
);

// ⚡ Highly optimized compound index (typical query pattern)
ReportQuestionSchema.index({ typeId: 1, isActive: 1 });

module.exports = prithuDB.model("ReportQuestion", ReportQuestionSchema, "ReportQuestions");
