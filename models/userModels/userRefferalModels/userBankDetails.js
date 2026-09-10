const mongoose = require("mongoose");
const { prithuDB } = require("../../../database");

const UserBankDetailsSchema = new mongoose.Schema(
    {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },
        accountHolderName: { type: String, required: true },
        mobileNumber: { type: String, required: true },
        ifscCode: { type: String, required: true },
        bankName: { type: String, required: true },
        branch: { type: String, required: true },
        bankAddress: { type: String, required: true },
        accountNumber: { type: String, required: true },
        accountType: { type: String, enum: ["Savings", "Current"], default: "Savings" },
    },
    { timestamps: true }
);

module.exports = prithuDB.model("UserBankDetails", UserBankDetailsSchema, "UserBankDetails");
