const axios = require('axios');

const API_KEY = "22788E6CE127140ADFC5F2DAB17EA08C";
const SECRET_KEY = "5dca64dccd1f57519f62952639903af8e9f4e0fa625476c4127189ab677673c3afbeb81b419a587d4c740bed47104caeab3e711c36dd346d88efaecba7bd7a17";
const MERCHANT_ID = "INFI349";

async function testNumericIdentical() {
    const baseUrl = "https://api.instifi.com/live/api/v1/Instify";
    // Numeric ID (e.g. 8 digits)
    const singleId = String(Math.floor(10000000 + Math.random() * 90000000));

    console.log(`Getting token with numeric ID: ${singleId}`);
    let token = "";
    try {
        const authRes = await axios.post(`${baseUrl}/Authorization`, 
            { orderId: singleId },
            {
                headers: {
                    'X-CLIENT-ID': MERCHANT_ID,
                    'X-CLIENT-KEY': API_KEY,
                    'X-SECRET-KEY': SECRET_KEY,
                    'Content-Type': 'application/json'
                }
            }
        );
        token = authRes.data?.data?.token;
        console.log("Token obtained successfully.");
    } catch (e) {
        console.error("Auth failed:", e.response?.data || e.message);
        return;
    }

    const payload = {
        amount: "1.00",
        payMode: "all",
        productInfo: "Subscription Purchase",
        customerName: "Test Customer",
        customerMobile: "9999999999",
        customerEmail: "customer@example.com",
        redirectionURL: "http://localhost:5174/subscription",
        currencyCode: "INR",
        orderId: singleId,
        merchantTxnId: singleId,
        merchantRefId: singleId,
        merchantId: MERCHANT_ID
    };

    console.log("Sending CreateOrder with identical numeric IDs...");

    try {
        const res = await axios.post(`${baseUrl}/CreateOrder`, payload, {
            headers: {
                'ACCESS-TOKEN': token,
                'Content-Type': 'application/json'
            }
        });
        console.log("SUCCESS:", res.data);
    } catch (error) {
        console.log("FAILED:");
        console.log("Status:", error.response?.status);
        console.log("Data:", JSON.stringify(error.response?.data, null, 2));
    }
}

testNumericIdentical();
