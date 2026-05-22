const mongoose = require("mongoose");
const dotenv = require("dotenv");
dotenv.config({ path: "r:/Suriya.DLK/newProject/be/.env" });

const PaymentTransaction = require("../models/PaymentTransaction");
const UserSubscription = require("../models/subscriptionModels/userSubscriptionModel");
const Invoice = require("../models/subscriptionModels/invoiceModel");
const paymentController = require("../controllers/paymentController");

const dbURI = "mongodb+srv://prithuapp_db_user:eETUIeouSRU7Xipu@cluster0.x0vkq8e.mongodb.net/Prithu-DB?retryWrites=true&w=majority&appName=Cluster0";

async function runTest() {
    try {
        await mongoose.connect(dbURI);
        console.log("DB connected successfully");

        const targetOrderId = "ORD46651894";

        // 1. Find or create a mock transaction in the database to test with
        let transaction = await PaymentTransaction.findOne({ orderId: targetOrderId });
        if (!transaction) {
            console.log(`Creating mock transaction for order ${targetOrderId}...`);
            transaction = new PaymentTransaction({
                userId: "66432abdc8319f001f341234", // mock user ID
                planId: "664c502fb420ef1e8ab568d4", // mock plan ID (or active plan ID)
                orderId: targetOrderId,
                merchantTxnId: "TXN4665189499",
                amount: 1.00,
                paymentStatus: "pending",
                transactionStatus: "created",
                customerName: "Customer",
                customerEmail: "customer@example.com",
                customerMobile: "9999999999"
            });
            await transaction.save();
        } else {
            console.log(`Found existing transaction. Resetting status to pending to simulate verification flow...`);
            transaction.paymentStatus = "pending";
            transaction.transactionStatus = "created";
            transaction.transactionId = null;
            transaction.paymentId = null;
            await transaction.save();
        }

        console.log("Current transaction state in DB:", {
            orderId: transaction.orderId,
            merchantTxnId: transaction.merchantTxnId,
            paymentStatus: transaction.paymentStatus,
            transactionId: transaction.transactionId
        });

        // 2. Prepare mock req and res
        const req = {
            body: {
                transactionId: "PND2252026161411382450"
            }
        };

        const res = {
            statusCode: 200,
            jsonPayload: null,
            status(code) {
                this.statusCode = code;
                return this;
            },
            json(payload) {
                this.jsonPayload = payload;
                return this;
            }
        };

        console.log("\nTriggering paymentController.verifyPayment with payload:", req.body);

        // 3. Invoke controller
        await paymentController.verifyPayment(req, res);

        console.log("\nResponse from verifyPayment:");
        console.log("Status Code:", res.statusCode);
        console.log("JSON Payload:", JSON.stringify(res.jsonPayload, null, 2));

        // 4. Verify DB was updated correctly
        const updatedTransaction = await PaymentTransaction.findOne({ orderId: targetOrderId });
        console.log("\nUpdated transaction state in DB:", {
            orderId: updatedTransaction.orderId,
            paymentStatus: updatedTransaction.paymentStatus,
            transactionId: updatedTransaction.transactionId,
            invoiceId: updatedTransaction.invoiceId
        });

        // 5. Verify UserSubscription was activated
        const userSub = await UserSubscription.findOne({ userId: updatedTransaction.userId }).sort({ createdAt: -1 });
        if (userSub) {
            console.log("User subscription activated/found:", {
                userId: userSub.userId,
                planType: userSub.planType,
                status: userSub.status,
                startDate: userSub.startDate,
                endDate: userSub.endDate
            });
        } else {
            console.log("No user subscription found!");
        }

    } catch (error) {
        console.error("Test execution failed:", error);
    } finally {
        await mongoose.disconnect();
        console.log("\nDisconnected from DB.");
        process.exit(0);
    }
}

runTest();
