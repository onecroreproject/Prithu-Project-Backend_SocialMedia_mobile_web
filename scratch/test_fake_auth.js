const axios = require('axios');

const API_KEY = "22788E6CE127140ADFC5F2DAB17EA08C";
const SECRET_KEY = "5dca64dccd1f57519f62952639903af8e9f4e0fa625476c4127189ab677673c3afbeb81b419a587d4c740bed47104caeab3e711c36dd346d88efaecba7bd7a17";
const MERCHANT_ID = "INFI349";

async function testFakeAuth() {
    const baseUrl = "https://api.instifi.com/live/api/v1/Instify";
    const orderId = "ORD" + Date.now().toString().slice(-8);

    console.log("Testing with correct secret key...");
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
        console.log("Correct Key Success:", authRes.data.responseCode);
    } catch (e) {
        console.log("Correct Key Failed:", e.message);
    }

    console.log("Testing with FAKE secret key...");
    try {
        const authRes = await axios.post(`${baseUrl}/Authorization`, 
            { orderId },
            {
                headers: {
                    'X-CLIENT-ID': MERCHANT_ID,
                    'X-CLIENT-KEY': API_KEY,
                    'X-SECRET-KEY': "fake_secret_key_123",
                    'Content-Type': 'application/json'
                }
            }
        );
        console.log("Fake Key Success:", authRes.data.responseCode);
    } catch (e) {
        console.log("Fake Key Failed (Expected):", e.response?.data || e.message);
    }
}

testFakeAuth();
