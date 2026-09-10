const AnalyticsMetric = require("../../../models/adminModels/salesDashboardMetricks");
const UserSubscription = require("../../../models/subscriptionModels/userSubscriptionModel");
const ProfileSettings = require("../../../models/profileSettingModel");
const SubscriptionPlan = require("../../../models/subscriptionModels/subscriptionPlanModel");
const UserReferral = require("../../../models/userModels/userRefferalModels/userReferralModel");
const UserEarning = require("../../../models/userModels/userRefferalModels/referralEarnings");
const User = require("../../../models/userModels/userModel");
const SubscriptionInvoice = require("../../../models/InvoiceModel/subscriptionInvoice");
const WithdrawalInvoice = require("../../../models/InvoiceModel/withdrawelInvoice");


exports.getAnalytics = async (req, res) => {
  try {
    let { startDate, endDate } = req.query;

    let currentStart, currentEnd;

    if (startDate && endDate) {
      currentStart = new Date(startDate);
      currentStart.setHours(0, 0, 0, 0);

      currentEnd = new Date(endDate);
      currentEnd.setHours(23, 59, 59, 999);
    } else {
      // Default to last 30 days
      currentEnd = new Date();
      currentEnd.setHours(23, 59, 59, 999);
      currentStart = new Date();
      currentStart.setDate(currentEnd.getDate() - 29);
      currentStart.setHours(0, 0, 0, 0);
    }

    const duration = currentEnd.getTime() - currentStart.getTime();
    const baselineStart = new Date(currentStart.getTime() - duration - 1);
    const baselineEnd = new Date(currentStart.getTime() - 1);

    const getPeriodStats = async (start, end) => {
      // 1. Snapshot metrics at the end of the period
      const [totalUsers, byReferralUsers, trialFinishedUsers, latestSnapshot] = await Promise.all([
        User.countDocuments({ createdAt: { $lte: end } }),
        User.countDocuments({ referredByUserId: { $ne: null }, createdAt: { $lte: end } }),
        User.countDocuments({ trialUsed: true, createdAt: { $lte: end } }),
        // For actual subscribers, we rely on the daily snapshots as it's the only historical record of "active" status
        AnalyticsMetric.findOne({ date: { $lte: end } }).sort({ date: -1 }).lean()
      ]);

      // 2. Incremental metrics within the period
      const Invoice = require("../../../models/subscriptionModels/invoiceModel");
      const [revenueData, withdrawalsData] = await Promise.all([
        // Sum actual paid invoice amounts (most accurate - captures price at time of payment)
        Invoice.aggregate([
          { $match: { status: "paid", paidAt: { $gte: start, $lte: end } } },
          { $group: { _id: null, total: { $sum: "$amount" } } }
        ]),

        // Accumulate completed withdrawals in the range
        WithdrawalInvoice.aggregate([
          { $match: { status: "completed", processedAt: { $gte: start, $lte: end } } },
          { $group: { _id: null, count: { $sum: 1 }, total: { $sum: "$withdrawalAmount" } } }
        ])
      ]);

      return {
        totalUsers,
        byReferralUsers,
        totalTrialUsers: trialFinishedUsers, // "who finish their trail"
        totalSubscribers: latestSnapshot?.totalSubscribers || 0, // "who actually subscribed"
        totalRevenue: revenueData[0]?.total || 0,
        totalWithdrawals: withdrawalsData[0]?.count || 0,
        totalWithdrawalAmount: withdrawalsData[0]?.total || 0
      };
    };

    const [totals, baseline, currentData] = await Promise.all([
      getPeriodStats(currentStart, currentEnd),
      getPeriodStats(baselineStart, baselineEnd),
      AnalyticsMetric.find({ date: { $gte: currentStart, $lte: currentEnd } }).sort({ date: 1 })
    ]);

    res.status(200).json({
      success: true,
      data: currentData,
      totals,
      baseline
    });
  } catch (err) {
    console.error("❌ Error fetching analytics:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};








exports.getRecentSubscriptionUsers = async (req, res) => {
  try {
    // ✅ Fetch latest subscriptions (limit 5)
    const subscriptions = await UserSubscription.find()
      .sort({ createdAt: -1 }) // most recent first
      .limit(5)
      .populate({
        path: "planId",
        select: "planName planType duration price",
        model: SubscriptionPlan,
      })
      .lean();

    // ✅ Get all unique userIds
    const userIds = subscriptions.map((sub) => sub.userId);

    // ✅ Fetch profile details (username, avatar)
    const profiles = await ProfileSettings.find(
      { userId: { $in: userIds } },
      { userId: 1, userName: 1, modifyAvatar: 1, profileAvatar: 1 }
    ).lean();

    // ✅ Map profile info to subscriptions
    const profileMap = profiles.reduce((acc, profile) => {
      acc[profile.userId.toString()] = profile;
      return acc;
    }, {});

    // ✅ Fetch emails from User collection
    const users = await User.find({ _id: { $in: userIds } }).select("email").lean();
    const emailMap = users.reduce((acc, user) => {
      acc[user._id.toString()] = user.email;
      return acc;
    }, {});

    // ✅ Build final result
    const result = subscriptions.map((sub) => {
      const profile = profileMap[sub.userId?.toString()] || {};
      return {
        userId: sub.userId,
        userName: profile.userName || "Unknown User",
        avatar: profile.modifyAvatar || profile.profileAvatar || null,
        planName: sub.planId?.planName || "N/A",
        planType: sub.planId?.planType || "N/A",
        startDate: sub.startDate,
        endDate: sub.endDate,
        isActive: sub.isActive,
        email: emailMap[sub.userId?.toString()] || "N/A",
        paymentStatus: sub.paymentStatus,
        createdAt: sub.createdAt,
      };
    });

    res.status(200).json({
      success: true,
      count: result.length,
      data: result,
    });
  } catch (error) {
    console.error("Error fetching recent subscriptions:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching recent subscriptions",
    });
  }
};







exports.getTopReferralUsers = async (req, res) => {
  try {
    // 1️⃣ Aggregate top users by number of referrals
    const topReferrals = await UserReferral.aggregate([
      {
        $project: {
          parentId: 1,
          referralCount: { $size: "$childIds" }, // count of referred users
        },
      },
      { $sort: { referralCount: -1 } }, // sort descending
      { $limit: 10 }, // top 10 users
    ]);

    const parentIds = topReferrals.map((ref) => ref.parentId);



    // 3️⃣ Fetch profile info for all parentIds
    const profiles = await ProfileSettings.find(
      { userId: { $in: parentIds } },
      { userId: 1, userName: 1, modifyAvatar: 1, profileAvatar: 1 }
    ).lean();

    const profileMap = profiles.reduce((acc, profile) => {
      acc[profile.userId.toString()] = profile;
      return acc;
    }, {});

    // 4️⃣ Fetch emails from User collection
    const users = await User.find({ _id: { $in: parentIds } }).select("_id email").lean();
    const emailMap = users.reduce((acc, user) => {
      acc[user._id.toString()] = user.email;
      return acc;
    }, {});

    // 5️⃣ Fetch total earnings for all parentIds
    const earningsData = await UserEarning.aggregate([
      { $match: { userId: { $in: parentIds } } },
      {
        $group: {
          _id: "$userId",
          totalEarnings: { $sum: "$amount" },
        },
      },
    ]);

    const earningsMap = earningsData.reduce((acc, earning) => {
      acc[earning._id.toString()] = earning.totalEarnings;
      return acc;
    }, {});

    // 6️⃣ Combine data
    const results = topReferrals.map((ref) => {
      const profile = profileMap[ref.parentId.toString()] || {};
      const totalEarnings = earningsMap[ref.parentId.toString()] || 0;
      const email = emailMap[ref.parentId.toString()] || "Unknown";

      return {
        parentId: ref.parentId,
        userName: profile.userName || "Unknown",
        avatar: profile.profileAvatar || null,
        referralCount: ref.referralCount,
        totalEarnings,
        email: email
      };
    });

    res.status(200).json({ success: true, data: results });
  } catch (err) {
    console.error("Error getting top referrals:", err);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};



exports.getUserAndSubscriptionCountsDaily = async (req, res) => {
  try {
    const { period = "month" } = req.query;

    let startDate;
    let format;
    let days;
    let labels = [];

    const now = new Date();

    if (period === "week") {
      days = 7;
      startDate = new Date(now);
      startDate.setDate(now.getDate() - 6);
      startDate.setHours(0, 0, 0, 0);
      format = "%Y-%m-%d";
      // Generate last 7 days labels in Local Time for consistency with what users expect
      for (let i = 0; i < 7; i++) {
        const d = new Date(startDate);
        d.setDate(startDate.getDate() + i);
        // Using local date string YYYY-MM-DD
        const year = d.getFullYear();
        const month = (d.getMonth() + 1).toString().padStart(2, '0');
        const day = d.getDate().toString().padStart(2, '0');
        labels.push(`${year}-${month}-${day}`);
      }
    } else if (period === "year") {
      startDate = new Date(now.getFullYear() - 4, 0, 1); // last 5 years
      format = "%Y";
      for (let i = 0; i < 5; i++) {
        labels.push((now.getFullYear() - 4 + i).toString());
      }
    } else {
      // month (default: current year months)
      startDate = new Date(now.getFullYear(), 0, 1);
      format = "%Y-%m";
      for (let i = 0; i < 12; i++) {
        const year = now.getFullYear();
        const month = (i + 1).toString().padStart(2, '0');
        labels.push(`${year}-${month}`);
      }
    }

    // Aggregate registered users
    // IMPORTANT: Aggregation $dateToString handles UTC dates. 
    // To match local dates, we should use a timezone offset if possible, 
    // but for simplicity & consistency we'll use the timezone of the server.
    const userCounts = await User.aggregate([
      { $match: { createdAt: { $gte: startDate } } },
      {
        $group: {
          _id: { $dateToString: { format: format, date: "$createdAt", timezone: "Asia/Kolkata" } },
          count: { $sum: 1 },
        },
      },
    ]);

    // Aggregate subscription users
    const subscriptionCounts = await UserSubscription.aggregate([
      { $match: { createdAt: { $gte: startDate } } },
      {
        $group: {
          _id: { $dateToString: { format: format, date: "$createdAt", timezone: "Asia/Kolkata" } }, // Use IST timezone for grouping
          count: { $sum: 1 },
        },
      },
    ]);

    const regData = labels.map(label => {
      const match = userCounts.find(u => u._id === label);
      return match ? match.count : 0;
    });

    const subData = labels.map(label => {
      const match = subscriptionCounts.find(s => s._id === label);
      return match ? match.count : 0;
    });

    // Format labels for frontend if needed (e.g., "2024-01" -> "Jan")
    const displayLabels = labels.map(label => {
      if (period === "month") {
        const monthIdx = parseInt(label.split("-")[1]) - 1;
        const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        return monthNames[monthIdx];
      }
      if (period === "week") {
        const d = new Date(label);
        const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
        return dayNames[d.getDay()];
      }
      return label; // year remains same
    });

    res.status(200).json({
      success: true,
      data: {
        categories: displayLabels,
        registeredUsers: regData,
        subscriptionUsers: subData,
      },
    });
  } catch (error) {
    console.error("Error fetching user/subscription counts:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching counts",
    });
  }
};




exports.getRecentWithdrawalUsers = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;

    // ✅ Fetch latest completed withdrawals
    const withdrawals = await WithdrawalInvoice.find({ status: "completed" })
      .sort({ processedAt: -1 })
      .limit(limit)
      .lean();

    // ✅ Get all unique userIds
    const userIds = withdrawals.map((w) => w.userId);

    // ✅ Fetch profile details (username, avatar)
    const profiles = await ProfileSettings.find(
      { userId: { $in: userIds } },
      { userId: 1, userName: 1, modifyAvatar: 1, profileAvatar: 1 }
    ).lean();

    const profileMap = profiles.reduce((acc, profile) => {
      acc[profile.userId.toString()] = profile;
      return acc;
    }, {});

    // ✅ Fetch emails from User collection
    const users = await User.find({ _id: { $in: userIds } }).select("email").lean();
    const emailMap = users.reduce((acc, user) => {
      acc[user._id.toString()] = user.email;
      return acc;
    }, {});

    // ✅ Build final result
    const result = withdrawals.map((w) => {
      const profile = profileMap[w.userId?.toString()] || {};
      return {
        id: w._id,
        userId: w.userId,
        userName: profile.userName || "Unknown User",
        email: emailMap[w.userId?.toString()] || "N/A",
        amount: w.withdrawalAmount,
        processedAt: w.processedAt,
        avatar: profile.modifyAvatar || profile.profileAvatar || null,
        status: w.status
      };
    });

    res.status(200).json({
      success: true,
      count: result.length,
      data: result
    });
  } catch (err) {
    console.error("❌ Error fetching recent withdrawals:", err);
    res.status(500).json({ success: false, message: "Server error while fetching withdrawals" });
  }
};
