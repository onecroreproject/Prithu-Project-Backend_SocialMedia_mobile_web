const axios = require('axios');

const API_KEY = "22788E6CE127140ADFC5F2DAB17EA08C";
const SECRET_KEY = "5dca64dccd1f57519f62952639903af8e9f4e0fa625476c4127189ab677673c3afbeb81b419a587d4c740bed47104caeab3e711c36dd346d88efaecba7bd7a17";
const MERCHANT_ID = "INFI349";

async function testPermutations() {
    const baseUrl = "https://api.instifi.com/live/api/v1/Instify";
    
    // Generate a unique orderId
    const orderId = "ORD" + Date.now().toString().slice(-8);
    
    console.log(`Using orderId for Authorization: ${orderId}`);

    // 1. Get Token
    let token = "";
    try {
        const authResponse = await axios.post(`${baseUrl}/Authorization`,
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
        token = authResponse.data?.data?.token;
        console.log("Token obtained successfully:", token);
    } catch (e) {
        console.error("Auth failed:", e.response?.data || e.message);
        return;
    }

    if (!token) {
        console.error("No token received.");
        return;
    }

    // List of keys to test
    const merchantIdKeys = ["merchantId", "merchantID", "merchant_id", "mid", "clientId", "merchantRefId"];
    const orderIdKeys = ["orderId", "OrderId", "orderID", "order_id"];
    const txnIdKeys = ["merchantTxnId", "merchantRefId", "merchantRefID", "txnId", "transactionId", "refId"];
    const tokenHeaders = ["ACCESS-TOKEN", "ACCESS_TOKEN", "access-token"];

    console.log("Starting permutation testing...");

    for (const tokenHeader of tokenHeaders) {
        for (const mIdKey of merchantIdKeys) {
            for (const oIdKey of orderIdKeys) {
                for (const tIdKey of txnIdKeys) {
                    // Skip if the same key is used for multiple purposes
                    if (mIdKey === tIdKey || mIdKey === oIdKey || oIdKey === tIdKey) {
                        continue;
                    }

                    const payload = {
                        amount: "1.00",
                        payMode: "all",
                        productInfo: "Subscription Purchase",
                        customerName: "Test Customer",
                        customerMobile: "9999999999",
                        customerEmail: "customer@example.com",
                        redirectionURL: "http://localhost:5174/subscription",
                        currencyCode: "INR"
                    };

                    payload[mIdKey] = MERCHANT_ID;
                    payload[oIdKey] = orderId;
                    payload[tIdKey] = "TXN" + Date.now().toString().slice(-6) + Math.floor(Math.random() * 10);

                    const headers = {
                        'Content-Type': 'application/json'
                    };
                    headers[tokenHeader] = token;

                    try {
                        const response = await axios.post(`${baseUrl}/CreateOrder`,
                            payload,
                            {
                                headers,
                                timeout: 3000
                            }
                        );
                        console.log(`\n\n🎉 SUCCESS!`);
                        console.log(`Headers:`, headers);
                        console.log(`Payload:`, payload);
                        console.log(`Response:`, JSON.stringify(response.data, null, 2));
                        return;
                    } catch (error) {
                        const errMsg = error.response?.data?.responseMessage || error.response?.data?.message || error.message;
                        // Avoid flooding if it's always the same error, but print if different
                        if (!errMsg.includes("Invalid Token or MerchantRefID")) {
                            console.log(`Keys combo [${mIdKey}, ${oIdKey}, ${tIdKey}] with header [${tokenHeader}] failed with: ${errMsg}`);
                        }
                    }
                }
            }
        }
    }
    console.log("All tested permutations completed.");
}

testPermutations();
