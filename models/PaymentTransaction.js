const mongoose = require("mongoose");
const { prithuDB } = require("../database");

const paymentTransactionSchema = new mongoose.Schema({
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User',
    required: true 
  },
  planId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SubscriptionPlan',
    required: false
  },
  orderId: { 
    type: String, 
    required: true,
    unique: true 
  },
  merchantTxnId: {
    type: String,
    required: true,
    unique: true
  },
  paymentId: { 
    type: String 
  }, // Session ID or Payment ID from Instifi
  transactionId: { 
    type: String 
  }, // Final Txn ID after success
  amount: { 
    type: Number, 
    required: true 
  },
  currencyCode: {
    type: String,
    default: "INR"
  },
  paymentMethod: {
    type: String,
    default: "Instifi"
  },
  paymentStatus: { 
    type: String, 
    enum: ["pending", "success", "failed", "cancelled", "subscriptionPending"],
    default: "pending" 
  },
  transactionStatus: {
    type: String,
    enum: ["created", "pending", "success", "failed"],
    default: "created"
  },
  invoiceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Invoice'
  },
  invoiceUrl: {
    type: String
  },
  customerName: {
    type: String
  },
  customerEmail: {
    type: String
  },
  customerMobile: {
    type: String
  },
  gatewayResponse: { 
    type: Object 
  }, // Full response from Instifi (backward compatibility)
  paymentGatewayResponse: {
    type: Object
  }, // Full response from Instifi
  createdAt: { 
    type: Date, 
    default: Date.now 
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

paymentTransactionSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = prithuDB.model("PaymentTransaction", paymentTransactionSchema, "PaymentTransaction");
