const dotenv = require('dotenv');
const mongoose = require('mongoose');

// Load environment variables
dotenv.config({ path: 'r:/Suriya.DLK/newProject/be/.env' });

const instifiService = require('../services/instifiPaymentService');

const dbURI = "mongodb+srv://prithuapp_db_user:eETUIeouSRU7Xipu@cluster0.x0vkq8e.mongodb.net/Prithu-DB?retryWrites=true&w=majority&appName=Cluster0";

async function run() {
    await mongoose.connect(dbURI);
    console.log("DB connected successfully");

    const pendingTxns = await mongoose.connection.db.collection('PaymentTransaction')
        .find({ paymentStatus: "pending" })
        .toArray();

    console.log(`\nFound ${pendingTxns.length} pending transactions in DB.`);

    for (const txn of pendingTxns) {
        console.log(`\n--------------------------------------------`);
        console.log(`Checking transaction ID: ${txn._id}`);
        console.log(`orderId: ${txn.orderId}, merchantTxnId: ${txn.merchantTxnId}`);
        console.log(`createdAt: ${txn.createdAt}`);
        
        // 1. Query by orderId
        console.log("Querying by orderId (searchType 1)...");
        try {
            const res1 = await instifiService.checkStatus(txn.orderId, "");
            console.log(`Response 1: Code=${res1.responseCode}, Message="${res1.responseMessage}", Status="${res1.data?.transactionStatus}"`);
            if (res1.responseCode === "200") {
                console.log("Full data:", JSON.stringify(res1.data, null, 2));
            }
        } catch (err) {
            console.log("Query 1 failed:", err.response?.data || err.message);
        }

        // 2. Query by merchantTxnId as transactionId
        console.log("Querying by merchantTxnId (searchType 2)...");
        try {
            const res2 = await instifiService.checkStatus("", txn.merchantTxnId);
            console.log(`Response 2: Code=${res2.responseCode}, Message="${res2.responseMessage}", Status="${res2.data?.transactionStatus}"`);
            if (res2.responseCode === "200") {
                console.log("Full data:", JSON.stringify(res2.data, null, 2));
            }
        } catch (err) {
            console.log("Query 2 failed:", err.response?.data || err.message);
        }
    }

    await mongoose.disconnect();
}

run();
