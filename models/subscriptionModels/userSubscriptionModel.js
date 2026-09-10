const mongoose = require("mongoose");
const { prithuDB } = require("../../database");

const userSubscriptionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  planId: { type: mongoose.Schema.Types.ObjectId, ref: "SubscriptionPlan", required: true },

  // Subscription dates
  startDate: { type: Date },
  endDate: { type: Date, index: true },

  // Limits usage (e.g., API calls, storage, etc.)
  limitsUsed: { type: mongoose.Schema.Types.Mixed, default: {} },

  // Subscription status
  isActive: { type: Boolean, default: false, index: true },
  paymentStatus: { type: String, enum: ["pending", "success", "failed"], default: "pending", index: true },
  subscriptionStatus: { type: String },
  createdAt: { type: Date, default: Date.now, index: true },

  // Instifi details
  instifiMerchantTxnId: { type: String },
  instifiOrderId: { type: String },
  paymentId: { type: String },
  activatedAt: { type: Date },
  expiryDate: { type: Date },

  invoiceId: { type: mongoose.Schema.Types.ObjectId, ref: "Invoice" }, // Linked Invoice
  lastExpiryReminderDate: { type: String }, // Format: YYYY-MM-DD to track daily reminders

  // Meta
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

// Auto-update updatedAt
userSubscriptionSchema.pre("save", function (next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = prithuDB.model(
  "UserSubscription",
  userSubscriptionSchema,
  "UserSubscriptions"
);
