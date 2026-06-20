const mongoose = require("mongoose");
const { prithuDB } = require("../../database");

// ------------ FCM SUB-SCHEMA -------------
const FcmTokenSchema = new mongoose.Schema(
  {
    token: { type: String, required: true, index: true },
    platform: { type: String, enum: ["web", "ios", "android"], required: true },
    topics: { type: [String], default: [] },
    lastSeenAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

// ------------ SUBSCRIPTION SUB-SCHEMA -------------
const SubscriptionSchema = new mongoose.Schema(
  {
    isActive: { type: Boolean, default: false },
    planType: { type: String, enum: ["trial", "basic", "premium"], default: "basic" },
    planId: { type: mongoose.Schema.Types.ObjectId, ref: "SubscriptionPlan" },
    startDate: { type: Date },
    endDate: { type: Date },
    subscriptionStatus: { type: String },
    paymentStatus: { type: String },
    paymentId: { type: String },
    activatedAt: { type: Date },
    expiryDate: { type: Date },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

// ------------ MAIN USER SCHEMA --------------
const UserSchema = new mongoose.Schema(
  {
    userName: {
      type: String,
      required: true,
      unique: true,
      minlength: 3,
      maxlength: 30,
      trim: true,
    },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },

    passwordHash: {
      type: String,
      required: true,
    },

    roles: {
      type: [String],
      enum: ["User", "Business", "Creator"],
      default: ["User"],
    },

    activeAccount: { type: mongoose.Schema.Types.ObjectId, ref: "Account" },

    accounts: [{ type: mongoose.Schema.Types.ObjectId, ref: "Account" }],

    profileSettings: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ProfileSettings",
    },

    // ------------ WALLET SYSTEM --------------
    wallet: {
      balance: { type: Number, default: 0 },
      totalPurchasedCredits: { type: Number, default: 0 },
      totalSpentCredits: { type: Number, default: 0 },
    },

    // ------------ REFERRAL LOGIC --------------
    referralCode: { type: String, unique: true, sparse: true, trim: true },
    referralCodeIsValid: { type: Boolean, default: false },
    referredByUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      index: true,
    },
    referralCodeUsageCount: { type: Number, default: 0 },
    referralCodeUsageLimit: { type: Number, default: 2 },

    // ------------ EARNING SYSTEM --------------
    totalEarnings: { type: Number, default: 0 },
    withdrawnEarnings: { type: Number, default: 0 },
    balanceEarnings: { type: Number, default: 0 },

    // ------------ SUBSCRIPTION --------------
    subscription: { type: SubscriptionSchema, default: {} },

    // ------------ FCM DEVICES --------------
    fcmTokens: { type: [FcmTokenSchema], default: [] },

    // ------------ ACCOUNT STATUS --------------
    isActive: { type: Boolean, default: true },
    isBlocked: { type: Boolean, default: false },

    // ------------ TIMING METRICS --------------
    lastActiveAt: { type: Date, default: Date.now },
    lastLoginAt: { type: Date },

    // ------------ PRESENCE STATUS --------------
    isOnline: { type: Boolean, default: false },
    lastSeenAt: { type: Date, default: null },

    // ------------ OTP --------------
    otpCode: { type: String },
    otpExpiresAt: { type: Date },

    // ------------ TERMS & COMPLIANCE --------------
    termsAccepted: { type: Boolean, default: false, required: true },
    termsAcceptedAt: { type: Date },
    trialUsed: { type: Boolean, default: false },

    // ------------ USER POST STATUS --------------
    allowToPost: {
      type: String,
      enum: ["allow", "interest", "notallow"],
      default: "notallow",
      index: true,
    },

    // ------------ PROMOTIONAL CAMPAIGN --------------
    lastPromotionalEmailDate: { type: Date },
    promoTemplateIndex: { type: Number, default: 0 },

    // ------------ ANALYTICS & RECOMMENDATION --------------
    interestScore: {
      type: Map,
      of: Number,
      default: {},
    }, // categoryId -> score
    categoryPreference: [{
      categoryId: { type: mongoose.Schema.Types.ObjectId, ref: "Categories" },
      score: { type: Number, default: 0 },
    }],
    engagementScore: { type: Number, default: 0 },
    watchBehavior: {
      averageWatchTime: { type: Number, default: 0 },
      completionRate: { type: Number, default: 0 },
    },
  },
  {
    timestamps: true,
    versionKey: false,
    minimize: true,
  }
);

// ------------ INDEXES --------------
// Note: email, userName, and referralCode already have unique: true in their field definitions
// which automatically creates unique indexes, so we don't need explicit index() calls for them
UserSchema.index({ referralCodeIsValid: 1 });
UserSchema.index({ "subscription.isActive": 1 });
UserSchema.index({ isOnline: 1 });
UserSchema.index({ createdAt: 1 });

// ------------ HOOK --------------
UserSchema.pre("save", function (next) {
  if (this.subscription) {
    this.subscription.updatedAt = Date.now();
  }
  next();
});

module.exports =
  mongoose.models.User ||
  prithuDB.model("User", UserSchema, "User");
