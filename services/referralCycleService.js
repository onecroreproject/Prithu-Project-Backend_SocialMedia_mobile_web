const ReferralCycle = require("../models/userModels/userRefferalModels/referralCycle");
const UserSubscription = require("../models/subscriptionModels/userSubscriptionModel");
const mongoose = require("mongoose");

/**
 * Gets the current active cycle for a user, or creates a new one if needed.
 */
const getOrCreateActiveCycle = async (userId, session = null) => {
    const now = new Date();

    // Find active cycle
    let cycle = await ReferralCycle.findOne({
        userId,
        status: { $in: ["active", "completed"] },
        endDate: { $gt: now }
    }).session(session);

    if (!cycle) {
        // Mark any old active/completed cycles as expired
        await ReferralCycle.updateMany(
            {
                userId,
                status: { $in: ["active", "completed"] },
                endDate: { $lte: now }
            },
            { $set: { status: "expired" } },
            { session }
        );

        // Create new strictly 30-day cycle
        const startDate = now;
        const endDate = new Date(startDate.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days

        cycle = new ReferralCycle({
            userId,
            startDate,
            endDate,
            referralCount: 0,
            eligibleReferrals: 0,
            earnedAmount: 0,
            referralIds: [],
            referralDetails: [],
            claimedMilestones: [],
            status: "active"
        });
        await cycle.save({ session });
    }

    return cycle;
};

/**
 * Updates the cycle when a user is referred (raw signup).
 */
const addReferralToCycle = async (referrerId, referredUserId, session = null) => {
    const cycle = await getOrCreateActiveCycle(referrerId, session);

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
 * Validates the referral when the referred user buys a subscription.
 */
const validateReferralOnSubscription = async (referrerId, referredUserId, amount, session = null) => {
    // Only Rs 599 subscription qualifies (or whatever target amount is, assuming amount is passed)
    if (amount !== 599) return null;

    const cycle = await getOrCreateActiveCycle(referrerId, session);

    // Find the referral detail in the current cycle
    const referralIndex = cycle.referralDetails.findIndex(r => r.referredUserId.toString() === referredUserId.toString());
    
    if (referralIndex !== -1) {
        const refDetail = cycle.referralDetails[referralIndex];
        if (refDetail.subscriptionStatus !== "Qualified") {
            refDetail.subscriptionStatus = "Qualified";
            cycle.eligibleReferrals += 1;
            
            if (cycle.eligibleReferrals >= cycle.targetReferrals) {
                cycle.status = "completed";
            }
            
            await cycle.save({ session });
            return cycle;
        }
    } else {
        // Referral was from a previous cycle, or we just want to credit it to the current active cycle.
        // The prompt says "Referrals from the previous cycle must not automatically count toward the new cycle."
        // We will only qualify it if they are in the current cycle's referralIds.
        // So we do nothing if not found in current cycle.
    }
    
    return cycle;
};

module.exports = {
    getOrCreateActiveCycle,
    addReferralToCycle,
    validateReferralOnSubscription
};
