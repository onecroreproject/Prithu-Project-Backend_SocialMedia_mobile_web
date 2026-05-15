const PaymentTransaction = require("../models/PaymentTransaction");
const instifiService = require("../services/instifiPaymentService");
const User = require("../models/userModels/userModel"); // Assuming path

/**
 * Initialize Payment
 */
exports.createPayment = async (req, res) => {
    try {
        const { amount, customerName, customerEmail, customerPhone } = req.body;
        const userId = req.Id;

        if (!amount) {
            return res.status(400).json({ success: false, message: "Amount is required" });
        }

        // Generate unique IDs in a standard format
        // Shorter orderId might help with the 205 error
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
            customerName,
            customerEmail,
            customerMobile: customerPhone,
            productInfo: "Subscription Purchase",
            payMode: "all" // Allow all payment modes
        };

        const instifiOrder = await instifiService.createOrder(token, orderData);

        // 3. Save Transaction in DB
        const transaction = new PaymentTransaction({
            userId,
            orderId,
            merchantTxnId,
            amount,
            paymentStatus: "pending",
            gatewayResponse: instifiOrder
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
    try {
        const { merchantTxnId, orderId } = req.body;

        if (!orderId) {
            return res.status(400).json({ success: false, message: "Order ID is required for verification" });
        }

        // 1. Check Status from Instifi
        // Note: New checkStatus logic in instifiPaymentService uses credentials, not token
        const statusResponse = await instifiService.checkStatus(orderId);

        if (statusResponse.responseCode === "200" && statusResponse.data) {
            const data = statusResponse.data;
            const status = data.transactionStatus?.toLowerCase();

            // 2. Find and update transaction
            const transaction = await PaymentTransaction.findOne({ orderId });
            
            if (transaction) {
                transaction.paymentId = data.transactionId; // Update with Instifi's ID
                
                if (status === "completed" || status === "success") {
                    transaction.paymentStatus = "success";
                } else if (status === "failed") {
                    transaction.paymentStatus = "failed";
                } else if (status === "cancelled") {
                    transaction.paymentStatus = "cancelled";
                }
                
                await transaction.save();
                
                return res.status(200).json({
                    success: true,
                    status: transaction.paymentStatus,
                    data: data
                });
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
    }
};
