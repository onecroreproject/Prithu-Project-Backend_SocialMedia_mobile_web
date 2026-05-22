const axios = require('axios');

const API_KEY = "22788E6CE127140ADFC5F2DAB17EA08C";
const SECRET_KEY = "5dca64dccd1f57519f62952639903af8e9f4e0fa625476c4127189ab677673c3afbeb81b419a587d4c740bed47104caeab3e711c36dd346d88efaecba7bd7a17";
const MERCHANT_ID = "INFI349";

async function testApiKeyAsClientId() {
    const baseUrl = "https://api.instifi.com/live/api/v1/Instify";
    const orderId = "ORD" + Date.now().toString().slice(-8);

    console.log("Getting token with API_KEY as X-CLIENT-ID...");
    let token = "";
    try {
        const authRes = await axios.post(`${baseUrl}/Authorization`, 
            { orderId },
            {
                headers: {
                    'X-CLIENT-ID': API_KEY,
                    'X-CLIENT-KEY': API_KEY,
                    'X-SECRET-KEY': SECRET_KEY,
                    'Content-Type': 'application/json'
                }
            }
        );
        token = authRes.data?.data?.token;
        console.log(`Auth SUCCESS! Token: ${token ? 'YES' : 'NO'}`);
    } catch (e) {
        console.log("Auth FAILED:", e.response?.data || e.message);
        return;
    }

    if (token) {
        const payload = {
            amount: "1.00",
            payMode: "all",
            productInfo: "Subscription Purchase",
            customerName: "Test Customer",
            customerMobile: "9999999999",
            customerEmail: "customer@example.com",
            redirectionURL: "http://localhost:5174/subscription",
            currencyCode: "INR",
            orderId: orderId,
            merchantTxnId: "TXN" + Date.now().toString().slice(-8),
            merchantId: MERCHANT_ID
        };

        try {
            const res = await axios.post(`${baseUrl}/CreateOrder`, payload, {
                headers: {
                    'ACCESS-TOKEN': token,
                    'Content-Type': 'application/json'
                }
            });
            console.log("CreateOrder SUCCESS! Response:", res.data);
        } catch (error) {
            console.log("CreateOrder FAILED:");
            console.log("Status:", error.response?.status);
            console.log("Data:", JSON.stringify(error.response?.data, null, 2));
        }
    }
}

testApiKeyAsClientId();
