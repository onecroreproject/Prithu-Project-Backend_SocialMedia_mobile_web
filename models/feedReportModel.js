// models/Report.js
const mongoose = require("mongoose");
const {prithuDB}=require("../database");
const { sendMailSafe } = require("../utils/sendMail");

// Embedded Answers
const ReportAnswerSchema = new mongoose.Schema(
  {
    questionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ReportQuestion",
      required: true,
      index: true, // ⚡ answers lookup faster
    },
    questionText: { type: String, required: true, trim: true },
    selectedOption: { type: String, required: true, trim: true },
  },
  { _id: false } // ⚡ reduces document size
);

const ReportSchema = new mongoose.Schema(
  {
    typeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ReportType",
      required: true,
      index: true,
    },

    reportedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    targetId: {
      type: mongoose.Schema.Types.ObjectId,
      refPath: "targetType",
      required: true,
      index: true,
    },

    targetType: {
      type: String,
      enum: ["Feed", "User", "Comment"],
      required: true,
      index: true,
      trim: true,
    },

    answers: {
      type: [ReportAnswerSchema],
      default: [],
      validate: v => Array.isArray(v) && v.length > 0,
    },

    status: {
      type: String,
      enum: ["Pending", "Reviewed", "Action Taken", "Rejected"],
      default: "Pending",
      index: true,
    },

    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admins",
      default: null,
    },

    actionTaken: {
      type: String,
      default: null,
      trim: true,
      maxlength: 300,
    },

    actionDate: {
      type: Date,
      default: null,
    },

    notified: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  {
    timestamps: true,
    versionKey: false, // ⚡ remove __v
    minimize: true, // ⚡ remove empty objects
  }
);

// ⚡ Common query pattern optimization
ReportSchema.index({ status: 1, actionDate: -1 });
ReportSchema.index({ reportedBy: 1, status: 1 });
ReportSchema.index({ targetId: 1, targetType: 1 });

// ---------------------------------------------------------
// ⚠️ FIXED: No infinite save loop for .post("save")
// ---------------------------------------------------------
ReportSchema.post("save", async function (doc) {
  try {
    // Only trigger email if status changed from Pending AND not notified yet
    if (doc.status === "Pending" || doc.notified) return;

    const populatedDoc = await doc.populate("reportedBy", "email username");

    if (!populatedDoc.reportedBy?.email) return;

    // Prepare email content
    const subject = "Your Report Status Has Been Updated";
    const html = `Hello ${populatedDoc.reportedBy.username},<br><br>

Your report regarding <b>${populatedDoc.targetType}</b> has been updated.<br><br>

📌 <b>Status:</b> ${populatedDoc.status}<br>
📌 <b>Action:</b> ${populatedDoc.actionTaken || "N/A"}<br>
📌 <b>Date:</b> ${populatedDoc.actionDate || new Date().toLocaleString()}<br><br>

Thank you,<br>
Support Team`;

    // Send email
    await sendMailSafe({ to: populatedDoc.reportedBy.email, subject, html });

    // ⚡ Direct update, avoids recursive save() loop
    await prithuDB.model("Report").updateOne(
      { _id: doc._id },
      { $set: { notified: true } }
    );
  } catch (err) {
    console.error("❌ Error sending report status mail:", err.message);
  }
});

module.exports = prithuDB.model("Report", ReportSchema, "Reports");
