// services/subscriptionService.js
const User = require("../../models/userModels/userModel");
const UserSubscription = require("../../models/subscriptionModels/userSubscriptionModel");
const SubscriptionPlan = require("../../models/subscriptionModels/subscriptionPlanModel");
const { processReferral } = require("../../middlewares/referralMiddleware/referralCount");
const mongoose = require("mongoose");
const { prithuDB } = require("../../database");


exports.activateSubscription = async (userId, planId, paymentResult, paymentId = "") => {
  const MAX_RETRIES = 5;
  let attempt = 0;

  while (attempt < MAX_RETRIES) {
    attempt++;
    const session = await prithuDB.startSession();
    session.startTransaction();

    try {
      if (!userId || !planId) {
        throw new Error("userId and planId are required");
      }

      // 🔎 Check if already subscribed for this specific payment
      const existingSubscription = await UserSubscription.findOne({
        userId,
        planId,
        isActive: true,
      }).session(session);

      if (existingSubscription && paymentId && existingSubscription.paymentId === paymentId) {
        await session.commitTransaction();
        session.endSession();
        return existingSubscription;
      }

      // 🔎 Fetch user & plan
      const user = await User.findById(userId).session(session);
      if (!user) throw new Error("User not found");

      const plan = await SubscriptionPlan.findById(planId).session(session);
      if (!plan) throw new Error("Subscription plan not found");

      // 🔎 Find or create subscription
      let subscription = await UserSubscription.findOne({ userId }).session(session);
      if (!subscription) {
        subscription = new UserSubscription({
          userId,
          planId,
          isActive: false,
          paymentStatus: "pending",
          subscriptionStatus: "pending",
        });
      }

      // 📅 Duration
      const today = new Date();
      const durationMs = (plan.durationDays || 30) * 24 * 60 * 60 * 1000;

      // ✅ Success
      if (paymentResult === "success") {
        subscription.isActive = true;
        subscription.paymentStatus = "success";
        subscription.subscriptionStatus = "active";
        if (paymentId) {
          subscription.paymentId = paymentId;
        }
        subscription.startDate = subscription.startDate || today;
        subscription.endDate =
          subscription.endDate && subscription.endDate > today
            ? new Date(subscription.endDate.getTime() + durationMs)
            : new Date(today.getTime() + durationMs);
        subscription.activatedAt = subscription.startDate;
        subscription.expiryDate = subscription.endDate;

        await subscription.save({ session });

        user.subscription = {
          isActive: true,
          planType: plan.planType || "basic",
          planId: plan._id,
          startDate: subscription.startDate,
          endDate: subscription.endDate,
          subscriptionStatus: "active",
          paymentStatus: "success",
          paymentId: paymentId || subscription.paymentId || "",
          activatedAt: subscription.startDate,
          expiryDate: subscription.endDate,
        };
        // Only paid subscription plans enable the referral code, free trial does not
        if (plan.planType !== "trial" && (plan.price > 0 || plan.planType === "basic" || plan.planType === "premium")) {
          user.referralCodeIsValid = true;
        } else {
          user.referralCodeIsValid = false;
        }
        await user.save({ session });

        // update parent referral
        if (user.referredByUserId) {
          const parent = await User.findById(user.referredByUserId).session(session);
          if (parent) {
            parent.referralCodeUsageCount += 1;
            if (parent.referralCodeUsageCount >= parent.referralCodeUsageLimit) {
              parent.referralCodeIsValid = false;
            }
            await parent.save({ session });
          }
        }

        await session.commitTransaction();
        session.endSession();

        // Run referral processing outside the committed transaction to avoid lock/write conflicts
        try {
          await processReferral(userId);

          // Trigger Milestone/Cycle validation
          if (user.referredByUserId) {
            const { validateReferralOnSubscription } = require("../../services/referralCycleService");
            await validateReferralOnSubscription(user.referredByUserId, userId, plan.price || 0);
          }
        } catch (referralErr) {
          console.error("Referral processing error:", referralErr.message);
        }

        return subscription;
      }

      // ❌ Failed
      if (paymentResult === "failed") {
        subscription.isActive = false;
        subscription.paymentStatus = "failed";
        subscription.subscriptionStatus = "failed";
        if (paymentId) {
          subscription.paymentId = paymentId;
        }
        await subscription.save({ session });

        user.subscription = {
          isActive: false,
          planType: plan.planType || "basic",
          planId: plan._id,
          subscriptionStatus: "failed",
          paymentStatus: "failed",
          paymentId: paymentId || subscription.paymentId || "",
        };
        user.referralCodeIsValid = false;
        await user.save({ session });

        await session.commitTransaction();
        session.endSession();
        return subscription;
      }

      // ⏳ Pending
      subscription.paymentStatus = "pending";
      await subscription.save({ session });
      await session.commitTransaction();
      session.endSession();

      return subscription;
    } catch (err) {
      try {
        await session.abortTransaction();
      } catch (abortErr) {
        // Silently catch if transaction is already ended/aborted
      }
      session.endSession();

      const isTransient = 
        err.message.includes("Write conflict") || 
        err.message.includes("TransientTransactionError") || 
        err.name === "MongoServerError" && err.code === 112;

      if (isTransient && attempt < MAX_RETRIES) {
        console.warn(`[activateSubscription] Transient error encountered (attempt ${attempt}/${MAX_RETRIES}). Retrying in ${100 * attempt}ms...`, err.message);
        await new Promise(resolve => setTimeout(resolve, 100 * attempt));
        continue;
      }
      throw err;
    }
  }
};
