const axios = require('axios');

const API_KEY = "22788E6CE127140ADFC5F2DAB17EA08C";
const SECRET_KEY = "5dca64dccd1f57519f62952639903af8e9f4e0fa625476c4127189ab677673c3afbeb81b419a587d4c740bed47104caeab3e711c36dd346d88efaecba7bd7a17";

const merchantIdsToTest = ["INFI349", "INFI349a17"];

async function testMerchantIds() {
    const baseUrl = "https://api.instifi.com/live/api/v1/Instify";
    const orderId = "ORD" + Date.now().toString().slice(-8);

    for (const mId of merchantIdsToTest) {
        console.log(`\n--- Testing with merchantId: ${mId} ---`);
        let token = "";
        try {
            const authRes = await axios.post(`${baseUrl}/Authorization`, 
                { orderId },
                {
                    headers: {
                        'X-CLIENT-ID': mId,
                        'X-CLIENT-KEY': API_KEY,
                        'X-SECRET-KEY': SECRET_KEY,
                        'Content-Type': 'application/json'
                    }
                }
            );
            token = authRes.data?.data?.token;
            console.log(`Auth SUCCESS! Token obtained: ${token ? 'YES' : 'NO'}`);
            console.log("Auth response data:", authRes.data);
        } catch (e) {
            console.log(`Auth FAILED:`, e.response?.data || e.message);
            continue; // Skip CreateOrder if auth failed
        }

        if (token) {
            const payload = {
                amount: "1.00",
                merchantTxnId: "TXN" + Date.now().toString().slice(-8),
                orderId: orderId,
                payMode: "all",
                merchantId: mId,
                productInfo: "Subscription Purchase",
                customerName: "Test Customer",
                customerMobile: "9999999999",
                customerEmail: "customer@example.com",
                redirectionURL: "http://localhost:5174/subscription",
                currencyCode: "INR"
            };

            try {
                const res = await axios.post(`${baseUrl}/CreateOrder`, payload, {
                    headers: {
                        'ACCESS-TOKEN': token,
                        'Content-Type': 'application/json'
                    }
                });
                console.log(`CreateOrder SUCCESS with merchantId ${mId}! Response:`, res.data);
            } catch (error) {
                console.log(`CreateOrder FAILED with merchantId ${mId}:`);
                console.log("Error status:", error.response?.status);
                console.log("Error data:", JSON.stringify(error.response?.data, null, 2));
            }
        }
    }
}

testMerchantIds();
