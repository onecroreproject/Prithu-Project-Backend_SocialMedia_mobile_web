const mongoose = require("mongoose");
const dotenv = require("dotenv");
dotenv.config({ path: "r:/Suriya.DLK/newProject/be/.env" });

const PaymentTransaction = require("../models/PaymentTransaction");
const UserSubscription = require("../models/subscriptionModels/userSubscriptionModel");
const paymentController = require("../controllers/paymentController");

const dbURI = "mongodb+srv://prithuapp_db_user:eETUIeouSRU7Xipu@cluster0.x0vkq8e.mongodb.net/Prithu-DB?retryWrites=true&w=majority&appName=Cluster0";

async function runConcurrentTest() {
    try {
        await mongoose.connect(dbURI);
        console.log("DB connected successfully");

        const targetOrderId = "ORD46651894";

        // Reset transaction in DB to pending
        await PaymentTransaction.updateOne(
            { orderId: targetOrderId },
            { 
                $set: { 
                    paymentStatus: "pending", 
                    transactionStatus: "created",
                    transactionId: null,
                    paymentId: null
                } 
            }
        );

        console.log("Reset transaction state to pending. Simulating 3 parallel verification requests...");

        // Create 3 concurrent mock request objects
        const createMockReqRes = (id) => {
            const req = {
                body: {
                    transactionId: "PND2252026161411382450"
                }
            };
            const res = {
                id,
                statusCode: 200,
                jsonPayload: null,
                status(code) {
                    this.statusCode = code;
                    return this;
                },
                json(payload) {
                    this.jsonPayload = payload;
                    console.log(`[Request #${id}] Finished with status ${this.statusCode}, success: ${payload.success}, status: ${payload.status}`);
                    return this;
                }
            };
            return { req, res };
        };

        const client1 = createMockReqRes(1);
        const client2 = createMockReqRes(2);
        const client3 = createMockReqRes(3);

        // Trigger them exactly in parallel
        await Promise.all([
            paymentController.verifyPayment(client1.req, client1.res),
            paymentController.verifyPayment(client2.req, client2.res),
            paymentController.verifyPayment(client3.req, client3.res)
        ]);

        console.log("\nAll concurrent requests completed.");

        // Check DB state
        const finalTxn = await PaymentTransaction.findOne({ orderId: targetOrderId });
        console.log("\nFinal state in DB:", {
            orderId: finalTxn.orderId,
            paymentStatus: finalTxn.paymentStatus,
            transactionId: finalTxn.transactionId
        });

    } catch (err) {
        console.error("Simulation error:", err);
    } finally {
        await mongoose.disconnect();
        console.log("Disconnected.");
        process.exit(0);
    }
}

runConcurrentTest();
