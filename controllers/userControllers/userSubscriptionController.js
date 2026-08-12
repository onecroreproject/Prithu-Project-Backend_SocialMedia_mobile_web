const UserSubscription = require("../../models/subscriptionModels/userSubscriptionModel.js");
const SubscriptionPlan = require("../../models/subscriptionModels/subscriptionPlanModel.js");
const User = require('../../models/userModels/userModel.js');
const mongoose = require('mongoose');
const crypto = require("crypto");
const Invoice = require("../../models/subscriptionModels/invoiceModel.js");
const { prithuDB } = require("../../database");
const activateTrialPlan = require('../../middlewares/subscriptionMiddlewares/activateTrialPlan');
const checkActiveSubscription = require('../../middlewares/subscriptionMiddlewares/checkActiveSubscription.js');
const { sendTemplateEmail } = require("../../utils/templateMailer.js");
const { handleReferralReward } = require("../../middlewares/helper/directReferalFunction.js");
const { generateInvoicePDF } = require("../../utils/invoiceGenerator.js");

/**
 * 1️⃣ Subscribe to a Plan
 */
exports.subscribePlan = async (req, res) => {
  try {
    const { planId } = req.body;
    const userId = req.Id;

    if (!planId || !userId) {
      return res.status(400).json({ message: "planId is required" });
    }

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    const plan = await SubscriptionPlan.findById(planId);
    if (!plan) return res.status(404).json({ message: "Plan not found" });

    // ❌ Block if active subscription exists
    const activeSub = await UserSubscription.findOne({
      userId,
      isActive: true,
      endDate: { $gt: new Date() }
    });

    if (activeSub) {
      return res.status(400).json({
        message: "You already have an active subscription",
        endDate: activeSub.endDate
      });
    }

    // ✅ FREE / TRIAL PLAN (no Razorpay)
    if (plan.price === 0) {
      const today = new Date();
      const durationMs = (plan.durationDays || 30) * 86400000;

      const subscription = new UserSubscription({
        userId,
        planId,
        isActive: true,
        paymentStatus: "success",
        startDate: today,
        endDate: new Date(today.getTime() + durationMs)
      });

      await subscription.save();

      user.subscription = {
        isActive: true,
        planType: plan.planType,
        startDate: subscription.startDate,
        endDate: subscription.endDate
      };

      await user.save();

      return res.status(200).json({
        success: true,
        message: "Free plan activated",
        subscription
      });
    }

    // ❌ PAID plans must go through createOrder + verifyPayment
    return res.status(400).json({
      message: "Use payment flow to activate paid plans"
    });

  } catch (err) {
    console.error("subscribePlan error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

/**
 * 2️⃣ Cancel Subscription
 */
exports.cancelSubscription = async (req, res) => {
  try {
    const { subscriptionId } = req.body;
    const userId = req.Id; // From auth

    if (!subscriptionId) {
      return res.status(400).json({ message: "Subscription ID is required" });
    }

    // Security: Find subscription for THIS user only
    const subscription = await UserSubscription.findOne({ _id: subscriptionId, userId });

    if (!subscription) {
      return res.status(404).json({ message: "Subscription not found or unauthorized" });
    }

    if (!subscription.isActive) {
      return res.status(400).json({ message: "Subscription is already inactive" });
    }

    subscription.isActive = false;
    await subscription.save();

    res.status(200).json({ message: "Subscription cancelled successfully" });
  } catch (err) {
    console.error("cancelSubscription error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

/**
 * 3️⃣ Get Active Subscription Detail
 */
exports.getUserSubscriptionPlanWithId = async (req, res) => {
  const userId = req.Id; // From auth

  if (!userId) {
    return res.status(400).json({ message: "Unauthorized" });
  }

  try {
    const plan = await UserSubscription.findOne({ userId, isActive: true })
      .populate("planId")
      .populate("userId", "userName email");

    if (!plan) {
      return res.status(404).json({ message: "No active plan found" });
    }

    res.status(200).json({ success: true, plan });
  } catch (error) {
    console.error("getUserSubscriptionPlanWithId error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

/**
 * 4️⃣ Get All Subscription Plans
 */
exports.getAllSubscriptionPlans = async (req, res) => {
  try {
    const plans = await SubscriptionPlan.find({ isActive: true });
    res.status(200).json({ success: true, plans });
  } catch (error) {
    console.error("getAllSubscriptionPlans error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

/**
 * 5️⃣ Activate Trial Plan
 */
exports.userTrialPlanActive = async (req, res) => {
  try {
    const userId = req.Id; // From auth

    // Middleware 'activateTrialPlan' handles logic for one-time activation
    const newSub = await activateTrialPlan(userId);

    res.status(200).json({
      success: true,
      subscription: newSub
    });
  } catch (err) {
    console.error("userTrialPlanActive error:", err);
    res.status(400).json({ success: false, error: err.message });
  }
};

/**
 * 6️⃣ Check Active Subscription
 */
exports.checkUserActiveSubscription = async (req, res) => {
  try {
    const userId = req.Id; // From auth

    if (!userId) return res.status(400).json({ message: "Unauthorized" });

    const result = await checkActiveSubscription(userId);
    res.status(200).json({
      success: true,
      isActive: result.hasActive,
      planType: result.planType,
      subscription: result.subscription,
      message: result.message,
      warning: result.warning
    });

  } catch (err) {
    console.error("checkUserActiveSubscription error:", err);
    res.status(400).json({ success: false, error: err.message });
  }
};

/**
 * 7️⃣ Check Trial Eligibility
 */
exports.checkTrialEligibility = async (req, res) => {
  try {
    const userId = req.Id;
    const hasUsedTrial = require('../../middlewares/subscriptionMiddlewares/userTrialChecker');

    // Check if user has used trial (returns object if active/used, false if used/expired?? Wait, let's check current logic)
    // Actually userTrialChecker returns: 
    // - null (never used)
    // - false (used & expired/inactive)
    // - object (active)

    // BUT we modified it to check User.trialUsed too.
    // If User.trialUsed is true, hasUsedTrial might return false (step 276 diff shows: if user.trialUsed return false).

    // This is slightly confusing naming in the original file vs my change. 
    // Let's re-read userTrialChecker.js to be 100% sure what it returns.

    const trialStatus = await hasUsedTrial(userId);

    // If trialStatus is null -> Eligible (Never used)
    // If trialStatus is false -> Not Eligible (Used and expired/cancelled)
    // If trialStatus is object -> Active (Not Eligible to activate new, but is currently running)

    let isEligible = false;
    let hasUsed = true;
    let trialActive = false;
    let trialExpiresAt = null;
    let trialRemainingDays = 0;

    if (trialStatus === null) {
      isEligible = true;
      hasUsed = false;
    } else if (typeof trialStatus === 'object') {
      // Active
      isEligible = false;
      hasUsed = true; // Technically using it now
      trialActive = true;
      trialExpiresAt = trialStatus.endDate;
      trialRemainingDays = trialStatus.remainingDays;
    } else {
      // false, meaning used and done
      isEligible = false;
      hasUsed = true;
    }

    // Safety check on User model directly just in case middleware changes
    if (isEligible) {
      const user = await User.findById(userId).select('trialUsed');
      if (user?.trialUsed) {
        isEligible = false;
        hasUsed = true;
      }
    }

    res.status(200).json({
      success: true,
      isEligible,
      hasUsedTrial: hasUsed,
      trialActive,
      trialExpiresAt,
      trialRemainingDays
    });

  } catch (err) {
    console.error("checkTrialEligibility error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
};


/**
 * Razorpay methods (createSubscriptionOrder, verifySubscriptionPayment, recordPaymentFailure, recordPaymentCancel) 
 * have been removed. Use paymentController for Instifi payments.
 */

/**
 * 1️⃣2️⃣ Download Invoice PDF
 */
exports.downloadInvoice = async (req, res) => {
  try {
    const { invoiceId } = req.params;
    const userId = req.Id;

    const invoice = await Invoice.findById(invoiceId).populate('planId').populate('userId');
    if (!invoice) {
      return res.status(404).json({ success: false, message: "Invoice not found" });
    }

    // Security check: Only the owner or admin can download
    if (invoice.userId._id.toString() !== userId.toString()) {
      return res.status(403).json({ success: false, message: "Unauthorized" });
    }

    const pdfBuffer = await generateInvoicePDF({
      userName: invoice.userId.userName,
      email: invoice.userId.email,
      invoiceNumber: invoice.invoiceNumber,
      paymentDate: invoice.paidAt.toLocaleDateString(),
      planName: invoice.planId.name,
      amount: invoice.amount,
      razorpayPaymentId: invoice.razorpayPaymentId
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=Invoice_${invoice.invoiceNumber}.pdf`);
    res.status(200).send(pdfBuffer);

  } catch (err) {
    console.error("downloadInvoice error:", err);
    res.status(500).json({ success: false, message: "Failed to generate invoice PDF", error: err.message });
  }
};

/**
 * 1️⃣3️⃣ Get User Invoices
 */
exports.getUserInvoices = async (req, res) => {
  try {
    const userId = req.Id;
    const invoices = await Invoice.find({ userId })
      .populate('planId', 'name')
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      invoices
    });
  } catch (err) {
    console.error("getUserInvoices error:", err);
    res.status(500).json({ success: false, message: "Failed to fetch invoices" });
  }
};

