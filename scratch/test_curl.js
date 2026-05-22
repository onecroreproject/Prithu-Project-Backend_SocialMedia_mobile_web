const axios = require('axios');
const { execSync } = require('child_process');

const API_KEY = "22788E6CE127140ADFC5F2DAB17EA08C";
const SECRET_KEY = "5dca64dccd1f57519f62952639903af8e9f4e0fa625476c4127189ab677673c3afbeb81b419a587d4c740bed47104caeab3e711c36dd346d88efaecba7bd7a17";
const MERCHANT_ID = "INFI349";

async function runCurlTest() {
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

    const payload = {
        amount: "1.00",
        merchantTxnId: "TXN" + Date.now().toString().slice(-8),
        orderId: orderId,
        payMode: "all",
        merchantId: MERCHANT_ID,
        productInfo: "Subscription Purchase",
        customerName: "Test Customer",
        customerMobile: "9999999999",
        customerEmail: "customer@example.com",
        redirectionURL: "http://localhost:5174/subscription",
        currencyCode: "INR"
    };

    const payloadStr = JSON.stringify(payload).replace(/"/g, '\\"');

    // Test different header formats using curl
    const headersToTest = [
        "ACCESS- TOKEN",
        "ACCESS-TOKEN",
        "X-ACCESS-TOKEN",
        "x-access-token",
        "Authorization"
    ];

    for (const headerName of headersToTest) {
        console.log(`\nTesting header "${headerName}" with curl...`);
        const curlCmd = `curl -s -X POST "${baseUrl}/CreateOrder" -H "Content-Type: application/json" -H "${headerName}: ${token}" -d "${payloadStr}"`;
        
        try {
            const output = execSync(curlCmd, { encoding: 'utf-8' });
            console.log("CURL RESPONSE:", output);
        } catch (e) {
            console.error("CURL EXECUTION ERROR:", e.message);
        }
    }
}

runCurlTest();
