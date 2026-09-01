const mongoose = require("mongoose");
const { prithuDB } = require("../database");

const profileCardPlanSchema = new mongoose.Schema(
  {
    name: { type: String, default: "Profile Card Pro Pass" },
    price: { type: Number, default: 50, required: true }, // Default Rs. 50
    originalPrice: { type: Number, default: 199 }, // Strikethrough price for UI discount display
    durationDays: { type: Number, default: 30 }, // 30 Days validity (Monthly Pro Pass)
    description: { 
      type: String, 
      default: "Full access to 5 templates, custom theme colors, photo gallery, services, QR code & instant sharing for 30 days" 
    },
    features: [
      { type: String }
    ],
    badgeText: { type: String, default: "POPULAR • 75% OFF" },
    trialEnabled: { type: Boolean, default: true }, // 3 Days Free Trial enabled by default
    trialDurationDays: { type: Number, default: 3 }, // Configurable trial duration (default 3 days)
    isActive: { type: Boolean, default: true }
  },
  { timestamps: true, versionKey: false }
);

const ProfileCardPlan = prithuDB.model("ProfileCardPlan", profileCardPlanSchema, "ProfileCardPlans");

// Auto-seed default Rs. 50 plan if none exists
async function autoSeedProfileCardPlan() {
  try {
    const count = await ProfileCardPlan.countDocuments();
    if (count === 0) {
      await ProfileCardPlan.create({
        name: "Profile Card Pro Pass",
        price: 50,
        originalPrice: 199,
        durationDays: 30,
        badgeText: "POPULAR • 75% OFF",
        description: "Unlock all 5 card templates, custom colors, services, QR code image and live sharing for 30 days",
        features: [
          "All 5 Premium Card Themes & Live Color Controls",
          "Unlock QR Code Image & Instant Sharing",
          "Services & Products Showcase (Unlimited)",
          "Photo Gallery & Showcase Images",
          "1-Tap WhatsApp, Direct Call & Google Maps Buttons",
          "vCard Contact Save (.VCF) Download",
          "Real-Time Page View Analytics"
        ],
        isActive: true
      });
      console.log("✅ Auto-seeded default Rs. 50 Profile Card Plan");
    }
  } catch (err) {
    console.error("Error auto-seeding Profile Card plan:", err.message);
  }
}

autoSeedProfileCardPlan();

module.exports = {
  ProfileCardPlan,
  autoSeedProfileCardPlan
};
