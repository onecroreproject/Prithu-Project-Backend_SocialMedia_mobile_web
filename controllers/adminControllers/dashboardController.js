const User = require("../../models/userModels/userModel");
const Account = require("../../models/accountSchemaModel");
const UserSubscription = require("../../models/subscriptionModels/userSubscriptionModel"); // stores user subscriptions with planId
const SubscriptionPlan = require("../../models/subscriptionModels/subscriptionPlanModel");
const Report = require("../../models/feedReportModel");
const ChildAdmin = require("../../models/childAdminModel");

exports.getDashboardMetricCount = async (req, res) => {
  try {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const twentyMinutesAgo = new Date(Date.now() - 20 * 60 * 1000);

    // -----------------------------------
    // Run all queries in parallel
    // -----------------------------------
    const [
      totalUsers,
      onlineUsers,
      newRegistrationsToday,
      suspendedUsers,
      totalReports,
      // Child Admin Stats
      totalChildAdmins,
      onlineChildAdmins,
      onlineChildAdminsNamesData,
    ] = await Promise.all([
      // 1️⃣ Total Users
      User.countDocuments(),

      // 2️⃣ Online Users (Using 20min threshold for consistency with User Detail page)
      User.countDocuments({
        isOnline: true,
        lastSeenAt: { $gte: twentyMinutesAgo }
      }),

      // 3️⃣ New registrations today
      User.countDocuments({
        createdAt: { $gte: startOfToday },
      }),

      // 4️⃣ Suspended users
      User.countDocuments({
        isBlocked: true,
      }),

      // 5️⃣ Total reports
      Report.countDocuments(),

      // 6️⃣ Total Child Admins
      ChildAdmin.countDocuments(),

      // 7️⃣ Online Child Admins
      ChildAdmin.countDocuments({ isOnline: true }),

      // 8️⃣ Online Child Admin Names
      ChildAdmin.find({ isOnline: true }).select("userName").lean(),
    ]);

    const onlineAdminNames = (onlineChildAdminsNamesData || []).map(admin => admin.userName);

    // -----------------------------------
    // Send response
    // -----------------------------------
    return res.status(200).json({
      success: true,
      totalUsers,
      onlineUsers,
      newRegistrationsToday,
      suspendedUsers,
      totalReports,
      totalChildAdmins,
      onlineChildAdmins,
      onlineAdminNames,
    });
  } catch (error) {
    console.error("Dashboard metric error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch dashboard metrics",
      error: error.message,
    });
  }
};





exports.getDashUserRegistrationRatio = async (req, res) => {
  try {
    const range = req.query.range || "yearly"; // "yearly", "quarterly", "monthly"
    const selectedYear = parseInt(req.query.year) || new Date().getFullYear();
    const selectedMonth = parseInt(req.query.month) || (new Date().getMonth() + 1);

    let matchQuery = {};
    let groupFormat = {};
    let dataLength = 0;
    let categories = [];

    // ---------------------------------------
    // Set match and group stages based on range
    // ---------------------------------------
    if (range === "monthly") {
      const startDate = new Date(selectedYear, selectedMonth - 1, 1);
      const endDate = new Date(selectedYear, selectedMonth, 0, 23, 59, 59, 999);
      matchQuery = { createdAt: { $gte: startDate, $lte: endDate } };
      groupFormat = { $dayOfMonth: "$createdAt" };
      dataLength = new Date(selectedYear, selectedMonth, 0).getDate();
    } else if (range === "quarterly") {
      matchQuery = {
        createdAt: {
          $gte: new Date(`${selectedYear}-01-01`),
          $lte: new Date(`${selectedYear}-12-31T23:59:59.999Z`)
        }
      };
      groupFormat = { $ceil: { $divide: [{ $month: "$createdAt" }, 3] } };
      dataLength = 4;
    } else {
      // Default: yearly (monthly breakdown)
      matchQuery = {
        createdAt: {
          $gte: new Date(`${selectedYear}-01-01`),
          $lte: new Date(`${selectedYear}-12-31T23:59:59.999Z`)
        }
      };
      groupFormat = { $month: "$createdAt" };
      dataLength = 12;
    }

    const result = await User.aggregate([
      { $match: matchQuery },
      {
        $project: {
          groupKey: groupFormat,
          isActiveToday: {
            $cond: [
              { $gte: ["$lastActiveAt", new Date(new Date().setHours(0, 0, 0, 0))] },
              1,
              0
            ]
          },
          isSuspended: { $cond: [{ $eq: ["$isBlocked", true] }, 1, 0] },
          subscriptionActive: {
            $cond: [{ $eq: ["$subscription.isActive", true] }, 1, 0]
          }
        }
      },
      {
        $group: {
          _id: "$groupKey",
          registrations: { $sum: 1 },
          activeUsers: { $sum: "$isActiveToday" },
          suspendedUsers: { $sum: "$isSuspended" },
          subscriptionUsers: { $sum: "$subscriptionActive" }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // ---------------------------------------
    // Prepare formatted dataset
    // ---------------------------------------
    const data = Array.from({ length: dataLength }, (_, i) => ({
      index: i + 1,
      registrations: 0,
      activeUsers: 0,
      suspendedUsers: 0,
      subscriptionUsers: 0,
      growthPercent: 0
    }));

    result.forEach(item => {
      const index = item._id - 1;
      if (index >= 0 && index < dataLength) {
        data[index] = {
          ...data[index],
          registrations: item.registrations || 0,
          activeUsers: item.activeUsers || 0,
          suspendedUsers: item.suspendedUsers || 0,
          subscriptionUsers: item.subscriptionUsers || 0
        };
      }
    });

    // Label categories for frontend
    if (range === "monthly") {
      categories = data.map(d => d.index.toString());
    } else if (range === "quarterly") {
      categories = ["Q1", "Q2", "Q3", "Q4"];
    } else {
      categories = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    }

    // ---------------------------------------
    // Calculate month-to-month growth %
    // ---------------------------------------
    for (let i = 1; i < dataLength; i++) {
      const prev = data[i - 1].registrations;
      const curr = data[i].registrations;
 
      data[i].growthPercent =
        prev === 0 ? (curr > 0 ? 100 : 0) : ((curr - prev) / prev) * 100;
    }
 
    // ---------------------------------------
    // Return the dataset
    // ---------------------------------------
    return res.status(200).json({
      success: true,
      year: selectedYear,
      range,
      categories,
      monthlyData: data
    });

  } catch (err) {
    console.error("❌ Monthly Growth Error:", err);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};





exports.getDashUserSubscriptionRatio = async (req, res) => {
  try {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);

    // 1️⃣ Get total users count
    const totalUsers = await User.countDocuments();

    // 2️⃣ Aggregate active subscriptions with plan price and overall subscription users
    const subscriptionStats = await UserSubscription.aggregate([
      {
        $lookup: {
          from: "SubscriptionPlan", // check your collection name in MongoDB
          localField: "planId",
          foreignField: "_id",
          as: "plan",
        },
      },
      { $unwind: "$plan" },
      {
        $group: {
          _id: null,
          totalSubscriptionAmount: { $sum: "$plan.price" },
          todaySubscriptionAmount: {
            $sum: {
              $cond: [
                { $and: [{ $gte: ["$createdAt", startOfToday] }, { $lte: ["$createdAt", endOfToday] }] },
                "$plan.price",
                0,
              ],
            },
          },
          todaySubscriptionUsers: {
            $sum: {
              $cond: [
                { $and: [{ $gte: ["$createdAt", startOfToday] }, { $lte: ["$createdAt", endOfToday] }] },
                1,
                0,
              ],
            },
          },
          // ✅ Count distinct active subscription users for overall ratio
          activeUserIds: { $addToSet: "$userId" },
        },
      },
    ]);

    const stats = subscriptionStats[0] || {
      totalSubscriptionAmount: 0,
      todaySubscriptionAmount: 0,
      todaySubscriptionUsers: 0,
      activeUserIds: [],
    };

    // 3️⃣ Calculate overall subscription ratio
    const overallSubscriptionUsers = stats.activeUserIds.length;
    const ratioPercentage = totalUsers
      ? ((overallSubscriptionUsers / totalUsers) * 100).toFixed(2)
      : "0.00";

    res.json({
      totalUsers,
      totalSubscriptionAmount: stats.totalSubscriptionAmount,
      todaySubscriptionUsers: stats.todaySubscriptionUsers,
      todaySubscriptionAmount: stats.todaySubscriptionAmount,
      overallSubscriptionUsers,
      ratioPercentage,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};












exports.getDashboardHeartbeat = async (req, res) => {
  try {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);
    const twentyMinutesAgo = new Date(Date.now() - 20 * 60 * 1000);

    const [
      metrics,
      subscriptionStats,
      recentSubscriptions
    ] = await Promise.all([
      // 1. Core Metrics (Optimized)
      Promise.all([
        User.countDocuments(),
        User.countDocuments({ isOnline: true, lastSeenAt: { $gte: twentyMinutesAgo } }),
        User.countDocuments({ createdAt: { $gte: startOfToday } }),
        User.countDocuments({ isBlocked: true }),
        Report.countDocuments(),
        ChildAdmin.countDocuments(),
        ChildAdmin.countDocuments({ isOnline: true }),
        ChildAdmin.find({ isOnline: true }).select("userName").lean(),
      ]).then(([totalUsers, onlineUsers, newRegistrationsToday, suspendedUsers, totalReports, totalChildAdmins, onlineChildAdmins, onlineChildAdminsNamesData]) => ({
        totalUsers,
        onlineUsers,
        newRegistrationsToday,
        suspendedUsers,
        totalReports,
        totalChildAdmins,
        onlineChildAdmins,
        onlineAdminNames: (onlineChildAdminsNamesData || []).map(admin => admin.userName)
      })),

      // 2. Subscription Revenue Stats (Aggregated)
      UserSubscription.aggregate([
        {
          $lookup: {
            from: "SubscriptionPlan",
            localField: "planId",
            foreignField: "_id",
            as: "plan",
          },
        },
        { $unwind: "$plan" },
        {
          $group: {
            _id: null,
            totalSubscriptionAmount: { $sum: "$plan.price" },
            todaySubscriptionAmount: {
              $sum: {
                $cond: [
                  { $and: [{ $gte: ["$createdAt", startOfToday] }, { $lte: ["$createdAt", endOfToday] }] },
                  "$plan.price",
                  0,
                ],
              },
            },
            activeUserIds: { $addToSet: "$userId" },
          },
        },
      ]).then(res => res[0] || { totalSubscriptionAmount: 0, todaySubscriptionAmount: 0, activeUserIds: [] }),

      // 3. Recent Subscriptions (Latest 5)
      UserSubscription.find()
        .sort({ createdAt: -1 })
        .limit(5)
        .populate({
          path: "planId",
          select: "planName price",
          model: SubscriptionPlan,
        })
        .lean()
    ]);

    // Fetch user details for recent subscriptions
    const userIds = recentSubscriptions.map(sub => sub.userId);
    const ProfileSettings = require("../../models/profileSettingModel");
    const profiles = await ProfileSettings.find(
      { userId: { $in: userIds } },
      { userId: 1, userName: 1, profileAvatar: 1 }
    ).lean();

    const profileMap = profiles.reduce((acc, p) => {
      acc[p.userId.toString()] = p;
      return acc;
    }, {});

    const formattedRecentSubscribers = recentSubscriptions.map(sub => ({
      id: sub._id,
      userName: profileMap[sub.userId?.toString()]?.userName || "Unknown",
      avatar: profileMap[sub.userId?.toString()]?.profileAvatar || null,
      planName: sub.planId?.planName || "Trial",
      price: sub.planId?.price || 0,
      createdAt: sub.createdAt,
      status: sub.paymentStatus
    }));

    const totalUsers = metrics.totalUsers;
    const ratioPercentage = totalUsers ? ((subscriptionStats.activeUserIds.length / totalUsers) * 100).toFixed(2) : "0.00";

    res.status(200).json({
      success: true,
      metrics,
      revenue: {
        totalAmount: subscriptionStats.totalSubscriptionAmount,
        todayAmount: subscriptionStats.todaySubscriptionAmount,
        ratioPercentage
      },
      recentSubscribers: formattedRecentSubscribers
    });
  } catch (error) {
    console.error("Dashboard heartbeat error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};
