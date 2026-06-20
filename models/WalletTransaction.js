const mongoose = require("mongoose");
const { prithuDB } = require("../database");

const WalletTransactionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    transactionType: { 
      type: String, 
      enum: ["PURCHASE", "PROMPT_UNLOCK", "AI_GENERATION", "REFUND", "ADMIN_ADJUSTMENT"], 
      required: true 
    },
    credits: { type: Number, required: true },
    amount: { type: Number, default: 0 }, // monetary amount if it's a purchase
    balanceBefore: { type: Number, required: true },
    balanceAfter: { type: Number, required: true },
    referenceId: { type: String }, // e.g., promptId, generationId, or paymentId
    remarks: { type: String },
  },
  { timestamps: true, versionKey: false }
);

module.exports = prithuDB.model("WalletTransaction", WalletTransactionSchema, "WalletTransactions");
