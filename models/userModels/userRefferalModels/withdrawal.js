const mongoose = require("mongoose");
const { prithuDB } = require("../../../database");


const WithdrawalSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  amount: { type: Number, required: true }, // requested withdrawal amount
  withdrawalAmount: { type: Number, required: true }, // optional: separate field for clarity
  totalAmount: { type: Number, required: true }, // total balance before withdrawal
  bankDetails: { type: Object }, // snapshot of bank info at time of request
  cycleIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "ReferralCycle" }], // associated cycles
  notes: { type: String, default: "" }, // user notes
  status: { type: String, enum: ["pending", "approved", "rejected", "paid"], default: "pending" },
  requestedAt: { type: Date, default: Date.now },
  processedAt: { type: Date }
});

module.exports = prithuDB.model("Withdrawal", WithdrawalSchema, "Withdrawals");
