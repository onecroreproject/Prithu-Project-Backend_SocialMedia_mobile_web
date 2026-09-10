const UserSubscription = require('../../models/subscriptionModels/userSubscriptionModel');
const SubscriptionPlan = require('../../models/subscriptionModels/subscriptionPlanModel');

exports.assignPlanToUser = async (userId, planId) => {
  const plan = await SubscriptionPlan.findById(planId);
  if (!plan || !plan.isActive) throw new Error("Plan not available");

  const startDate = new Date();
  const endDate = new Date();
  endDate.setDate(startDate.getDate() + plan.durationDays);

  // ✅ Copy only the limits defined in the plan
  const subscription = await UserSubscription.create({
    userId,
    planId,
    startDate,
    endDate,
    limitsUsed: { ...plan.limits }, // spread ensures only that plan's limits are stored
  });

  return subscription;
};

