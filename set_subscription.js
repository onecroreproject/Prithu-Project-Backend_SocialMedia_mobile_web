require('dotenv').config();
const { prithuDB } = require('./database');
const User = require('./models/userModels/userModel');
const SubscriptionPlan = require('./models/subscriptionModels/subscriptionPlanModel');
const UserSubscription = require('./models/subscriptionModels/userSubscriptionModel');

async function run() {
  try {
    const user = await User.findOne({ email: 'ssuriya1806@gmail.com' });
    if (!user) {
      console.log('User not found!');
      process.exit(1);
    }
    console.log('Found user:', user._id);

    // Find or create a premium plan
    let plan = await SubscriptionPlan.findOne({ planType: 'premium' });
    if (!plan) {
      plan = await SubscriptionPlan.create({
        name: 'Lifetime Premium',
        price: 0,
        durationDays: 36500,
        planType: 'premium',
      });
      console.log('Created Premium Plan:', plan._id);
    } else {
      console.log('Found Premium Plan:', plan._id);
    }

    // Upsert User Subscription
    const endDate = new Date('2099-12-31T23:59:59Z');
    const sub = await UserSubscription.findOneAndUpdate(
      { userId: user._id },
      {
        $set: {
          planId: plan._id,
          isActive: true,
          startDate: new Date(),
          endDate: endDate,
          subscriptionStatus: 'active',
          paymentStatus: 'success',
        }
      },
      { upsert: true, new: true }
    );
    console.log('Subscription updated successfully:', sub._id);
    
  } catch (e) {
    console.error(e);
  } finally {
    process.exit(0);
  }
}

// Wait for connection
prithuDB.once('connected', () => {
  run();
});
