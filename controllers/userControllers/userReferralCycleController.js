const ReferralCycle = require("../../models/userModels/userRefferalModels/referralCycle");
const ReferralMilestoneConfig = require("../../models/userModels/userRefferalModels/referralMilestoneConfig");
const User = require("../../models/userModels/userModel");
const ProfileSettings = require("../../models/profileSettingModel");
const { getOrCreateActiveCycle } = require("../../services/referralCycleService");

const DEFAULT_MILESTONES = [
    { count: 5, reward: 100, title: "Bronze Starter", subtitle: "5 Qualified Referrals", icon: "seedling", badge: "Tier 1", isGrand: false },
    { count: 10, reward: 300, title: "Starter Goal", subtitle: "10 Qualified Referrals", icon: "bolt", badge: "Tier 2", isGrand: false },
    { count: 15, reward: 500, title: "Rising Star", subtitle: "15 Qualified Referrals", icon: "star", badge: "Tier 3", isGrand: false },
    { count: 20, reward: 700, title: "Silver Goal", subtitle: "20 Qualified Referrals", icon: "medal", badge: "Tier 4", isGrand: false },
    { count: 24, reward: 1000, title: "Gold Goal", subtitle: "24 Qualified Referrals", icon: "trophy", badge: "Tier 5", isGrand: false },
    { count: 25, reward: 2500, title: "Mega Reward", subtitle: "25 Qualified Referrals", icon: "crown", badge: "Mega Prize 🏆", isGrand: true }
];

/**
 * Fetch all referral cycles for a user (Active and Past)
 */
exports.getReferralCycles = async (req, res) => {
    try {
        const userId = req.Id;

        // Check active subscription status
        const checkActiveSubscription = require("../../middlewares/subscriptionMiddlewares/checkActiveSubscription");
        const subStatus = await checkActiveSubscription(userId);
        const user = await User.findById(userId).select("referralCodeIsValid");
        const isEligible = (subStatus.hasActive && subStatus.planType !== 'trial') || user?.referralCodeIsValid;

        // Proactively expire old cycles and ensure an active one exists
        await getOrCreateActiveCycle(userId);

        const cycles = await ReferralCycle.find({ userId })
            .sort({ endDate: -1 })
            .lean();

        // Dynamic config
        let config = await ReferralMilestoneConfig.findOne({ key: "default" }).lean();
        if (!config) {
            config = {
                key: "default",
                rewardPerPerson: 100,
                maxReferralsLimit: 25,
                cycleDays: 30,
                qualifyingPlanPrice: 599,
                milestones: DEFAULT_MILESTONES
            };
        } else {
            if (config.rewardPerPerson === undefined) config.rewardPerPerson = 100;
            if (config.maxReferralsLimit === undefined) config.maxReferralsLimit = 25;
            if (!config.milestones || config.milestones.length === 0) config.milestones = DEFAULT_MILESTONES;
        }

        return res.status(200).json({
            success: true,
            isEligible,
            isLocked: !isEligible,
            isTrial: subStatus.planType === 'trial',
            hasActive: subStatus.hasActive,
            config: {
                rewardPerPerson: config.rewardPerPerson,
                maxReferralsLimit: config.maxReferralsLimit,
                cycleDays: config.cycleDays,
                qualifyingPlanPrice: config.qualifyingPlanPrice,
                milestones: config.milestones
            },
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

        let cycle = null;
        if (cycleId && cycleId !== 'active') {
            cycle = await ReferralCycle.findOne({ _id: cycleId, userId }).lean();
        }
        if (!cycle) {
            cycle = await ReferralCycle.findOne({ userId, status: { $in: ["active", "completed"] } }).sort({ endDate: -1 }).lean();
        }

        // Direct lookup of all users referred by this user
        const directReferred = await User.find({ referredByUserId: userId }).select("userName email createdAt").lean();
        const directIds = directReferred.map(u => u._id.toString());
        const cycleIds = (cycle?.referralIds || []).map(id => id.toString());

        const mergedIds = [...new Set([...cycleIds, ...directIds])];

        const referrals = await User.find({ _id: { $in: mergedIds } })
            .select("userName email createdAt")
            .lean();

        const profileSettings = await ProfileSettings.find({ userId: { $in: mergedIds } })
            .select("userId phoneNumber name profileAvatar modifyAvatarPublicId")
            .lean();

        const checkActiveSubscription = require("../../middlewares/subscriptionMiddlewares/checkActiveSubscription");

        const result = await Promise.all(referrals.map(async ref => {
            const profile = profileSettings.find(p => p.userId.toString() === ref._id.toString());
            const detail = cycle?.referralDetails?.find(d => d.referredUserId.toString() === ref._id.toString());
            
            const sub = await checkActiveSubscription(ref._id);
            const isQualified = (sub.hasActive && sub.planType !== 'trial') || detail?.subscriptionStatus === "Qualified";

            const joinedDate = detail?.date || ref.createdAt || new Date();

            return {
                _id: ref._id,
                userName: ref.userName || profile?.name || 'Prithu Member',
                displayName: profile?.name || ref.userName || 'Prithu Member',
                mobileNumber: profile?.phoneNumber || "N/A",
                email: ref.email,
                avatar: profile ? (profile.modifyAvatarPublicId || profile.profileAvatar) : null,
                date: joinedDate,
                referralDate: joinedDate,
                formattedDate: new Date(joinedDate).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric'
                }),
                subscriptionStatus: isQualified ? "Qualified" : "Pending",
                isQualified
            };
        }));

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
        const { milestone } = req.body; // 5, 10, 15, 20, 24, or 25

        const numericMilestone = Number(milestone);

        // Fetch dynamic milestones
        let config = await ReferralMilestoneConfig.findOne({ key: "default" }).lean();
        const activeMilestones = config?.milestones?.length ? config.milestones : DEFAULT_MILESTONES;
        const targetMilestone = activeMilestones.find(m => Number(m.count) === numericMilestone);

        const reward = targetMilestone ? Number(targetMilestone.reward) : (numericMilestone * (config?.rewardPerPerson || 100));

        if (!targetMilestone && !reward) {
            return res.status(400).json({ success: false, message: "Invalid milestone" });
        }

        // Verify active VIP subscription
        const checkActiveSubscription = require("../../middlewares/subscriptionMiddlewares/checkActiveSubscription");
        const subStatus = await checkActiveSubscription(userId);
        const user = await User.findById(userId).select("referralCodeIsValid");
        const isVip = (subStatus.hasActive && subStatus.planType !== 'trial') || user?.referralCodeIsValid;

        if (!isVip) {
            return res.status(400).json({
                success: false,
                message: "Active VIP subscription is required to claim milestone cashback rewards."
            });
        }

        const cycle = await getOrCreateActiveCycle(userId);

        // Check if this specific milestone tier was already claimed
        cycle.claimedMilestones = cycle.claimedMilestones || [];
        if (cycle.claimedMilestones.includes(numericMilestone)) {
            return res.status(400).json({
                success: false,
                message: `You have already claimed the Tier ${numericMilestone} milestone cashback.`
            });
        }

        if (cycle.eligibleReferrals < numericMilestone) {
            return res.status(400).json({
                success: false,
                message: `You need ${numericMilestone} qualified referrals to claim this tier. Currently at ${cycle.eligibleReferrals}.`
            });
        }

        cycle.claimedMilestones.push(numericMilestone);
        cycle.earnedAmount = (cycle.earnedAmount || 0) + reward;
        if (cycle.eligibleReferrals >= (cycle.targetReferrals || config?.maxReferralsLimit || 25)) {
            cycle.status = "completed";
        }
        await cycle.save();

        // Update Wallet & Total Earnings
        const updatedUser = await User.findByIdAndUpdate(userId, {
            $inc: { "wallet.balance": reward, totalEarnings: reward }
        }, { new: true });

        // Add to Referral Activity
        try {
            const UserReferralActivity = require("../../models/userModels/userRefferalModels/userReferralActivity");
            await UserReferralActivity.create({
                userId,
                activityType: "milestone_claimed",
                earnedAmount: reward
            });
        } catch (actErr) {
            console.error("Referral activity error:", actErr);
        }

        // Add to Wallet Transaction
        try {
            const WalletTransaction = require("../../models/WalletTransaction");
            await WalletTransaction.create({
                userId,
                transactionType: "MILESTONE_CASHBACK",
                credits: reward,
                amount: reward,
                balanceBefore: (updatedUser?.wallet?.balance || reward) - reward,
                balanceAfter: updatedUser?.wallet?.balance || reward,
                referenceId: `M${numericMilestone}_${cycle._id}`,
                remarks: `Claimed Tier ${numericMilestone} Referrals Milestone Cashback (₹${reward})`
            });
        } catch (txErr) {
            console.error("Wallet transaction error:", txErr);
        }

        return res.status(200).json({
            success: true,
            message: `🎉 Successfully claimed ₹${reward} cashback! Your referral mission for this cycle is complete.`,
            reward,
            claimedMilestones: cycle.claimedMilestones,
            cycleStatus: cycle.status
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

        // Check if user is currently on free trial
        const checkActiveSubscription = require("../../middlewares/subscriptionMiddlewares/checkActiveSubscription");
        const subStatus = await checkActiveSubscription(userId);
        if (subStatus.hasActive && subStatus.planType === 'trial') {
            return res.status(400).json({ success: false, message: "Referral code entry is not available on Free Trial. Please choose a paid membership plan." });
        }

        // Check if user already has a referrer
        if (currentUser.referredByUserId) {
            return res.status(400).json({ success: false, message: "You have already applied a referral code" });
        }

        // Find referrer by code
        const referrer = await User.findOne({
            referralCode: cleanCode,
        });

        if (!referrer) {
            return res.status(400).json({ success: false, message: "Invalid referral code. User not found." });
        }

        if (referrer._id.toString() === userId.toString()) {
            return res.status(400).json({ success: false, message: "You cannot use your own referral code" });
        }

        // Check if referrer has an active paid subscription
        const referrerSub = await checkActiveSubscription(referrer._id);
        const isReferrerVip = (referrerSub.hasActive && referrerSub.planType !== 'trial') || referrer.referralCodeIsValid;

        if (!isReferrerVip) {
            return res.status(400).json({
                success: false,
                status: "referrer_pending_subscription",
                message: `Referrer @${referrer.userName}'s subscription is pending. Only active VIP members can refer friends.`
            });
        }

        // Assign referrer
        currentUser.referredByUserId = referrer._id;
        await currentUser.save();

        // Add to referrer's cycle
        try {
            const { addReferralToCycle, validateReferralOnSubscription } = require("../../services/referralCycleService");
            await addReferralToCycle(referrer._id, currentUser._id);

            // If current user is already an active paid VIP member, qualify referral immediately!
            if (subStatus.hasActive && subStatus.planType !== 'trial') {
                await validateReferralOnSubscription(referrer._id, currentUser._id, subStatus.subscription?.amount || 1);
            }
        } catch (cycleErr) {
            console.error("❌ Failed to update referral cycle on apply:", cycleErr);
        }

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
            message: `Referral code applied successfully! Referred by @${referrer.userName} (Active VIP).`,
            referrerName: referrer.userName
        });
    } catch (error) {
        console.error("Error applying referral code:", error);
        return res.status(500).json({ success: false, message: "Server error", error: error.message });
    }
};

