const mongoose = require("mongoose");
const { prithuDB } = require("../../../database");

const ReferralCycleSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    referralCount: { type: Number, default: 0 }, // total raw referrals
    eligibleReferrals: { type: Number, default: 0 }, // those with Rs 599 subscription
    targetReferrals: { type: Number, default: 25 },
    earnedAmount: { type: Number, default: 0 },
    claimedMilestones: [{ type: Number }], // e.g. [20, 24, 25]
    referralIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    referralDetails: [{
        referredUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        subscriptionStatus: { type: String, enum: ["Pending", "Qualified", "Failed"], default: "Pending" },
        date: { type: Date, default: Date.now }
    }],
    status: {
        type: String,
        enum: ["active", "completed", "expired", "withdrawn"],
        default: "active"
    }
}, { timestamps: true });

ReferralCycleSchema.index({ userId: 1, status: 1 });
ReferralCycleSchema.index({ userId: 1, endDate: 1 });

module.exports = prithuDB.model("ReferralCycle", ReferralCycleSchema, "ReferralCycles");
