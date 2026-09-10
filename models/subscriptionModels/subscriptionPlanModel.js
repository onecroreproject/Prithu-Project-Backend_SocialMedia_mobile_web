const mongoose = require("mongoose");
const { prithuDB } = require("../../database");

const subscriptionPlanSchema = new mongoose.Schema({
  name: { type: String, required: true },
  price: { type: Number, required: true },
  durationDays: { type: Number, required: true },

  razorpayPlanId: { type: String }, // Required for paid plans

  limits: {
    deviceLimit: { type: Number, default: 1 },
  },

  description: { type: String },       // For UI display
  planType: {                          // Categorize plans
    type: String,
    enum: ["trial", "basic", "premium"], // Allowed values
    default: "basic"
  },

  isActive: { type: Boolean, default: true },

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

module.exports = prithuDB.model("SubscriptionPlan", subscriptionPlanSchema, "SubscriptionPlan");
// module.exports= mongoose.models.SubscriptionPlan || prithuDB.model("SubscriptionPlan", subscriptionPlanSchema,"SubscriptionPlan");




