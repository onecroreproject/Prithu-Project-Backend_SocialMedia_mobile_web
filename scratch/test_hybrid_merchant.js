const axios = require('axios');

const API_KEY = "22788E6CE127140ADFC5F2DAB17EA08C";
const SECRET_KEY = "5dca64dccd1f57519f62952639903af8e9f4e0fa625476c4127189ab677673c3afbeb81b419a587d4c740bed47104caeab3e711c36dd346d88efaecba7bd7a17";

async function testHybrid() {
    const baseUrl = "https://api.instifi.com/live/api/v1/Instify";
    const orderId = "ORD" + Date.now().toString().slice(-8);

    console.log("Getting token with INFI349...");
    let token = "";
    try {
        const authRes = await axios.post(`${baseUrl}/Authorization`, 
            { orderId },
            {
                headers: {
                    'X-CLIENT-ID': "INFI349",
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

    const merchantIdOptions = ["INFI349", "INFI349a17"];
    const merchantTxnIdKeys = ["merchantTxnId", "merchantRefId", "merchantRefID", "MerchantRefID"];

    for (const mId of merchantIdOptions) {
        for (const txnKey of merchantTxnIdKeys) {
            console.log(`\nTesting: merchantId=${mId}, txnKey=${txnKey}`);
            const payload = {
                amount: "1.00",
                payMode: "all",
                productInfo: "Subscription Purchase",
                customerName: "Test Customer",
                customerMobile: "9999999999",
                customerEmail: "customer@example.com",
                redirectionURL: "http://localhost:5174/subscription",
                currencyCode: "INR",
                orderId: orderId
            };
            payload.merchantId = mId;
            payload[txnKey] = "TXN" + Date.now().toString().slice(-8);

            try {
                const res = await axios.post(`${baseUrl}/CreateOrder`, payload, {
                    headers: {
                        'ACCESS-TOKEN': token,
                        'Content-Type': 'application/json'
                    }
                });
                console.log(`🎉 SUCCESS with ${mId} and ${txnKey}! Response:`, res.data);
                return;
            } catch (error) {
                console.log(`❌ Failed:`, error.response?.data || error.message);
            }
        }
    }
}

testHybrid();
