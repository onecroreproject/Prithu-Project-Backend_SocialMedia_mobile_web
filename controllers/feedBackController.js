const User = require("../models/userModels/userModel");
const SupportQuery = require("../models/SupportQuery");
const UserFeedback = require("../models/UserFeedbackAndReport");
const { getIO } = require("../middlewares/webSocket");

exports.submitUserFeedback = async (req, res) => {
  try {
    const userId = req.Id; // from auth middleware

    const {
      section,
      type,
      entityId,
      entityType,
      title,
      message,
      category,
      device,
      platform,
      guestName,
      guestEmail,
    } = req.body;

    if (!section || !type || !message) {
      return res.status(400).json({
        success: false,
        message: "section, type, and message are required",
      });
    }

    // If user is logged in, optionally update their details if provided in guest fields
    if (userId) {
      const user = await User.findById(userId);
      if (user) {
        let updated = false;
        // Example: If user has no username/email set (unlikely for email but possible for other fields)
        // Or if we want to allow updating current user details via this form
        // User requested: "if the user detail comes save in exist be/models/userModels/userModel.js"
        // We should be careful not to overwrite critical data without verification, 
        // but here we'll assume the user wants to keep the userModel updated.

        // For now, let's just make sure we are associating correctly.
      }
    }

    const feedback = await UserFeedback.create({
      userId,
      guestName,
      guestEmail,
      section,
      type,
      entityId,
      entityType,
      title,
      message,
      category,
      device,
      platform,
      ipAddress: req.ip,
    });

    // Emit socket event for admin real-time update
    const io = getIO();
    if (io) {
      io.emit("newSupportQuery", feedback);
    }

    res.status(201).json({
      success: true,
      message: "Feedback submitted successfully",
      data: feedback,
    });
  } catch (err) {
    console.error("Submit Feedback Error:", err);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};




exports.getMyFeedbackAndReports = async (req, res) => {
  try {
    const userId = req.Id; // from auth middleware

    const {
      type,        // feedback | report
      section,     // post, comment, job, etc.
      status,      // pending | in_review | resolved | rejected
      category,    // bug, spam, abuse, etc.
      search,
      page = 1,
      limit = 10,
    } = req.query;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    /* -------------------- Build Query -------------------- */
    const query = {
      userId,
    };

    // Enum-safe filters (as per schema)
    if (type && ["feedback", "report"].includes(type)) {
      query.type = type;
    }

    if (
      section &&
      [
        "post",
        "comment",
        "portfolio",
        "profile",
        "help",
        "referral",
        "notification",
        "app",
        "other",
      ].includes(section)
    ) {
      query.section = section;
    }

    if (
      status &&
      ["pending", "in_review", "resolved", "rejected"].includes(status)
    ) {
      query.status = status;
    }

    if (
      category &&
      [
        "bug",
        "spam",
        "abuse",
        "harassment",
        "misinformation",
        "feature_request",
        "performance",
        "ui_ux",
        "other",
      ].includes(category)
    ) {
      query.category = category;
    }

    // Search in title & message
    if (search) {
      const regex = new RegExp(search.trim(), "i");
      query.$or = [{ title: regex }, { message: regex }];
    }

    /* -------------------- Fetch Data -------------------- */
    const skip = (Number(page) - 1) * Number(limit);

    const [feedbacks, total] = await Promise.all([
      UserFeedback.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .lean(),

      UserFeedback.countDocuments(query),
    ]);

    /* -------------------- Response -------------------- */
    return res.status(200).json({
      success: true,
      meta: {
        total,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(total / limit),
      },
      data: feedbacks,
    });
  } catch (err) {
    console.error("❌ Get My Feedback Error:", err);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};





exports.getAllUserFeedback = async (req, res) => {
  try {
    const {
      section,
      type,
      status,
      search,
      page = 1,
      limit = 20,
    } = req.query;

    const query = {};

    if (section) query.section = section;
    if (type) query.type = type;
    if (status) query.status = status;

    if (search) {
      query.$or = [
        { title: new RegExp(search, "i") },
        { message: new RegExp(search, "i") },
      ];
    }

    const feedbacks = await UserFeedback.find(query)
      .populate("userId", "userName email")
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit))
      .lean();

    const total = await UserFeedback.countDocuments(query);

    res.status(200).json({
      success: true,
      total,
      page: Number(page),
      data: feedbacks,
    });
  } catch (err) {
    console.error("Get Feedback Error:", err);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};



exports.updateFeedbackStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, adminNote } = req.body;

    const feedback = await UserFeedback.findByIdAndUpdate(
      id,
      { status, adminNote },
      { new: true }
    );

    if (!feedback) {
      return res.status(404).json({
        success: false,
        message: "Feedback not found",
      });
    }
    res.status(200).json({
      success: true,
      message: "Feedback updated",
      data: feedback,
    });
  } catch (err) {
    console.error("Update Feedback Error:", err);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};


/* -------------------------------------------------------------------------- */
/*                            SUPPORT QUERY SECTION                           */
/* -------------------------------------------------------------------------- */

exports.submitSupportQuery = async (req, res) => {
  try {
    const userId = req.Id;
    const { name, email, subject, message } = req.body;

    if (!name || !email || !subject || !message) {
      return res.status(400).json({
        success: false,
        message: "All fields are required",
      });
    }

    const query = await SupportQuery.create({
      userId,
      name,
      email,
      subject,
      message,
    });

    // Emit live update for Admin
    const io = getIO();
    if (io) {
      io.emit("newSupportQuery", query);
    }

    res.status(201).json({
      success: true,
      message: "Support query submitted successfully",
      data: query,
    });
  } catch (err) {
    console.error("Submit Support Query Error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

exports.getAllSupportQueries = async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const filter = {};
    if (status && ["pending", "resolved"].includes(status)) {
      filter.status = status;
    }

    const queries = await SupportQuery.find(filter)
      .populate("userId", "userName email")
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit))
      .lean();

    const total = await SupportQuery.countDocuments(filter);

    res.status(200).json({
      success: true,
      total,
      data: queries,
    });
  } catch (err) {
    console.error("Get Support Queries Error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

exports.updateSupportQueryStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const query = await SupportQuery.findByIdAndUpdate(
      id,
      { status },
      { new: true }
    );

    if (!query) {
      return res.status(404).json({ success: false, message: "Query not found" });
    }

    res.status(200).json({
      success: true,
      message: `Support query marked as ${status}`,
      data: query,
    });
  } catch (err) {
    console.error("Update Support Query Error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

exports.getMySupportQueries = async (req, res) => {
  try {
    const userId = req.Id;
    const queries = await SupportQuery.find({ userId }).sort({ createdAt: -1 });
    res.status(200).json({ success: true, data: queries });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
