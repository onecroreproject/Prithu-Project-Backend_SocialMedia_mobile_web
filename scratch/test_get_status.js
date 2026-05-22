const dotenv = require('dotenv');
// Load environment variables
dotenv.config({ path: 'r:/Suriya.DLK/newProject/be/.env' });

const instifiService = require('../services/instifiPaymentService');

async function run() {
    console.log("--- Testing GetStatus ---");
    
    // Test 1: Query by orderId (searchType 1)
    const orderId1 = "ORD46651894";
    console.log(`\n1. Querying by orderId (searchType 1) for: ${orderId1}`);
    try {
        const res = await instifiService.checkStatus(orderId1, "");
        console.log("✅ Success! Response:", JSON.stringify(res, null, 2));
    } catch (e) {
        console.log("❌ FAILED:", e.response?.data || e.message);
    }

    // Test 2: Query by transactionId (searchType 2)
    const txnId1 = "PND2252026161411382450";
    console.log(`\n2. Querying by transactionId (searchType 2) for: ${txnId1}`);
    try {
        const res = await instifiService.checkStatus("", txnId1);
        console.log("✅ Success! Response:", JSON.stringify(res, null, 2));
    } catch (e) {
        console.log("❌ FAILED:", e.response?.data || e.message);
    }
}

run();
