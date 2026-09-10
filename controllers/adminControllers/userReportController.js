// -------------------------------------------------------
// IMPORT MODELS
// -------------------------------------------------------
const ReportQuestion = require("../../models/userModels/Report/reprotQuetionAnswerModel");
const ReportType = require("../../models/userModels/Report/reportTypeModel");
const ReportLog = require("../../models/reportLog");
const Report = require("../../models/feedReportModel");
const User = require("../../models/userModels/userModel");
const Feed = require("../../models/feedModel");

// -------------------------------------------------------
// 3️⃣ GET FIRST QUESTION FOR A REPORT TYPE
// -------------------------------------------------------
exports.getStartQuestion = async (req, res) => {
  try {
    const { typeId } = req.query;

    if (!typeId)
      return res.status(400).json({ message: "typeId is required" });

    // Always pick the earliest created active question under this type
    const firstQuestion = await ReportQuestion.findOne({
      typeId,
      isActive: true,
    })
      .sort({ createdAt: 1 })
      .lean();

    if (!firstQuestion) {
      return res.status(404).json({
        message: "No active questions found for this report type",
      });
    }

    res.status(200).json({
      message: "Start question fetched",
      data: firstQuestion,
    });
  } catch (error) {
    console.error("Error fetching start question:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// -------------------------------------------------------
// 4️⃣ GET NEXT QUESTION BASED ON SELECTED OPTION
// -------------------------------------------------------
exports.getNextQuestion = async (req, res) => {
  try {
    const { reportId, questionId, selectedOption } = req.body;
    const userId = req.Id || req.body.userId;

    if (!reportId || !questionId || !selectedOption) {
      return res.status(400).json({
        message: "reportId, questionId, and selectedOption are required",
      });
    }

    const question = await ReportQuestion.findById(questionId);
    if (!question)
      return res.status(404).json({ message: "Question not found" });

    // Validate selected option
    const option = question.options.find(
      (o) => o._id.toString() === selectedOption
    );
    if (!option) {
      return res.status(400).json({ message: "Invalid option selected" });
    }

    // Save answer into Report.answers[]
    await Report.findByIdAndUpdate(
      reportId,
      {
        $push: {
          answers: {
            questionId,
            questionText: question.questionText,
            selectedOption: option.text,
          },
        },
      },
      { new: true }
    );

    // Log the answer
    await ReportLog.create({
      reportId,
      action: "Answered",
      performedBy: userId,
      answer: {
        questionId,
        questionText: question.questionText,
        selectedOption: option.text,
      },
    });

    // Return next question if exists
    if (option.nextQuestion) {
      const nextQuestion = await ReportQuestion.findById(option.nextQuestion)
        .lean();

      if (!nextQuestion) {
        return res.json({
          isLast: true,
          message: "Next question not found",
        });
      }

      return res.json({
        message: "Next question found",
        data: nextQuestion,
      });
    }

    // No next question → final step
    return res.json({
      isLast: true,
      message: "No more questions",
    });
  } catch (error) {
    console.error("Error in next question:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// -------------------------------------------------------
// 5️⃣ GET ALL ACTIVE REPORT TYPES
// -------------------------------------------------------
exports.getReportTypes = async (req, res) => {
  try {
    const types = await ReportType.find({ isActive: true })
      .sort({ createdAt: 1 })
      .lean();

    res.status(200).json({
      message: "Report types fetched",
      data: types,
    });
  } catch (error) {
    console.error("Error fetching report types:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// -------------------------------------------------------
// 6️⃣ CREATE INITIAL REPORT (FIRST ANSWER)
// -------------------------------------------------------
exports.createFeedReport = async (req, res) => {
  try {
    const { typeId, targetId, targetType, answers } = req.body;
    const userId = req.Id || req.body.userId;
console.log({targetId,userId})
    if (!typeId || !targetId || !targetType) {
      return res.status(400).json({
        message: "typeId, targetId, and targetType are required",
      });
    }

    if (!Array.isArray(answers) || answers.length === 0) {
      return res.status(400).json({
        message: "Answers must contain at least one item",
      });
    }

    // Normalize answer structure to match schema
    const formattedAnswers = answers.map((a) => ({
      questionId: a.questionId,
      questionText: a.questionText,
      selectedOption: a.selectedOption,
    }));

    const report = await Report.create({
      typeId,
      reportedBy: userId,
      targetId,
      targetType,
      answers: formattedAnswers,
    });

    await ReportLog.create({
      reportId: report._id,
      action: "Created",
      performedBy: userId,
      note: "Report created",
    });

    res.status(201).json({
      message: "Report created",
      data: report,
    });
  } catch (error) {
    console.error("Error creating report:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// -------------------------------------------------------
// 7️⃣ GET REPORT LOGS
// -------------------------------------------------------
exports.getReportLogs = async (req, res) => {
  try {
    const { reportId } = req.params;

    const logs = await ReportLog.find({ reportId })
      .populate("performedBy", "userName email")
      .sort({ performedAt: -1 });

    res.json({ reportId, logs });
  } catch (error) {
    console.error("Error fetching logs:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};
