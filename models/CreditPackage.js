const mongoose = require("mongoose");
const { prithuDB } = require("../database");

const CreditPackageSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    credits: { type: Number, required: true },
    price: { type: Number, required: true },
    currency: { type: String, default: "INR" },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true, versionKey: false }
);

module.exports = prithuDB.model("CreditPackage", CreditPackageSchema, "CreditPackages");
