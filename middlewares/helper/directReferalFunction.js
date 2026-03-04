const User = require("../../models/userModels/userModel");
const UserSubscription = require("../../models/subscriptionModels/userSubscriptionModel");
const UserEarning = require("../../models/userModels/userRefferalModels/referralEarnings");
const UserReferral = require("../../models/userModels/userRefferalModels/userReferralModel");
const { sendTemplateEmail } = require("../../utils/templateMailer");
const Withdrawal = require("../../models/userModels/userRefferalModels/withdrawal");
const { updateCycleOnReferral } = require("../../services/referralCycleService");


/**
 * Core logic to process a direct referral reward.
 * Can be called from API handlers or other services.
 * @param {string} referredUserId - The ID of the user who signed up.
 * @returns {Promise<{success: boolean, message: string}>}
 */
const processReferralReward = async (referredUserId) => {
  try {
    const currentUser = await User.findById(referredUserId);
    if (!currentUser) return { success: false, message: "User not found" };

    const referrerId = currentUser.referredByUserId;
    if (!referrerId) return { success: false, message: "No referrer found" };

    // 1️⃣ Prevent Duplicate Rewards
    const existingEarning = await UserEarning.findOne({
      userId: referrerId,
      fromUserId: referredUserId,
      level: 1
    });
    if (existingEarning) return { success: false, message: "Reward already processed for this referral" };

    // 2️⃣ Check Referrer Subscription
    const referrerSubscription = await UserSubscription.findOne({
      userId: referrerId,
      isActive: true,
      paymentStatus: "success",
      endDate: { $gt: new Date() },
    });

    const referrer = await User.findById(referrerId);
    if (!referrer) return { success: false, message: "Referrer not found" };

    if (referrerSubscription) {
      const rewardAmount = 100;

      // 3️⃣ Credits & Records
      await UserEarning.create({
        userId: referrerId,
        fromUserId: referredUserId,
        level: 1,
        tier: 1,
        amount: rewardAmount,
        isPartial: false,
      });

      const updatedReferrer = await User.findByIdAndUpdate(
        referrerId,
        { $inc: { totalEarnings: rewardAmount, balanceEarnings: rewardAmount, referralCodeUsageCount: 1 } },
        { new: true }
      );

      // Link child to parent in UserReferral collection
      await UserReferral.updateOne(
        { parentId: referrerId },
        { $addToSet: { childIds: referredUserId } },
        { upsert: true }
      );

      // 4️⃣ Withdrawal Update
      let withdrawal = await Withdrawal.findOne({ userId: referrerId, status: "pending" });
      if (withdrawal) {
        withdrawal.amount += rewardAmount;
        withdrawal.totalAmount += rewardAmount;
        await withdrawal.save();
      } else {
        await Withdrawal.create({
          userId: referrerId,
          amount: rewardAmount,
          withdrawalAmount: 0,
          totalAmount: updatedReferrer.balanceEarnings,
          invoiceIds: [],
          status: "pending",
        });
      }

      // 5️⃣ Update Referral Cycle & Get Stats
      let cycleStats = { referredInCycle: 0, peopleRemaining: 25, daysRemaining: 30 };
      try {
        const cycle = await updateCycleOnReferral(referrerId, referredUserId, rewardAmount);
        if (cycle) {
          cycleStats.referredInCycle = cycle.referralCount;
          cycleStats.peopleRemaining = Math.max(0, 25 - cycle.referralCount);
          cycleStats.daysRemaining = Math.max(0, Math.ceil((cycle.endDate - new Date()) / (1000 * 60 * 60 * 24)));
        }
      } catch (cycleErr) {
        console.error("Failed to update referral cycle:", cycleErr);
      }

      const totalSuccessfulReferrals = await UserEarning.countDocuments({ userId: referrerId });

      // 6️⃣ Send Referral Reward Email
      if (updatedReferrer?.email) {
        await sendTemplateEmail({
          templateName: "ReferralReward.html",
          to: updatedReferrer.email,
          subject: `You earned ₹${rewardAmount} from a referral!`,
          placeholders: {
            referrerName: updatedReferrer.userName,
            referredUserName: currentUser.userName,
            rewardAmount,
            referralDate: new Date().toLocaleDateString(),
            totalSuccessfulReferrals,
            totalEarnings: updatedReferrer.totalEarnings,
            referredInCycle: cycleStats.referredInCycle,
            peopleRemaining: cycleStats.peopleRemaining,
            daysRemaining: cycleStats.daysRemaining,
          },
          embedLogo: false,
        });
      }

      return { success: true, message: "Reward processed successfully" };
    }

    // 8️⃣ Handle Expired Referrer Case
    await User.findByIdAndUpdate(referredUserId, { $unset: { referredByUserId: "" } });
    await UserReferral.findOneAndUpdate(
      { parentId: referrerId },
      { $pull: { childIds: referredUserId } }
    );

    // Notify users of expiry
    if (referrer?.email) {
      await sendTemplateEmail({
        templateName: "SubscriptionExpired.html",
        to: referrer.email,
        subject: "Referral Subscription Expired",
        placeholders: {
          referrerName: referrer.userName,
          referredUserName: currentUser.userName,
          referralCode: currentUser.referralCode,
        },
        embedLogo: false,
      });
    }

    return { success: true, message: "Referrer subscription expired, users notified" };
  } catch (error) {
    console.error("processReferralReward error:", error);
    throw error;
  }
};

exports.handleReferralReward = async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ message: "User ID required" });

    const result = await processReferralReward(userId);
    return res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

exports.processReferralReward = processReferralReward;

