const ReferralCycle = require("../models/userModels/userRefferalModels/referralCycle");
const ReferralMilestoneConfig = require("../models/userModels/userRefferalModels/referralMilestoneConfig");
const UserSubscription = require("../models/subscriptionModels/userSubscriptionModel");
const User = require("../models/userModels/userModel");
const UserEarning = require("../models/userModels/userRefferalModels/referralEarnings");
const UserReferralActivity = require("../models/userModels/userRefferalModels/userReferralActivity");
const WalletTransaction = require("../models/WalletTransaction");
const mongoose = require("mongoose");

/**
 * Gets the persistent active referral record for a user, or creates one if needed.
 * No cycle expiration - referral progress is cumulative and persistent.
 */
const getOrCreateActiveCycle = async (userId, session = null) => {
    // Find existing referral record for user
    let cycle = await ReferralCycle.findOne({
        userId,
        status: { $in: ["active", "completed"] }
    }).session(session);

    if (!cycle) {
        // Fetch dynamic config
        let config = await ReferralMilestoneConfig.findOne({ key: "default" }).lean();
        const maxLimit = config?.maxReferralsLimit || 25;

        cycle = new ReferralCycle({
            userId,
            startDate: new Date(),
            endDate: null,
            referralCount: 0,
            eligibleReferrals: 0,
            earnedAmount: 0,
            referralIds: [],
            referralDetails: [],
            claimedMilestones: [],
            status: "active",
            targetReferrals: maxLimit
        });
        await cycle.save({ session });
    }

    return cycle;
};

/**
 * Updates the cycle when a user is referred (raw signup).
 * Limited to dynamic maxReferralsLimit per cycle (default: 25).
 */
const addReferralToCycle = async (referrerId, referredUserId, session = null) => {
    const cycle = await getOrCreateActiveCycle(referrerId, session);

    let config = await ReferralMilestoneConfig.findOne({ key: "default" }).lean();
    const maxLimit = config?.maxReferralsLimit || 25;

    // Limit referrals per cycle
    if (cycle.referralIds.length >= maxLimit) {
        return cycle;
    }

    if (!cycle.referralIds.includes(referredUserId)) {
        cycle.referralIds.push(referredUserId);
        cycle.referralCount = cycle.referralIds.length;
        
        cycle.referralDetails.push({
            referredUserId: referredUserId,
            subscriptionStatus: "Pending",
            date: new Date()
        });

        await cycle.save({ session });
    }
    return cycle;
};

/**
 * Validates the referral when the referred user buys a paid subscription.
 * Directly credits the referrer's wallet with ₹100 per person and records transactions.
 */
const validateReferralOnSubscription = async (referrerId, referredUserId, amount, session = null) => {
    // Only paid plans qualify (price > 0 or standard plan)
    if (typeof amount === 'number' && amount <= 0) return null;

    const cycle = await getOrCreateActiveCycle(referrerId, session);

    let config = await ReferralMilestoneConfig.findOne({ key: "default" }).lean();
    const maxLimit = config?.maxReferralsLimit || 25;
    const rewardPerPerson = config?.rewardPerPerson !== undefined ? config.rewardPerPerson : 100;

    let isNewlyQualified = false;

    // Find the referral detail in the current cycle
    const referralIndex = cycle.referralDetails.findIndex(r => r.referredUserId.toString() === referredUserId.toString());

    if (referralIndex !== -1) {
        const refDetail = cycle.referralDetails[referralIndex];
        if (refDetail.subscriptionStatus !== "Qualified") {
            refDetail.subscriptionStatus = "Qualified";
            cycle.eligibleReferrals = Math.min(maxLimit, cycle.eligibleReferrals + 1);
            cycle.earnedAmount = (cycle.earnedAmount || 0) + rewardPerPerson;
            isNewlyQualified = true;
            
            if (cycle.eligibleReferrals >= (cycle.targetReferrals || maxLimit)) {
                cycle.status = "completed";
            }
            
            await cycle.save({ session });
        }
    } else {
        // If referred in active cycle and under limit
        if (cycle.referralIds.length < maxLimit && !cycle.referralIds.map(id => id.toString()).includes(referredUserId.toString())) {
            cycle.referralIds.push(referredUserId);
            cycle.referralCount = cycle.referralIds.length;
            cycle.referralDetails.push({
                referredUserId: referredUserId,
                subscriptionStatus: "Qualified",
                date: new Date()
            });
            cycle.eligibleReferrals = Math.min(maxLimit, cycle.eligibleReferrals + 1);
            cycle.earnedAmount = (cycle.earnedAmount || 0) + rewardPerPerson;
            isNewlyQualified = true;
            await cycle.save({ session });
        }
    }

    // 💰 Credit Referrer's Wallet directly per person
    if (isNewlyQualified && rewardPerPerson > 0) {
        try {
            const parentUser = await User.findById(referrerId).session(session);
            if (parentUser) {
                if (!parentUser.wallet) {
                    parentUser.wallet = { balance: 0, totalPurchasedCredits: 0, totalSpentCredits: 0 };
                }
                const prevBalance = parentUser.wallet.balance || 0;
                const newBalance = prevBalance + rewardPerPerson;

                parentUser.wallet.balance = newBalance;
                parentUser.totalEarnings = (parentUser.totalEarnings || 0) + rewardPerPerson;
                parentUser.walletBalance = newBalance;
                await parentUser.save({ session });

                // Create UserEarning record
                try {
                    await UserEarning.create([{
                        userId: referrerId,
                        fromUserId: referredUserId,
                        level: 1,
                        amount: rewardPerPerson,
                        isPartial: false
                    }], { session });
                } catch (earnErr) {
                    console.warn("UserEarning create warning:", earnErr.message);
                }

                // Create WalletTransaction record
                try {
                    await WalletTransaction.create([{
                        userId: referrerId,
                        transactionType: "DIRECT_REFERRAL_REWARD",
                        credits: rewardPerPerson,
                        amount: rewardPerPerson,
                        balanceBefore: prevBalance,
                        balanceAfter: newBalance,
                        referenceId: referredUserId.toString(),
                        remarks: `Referral Reward: ₹${rewardPerPerson} for referred friend subscription`,
                    }], { session });
                } catch (txnErr) {
                    console.warn("WalletTransaction create warning:", txnErr.message);
                }

                // Log UserReferralActivity
                try {
                    await UserReferralActivity.create([{
                        userId: referrerId,
                        referredUserId: referredUserId,
                        activityType: "referral_reward",
                        earnedAmount: rewardPerPerson
                    }], { session });
                } catch (actErr) {
                    console.warn("UserReferralActivity create warning:", actErr.message);
                }
            }
        } catch (walletUpdateErr) {
            console.error("Error crediting referrer wallet:", walletUpdateErr);
        }
    }
    
    return cycle;
};

module.exports = {
    getOrCreateActiveCycle,
    addReferralToCycle,
    validateReferralOnSubscription
};
