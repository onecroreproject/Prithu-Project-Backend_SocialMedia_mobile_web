const mongoose = require("mongoose");
const {prithuDB}=require("../../database");

const SubscriptionInvoiceSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }, // User who paid
  planId: { type: mongoose.Schema.Types.ObjectId, ref: "SubscriptionPlan", required: true }, // Subscription plan
  razorpayInvoiceId: { type: String, required: true }, // Razorpay invoice ID
  razorpayPaymentId: { type: String }, // Razorpay payment ID (if paid)
  razorpaySubscriptionId: { type: String, required: true }, // Subscription ID
  amount: { type: Number, required: true }, // Amount in smallest currency unit (e.g., paise)
  currency: { type: String, default: "INR" },
  status: { type: String, enum: ["created", "paid", "failed", "refunded"], default: "created", index: true },
  issuedAt: { type: Date, default: Date.now },
  paidAt: { type: Date, index: true }, // Date when payment was completed
  metadata: { type: Object }, // Optional: any extra info like plan name, duration, etc.
});

module.exports = prithuDB.model(
  "SubscriptionInvoice",
  SubscriptionInvoiceSchema,
  "SubscriptionInvoices"
);
