const UserSubscription = require("../models/subscriptionModels/userSubscriptionModel");
const User = require("../models/userModels/userModel");
const { sendTemplateEmail } = require("../utils/templateMailer");
const createQueue = require("../queue.js");

const reminderQueue = createQueue("subscription-expiry-reminder");

reminderQueue.process(async (job) => {
    const { subId, remainingDays, todayStr } = job.data;
    console.log(`🔹 Processing expiry reminder for subscription ${subId} (${remainingDays} days left)`);

    try {
        const subscription = await UserSubscription.findById(subId).populate("planId");
        if (!subscription || !subscription.isActive) {
            console.log(`⚠️ Subscription ${subId} no longer active or missing. Skipping.`);
            return;
        }

        const user = await User.findById(subscription.userId);
        if (!user || !user.email) {
            console.log(`⚠️ User ${subscription.userId} not found or has no email. Skipping.`);
            return;
        }

        // Send Email
        await sendTemplateEmail({
            templateName: "SubscriptionExpired.html",
            to: user.email,
            subject: `⚠️ Reminder: Your Prithu subscription expires in ${remainingDays} days`,
            placeholders: {
                userName: user.userName,
                planName: subscription.planId.name,
                remainingDays: remainingDays.toString()
            },
            embedLogo: false
        });

        // Update last reminder date to prevent duplicates
        subscription.lastExpiryReminderDate = todayStr;
        await subscription.save();

        console.log(`✅ Expiry reminder sent to ${user.email} (Subscription: ${subId})`);
    } catch (err) {
        console.error(`❌ Error in subscription reminder worker for ${subId}:`, err);
        throw err; // Bull will retry based on config
    }
});

reminderQueue.on("completed", (job) => console.log(`✅ Reminder job completed: ${job.id}`));
reminderQueue.on("failed", (job, err) => console.error(`❌ Reminder job failed: ${job.id}`, err));

module.exports = reminderQueue;
