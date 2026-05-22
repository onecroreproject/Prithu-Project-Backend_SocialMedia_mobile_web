const UserSubscription = require("../../models/subscriptionModels/userSubscriptionModel.js");
const SubscriptionPlan = require("../../models/subscriptionModels/subscriptionPlanModel.js");
const User = require('../../models/userModels/userModel.js');
const hasTrial = require('../../middlewares/subscriptionMiddlewares/userTrialChecker');
const { sendTemplateEmail } = require("../../utils/templateMailer.js");
const mongoose = require('mongoose');
const { prithuDB } = require("../../database");

/**
 * Activate a trial plan for a user.
 * Ensures the user has not previously used a trial.
 */
async function activateTrialPlan(userId, userEmail, userName) {
  const MAX_RETRIES = 5;
  let attempt = 0;

  while (attempt < MAX_RETRIES) {
    attempt++;
    const session = await prithuDB.startSession();
    session.startTransaction();

    try {
      // 1. Fetch trial plan
      const trialPlan = await SubscriptionPlan.findOne({ planType: "trial", isActive: true }).session(session);
      if (!trialPlan) throw new Error("Trial plan is not available at the moment.");

      // 2. Fetch user details if email or name is missing
      if (!userEmail || !userName) {
        const user = await User.findById(userId).select("email userName").session(session).lean();
        if (user) {
          userEmail = userEmail || user.email;
          userName = userName || user.userName;
        }
      }

      // 3. Check if user has already used or is currently in a trial
      const usedTrial = await hasUserUsedTrialStrict(userId, session);

      if (usedTrial) {
        if (userEmail) {
          await sendTemplateEmail({
            templateName: "TrialPlanExpired.html",
            to: userEmail,
            subject: "Trial Plan Expired",
            placeholders: { userName },
            embedLogo: false
          }).catch(err => console.error("Email failed:", err));
        }
        await session.abortTransaction();
        session.endSession();
        return { success: false, message: "You have already used your trial plan." };
      }

      // 4. Activate Trial
      // Use dynamic duration from DB
      const durationDays = trialPlan.durationDays || 3; // Fallback to 3 only if DB field missing

      // Explicitly set dates
      const startDate = new Date();
      const endDate = new Date();
      endDate.setDate(startDate.getDate() + durationDays);

      const newSubscription = new UserSubscription({
        userId,
        planId: trialPlan._id,
        startDate,
        endDate,
        paymentStatus: "success",
        isActive: true, // Mark active
        limitsUsed: {},
      });

      await newSubscription.save({ session });

      // CRITICAL: Permanently mark trial as used
      await User.findByIdAndUpdate(userId, {
        trialUsed: true,
        subscription: {
          isActive: true,
          planType: "trial",
          startDate,
          endDate
        }
      }).session(session);

      await session.commitTransaction();
      session.endSession();

      if (userEmail) {
        await sendTemplateEmail({
          templateName: "TrialPlanActivation.html",
          to: userEmail,
          subject: "🎉 Trial Plan Activated!",
          placeholders: {
            userName,
            planType: "Trial",
            startDate: startDate.toDateString(),
            endDate: endDate.toDateString()
          },
          embedLogo: false
        }).catch(err => console.error("Email failed:", err));
      }

      return {
        success: true,
        message: `Trial plan activated successfully for ${durationDays} days!`,
        subscription: newSubscription
      };

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
        console.warn(`[activateTrialPlan] Transient error encountered (attempt ${attempt}/${MAX_RETRIES}). Retrying in ${100 * attempt}ms...`, err.message);
        await new Promise(resolve => setTimeout(resolve, 100 * attempt));
        continue;
      }
      throw err;
    }
  }
}

// Internal helper for strict check within transaction
async function hasUserUsedTrialStrict(userId, session) {
  const user = await User.findById(userId).select("trialUsed").session(session);
  if (user && user.trialUsed) return true;

  // Double check subscription history just in case
  const trialPlan = await SubscriptionPlan.findOne({ planType: "trial" }).session(session);
  if (!trialPlan) return false;

  const existing = await UserSubscription.findOne({ userId, planId: trialPlan._id }).session(session);
  return !!existing;
}

module.exports = activateTrialPlan;
