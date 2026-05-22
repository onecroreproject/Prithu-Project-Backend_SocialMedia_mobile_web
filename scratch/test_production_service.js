const dotenv = require('dotenv');
// Load environment variables
dotenv.config({ path: 'r:/Suriya.DLK/newProject/be/.env' });

const instifiService = require('../services/instifiPaymentService');

async function testProductionService() {
    console.log("--- Testing Production InstifiPaymentService ---");
    console.log("Base URL:", instifiService.baseURL);
    console.log("Client ID:", instifiService.clientId);
    console.log("Merchant ID:", instifiService.merchantId);
    console.log("API Key:", instifiService.apiKey ? "PRESENT" : "MISSING");
    console.log("Secret Key:", instifiService.secretKey ? "PRESENT" : "MISSING");

    const orderId = "ORD" + Date.now().toString().slice(-8);
    const merchantTxnId = "TXN" + Date.now().toString().slice(-8);

    try {
        console.log("\n1. Requesting Access Token...");
        const token = await instifiService.getAccessToken(orderId);
        console.log("✅ Success! Token obtained:", token);

        console.log("\n2. Initializing CreateOrder...");
        const orderData = {
            amount: "1.00",
            orderId,
            merchantTxnId,
            customerName: "Test Customer",
            customerEmail: "customer@example.com",
            customerMobile: "9999999999",
            productInfo: "Subscription Purchase",
            payMode: "all"
        };

        const result = await instifiService.createOrder(token, orderData);
        console.log("🎉 SUCCESS! CreateOrder response:");
        console.log(JSON.stringify(result, null, 2));
    } catch (error) {
        console.error("❌ FAILED:", error.message);
        if (error.response) {
            console.error("Response data:", error.response.data);
        }
    }
}

testProductionService();
