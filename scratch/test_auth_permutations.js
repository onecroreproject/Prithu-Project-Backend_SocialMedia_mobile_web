const axios = require('axios');

const API_KEY = "22788E6CE127140ADFC5F2DAB17EA08C";
const SECRET_KEYS = [
    "5dca64dccd1f57519f62952639903af8e9f4e0fa625476c4127189ab677673c3afbeb81b419a587d4c740bed47104caeab3e711c36dd346d88efaecba7bd7a17",
    "5dca64dccd1f57519f62952639903af8e9f4e0fa625476c4127189ab677673c3afbeb81b419a587d4c740bed47104caeab3e711c36dd346d88efaecba7bd7a17a17"
];
const MERCHANT_IDS = [
    "INFI349",
    "INFI349a17"
];

async function runAuthTest() {
    const baseUrl = "https://api.instifi.com/live/api/v1/Instify";
    
    for (const secretKey of SECRET_KEYS) {
        for (const merchantId of MERCHANT_IDS) {
            const orderId = "ORD" + Date.now().toString().slice(-8);
            console.log(`\nTesting combination: MerchantID=${merchantId}, SecretKeyEndsWith=${secretKey.slice(-5)}`);
            try {
                const authRes = await axios.post(`${baseUrl}/Authorization`, 
                    { orderId },
                    {
                        headers: {
                            'X-CLIENT-ID': merchantId,
                            'X-CLIENT-KEY': API_KEY,
                            'X-SECRET-KEY': secretKey,
                            'Content-Type': 'application/json'
                        }
                    }
                );
                console.log(`RESULT:`, authRes.data);
            } catch (e) {
                console.log(`FAILED:`, e.response?.data || e.message);
            }
        }
    }
}

runAuthTest();
