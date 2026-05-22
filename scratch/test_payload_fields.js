const axios = require('axios');

const API_KEY = "22788E6CE127140ADFC5F2DAB17EA08C";
const SECRET_KEY = "5dca64dccd1f57519f62952639903af8e9f4e0fa625476c4127189ab677673c3afbeb81b419a587d4c740bed47104caeab3e711c36dd346d88efaecba7bd7a17";
const MERCHANT_ID = "INFI349";

async function testNumericIds() {
    const baseUrl = "https://api.instifi.com/live/api/v1/Instify";
    
    // Generate purely numeric order ID (10 digits)
    const orderId = String(Math.floor(1000000000 + Math.random() * 9000000000));
    // Generate purely numeric transaction ID (12 digits)
    const txnVal = String(Math.floor(100000000000 + Math.random() * 900000000000));

    console.log(`Using numeric orderId: ${orderId}`);
    console.log(`Using numeric txnVal: ${txnVal}`);

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

    const payloadKeys = [
        { txnKey: "merchantTxnId", orderKey: "orderId", merchKey: "merchantId" },
        { txnKey: "merchantRefId", orderKey: "orderId", merchKey: "merchantId" },
        { txnKey: "merchantRefId", orderKey: "OrderId", merchKey: "merchantId" }
    ];

    for (const keys of payloadKeys) {
        console.log(`Testing numeric IDs with payload: txn=${keys.txnKey}, order=${keys.orderKey}`);
        
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

        payload[keys.orderKey] = orderId;
        payload[keys.txnKey] = txnVal;
        payload[keys.merchKey] = MERCHANT_ID;

        try {
            const response = await axios.post(`${baseUrl}/CreateOrder`,
                payload,
                {
                    headers: {
                        'ACCESS-TOKEN': token,
                        'Content-Type': 'application/json'
                    },
                    timeout: 5000
                }
            );
            console.log(`\n\n🎉 SUCCESS! keys:`, keys);
            console.log("Response:", JSON.stringify(response.data, null, 2));
            return;
        } catch (error) {
            console.log(`❌ Fail: ${error.response?.data?.responseMessage || error.response?.data?.message || error.message}`);
        }
    }
}

testNumericIds();
