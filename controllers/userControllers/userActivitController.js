const UserActivity = require("../../models/userModels/userActivitySchema");


exports.getMyActivities = async (req, res) => {
  try {
    const userId = req.Id;

    if (!userId) {
      return res.status(400).json({ success: false, message: "User ID missing" });
    }

    // 🔥 Get today's date range
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);   // 00:00

    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999); // 23:59

    // 🔥 Query only today’s activities
    const activities = await UserActivity.find({
      userId,
      createdAt: { $gte: startOfDay, $lte: endOfDay }
    })
      .sort({ createdAt: -1 })
      .populate("targetId", "title userName companyName");

    res.json({ success: true, activities });

  } catch (err) {
    console.error("Error fetching today's activities:", err);
    res.status(500).json({ error: err.message });
  }
};

exports.getUserActivitiesForAdmin = async (req, res) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({ success: false, message: "User ID missing" });
    }

    const activities = await UserActivity.find({ userId })
      .sort({ createdAt: -1 })
      .populate("targetId", "title userName displayName profileAvatar")
      .lean();

    res.json({ success: true, activities });

  } catch (err) {
    console.error("Error fetching user activities for admin:", err);
    res.status(500).json({ error: err.message });
  }
};
