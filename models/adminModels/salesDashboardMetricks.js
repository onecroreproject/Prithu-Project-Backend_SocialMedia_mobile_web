// models/AnalyticsMetric.js
const mongoose = require("mongoose");
const { prithuDB } = require("../../database");

const analyticsMetricSchema = new mongoose.Schema(
  {
    date: {
      type: Date,
      required: true,
    },
    totalRevenue: {
      type: Number,
      default: 0,
    },
    totalInvoices: {
      type: Number,
      default: 0,
    },
    totalWithdrawals: {
      type: Number,
      default: 0,
    },
    totalWithdrawalInvoices: {
      type: Number,
      default: 0,
    },
    totalWithdrawalAmount: {
      type: Number,
      default: 0,
    },
    byReferralUsers: {
      type: Number,
      default: 0,
    },

    totalSubscribers: {
      type: Number,
      default: 0,
    },
    totalTrialUsers: {
      type: Number,
      default: 0,
    },
    totalUsers: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

// Ensure unique date record (one per day)
analyticsMetricSchema.index({ date: 1 }, { unique: true });

module.exports = prithuDB.model("AnalyticsMetric", analyticsMetricSchema, "AnalyticsMetrics");
