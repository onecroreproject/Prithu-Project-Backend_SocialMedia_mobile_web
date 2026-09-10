// controllers/analyticsController.js
const UserSubscription = require("../../models/subscriptionModels/userSubscriptionModel.js");
const Invoice = require("../../models/subscriptionModels/invoiceModel.js");
const WithdrawalInvoice = require("../../models/InvoiceModel/withdrawelInvoice.js");
const AnalyticsMetric = require("../../models/adminModels/salesDashboardMetricks.js");
const User = require("../../models/userModels/userModel.js");

exports.updateDailyAnalytics = async () => {
  try {
    const today = new Date();
    const startOfDay = new Date(today);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(today);
    endOfDay.setHours(23, 59, 59, 999);

    // ✅ Total users
    const totalUsers = await User.countDocuments();

    // ✅ Referral users count
    const byReferralUsers = await User.countDocuments({
      referredByUserId: { $ne: null },
    });

    // ✅ Trial & paid subscribers count (currently active)
    const [totalTrialUsers, totalSubscribers] = await Promise.all([
      UserSubscription.countDocuments({ isActive: true, paymentStatus: "success", planId: { $exists: true } }).then(async (count) => {
        // Count trial plan subscriptions
        const SubscriptionPlan = require("../../models/subscriptionModels/subscriptionPlanModel.js");
        const trialPlans = await SubscriptionPlan.find({ planType: "trial" }).select("_id").lean();
        const trialPlanIds = trialPlans.map(p => p._id);
        return UserSubscription.countDocuments({ isActive: true, planId: { $in: trialPlanIds } });
      }),
      // Paid (non-trial) active subscribers
      UserSubscription.countDocuments({ isActive: true, paymentStatus: "success" }).then(async (total) => {
        const SubscriptionPlan = require("../../models/subscriptionModels/subscriptionPlanModel.js");
        const trialPlans = await SubscriptionPlan.find({ planType: "trial" }).select("_id").lean();
        const trialPlanIds = trialPlans.map(p => p._id);
        return UserSubscription.countDocuments({ isActive: true, paymentStatus: "success", planId: { $nin: trialPlanIds } });
      }),
    ]);

    // ✅ Total revenue from paid invoices (CORRECT: uses actual paid amounts)
    const revenueResult = await Invoice.aggregate([
      { $match: { status: "paid" } },
      { $group: { _id: null, total: { $sum: "$amount" } } }
    ]);
    const totalRevenue = revenueResult[0]?.total || 0;

    // ✅ Total invoices
    const totalInvoices = await Invoice.countDocuments({ status: "paid" });

    // ✅ Total withdrawals today (completed only)
    const completedWithdrawals = await WithdrawalInvoice.find({
      status: "completed",
      processedAt: { $gte: startOfDay, $lte: endOfDay },
    }).lean();

    const totalWithdrawalAmount = completedWithdrawals.reduce(
      (sum, w) => sum + (w.withdrawalAmount || 0),
      0
    );
    const totalWithdrawalCount = completedWithdrawals.length;

    // ✅ Upsert analytics metric for today
    const analytics = await AnalyticsMetric.findOneAndUpdate(
      { date: startOfDay },
      {
        $set: {
          totalRevenue,
          totalUsers,
          totalInvoices,
          totalWithdrawals: totalWithdrawalCount,
          totalWithdrawalAmount,
          totalWithdrawalInvoices: totalWithdrawalCount,
          totalSubscribers,
          totalTrialUsers,
          byReferralUsers,
        },
      },
      { upsert: true, new: true }
    );

    return analytics;
  } catch (err) {
    console.error("❌ Error updating daily analytics:", err);
    throw err;
  }
};
