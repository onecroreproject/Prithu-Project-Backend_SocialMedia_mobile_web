const axios = require('axios');

const API_KEY = "22788E6CE127140ADFC5F2DAB17EA08C";
const SECRET_KEY = "5dca64dccd1f57519f62952639903af8e9f4e0fa625476c4127189ab677673c3afbeb81b419a587d4c740bed47104caeab3e711c36dd346d88efaecba7bd7a17";
const MERCHANT_ID = "INFI349";

async function testCapitalRefId() {
    const baseUrl = "https://api.instifi.com/live/api/v1/Instify";
    const orderId = "ORD" + Date.now().toString().slice(-8);
    const txnVal = "TXN" + Date.now().toString().slice(-8);

    console.log("Getting token...");
    let token = "";
    try {
        const authRes = await axios.post(`${baseUrl}/Authorization`, 
            { orderId },
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

    // We will test several combinations focusing on MerchantRefID (capital M)
    const testCases = [
        {
            name: "merchantId, orderId, MerchantRefID",
            payload: {
                amount: "1.00",
                payMode: "all",
                productInfo: "Subscription Purchase",
                customerName: "Test Customer",
                customerMobile: "9999999999",
                customerEmail: "customer@example.com",
                redirectionURL: "http://localhost:5174/subscription",
                currencyCode: "INR",
                orderId: orderId,
                MerchantRefID: txnVal,
                merchantId: MERCHANT_ID
            }
        },
        {
            name: "merchantId, OrderId, MerchantRefID",
            payload: {
                amount: "1.00",
                payMode: "all",
                productInfo: "Subscription Purchase",
                customerName: "Test Customer",
                customerMobile: "9999999999",
                customerEmail: "customer@example.com",
                redirectionURL: "http://localhost:5174/subscription",
                currencyCode: "INR",
                OrderId: orderId,
                MerchantRefID: txnVal,
                merchantId: MERCHANT_ID
            }
        },
        {
            name: "MerchantRefID only (no merchantId/orderId)",
            payload: {
                amount: "1.00",
                payMode: "all",
                productInfo: "Subscription Purchase",
                customerName: "Test Customer",
                customerMobile: "9999999999",
                customerEmail: "customer@example.com",
                redirectionURL: "http://localhost:5174/subscription",
                currencyCode: "INR",
                MerchantRefID: txnVal
            }
        }
    ];

    for (const tc of testCases) {
        console.log(`\nTesting case: ${tc.name}`);
        try {
            const res = await axios.post(`${baseUrl}/CreateOrder`, tc.payload, {
                headers: {
                    'ACCESS-TOKEN': token,
                    'Content-Type': 'application/json'
                }
            });
            console.log(`🎉 SUCCESS! Response:`, res.data);
            return;
        } catch (error) {
            console.log(`❌ Failed:`, error.response?.data || error.message);
        }
    }
}

testCapitalRefId();
