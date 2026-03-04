const ReferralCycle = require("../models/userModels/userRefferalModels/referralCycle");
const UserSubscription = require("../models/subscriptionModels/userSubscriptionModel");
const mongoose = require("mongoose");

/**
 * Gets the current active cycle for a user, or creates a new one if needed.
 */
const getOrCreateActiveCycle = async (userId, session = null) => {
    const now = new Date();

    // Find active or completed cycle
    let cycle = await ReferralCycle.findOne({
        userId,
        status: { $in: ["active", "completed"] },
        endDate: { $gt: now }
    }).session(session);

    // Fetch user's active subscription to align dates
    const activeSub = await UserSubscription.findOne({
        userId,
        isActive: true,
        paymentStatus: "success",
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

        // Create new cycle aligned with subscription if available
        let startDate = now;
        if (activeSub && activeSub.startDate) {
            startDate = new Date(activeSub.startDate);
        }

        const endDate = new Date(startDate.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days

        cycle = new ReferralCycle({
            userId,
            startDate,
            endDate,
            referralCount: 0,
            earnedAmount: 0,
            referralIds: [],
            status: "active"
        });
        await cycle.save({ session });
    } else if (activeSub && activeSub.startDate) {
        // Optional: Proactively realign cycle if subscription date changed (e.g. renewal)
        const expectedStart = new Date(activeSub.startDate);
        const expectedEnd = new Date(expectedStart.getTime() + 30 * 24 * 60 * 60 * 1000);

        if (cycle.startDate.getTime() !== expectedStart.getTime()) {
            cycle.startDate = expectedStart;
            cycle.endDate = expectedEnd;
            await cycle.save({ session });
        }
    }

    return cycle;
};

/**
 * Updates the cycle when a new referral is processed.
 */
const updateCycleOnReferral = async (userId, childId, amount, session = null) => {
    const cycle = await getOrCreateActiveCycle(userId, session);

    // Add referral if not already present
    if (!cycle.referralIds.includes(childId)) {
        cycle.referralIds.push(childId);
        cycle.referralCount = cycle.referralIds.length;
    }

    cycle.earnedAmount += amount;

    // Check if it reached 25 referrals
    if (cycle.referralCount >= 25 && cycle.status === "active") {
        cycle.status = "completed";
    }

    await cycle.save({ session });
    return cycle;
};

module.exports = {
    getOrCreateActiveCycle,
    updateCycleOnReferral
};
