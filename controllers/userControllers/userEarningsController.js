const mongoose = require("mongoose");

const UserEarning = require("../../models/userModels/userRefferalModels/referralEarnings.js");
const ProfileSettings = require("../../models/profileSettingModel");
const Withdrawal = require("../../models/userModels/userRefferalModels/withdrawal.js");
const SubscriptionPlan = require("../../models/subscriptionModels/subscriptionPlanModel.js");
const ReferralCycle = require("../../models/userModels/userRefferalModels/referralCycle");
const User = require("../../models/userModels/userModel");






exports.getUserEarnings = async (req, res) => {
  try {
    const userId = req.Id;
    const { fromDate, toDate } = req.query;

    if (!userId || !userId) {
      return res.status(400).json({ message: "Valid userId is required" });
    }

    // Date range filter
    const matchQuery = { userId: new mongoose.Types.ObjectId(userId) };
    if (fromDate || toDate) {
      matchQuery.createdAt = {};
      if (fromDate) matchQuery.createdAt.$gte = new Date(fromDate);
      if (toDate) matchQuery.createdAt.$lte = new Date(toDate);
    }

    // 1️⃣ Total Earnings and Breakdown
    const earningsPipeline = [
      { $match: matchQuery },
      { $sort: { createdAt: -1 } },
      {
        $facet: {
          total: [{ $group: { _id: null, total: { $sum: "$amount" } } }],
          breakdown: [
            {
              $group: {
                _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
                amount: { $sum: "$amount" }
              }
            },
            { $sort: { _id: -1 } }
          ],
          details: [
            {
              $lookup: {
                from: "profilesettings",
                localField: "fromUserId",
                foreignField: "userId",
                as: "profile",
                pipeline: [{ $project: { userName: 1, profileAvatar: 1, modifyAvatarPublicId: 1 } }]
              }
            },
            { $unwind: "$profile" },
            {
              $project: {
                fromUserName: "$profile.userName",
                fromUserAvatar: { $ifNull: ["$profile.modifyAvatarPublicId", "$profile.profileAvatar"] },
                amount: 1,
                createdAt: 1
              }
            }
          ]
        }
      }
    ];

    const [result] = await UserEarning.aggregate(earningsPipeline);

    const totalEarnings = result.total[0]?.total || 0;
    const breakdown = result.breakdown;
    const earningsDetails = result.details;

    // 2️⃣ Total Withdrawn
    const withdrawalResult = await Withdrawal.aggregate([
      { $match: { userId: new mongoose.Types.ObjectId(userId), status: "completed" } },
      { $group: { _id: null, totalWithdrawn: { $sum: "$withdrawalAmount" } } }
    ]);

    const totalWithdrawn = withdrawalResult[0]?.totalWithdrawn || 0;

    // Cycle-aware balance
    const activeCycles = await ReferralCycle.find({
      userId,
      status: { $in: ["active", "completed"] }
    });
    const currentBalance = activeCycles.reduce((sum, c) => sum + c.earnedAmount, 0);

    return res.status(200).json({
      success: true,
      totalEarnings,
      totalWithdrawn,
      balance: currentBalance,
      breakdown,
      earnings: earningsDetails
    });

  } catch (error) {
    console.error("Error fetching user earnings:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// 6️⃣ Get User Balance Amount
exports.getUserBalance = async (req, res) => {
  try {
    const userId = req.Id;

    const earningsResult = await UserEarning.aggregate([
      { $match: { userId: new mongoose.Types.ObjectId(userId) } },
      { $group: { _id: null, total: { $sum: "$amount" } } }
    ]);

    const withdrawalResult = await Withdrawal.aggregate([
      { $match: { userId: new mongoose.Types.ObjectId(userId), status: "completed" } },
      { $group: { _id: null, totalWithdrawn: { $sum: "$withdrawalAmount" } } }
    ]);

    const totalEarnings = earningsResult[0]?.total || 0;
    const totalWithdrawn = withdrawalResult[0]?.totalWithdrawn || 0;

    // Cycle-aware balance
    const activeCycles = await ReferralCycle.find({
      userId,
      status: { $in: ["active", "completed"] }
    });
    const currentBalance = activeCycles.reduce((sum, c) => sum + c.earnedAmount, 0);

    return res.status(200).json({
      success: true,
      totalEarnings,
      totalWithdrawn,
      balance: currentBalance
    });
  } catch (error) {
    console.error("Error getting user balance:", error);
    return res.status(500).json({ message: "Server error", error: error.message });
  }
};



