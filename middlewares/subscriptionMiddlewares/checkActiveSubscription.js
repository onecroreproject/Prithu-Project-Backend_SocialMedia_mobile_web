const UserSubscription = require("../../models/subscriptionModels/userSubscriptionModel.js");

/**
 * Checks if the user has an active, non-expired subscription.
 */
async function checkActiveSubscription(userId) {

  const now = new Date();

  // Find active subscription and populate plan details in one go
  const activeSub = await UserSubscription.findOne({
    userId,
    isActive: true,
    endDate: { $gt: now }
  }).populate("planId");

  if (!activeSub) {
    return { hasActive: false, message: "No active subscription found." };
  }

  // If populate didn't work or planId is missing
  if (!activeSub.planId) {
    return {
      hasActive: true,
      planType: null,
      subscription: activeSub,
      warning: "Subscription exists but plan details are missing."
    };
  }

  return {
    hasActive: true,
    planType: activeSub.planId.planType, // trial | basic | premium
    subscription: activeSub
  };
}

module.exports = checkActiveSubscription;