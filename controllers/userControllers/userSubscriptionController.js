const UserSubscription = require("../../models/subscriptionModels/userSubscriptionModel.js");
const SubscriptionPlan = require("../../models/subscriptionModels/subscriptionPlanModel.js");
const User = require('../../models/userModels/userModel.js');
const mongoose = require('mongoose');
const crypto = require("crypto");
const Invoice = require("../../models/subscriptionModels/invoiceModel.js");
const { prithuDB } = require("../../database");
const activateTrialPlan = require('../../middlewares/subscriptionMiddlewares/activateTrialPlan');
const checkActiveSubscription = require('../../middlewares/subscriptionMiddlewares/checkActiveSubscription.js');
const razorpay = require("../../middlewares/helper/razorPayConfig.js");
const { sendTemplateEmail } = require("../../utils/templateMailer.js");
const { handleReferralReward } = require("../../middlewares/helper/directReferalFunction.js");
const { generateInvoicePDF } = require("../../utils/invoiceGenerator.js");

/**
 * 1️⃣ Subscribe to a Plan
 */
exports.subscribePlan = async (req, res) => {
  const session = await prithuDB.startSession();

  try {
    session.startTransaction();

    const { planId } = req.body;
    const userId = req.Id;

    if (!planId || !userId) {
      return res.status(400).json({ message: "planId is required" });
    }

    const user = await User.findById(userId).session(session);
    if (!user) return res.status(404).json({ message: "User not found" });

    const plan = await SubscriptionPlan.findById(planId).session(session);
    if (!plan) return res.status(404).json({ message: "Plan not found" });

    // ❌ Block if active subscription exists
    const activeSub = await UserSubscription.findOne({
      userId,
      isActive: true,
      endDate: { $gt: new Date() }
    }).session(session);

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

      await subscription.save({ session });

      user.subscription = {
        isActive: true,
        planType: plan.planType,
        startDate: subscription.startDate,
        endDate: subscription.endDate
      };

      await user.save({ session });

      await session.commitTransaction();
      session.endSession();

      return res.status(200).json({
        success: true,
        message: "Free plan activated",
        subscription
      });
    }

    // ❌ PAID plans must go through createOrder + verifyPayment
    await session.abortTransaction();
    session.endSession();

    return res.status(400).json({
      message: "Use payment flow to activate paid plans"
    });

  } catch (err) {
    try { await session.abortTransaction(); } catch { }
    session.endSession();
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
 * 8️⃣ Create Razorpay Order
 */
exports.createSubscriptionOrder = async (req, res) => {
  const session = await prithuDB.startSession();
  try {
    session.startTransaction();
    const userId = req.Id;
    const { planId } = req.body;

    if (!planId) return res.status(400).json({ message: "Plan ID is required" });

    // 1. Fetch Plan
    const plan = await SubscriptionPlan.findById(planId).session(session);
    if (!plan) return res.status(404).json({ message: "Plan not found" });
    if (!plan.isActive) return res.status(400).json({ message: "Plan is currently unavailable" });

    // 2. Validate Price (Must be > 0 for Razorpay)
    if (plan.price <= 0) {
      return res.status(400).json({ message: "Use trial activation for free plans" });
    }

    // 3. Create Razorpay Order
    const options = {
      amount: plan.price * 100, // Amount in paise
      currency: "INR",
      receipt: `receipt_order_${new Date().getTime()}`,
      payment_capture: 1
    };

    const order = await razorpay.orders.create(options);
    if (!order) throw new Error("Razorpay order creation failed");

    // 4. Create/Update Pending Subscription Record
    // We store the razorpayOrderId to verify later
    let subscription = await UserSubscription.findOne({ userId, planId, paymentStatus: "pending" }).session(session);

    if (!subscription) {
      subscription = new UserSubscription({
        userId,
        planId,
        paymentStatus: "pending",
        razorpayOrderId: order.id
      });
    } else {
      subscription.razorpayOrderId = order.id;
    }

    await subscription.save({ session });
    await session.commitTransaction();
    session.endSession();

    console.log({
      success: true,
      orderId: order.id,
      key: process.env.RAZORPAY_KEY_ID,
      amount: plan.price * 100,
      currency: "INR",
      planName: plan.name,
      description: `Subscription for ${plan.name}`
    })

    return res.json({
      success: true,
      orderId: order.id, // ✅ IMPORTANT
      key: process.env.RAZORPAY_KEY_ID,
      amount: order.amount,
      currency: order.currency,
      planName: plan.name,
      description: `Subscription for ${plan.name}`
    });

  } catch (err) {
    try { await session.abortTransaction(); } catch (e) { }
    session.endSession();
    console.error("createSubscriptionOrder error:", err);
    res.status(500).json({ success: false, message: "Order creation failed", error: err.message });
  }
};

/**
 * 9️⃣ Verify Payment & Activate
 */
exports.verifySubscriptionPayment = async (req, res) => {
  const session = await prithuDB.startSession();
  try {
    session.startTransaction();
    const userId = req.Id;
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ success: false, message: "Missing payment details" });
    }

    // 1. Verify Signature
    const generated_signature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(razorpay_order_id + "|" + razorpay_payment_id)
      .digest("hex");

    if (generated_signature !== razorpay_signature) {
      return res.status(400).json({ success: false, message: "Payment verification failed: Invalid Signature" });
    }

    // 2. Find Subscription by Order ID AND User ID (Security check)
    const subscription = await UserSubscription.findOne({
      razorpayOrderId: razorpay_order_id,
      userId
    }).populate('planId').session(session);

    if (!subscription) {
      return res.status(404).json({ success: false, message: "Subscription record not found for this order" });
    }

    if (subscription.isActive && subscription.paymentStatus === "success") {
      // Idempotency: Already active
      await session.abortTransaction();
      session.endSession();
      return res.status(200).json({ success: true, message: "Subscription already active" });
    }

    // 3. Activate Subscription
    const plan = subscription.planId;
    const today = new Date();
    const durationMs = (plan.durationDays || 30) * 24 * 60 * 60 * 1000;

    subscription.paymentStatus = "success";
    subscription.isActive = true;
    subscription.startDate = today;
    subscription.endDate = new Date(today.getTime() + durationMs);
    subscription.razorpayPaymentId = razorpay_payment_id;
    subscription.razorpaySignature = razorpay_signature;

    // 4. Generate Invoice
    const invoiceNumber = `INV-${new Date().getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`;
    const invoice = new Invoice({
      invoiceNumber,
      userId,
      planId: plan._id,
      subscriptionId: subscription._id,
      amount: plan.price,
      currency: "INR",
      status: "paid",
      razorpayPaymentId: razorpay_payment_id,
      emailSent: false
    });

    await invoice.save({ session });
    subscription.invoiceId = invoice._id;
    await subscription.save({ session });

    // 5. Update User Record
    await User.findByIdAndUpdate(userId, {
      subscription: {
        isActive: true,
        planType: plan.planType,
        startDate: subscription.startDate,
        endDate: subscription.endDate
      }
    }).session(session);

    await session.commitTransaction();
    session.endSession();

    // 6. Send Subscription Activation Mail with PDF Invoice (Async)
    const activeUser = await User.findById(userId);

    try {
      // Generate PDF Invoice
      const pdfBuffer = await generateInvoicePDF({
        userName: activeUser.userName,
        email: activeUser.email,
        invoiceNumber,
        paymentDate: today.toLocaleDateString(),
        planName: plan.name,
        amount: plan.price,
        razorpayPaymentId: razorpay_payment_id
      });

      // Send Activation Detail Email WITH PDF ATTACHMENT
      sendTemplateEmail({
        templateName: "SubscriptionActivation.html",
        to: activeUser.email,
        subject: "🚀 Your Prithu Premium is Activated!",
        placeholders: {
          userName: activeUser.userName,
          planType: plan.name,
          startDate: today.toLocaleDateString(),
          endDate: subscription.endDate.toLocaleDateString(),
        },
        attachments: [
          {
            filename: `Invoice_${invoiceNumber}.pdf`,
            content: pdfBuffer,
            contentType: 'application/pdf'
          }
        ],
        embedLogo: false
      }).catch(err => console.error("Activation email failed:", err));

      // Mark Invoice as email sent
      await Invoice.findByIdAndUpdate(invoice._id, { emailSent: true });
    } catch (pdfErr) {
      console.error("PDF generation/Email failed:", pdfErr);
      // Fallback: Send email without attachment if PDF fails
      sendTemplateEmail({
        templateName: "SubscriptionActivation.html",
        to: activeUser.email,
        subject: "🚀 Your Prithu Premium is Activated!",
        placeholders: {
          userName: activeUser.userName,
          planType: plan.name,
          startDate: today.toLocaleDateString(),
          endDate: subscription.endDate.toLocaleDateString(),
        },
        embedLogo: false
      }).catch(err => console.error("Fallback activation email failed:", err));
    }

    return res.status(200).json({
      success: true,
      message: "Payment verified and subscription activated successfully!",
      subscription
    });

  } catch (err) {
    try { await session.abortTransaction(); } catch (e) { }
    session.endSession();
    console.error("verifySubscriptionPayment error:", err);
    res.status(500).json({ success: false, message: "Verification failed", error: err.message });
  }
};

/**
 * 🔟 Record Payment Failure
 */
exports.recordPaymentFailure = async (req, res) => {
  try {
    const userId = req.Id;
    const { razorpay_order_id, error_code, error_description } = req.body;

    if (!razorpay_order_id) {
      return res.status(400).json({ success: false, message: "Order ID is required" });
    }

    const subscription = await UserSubscription.findOne({
      razorpayOrderId: razorpay_order_id,
      userId
    }).populate('planId');

    if (!subscription) {
      return res.status(404).json({ success: false, message: "Subscription record not found" });
    }

    // Update subscription status if not already success
    if (subscription.paymentStatus !== "success") {
      subscription.paymentStatus = "failed";
      await subscription.save();
    }

    // Check if a failed invoice already exists for this order to avoid duplicates
    let invoice = await Invoice.findOne({ subscriptionId: subscription._id, status: "failed" });

    if (!invoice) {
      const invoiceNumber = `INV-FAIL-${new Date().getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`;
      invoice = new Invoice({
        invoiceNumber,
        userId,
        planId: subscription.planId._id,
        subscriptionId: subscription._id,
        amount: subscription.planId.price,
        currency: "INR",
        status: "failed",
        paymentMethod: "Razorpay"
      });
      await invoice.save();
    }

    const failUser = await User.findById(userId);
    if (failUser) {
      sendTemplateEmail({
        templateName: "payment-failed.html",
        to: failUser.email,
        subject: "⚠️ Payment Failed - Action Required",
        placeholders: {
          userName: failUser.userName,
          planName: subscription.planId.name,
        },
        embedLogo: false
      }).catch(err => console.error("Payment failure email failed:", err));
    }

    return res.status(200).json({
      success: true,
      message: "Payment failure recorded",
      invoice
    });

  } catch (err) {
    console.error("recordPaymentFailure error:", err);
    res.status(500).json({ success: false, message: "Failed to record payment failure", error: err.message });
  }
};

/**
 * 1️⃣1️⃣ Record Payment Cancellation (User Manual Cancel)
 */
exports.recordPaymentCancel = async (req, res) => {
  try {
    const userId = req.Id;
    const { razorpay_order_id } = req.body;

    if (!razorpay_order_id) {
      return res.status(400).json({ success: false, message: "Order ID is required" });
    }

    const subscription = await UserSubscription.findOne({
      razorpayOrderId: razorpay_order_id,
      userId
    }).populate('planId');

    if (!subscription) {
      return res.status(404).json({ success: false, message: "Subscription record not found" });
    }

    // Update status to canceled if not already success
    if (subscription.paymentStatus !== "success") {
      subscription.paymentStatus = "failed"; // We use failed in DB, but template says canceled
      await subscription.save();
    }

    const cancelUser = await User.findById(userId);
    if (cancelUser) {
      sendTemplateEmail({
        templateName: "payment-canceled.html",
        to: cancelUser.email,
        subject: "Prithu - Subscription Payment Canceled",
        placeholders: {
          userName: cancelUser.userName,
          planName: subscription.planId.name,
        },
        embedLogo: false
      }).catch(err => console.error("Payment cancellation email failed:", err));
    }

    return res.status(200).json({
      success: true,
      message: "Payment cancellation recorded"
    });

  } catch (err) {
    console.error("recordPaymentCancel error:", err);
    res.status(500).json({ success: false, message: "Failed to record payment cancellation", error: err.message });
  }
};

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

