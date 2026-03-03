const ReportQuestion = require("../../models/userModels/Report/reprotQuetionAnswerModel");
const ReportType = require("../../models/userModels/Report/reportTypeModel");
const ReportLog = require("../../models/reportLog");
const Report = require("../../models/feedReportModel");
const User = require("../../models/userModels/userModel");
const Feed = require("../../models/feedModel");
const Account = require("../../models/accountSchemaModel");
const { sendMailSafe } = require("../../utils/sendMail");
const ProfileSettings = require("../../models/profileSettingModel")
const UserComments = require("../../models/userCommentModel")





// -------------------------------------------------------
// 2️⃣ CREATE REPORT TYPE
// -------------------------------------------------------
exports.createReportType = async (req, res) => {
  try {
    const { name, description } = req.body;

    if (!name) return res.status(400).json({ message: "Report type name is required" });

    const existing = await ReportType.findOne({ name: name.trim() });
    if (existing) return res.status(400).json({ message: "Report type already exists" });

    const saved = await ReportType.create({
      name: name.trim(),
      description: description || "",
    });

    res.status(201).json({
      message: "Report type created successfully",
      data: saved,
    });
  } catch (error) {
    console.error("Error creating report type:", error);
    res.status(500).json({ message: "Internal server error", error: error.message });
  }
};

// -------------------------------------------------------
// 1️⃣ ADD REPORT QUESTION
// -------------------------------------------------------
exports.addReportQuestion = async (req, res) => {
  try {
    const { typeId, questionText, options } = req.body;

    if (!typeId || !questionText || !Array.isArray(options) || options.length === 0) {
      return res.status(400).json({ message: "Type, question text and options are required" });
    }

    const typeExists = await ReportType.findById(typeId);
    if (!typeExists) return res.status(404).json({ message: "ReportType not found" });

    const question = await ReportQuestion.create({
      typeId,
      questionText,
      options: options.map(opt => ({
        text: opt.text,
        nextQuestion: opt.nextQuestion || null
      }))
    });

    res.status(201).json({
      message: "Report question created successfully",
      data: question,
    });
  } catch (error) {
    console.error("Error creating report question:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};



// -------------------------------------------------------
// 9️⃣ ADMIN ACTION WITH EMAIL NOTIFICATION
// -------------------------------------------------------
exports.adminTakeActionOnReport = async (req, res) => {
  try {
    const { reportId } = req.params;
    const { status, actionTaken } = req.body;
    const adminId = req.id;

    const report = await Report.findById(reportId);
    if (!report) return res.status(404).json({ message: "Report not found" });

    report.status = status;
    report.actionTaken = actionTaken || null;
    report.reviewedBy = adminId;
    report.actionDate = new Date();
    await report.save();

    // Notify feed owner
    if (status === "Action Taken") {
      const feed = await Feed.findById(report.targetId);
      if (feed) {
        const account = await Account.findById(feed.createdByAccount);
        const user = await User.findById(account?.userId);

        if (user?.email) {
          const subject = "Action Taken on Your Feed";
          const html = `Hello ${user.userName},

An admin has reviewed a report against your feed and taken action.

📌 Status: ${status}
📌 Action Taken: ${actionTaken || "N/A"}
📌 Date: ${report.actionDate.toLocaleString()}

Thank you,
Support Team`;

          await sendMailSafe({ to: user.email, subject, html });
        }
      }
    }

    res.status(200).json({
      message: "Report updated successfully",
      data: report,
    });
  } catch (error) {
    console.error("Error updating report:", error);
    res.status(500).json({
      message: "Failed to update report",
      error: error.message,
    });
  }
};




exports.getQuestionsByType = async (req, res) => {
  try {
    const { typeId } = req.query;
    if (!typeId) return res.status(400).json({ message: "typeId is required" });

    const questions = await ReportQuestion.find({ typeId })
      .sort({ createdAt: 1 })
      .lean();

    res.json({ message: "Questions fetched", data: questions });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};



exports.getReportLogs = async (req, res) => {
  try {
    const { reportId } = req.params;

    const logs = await ReportLog.find({ reportId })
      .populate("performedBy", "userName email")
      .sort({ createdAt: 1 });

    res.json({ reportId, logs });
  } catch (error) {
    console.error("Error fetching report logs:", error);
    res.status(500).json({ message: "Internal server error", error: error.message });
  }
};


// -------------------------------------------------------
// 8️⃣ UPDATE REPORT STATUS (ADMIN)
// -------------------------------------------------------
exports.updateReportStatus = async (req, res) => {
  try {
    const { reportId } = req.params;
    const { status, note } = req.body;
    const adminId = req.Id;

    const report = await Report.findById(reportId);
    if (!report) return res.status(404).json({ message: "Report not found" });

    report.status = status;
    report.reviewedBy = adminId;

    if (status === "Action Taken") {
      report.actionTaken = note || "Action performed";
      report.actionDate = new Date();
    }

    await report.save();

    await ReportLog.create({
      reportId: report._id,
      action: status,
      performedBy: adminId,
      note,
    });

    res.json({
      message: "Report updated successfully",
      data: report,
    });
  } catch (error) {
    console.error("Error updating report:", error);
    res.status(500).json({ message: "Internal server error", error: error.message });
  }
};


exports.adminGetReportTypes = async (req, res) => {
  try {
    const types = await ReportType.find()
      .sort({ createdAt: 1 })
      .lean();

    if (!types.length) {
      return res.status(404).json({ message: "No report types found" });
    }

    res.status(200).json({
      message: "Report types fetched successfully",
      data: types,
    });
  } catch (error) {
    console.error("Error fetching report types:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};




exports.getQuestionById = async (req, res) => {
  try {
    const { questionId } = req.query;
    if (!questionId) return res.status(400).json({ message: "questionId required" });

    const question = await ReportQuestion.findById(questionId).lean();

    if (!question) return res.status(404).json({ message: "Question not found" });

    res.json({ message: "Question fetched", data: question });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};



exports.linkNextQuestion = async (req, res) => {
  try {
    const { parentQuestionId, optionId, nextQuestionId } = req.body;

    if (!parentQuestionId || !optionId || !nextQuestionId) {
      return res.status(400).json({ message: "Missing fields" });
    }

    const question = await ReportQuestion.findById(parentQuestionId);
    if (!question) return res.status(404).json({ message: "Parent question not found" });

    const option = question.options.id(optionId);
    if (!option) return res.status(404).json({ message: "Option not found" });

    option.nextQuestion = nextQuestionId;
    await question.save();

    res.json({ message: "Follow-up linked", data: question });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};



exports.getAllQuestions = async (req, res) => {
  try {
    const questions = await ReportQuestion.find({})
      .populate("typeId", "name")
      .populate("options.nextQuestion", "questionText")
      .sort({ createdAt: 1 })
      .lean();

    res.json({ message: "All questions", data: questions });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};


exports.toggleReportType = async (req, res) => {
  try {
    const { typeId, isActive } = req.body;

    const updated = await ReportType.findByIdAndUpdate(
      typeId,
      { isActive },
      { new: true }
    );

    res.json({ message: "Type updated", data: updated });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};



exports.deleteReportType = async (req, res) => {
  try {
    const { typeId } = req.query;

    await ReportType.findByIdAndDelete(typeId);

    res.json({ message: "Report type deleted" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};



exports.deleteQuestion = async (req, res) => {
  try {
    const { questionId } = req.query;
    if (!questionId) return res.status(400).json({ message: "questionId required" });

    // delete the question
    await ReportQuestion.findByIdAndDelete(questionId);

    // clean nextQuestion references
    await ReportQuestion.updateMany(
      { "options.nextQuestion": questionId },
      {
        $set: {
          "options.$[elem].nextQuestion": null
        }
      },
      {
        arrayFilters: [{ "elem.nextQuestion": questionId }]
      }
    );

    res.json({ message: "Question deleted & references cleaned" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};


exports.getAllReports = async (req, res) => {
  try {
    const reports = await Report.find({})
      .populate("typeId", "name")
      .populate("reportedBy", "_id")
      .sort({ createdAt: -1 })
      .lean();

    if (!reports.length) {
      return res.json({ message: "No reports found", data: [] });
    }

    const userIds = new Set(); // userId, adminId, childAdminId
    const feedIds = new Set();
    const commentIds = new Set();

    reports.forEach(r => {
      if (r.reportedBy?._id) userIds.add(r.reportedBy._id.toString());

      if (r.targetType === "User") userIds.add(r.targetId.toString());
      if (r.targetType === "Feed") feedIds.add(r.targetId.toString());
      if (r.targetType === "Comment") commentIds.add(r.targetId.toString());
    });

    // -----------------------------------------------------
    // 3️⃣ Fetch Feeds (Feed owner can be User/Admin/ChildAdmin)
    // -----------------------------------------------------
    const feeds = await Feed.find({
      _id: { $in: [...feedIds] }
    })
      .select("_id contentUrl createdByAccount roleRef")
      .lean();

    const feedMap = {};
    const feedOwnerIds = new Set();

    feeds.forEach(f => {
      feedMap[f._id.toString()] = f;
      feedOwnerIds.add(f.createdByAccount.toString());
    });

    // -----------------------------------------------------
    // 4️⃣ Collect ALL profile lookup IDs:
    // userId, adminId, childAdminId
    // -----------------------------------------------------
    const allProfileIds = new Set([
      ...userIds,
      ...feedOwnerIds
    ]);

    // -----------------------------------------------------
    // 5️⃣ Fetch ProfileSettings for all roles
    // -----------------------------------------------------
    const profiles = await ProfileSettings.find({
      $or: [
        { userId: { $in: [...allProfileIds] } },
        { adminId: { $in: [...allProfileIds] } },
        { childAdminId: { $in: [...allProfileIds] } },
      ]
    })
      .select("userId adminId childAdminId userName profileAvatar")
      .lean();

    const profileMap = {};

    profiles.forEach(p => {
      if (p.userId) profileMap[p.userId.toString()] = p;
      if (p.adminId) profileMap[p.adminId.toString()] = p;
      if (p.childAdminId) profileMap[p.childAdminId.toString()] = p;
    });

    // -----------------------------------------------------
    // 6️⃣ Fetch Comments
    // -----------------------------------------------------
    const comments = await UserComments.find({
      _id: { $in: [...commentIds] }
    })
      .select("_id commentText feedId userId")
      .lean();

    const commentMap = {};
    comments.forEach(c => (commentMap[c._id.toString()] = c));

    // -----------------------------------------------------
    // 7️⃣ Build final response
    // -----------------------------------------------------
    const finalData = reports.map(r => {
      const reporterProfile =
        profileMap[r.reportedBy?._id?.toString()] || {};

      const uniqueAnswers = Object.values(
        (r.answers || []).reduce((acc, ans) => {
          acc[ans.questionId] = ans;
          return acc;
        }, {})
      );

      let reportedTo = null;
      let contentUrl = null;
      let commentText = null;

      // ---------------- FEED TARGET ----------------
      if (r.targetType === "Feed") {
        const feed = feedMap[r.targetId?.toString()];
        if (feed) {
          const ownerProfile =
            profileMap[feed.createdByAccount?.toString()] || {};

          reportedTo = {
            _id: feed.createdByAccount,
            userName: ownerProfile.userName || "Unknown User",
            avatar: ownerProfile.profileAvatar || null,
          };

          contentUrl = feed.contentUrl;
        }
      }

      // ---------------- USER TARGET ----------------
      if (r.targetType === "User") {
        const targetUser = profileMap[r.targetId?.toString()] || {};

        reportedTo = {
          _id: r.targetId,
          userName: targetUser.userName || "Unknown User",
          avatar: targetUser.profileAvatar || null,
        };
      }

      // -------------- COMMENT TARGET --------------
      if (r.targetType === "Comment") {
        const comment = commentMap[r.targetId?.toString()];
        if (comment) {
          const ownerProfile =
            profileMap[comment.userId?.toString()] || {};

          commentText = comment.commentText;

          reportedTo = {
            _id: comment.userId,
            userName: ownerProfile.userName || "Unknown User",
            avatar: ownerProfile.profileAvatar || null,
          };

          const feed = feedMap[comment.feedId?.toString()];
          contentUrl = feed?.contentUrl || null;
        }
      }

      return {
        _id: r._id,
        type: r.typeId?.name || "",
        targetType: r.targetType,

        reportedBy: {
          _id: r.reportedBy?._id || null,
          userName: reporterProfile.userName || "Unknown",
          avatar: reporterProfile.profileAvatar || null,
        },

        reportedTo,

        target: {
          contentUrl,
          commentText,
        },

        answers: uniqueAnswers,
        status: r.status,
        actionTaken: r.actionTaken,
        actionDate: r.actionDate,
        createdAt: r.createdAt,
      };
    });

    return res.json({
      message: "Reports fetched successfully",
      data: finalData,
    });

  } catch (err) {
    console.error("❌ Error fetching reports:", err);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};








