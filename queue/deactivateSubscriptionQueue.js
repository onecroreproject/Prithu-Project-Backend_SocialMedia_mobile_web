const UserSubscription = require("../models/subscriptionModels/userSubscriptionModel");
const createQueue = require("../queue.js");

const deactivateQueue = createQueue("deactivated-subscription");

deactivateQueue.process(async (job) => {
    console.log("🔹 Running subscription deactivation job...", job.id);
    const now = new Date();

    // 1. Find all expired subscriptions that are currently active
    const expired = await UserSubscription.find({
        isActive: true,
        endDate: { $lt: now }
    }).populate("planId").select("userId planId").lean();

    if (expired.length === 0) {
        console.log("✅ No expired subscriptions found to deactivate.");
        return;
    }

    const userIds = expired.map(s => s.userId);
    const subIds = expired.map(s => s._id);

    // 2. Clear isActive in UserSubscription collection
    await UserSubscription.updateMany(
        { _id: { $in: subIds } },
        { $set: { isActive: false } }
    );

    const User = require("../models/userModels/userModel");
    const { sendTemplateEmail } = require("../utils/templateMailer");

    for (const sub of expired) {
        // Clear isActive in User collection (sub-document)
        await User.updateOne(
            { _id: sub.userId },
            { $set: { "subscription.isActive": false } }
        );

        // If it was a trial, send expiration email
        if (sub.planId && sub.planId.planType === "trial") {
            const user = await User.findById(sub.userId).select("email userName").lean();
            if (user && user.email) {
                await sendTemplateEmail({
                    templateName: "TrialPlanExpired.html",
                    to: user.email,
                    subject: "Your Trial Plan has Expired",
                    placeholders: { userName: user.userName },
                    embedLogo: false
                }).catch(err => console.error(`❌ Trial expiration email failed for ${user.email}:`, err));
            }
        }
    }

    console.log(`✅ Deactivated ${expired.length} expired subscriptions.`);
});

deactivateQueue.on("completed", (job) => console.log(`✅ Job completed: ${job.id}`));
deactivateQueue.on("failed", (job, err) => console.error(`❌ Job failed: ${job.id}`, err));

module.exports = deactivateQueue;
