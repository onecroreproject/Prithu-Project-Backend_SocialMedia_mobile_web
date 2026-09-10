const mongoose = require("mongoose");
const { prithuDB } = require("../../../database");

const UserReferralActivitySchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    referralCode: { type: String, trim: true },
    referredUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true }, // if registered
    activityType: {
        type: String,
        enum: ["invite", "signup", "reward", "share", "milestone_claimed", "subscription_purchased"],
        required: true
    },
    shareCount: { type: Number, default: 0 },
    sharingMedium: {
        type: String,
        enum: ["WhatsApp", "Facebook", "Instagram", "Copy Link", "Other", "whatsapp", "facebook", "instagram", "copy link"],
        default: "Other"
    },
    earnedAmount: { type: Number, default: 0 },
    activityDate: { type: Date, default: Date.now, index: true }
}, { timestamps: true });

module.exports = prithuDB.model("UserReferralActivity", UserReferralActivitySchema, "UserReferralActivities");
