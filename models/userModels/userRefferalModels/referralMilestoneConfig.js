const mongoose = require("mongoose");
const { prithuDB } = require("../../../database");

const MilestoneItemSchema = new mongoose.Schema({
    count: { type: Number, required: true },
    reward: { type: Number, required: true },
    title: { type: String, default: "" },
    subtitle: { type: String, default: "" },
    icon: { type: String, default: "trophy" },
    badge: { type: String, default: "" },
    isGrand: { type: Boolean, default: false }
}, { _id: false });

const ReferralMilestoneConfigSchema = new mongoose.Schema({
    key: { type: String, default: "default", unique: true },
    rewardPerPerson: { type: Number, default: 100 },
    maxReferralsLimit: { type: Number, default: 25 },
    cycleDays: { type: Number, default: 30 },
    qualifyingPlanPrice: { type: Number, default: 599 },
    milestones: {
        type: [MilestoneItemSchema],
        default: [
            { count: 5, reward: 100, title: "Bronze Starter", subtitle: "5 Qualified Referrals", icon: "seedling", badge: "Tier 1", isGrand: false },
            { count: 10, reward: 300, title: "Starter Goal", subtitle: "10 Qualified Referrals", icon: "bolt", badge: "Tier 2", isGrand: false },
            { count: 15, reward: 500, title: "Rising Star", subtitle: "15 Qualified Referrals", icon: "star", badge: "Tier 3", isGrand: false },
            { count: 20, reward: 700, title: "Silver Goal", subtitle: "20 Qualified Referrals", icon: "medal", badge: "Tier 4", isGrand: false },
            { count: 24, reward: 1000, title: "Gold Goal", subtitle: "24 Qualified Referrals", icon: "trophy", badge: "Tier 5", isGrand: false },
            { count: 25, reward: 2500, title: "Mega Reward", subtitle: "25 Qualified Referrals", icon: "crown", badge: "Mega Prize 🏆", isGrand: true }
        ]
    },
    updatedBy: { type: String, default: "Admin" }
}, { timestamps: true });

module.exports = prithuDB.model("ReferralMilestoneConfig", ReferralMilestoneConfigSchema, "ReferralMilestoneConfigs");
