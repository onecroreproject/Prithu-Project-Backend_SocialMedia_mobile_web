const axios = require('axios');

const API_KEY = "22788E6CE127140ADFC5F2DAB17EA08C";
const SECRET_KEY = "5dca64dccd1f57519f62952639903af8e9f4e0fa625476c4127189ab677673c3afbeb81b419a587d4c740bed47104caeab3e711c36dd346d88efaecba7bd7a17";
const MERCHANT_ID = "INFI349";

async function runTest() {
    const baseUrl = "https://api.instifi.com/live/api/v1/Instify";
    const orderId = "ORD" + Date.now().toString().slice(-8);

    console.log("Getting token with orderId:", orderId);
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
        console.log("Token:", token);
    } catch (e) {
        console.error("Auth error:", e.response?.data || e.message);
        return;
    }

    const testMerchantIds = ["349", 349];
    const testTxnKeys = ["merchantTxnId", "merchantRefId"];
    const testOrderKeys = ["orderId", "OrderId"];
    const payModes = ["all", "upi", "nb", "cc", "dc"];

    for (const testId of testMerchantIds) {
        for (const txnKey of testTxnKeys) {
            for (const orderKey of testOrderKeys) {
                for (const payMode of payModes) {
                    const payload = {
                        amount: "1.00",
                        payMode: payMode,
                        productInfo: "Subscription Purchase",
                        customerName: "Test Customer",
                        customerMobile: "9999999999",
                        customerEmail: "customer@example.com",
                        redirectionURL: "http://localhost:5174/subscription",
                        currencyCode: "INR"
                    };

                    payload[orderKey] = orderId;
                    payload[txnKey] = "TXN" + Date.now().toString().slice(-8);
                    payload["merchantId"] = testId;

                    console.log(`Testing: merchantId=${testId} (${typeof testId}), txnKey=${txnKey}, orderKey=${orderKey}, payMode=${payMode}`);

                    try {
                        const res = await axios.post(`${baseUrl}/CreateOrder`, payload, {
                            headers: {
                                'ACCESS-TOKEN': token,
                                'Content-Type': 'application/json'
                            }
                        });
                        console.log(`\n\n🎉 SUCCESS!`, res.data);
                        return;
                    } catch (error) {
                        console.log(`❌ FAIL:`, error.response?.data?.responseMessage || error.response?.data?.message || error.message);
                    }
                }
            }
        }
    }
}

runTest();
