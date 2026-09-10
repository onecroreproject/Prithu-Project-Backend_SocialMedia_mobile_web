const UserSubscription = require("../../models/subscriptionModels/userSubscriptionModel");
const SubscriptionPlan = require("../../models/subscriptionModels/subscriptionPlanModel");

/**
 * Checks if the user has previously used a trial plan.
 * Returns null if no trial, false if used/expired, or an object if active.
 */
async function hasUsedTrial(userId) {
  try {
    // 1. Check if user is permanently marked as having used the trial
    const user = await require("../../models/userModels/userModel").findById(userId).select("trialUsed");
    if (user && user.trialUsed) {
      return false; // Permanently ineligible
    }

    // 2. Find trial plan configuration
    const trialPlan = await SubscriptionPlan.findOne({ planType: "trial" });
    if (!trialPlan) return null;

    // 3. Find user's trial subscription record (Legacy check)
    const trialSubscription = await UserSubscription.findOne({
      userId,
      planId: trialPlan._id,
    });

    if (!trialSubscription) {
      return null; // Never used trial
    }

    // 4. If subscription exists but is manually deactivated or payment failed
    if (!trialSubscription.isActive) {
      return false; // Trial was used and is now inactive
    }

    // 5. Check if trial has expired
    const now = new Date();
    if (trialSubscription.endDate <= now) {
      return false; // Trial has expired
    }

    // 6. User currently has an active trial
    const remainingDays = Math.ceil((trialSubscription.endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    return {
      status: true,
      remainingDays,
      isActive: trialSubscription.isActive,
      endDate: trialSubscription.endDate
    };
  } catch (err) {
    console.error("Error in hasUsedTrial:", err.message);
    return false; // Safe fallback
  }
}

module.exports = hasUsedTrial;


