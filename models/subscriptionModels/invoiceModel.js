const mongoose = require("mongoose");
const { prithuDB } = require("../../database");

const invoiceSchema = new mongoose.Schema({
    invoiceNumber: { type: String, required: true, unique: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    planId: { type: mongoose.Schema.Types.ObjectId, ref: "SubscriptionPlan", required: true },
    subscriptionId: { type: mongoose.Schema.Types.ObjectId, ref: "UserSubscription" },

    amount: { type: Number, required: true }, // In Rupees
    currency: { type: String, default: "INR" },

    status: { type: String, enum: ["paid", "pending", "failed"], default: "paid", index: true },
    paymentMethod: { type: String, default: "Instifi" },
    razorpayPaymentId: { type: String }, // Stores either Razorpay Payment ID or Instifi Transaction ID
 
    paidAt: { type: Date, default: Date.now, index: true },
    emailSent: { type: Boolean, default: false },

    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
});

// Auto-update updatedAt
invoiceSchema.pre("save", function (next) {
    this.updatedAt = Date.now();
    next();
});

module.exports = prithuDB.model(
    "Invoice",
    invoiceSchema,
    "Invoices"
);
