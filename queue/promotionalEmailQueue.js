const Bull = require("bull");
const redisClient = require("../Config/redisConfig");
const { sendTemplateEmail } = require("../utils/templateMailer");
const User = require("../models/userModels/userModel");
const { getPromotionalStats } = require("../services/statsService");

const promoQueue = new Bull("promotional-emails", {
    redis: {
        host: process.env.REDIS_HOST || "127.0.0.1",
        port: process.env.REDIS_PORT || 6379,
        password: process.env.REDIS_PASSWORD || undefined,
    }
});

/**
 * Process promotional email jobs.
 */
promoQueue.process(async (job) => {
    const { userId, templateIndex, userName, email } = job.data;

    try {
        // 1. Get real-time stats (cached in Redis)
        const stats = await getPromotionalStats();

        // 2. Determine template name (1-10 rotation)
        const promoNumber = (templateIndex % 10) + 1;
        const templateName = `promotion/Promotion${promoNumber}.html`;

        // 3. Define subjects for each template variation
        const subjects = [
            "🎉 Your Moments Deserve Magic – Discover Prithu Today!",
            "💝 Turn Every Emotion Into a Story – Join Prithu",
            "✨ Celebrate, Express & Earn – Prithu Awaits!",
            "😂 Trending Satire: Join the Laughter on Prithu",
            "🕉️ Find Your Inner Peace – Soulful Spiritual Status",
            "💰 Grow Together, Earn Together – Referral Rewards",
            "🌟 See What the Prithu Community is Creating",
            "🌈 Express Your Mood – Daily Status Magic",
            "🛡️ 100% Free & Secure – Your Creative Home",
            "🚀 Your Creative Journey Starts Here – Prithu"
        ];

        const subject = subjects[templateIndex % 10];

        // 4. Send the email
        await sendTemplateEmail({
            templateName,
            to: email,
            subject,
            placeholders: {
                username: userName,
                ...stats
            },
            embedLogo: false
        });

        // 5. Update User tracking (done in cron, but we could double check here if needed)
        // Cron handles the selection, so we just log success.
        console.log(`✅ Promo ${promoNumber} sent to ${email}`);

    } catch (error) {
        console.error(`❌ Failed processing promo for ${email}:`, error);
        throw error; // Let Bull handle retry
    }
});

promoQueue.on("failed", (job, err) => {
    console.error(`❌ Job ${job.id} failed: ${err.message}`);
});

module.exports = promoQueue;
