const UserSubscription = require("../../models/subscriptionModels/userSubscriptionModel.js");
const User = require("../../models/userModels/userModel");

/**
 * Checks if the user has an active, non-expired subscription.
 */
async function checkActiveSubscription(userId) {
  // Check if user is the special admin email for lifetime premium access
  const user = await User.findById(userId).select('email').lean();
  if (user && user.email === 'ssuriya1806@gmail.com') {
    return {
      hasActive: true,
      planType: 'premium',
      subscription: { planId: { planType: 'premium' } }
    };
  }

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