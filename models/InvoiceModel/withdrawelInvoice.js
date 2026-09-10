const mongoose = require("mongoose");
const {prithuDB}=require("../../database");

const WithdrawalInvoiceSchema = new mongoose.Schema({
  withdrawalId: { type: mongoose.Schema.Types.ObjectId, ref: "Withdrawal", required: true }, // Link to Withdrawal
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  withdrawalAmount: { type: Number, required: true }, // Amount withdrawn
  totalAmount: { type: Number, required: true }, // Total balance before withdrawal
  currency: { type: String, default: "INR" },
  razorpayPaymentId: { type: String }, // Optional: if payout done via Razorpay
  status: { type: String, enum: ["pending", "completed", "rejected"], default: "pending" },
  requestedAt: { type: Date, required: true },
  processedAt: { type: Date },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

WithdrawalInvoiceSchema.pre("save", function(next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = prithuDB.model("WithdrawalInvoice", WithdrawalInvoiceSchema, "WithdrawalInvoices");
