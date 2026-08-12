const PaymentTransaction = require("../models/PaymentTransaction");
const instifiService = require("../services/instifiPaymentService");
const User = require("../models/userModels/userModel");
const Invoice = require("../models/subscriptionModels/invoiceModel");
const CreditPackage = require("../models/CreditPackage");
const WalletTransaction = require("../models/WalletTransaction");
const { activateSubscription } = require("../middlewares/subscriptionMiddlewares/paymentHelper");
const { sendTemplateEmail } = require("../utils/templateMailer");
const { generateInvoicePDF } = require("../utils/invoiceGenerator");

// Memory lock to prevent concurrent verification calls for the same transaction
const activeVerifications = new Map();

/**
 * Initialize Payment
 */
exports.createPayment = async (req, res) => {
    try {
        const { amount, planId, customerName, customerEmail, customerPhone } = req.body;
        const userId = req.Id;

        if (amount === undefined || amount === null || amount === "") {
            return res.status(400).json({ success: false, message: "Amount is required" });
        }
        if (Number(amount) <= 0) {
            return res.status(400).json({ success: false, message: "Amount must be greater than zero for payment gateway" });
        }
        if (!planId) {
            return res.status(400).json({ success: false, message: "Plan ID is required" });
        }

        // Generate unique IDs in a standard format
        const timestamp = Date.now().toString().slice(-8);
        const orderId = `ORD${timestamp}`;
        const merchantTxnId = `TXN${timestamp}${Math.floor(Math.random() * 100)}`;

        // 1. Get Token
        const token = await instifiService.getAccessToken(orderId);

        // 2. Create Order in Instifi
        const orderData = {
            amount,
            orderId,
            merchantTxnId,
            customerName: customerName || "Customer",
            customerEmail: customerEmail || "customer@example.com",
            customerMobile: customerPhone || "9999999999",
            productInfo: "Subscription Purchase",
            payMode: "all"
        };

        const instifiOrder = await instifiService.createOrder(token, orderData);

        // 3. Save Transaction in DB
        const transaction = new PaymentTransaction({
            userId,
            planId,
            orderId,
            merchantTxnId,
            amount,
            paymentStatus: "pending",
            transactionStatus: "created",
            customerName: orderData.customerName,
            customerEmail: orderData.customerEmail,
            customerMobile: orderData.customerMobile,
            gatewayResponse: instifiOrder,
            paymentGatewayResponse: instifiOrder
        });

        await transaction.save();

        res.status(200).json({
            success: true,
            paymentUrl: instifiOrder.url,
            orderId,
            merchantTxnId
        });

    } catch (error) {
        console.error("createPayment error:", error.response?.data || error.message);
        res.status(500).json({ 
            success: false, 
            message: error.message || "Failed to initialize payment" 
        });
    }
};

/**
 * Verify Payment Status
 */
exports.verifyPayment = async (req, res) => {
    const { merchantTxnId, orderId, transactionId } = req.body;

    if (!orderId && !transactionId) {
        return res.status(400).json({ success: false, message: "Order ID or Transaction ID is required for verification" });
    }

    let transaction = null;
    const queryFields = [];
    if (orderId) {
        queryFields.push({ orderId });
        queryFields.push({ merchantTxnId: orderId });
        queryFields.push({ transactionId: orderId });
        queryFields.push({ paymentId: orderId });
    }
    if (transactionId) {
        queryFields.push({ orderId: transactionId });
        queryFields.push({ merchantTxnId: transactionId });
        queryFields.push({ transactionId: transactionId });
        queryFields.push({ paymentId: transactionId });
    }
    if (merchantTxnId) {
        queryFields.push({ merchantTxnId });
        queryFields.push({ orderId: merchantTxnId });
    }

    try {
        if (queryFields.length > 0) {
            transaction = await PaymentTransaction.findOne({ $or: queryFields });
        }
    } catch (findErr) {
        console.warn("[verifyPayment] Early find transaction error:", findErr.message);
    }

    const lockKey = transaction ? transaction.orderId : (transactionId || orderId || merchantTxnId);
    let resolveLock = null;

    if (lockKey) {
        if (activeVerifications.has(lockKey)) {
            console.log(`[verifyPayment] Concurrent request detected for ${lockKey}. Waiting for existing verification to complete...`);
            try {
                await activeVerifications.get(lockKey);
            } catch (err) {
                console.warn(`[verifyPayment] Wait for concurrent request ${lockKey} failed:`, err.message);
            }

            // Re-fetch transaction from DB after waiting
            try {
                if (queryFields.length > 0) {
                    transaction = await PaymentTransaction.findOne({ $or: queryFields });
                }
            } catch (findErr) {
                console.warn("[verifyPayment] Re-fetch transaction error:", findErr.message);
            }
        } else {
            const lockPromise = new Promise(resolve => {
                resolveLock = resolve;
            });
            activeVerifications.set(lockKey, lockPromise);
        }
    }

    try {
        // If it's already marked as success in local database, skip gateway query and return success early
        if (transaction && transaction.paymentStatus === "success") {
            const responsePayload = {
                success: true,
                status: "success",
                message: "Payment already processed successfully",
                data: transaction.paymentGatewayResponse || {}
            };

            try {
                const latestInvoice = await Invoice.findOne({ userId: transaction.userId })
                    .sort({ createdAt: -1 });
                if (latestInvoice) {
                    responsePayload.receipt = {
                        invoiceNumber: latestInvoice.invoiceNumber,
                        amount: latestInvoice.amount,
                        currency: latestInvoice.currency || "INR",
                        paidAt: latestInvoice.paidAt,
                        paymentMethod: latestInvoice.paymentMethod || "Instifi",
                        transactionId: transaction.transactionId || transaction.paymentId
                    };
                }
            } catch (receiptErr) {
                console.warn("Could not fetch receipt for early response:", receiptErr.message);
            }

            return res.status(200).json(responsePayload);
        }

        // Determine what values to query Instifi with.
        // Querying by orderId (searchType: "1") is highly reliable.
        let searchOrderId = "";
        let searchTxnId = "";

        if (transaction) {
            searchOrderId = transaction.orderId;
            searchTxnId = ""; 
        } else {
            // Fallback: If no transaction was found in DB
            const potentialId = transactionId || orderId || merchantTxnId || "";
            if (potentialId) {
                if (potentialId.startsWith("ORD")) {
                    searchOrderId = potentialId;
                    searchTxnId = "";
                } else {
                    searchOrderId = "";
                    searchTxnId = potentialId;
                }
            }
        }

        // 2. Check Status from Instifi
        const statusResponse = await instifiService.checkStatus(searchOrderId || null, searchTxnId);

        if (statusResponse.responseCode === "200" && statusResponse.data) {
            const data = statusResponse.data;
            const rawStatus = data.transactionStatus?.toLowerCase();

            // Map payment status
            let finalStatus = "pending";
            if (rawStatus === "success" || rawStatus === "completed" || rawStatus === "successful") {
                finalStatus = "success";
            } else if (rawStatus === "failed" || rawStatus === "fail") {
                finalStatus = "failed";
            } else if (rawStatus === "cancelled" || rawStatus === "cancel" || rawStatus === "canceled") {
                finalStatus = "cancelled";
            }

            // If we didn't find the transaction earlier, try again with orderId returned by gateway response
            if (!transaction && data.orderId) {
                transaction = await PaymentTransaction.findOne({ orderId: data.orderId });
            }
            
            if (transaction) {
                // If it's already marked as success, skip double activation and return success
                if (transaction.paymentStatus === "success") {
                    const responsePayload = {
                        success: true,
                        status: "success",
                        message: "Payment already processed successfully",
                        data: data
                    };

                    try {
                        const latestInvoice = await Invoice.findOne({ userId: transaction.userId })
                            .sort({ createdAt: -1 });
                        if (latestInvoice) {
                            responsePayload.receipt = {
                                invoiceNumber: latestInvoice.invoiceNumber,
                                amount: latestInvoice.amount,
                                currency: latestInvoice.currency || "INR",
                                paidAt: latestInvoice.paidAt,
                                paymentMethod: latestInvoice.paymentMethod || "Instifi",
                                transactionId: data.transactionId || transaction.transactionId
                            };
                        }
                    } catch (receiptErr) {
                        console.warn("Could not fetch receipt for early response:", receiptErr.message);
                    }

                    return res.status(200).json(responsePayload);
                }

                transaction.paymentId = data.transactionId || transactionId || transaction.paymentId;
                transaction.transactionId = data.transactionId || transactionId || transaction.transactionId;
                transaction.paymentStatus = finalStatus === "success" ? "success" : (finalStatus === "failed" ? "failed" : (finalStatus === "cancelled" ? "cancelled" : "pending"));
                transaction.transactionStatus = finalStatus;
                transaction.paymentGatewayResponse = data;
                transaction.gatewayResponse = data;
                
                await transaction.save();

                // 3. Trigger activation on success/failed
                if (finalStatus === "success") {
                    // Activate Subscription
                    const subscription = await activateSubscription(
                        transaction.userId,
                        transaction.planId,
                        "success",
                        transaction.transactionId
                    );

                    // Create Invoice
                    const invoiceNumber = `INV-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
                    const newInvoice = new Invoice({
                        invoiceNumber,
                        userId: transaction.userId,
                        planId: transaction.planId,
                        subscriptionId: subscription._id,
                        amount: transaction.amount,
                        currency: "INR",
                        status: "paid",
                        paymentMethod: "Instifi",
                        razorpayPaymentId: transaction.transactionId || transaction.paymentId || "",
                        paidAt: new Date()
                    });
                    await newInvoice.save();

                    // Link invoice to transaction and subscription
                    transaction.invoiceId = newInvoice._id;
                    transaction.invoiceUrl = `/api/subscription/invoice/download/${newInvoice._id}`;
                    await transaction.save();

                    subscription.invoiceId = newInvoice._id;
                    await subscription.save();

                    // Send Activation Email with Attached Invoice PDF
                    const user = await User.findById(transaction.userId);
                    if (user && user.email) {
                        try {
                            const pdfBuffer = await generateInvoicePDF({
                                userName: user.userName,
                                email: user.email,
                                invoiceNumber: newInvoice.invoiceNumber,
                                paymentDate: newInvoice.paidAt.toLocaleDateString(),
                                planName: subscription.planType || "Premium",
                                amount: newInvoice.amount,
                                razorpayPaymentId: newInvoice.razorpayPaymentId
                            });

                            await sendTemplateEmail({
                                templateName: "SubscriptionActivation.html",
                                to: user.email,
                                subject: "🎉 Subscription Activated!",
                                placeholders: {
                                    userName: user.userName,
                                    planType: subscription.planType || "Premium",
                                    startDate: subscription.startDate ? subscription.startDate.toDateString() : new Date().toDateString(),
                                    endDate: subscription.endDate ? subscription.endDate.toDateString() : new Date().toDateString(),
                                },
                                attachments: [
                                    {
                                        filename: `Invoice_${newInvoice.invoiceNumber}.pdf`,
                                        content: pdfBuffer,
                                        contentType: 'application/pdf'
                                    }
                                ],
                                embedLogo: false
                            });
                        } catch (emailErr) {
                            console.error("Failed to send activation email / invoice:", emailErr);
                        }
                    }

                } else if (finalStatus === "failed") {
                    try {
                        await activateSubscription(
                            transaction.userId,
                            transaction.planId,
                            "failed",
                            transaction.transactionId
                        );
                    } catch (activationErr) {
                        console.warn("activateSubscription (failed) error:", activationErr.message);
                    }
                } else if (finalStatus === "cancelled") {
                    // Payment was cancelled by user — just update transaction, no subscription action needed
                    console.log("Payment cancelled by user for orderId:", transaction.orderId);
                }
                
                // Build enriched response with receipt details
                const responsePayload = {
                    success: true,
                    status: transaction.paymentStatus,
                    data: data
                };

                // If success, attach invoice + subscription info for receipt popup
                if (finalStatus === "success") {
                    try {
                        const latestInvoice = await Invoice.findOne({ userId: transaction.userId })
                            .sort({ createdAt: -1 });
                        if (latestInvoice) {
                            responsePayload.receipt = {
                                invoiceNumber: latestInvoice.invoiceNumber,
                                amount: latestInvoice.amount,
                                currency: latestInvoice.currency || "INR",
                                paidAt: latestInvoice.paidAt,
                                paymentMethod: latestInvoice.paymentMethod || "Instifi",
                                transactionId: data.transactionId || transaction.transactionId
                            };
                        }
                    } catch (receiptErr) {
                        console.warn("Could not fetch receipt for response:", receiptErr.message);
                    }
                }

                return res.status(200).json(responsePayload);
            } else {
                return res.status(404).json({ success: false, message: "Transaction not found in local database" });
            }
        } else {
            return res.status(400).json({ 
                success: false, 
                message: statusResponse.responseMessage || "Failed to verify status with gateway" 
            });
        }

    } catch (error) {
        console.error("verifyPayment error:", error.response?.data || error.message);
        res.status(500).json({ success: false, message: error.message || "Internal server error during verification" });
    } finally {
        if (resolveLock) {
            resolveLock();
            activeVerifications.delete(lockKey);
        }
    }
};

/**
 * Initialize Credit Purchase Payment
 * POST /web/api/payment/create-credit-payment
 */
exports.createCreditPayment = async (req, res) => {
    try {
        const { packageId, customerName, customerEmail, customerPhone } = req.body;
        const userId = req.Id;

        if (!packageId) {
            return res.status(400).json({ success: false, message: "Package ID is required" });
        }

        // Validate it's a real MongoDB ObjectId before querying
        if (!packageId.match(/^[a-fA-F0-9]{24}$/)) {
            return res.status(400).json({ success: false, message: "Invalid package ID. Please refresh and try again." });
        }

        // Fetch the package
        const creditPackage = await CreditPackage.findById(packageId);
        if (!creditPackage || !creditPackage.isActive) {
            return res.status(404).json({ success: false, message: "Credit package not found or inactive" });
        }

        const amount = creditPackage.price;
        if (!amount || amount <= 0) {
            return res.status(400).json({ success: false, message: "Invalid package price" });
        }

        const timestamp = Date.now().toString().slice(-8);
        const orderId = `CRD${timestamp}`;
        const merchantTxnId = `CRDT${timestamp}${Math.floor(Math.random() * 100)}`;

        const token = await instifiService.getAccessToken(orderId);

        const orderData = {
            amount,
            orderId,
            merchantTxnId,
            customerName: customerName || "Customer",
            customerEmail: customerEmail || "customer@example.com",
            customerMobile: customerPhone || "9999999999",
            productInfo: `Credits ${creditPackage.credits}`,
            payMode: "all"
        };

        const instifiOrder = await instifiService.createOrder(token, orderData);

        // Save a pending PaymentTransaction — planId is not applicable for credit purchases
        // so we save a dummy marker in the creditMeta field via gatewayResponse
        const transaction = new PaymentTransaction({
            userId,
            orderId,
            merchantTxnId,
            amount,
            paymentStatus: "pending",
            transactionStatus: "created",
            customerName: orderData.customerName,
            customerEmail: orderData.customerEmail,
            customerMobile: orderData.customerMobile,
            gatewayResponse: {
                ...instifiOrder,
                creditPackageId: packageId,
                credits: creditPackage.credits,
                type: "CREDIT_PURCHASE"
            },
            paymentGatewayResponse: instifiOrder
        });

        await transaction.save();

        res.status(200).json({
            success: true,
            paymentUrl: instifiOrder.url,
            orderId,
            merchantTxnId,
            packageName: creditPackage.name,
            credits: creditPackage.credits
        });

    } catch (error) {
        console.error("createCreditPayment error:", error.response?.data || error.message);
        res.status(500).json({
            success: false,
            message: error.message || "Failed to initialize credit payment"
        });
    }
};

/**
 * Verify Credit Purchase Payment & Credit Wallet
 * POST /web/api/payment/verify-credit-payment
 */
exports.verifyCreditPayment = async (req, res) => {
    const { orderId, transactionId, merchantTxnId } = req.body;
    const userId = req.Id;

    if (!orderId && !transactionId) {
        return res.status(400).json({ success: false, message: "Order ID or Transaction ID is required" });
    }

    try {
        // Find the pending transaction
        const queryFields = [];
        if (orderId) queryFields.push({ orderId }, { merchantTxnId: orderId });
        if (transactionId) queryFields.push({ orderId: transactionId }, { transactionId });
        if (merchantTxnId) queryFields.push({ merchantTxnId });

        const transaction = await PaymentTransaction.findOne({ $or: queryFields });

        if (!transaction) {
            return res.status(404).json({ success: false, message: "Transaction not found" });
        }

        // If already credited, return success
        if (transaction.paymentStatus === "success") {
            return res.status(200).json({
                success: true,
                status: "success",
                message: "Credits already added to wallet",
                credits: transaction.gatewayResponse?.credits || 0
            });
        }

        // Verify with Instifi
        const statusResponse = await instifiService.checkStatus(transaction.orderId, "");

        if (statusResponse.responseCode !== "200" || !statusResponse.data) {
            return res.status(400).json({
                success: false,
                message: statusResponse.responseMessage || "Failed to verify with payment gateway"
            });
        }

        const data = statusResponse.data;
        const rawStatus = data.transactionStatus?.toLowerCase();

        let finalStatus = "pending";
        if (["success", "completed", "successful"].includes(rawStatus)) finalStatus = "success";
        else if (["failed", "fail"].includes(rawStatus)) finalStatus = "failed";
        else if (["cancelled", "cancel", "canceled"].includes(rawStatus)) finalStatus = "cancelled";

        // Update transaction status
        transaction.paymentStatus = finalStatus === "success" ? "success" : (finalStatus === "failed" ? "failed" : "cancelled");
        transaction.transactionStatus = finalStatus === "success" ? "success" : "failed";
        transaction.transactionId = data.transactionId || transactionId || transaction.transactionId;
        transaction.paymentId = data.transactionId || transactionId || transaction.paymentId;
        transaction.paymentGatewayResponse = data;
        await transaction.save();

        if (finalStatus !== "success") {
            return res.status(200).json({
                success: false,
                status: finalStatus,
                message: `Payment ${finalStatus}`
            });
        }

        // Credit wallet on success
        const credits = transaction.gatewayResponse?.credits || 0;

        if (!credits || credits <= 0) {
            return res.status(500).json({ success: false, message: "Invalid credits amount in transaction record" });
        }

        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ success: false, message: "User not found" });

        if (!user.wallet) user.wallet = { balance: 0, totalPurchasedCredits: 0, totalSpentCredits: 0 };

        const balanceBefore = user.wallet.balance || 0;
        const balanceAfter = balanceBefore + credits;

        user.wallet.balance = balanceAfter;
        user.wallet.totalPurchasedCredits = (user.wallet.totalPurchasedCredits || 0) + credits;
        await user.save();

        // Record wallet transaction log
        await WalletTransaction.create({
            userId,
            transactionType: "PURCHASE",
            credits,
            amount: transaction.amount,
            balanceBefore,
            balanceAfter,
            referenceId: transaction.orderId,
            remarks: `Credit Purchase - ${credits} CR via Instifi (Order: ${transaction.orderId})`
        });

        return res.status(200).json({
            success: true,
            status: "success",
            message: `${credits} credits added to your wallet!`,
            credits,
            wallet: user.wallet
        });

    } catch (error) {
        console.error("verifyCreditPayment error:", error.response?.data || error.message);
        res.status(500).json({ success: false, message: error.message || "Internal server error" });
    }
};
