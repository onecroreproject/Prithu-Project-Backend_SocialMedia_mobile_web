const ReferralCycle = require("../../models/userModels/userRefferalModels/referralCycle");
const User = require("../../models/userModels/userModel");
const ProfileSettings = require("../../models/profileSettingModel");
const { getOrCreateActiveCycle } = require("../../services/referralCycleService");

/**
 * Fetch all referral cycles for a user (Active and Past)
 */
exports.getReferralCycles = async (req, res) => {
    try {
        const userId = req.Id;

        // Proactively expire old cycles and ensure an active one exists
        await getOrCreateActiveCycle(userId);

        const cycles = await ReferralCycle.find({ userId })
            .sort({ endDate: -1 })
            .lean();

        return res.status(200).json({
            success: true,
            data: cycles
        });
    } catch (error) {
        console.error("Error fetching referral cycles:", error);
        return res.status(500).json({ message: "Server error", error: error.message });
    }
};

/**
 * Fetch detailed referral user list for a specific cycle
 */
exports.getCycleDetails = async (req, res) => {
    try {
        const userId = req.Id;
        const { cycleId } = req.params;

        const cycle = await ReferralCycle.findOne({ _id: cycleId, userId }).lean();
        if (!cycle) {
            return res.status(404).json({ success: false, message: "Cycle not found" });
        }

        const referrals = await User.find({ _id: { $in: cycle.referralIds } })
            .select("userName email createdAt")
            .lean();

        const profileSettings = await ProfileSettings.find({ userId: { $in: cycle.referralIds } })
            .select("userId phoneNumber name")
            .lean();

        const result = referrals.map(ref => {
            const profile = profileSettings.find(p => p.userId.toString() === ref._id.toString());
            const detail = cycle.referralDetails?.find(d => d.referredUserId.toString() === ref._id.toString());
            return {
                _id: ref._id,
                userName: profile?.name || ref.userName,
                mobileNumber: profile?.phoneNumber || "N/A",
                email: ref.email,
                referralDate: detail ? detail.date : ref.createdAt,
                subscriptionStatus: detail ? detail.subscriptionStatus : "Pending"
            };
        });

        return res.status(200).json({
            success: true,
            data: result
        });
    } catch (error) {
        console.error("Error fetching cycle details:", error);
        return res.status(500).json({ message: "Server error", error: error.message });
    }
};

/**
 * Claim Milestone Cashback
 */
exports.claimMilestone = async (req, res) => {
    try {
        const userId = req.Id;
        const { milestone } = req.body; // 10, 20, 24, or 25

        const numericMilestone = Number(milestone);
        if (![10, 20, 24, 25].includes(numericMilestone)) {
            return res.status(400).json({ success: false, message: "Invalid milestone" });
        }

        const cycle = await getOrCreateActiveCycle(userId);

        if (cycle.claimedMilestones.includes(numericMilestone)) {
            return res.status(400).json({ success: false, message: "Milestone already claimed" });
        }

        if (cycle.eligibleReferrals < numericMilestone) {
            return res.status(400).json({ success: false, message: "Milestone not reached yet" });
        }

        let reward = 0;
        if (numericMilestone === 10) reward = 300;
        else if (numericMilestone === 20) reward = 700;
        else if (numericMilestone === 24) reward = 1000;
        else if (numericMilestone === 25) reward = 2500;

        cycle.claimedMilestones.push(numericMilestone);
        cycle.earnedAmount += reward;
        await cycle.save();

        // Update Wallet (assuming User.wallet.balance)
        await User.findByIdAndUpdate(userId, {
            $inc: { "wallet.balance": reward, totalEarnings: reward }
        });

        // Add to Referral Activity
        const UserReferralActivity = require("../../models/userModels/userRefferalModels/userReferralActivity");
        await UserReferralActivity.create({
            userId,
            activityType: "milestone_claimed",
            earnedAmount: reward
        });

        return res.status(200).json({
            success: true,
            message: `Successfully claimed ₹${reward} cashback!`,
            reward
        });
    } catch (error) {
        console.error("Error claiming milestone:", error);
        return res.status(500).json({ message: "Server error", error: error.message });
    }
};

/**
 * Apply/Enter Referral Code for an existing user
 */
exports.applyReferralCode = async (req, res) => {
    try {
        const userId = req.Id;
        const { referralCode } = req.body;

        if (!referralCode || !referralCode.trim()) {
            return res.status(400).json({ success: false, message: "Please enter a valid referral code" });
        }

        const cleanCode = referralCode.trim().toUpperCase();

        const currentUser = await User.findById(userId);
        if (!currentUser) {
            return res.status(404).json({ success: false, message: "User not found" });
        }

        // Check if user is trying to use their own referral code
        if (currentUser.referralCode && currentUser.referralCode.toUpperCase() === cleanCode) {
            return res.status(400).json({ success: false, message: "You cannot use your own referral code" });
        }

        // Check if user already has a referrer
        if (currentUser.referredByUserId) {
            return res.status(400).json({ success: false, message: "You have already applied a referral code" });
        }

        // Find referrer by code
        const referrer = await User.findOne({
            referralCode: cleanCode,
            referralCodeIsValid: true,
        });

        if (!referrer) {
            return res.status(400).json({ success: false, message: "Invalid or inactive referral code" });
        }

        if (referrer._id.toString() === userId.toString()) {
            return res.status(400).json({ success: false, message: "You cannot use your own referral code" });
        }

        // Assign referrer
        currentUser.referredByUserId = referrer._id;
        await currentUser.save();

        // Process reward if applicable
        try {
            const { processReferralReward } = require("../../middlewares/helper/directReferalFunction");
            if (typeof processReferralReward === 'function') {
                processReferralReward(currentUser._id).catch(err =>
                    console.error("❌ Referral Reward Processing on apply failed:", err)
                );
            }
        } catch (rewardErr) {
            console.error("Failed to trigger processReferralReward:", rewardErr);
        }

        return res.status(200).json({
            success: true,
            message: `Referral code applied successfully! Referred by @${referrer.userName}.`,
            referrerName: referrer.userName
        });
    } catch (error) {
        console.error("Error applying referral code:", error);
        return res.status(500).json({ success: false, message: "Server error", error: error.message });
    }
};

