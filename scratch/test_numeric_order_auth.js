const axios = require('axios');

const API_KEY = "22788E6CE127140ADFC5F2DAB17EA08C";
const SECRET_KEY = "5dca64dccd1f57519f62952639903af8e9f4e0fa625476c4127189ab677673c3afbeb81b419a587d4c740bed47104caeab3e711c36dd346d88efaecba7bd7a17";

async function testNumericOrderAuth() {
    const baseUrl = "https://api.instifi.com/live/api/v1/Instify";
    // Purely numeric orderId
    const orderId = String(Math.floor(1000000000 + Math.random() * 9000000000));
    
    console.log(`Testing Authorization for INFI349a17 with numeric orderId: ${orderId}`);
    try {
        const authRes = await axios.post(`${baseUrl}/Authorization`, 
            { orderId },
            {
                headers: {
                    'X-CLIENT-ID': 'INFI349a17',
                    'X-CLIENT-KEY': API_KEY,
                    'X-SECRET-KEY': SECRET_KEY,
                    'Content-Type': 'application/json'
                }
            }
        );
        console.log("SUCCESS:", authRes.data);
    } catch (e) {
        console.log("FAILED:", e.response?.data || e.message);
    }
}

testNumericOrderAuth();
