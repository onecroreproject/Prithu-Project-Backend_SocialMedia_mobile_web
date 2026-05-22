const axios = require('axios');

const API_KEY = "DBD49E9214DA85120D4D940D0E839180";
const SECRET_KEY = "0aeb11051263e3d03c631eaa987f6ed47683b24ca33ba280c50ee201d36cc0a463e3e5de29001c285d790a49eedbcf276a2597228f4cf2fc0745493ddec4e336";
const MERCHANT_ID = "INFI349";

async function testAuthUnique() {
    const baseUrl = "https://api.instifi.com/live/api/v1/Instify";
    
    // Generate a highly unique orderId
    const orderId = "ORD" + Date.now() + Math.floor(1000 + Math.random() * 9000);
    
    console.log(`Testing Authorization with highly unique orderId: ${orderId}`);
    try {
        const authResponse = await axios.post(`${baseUrl}/Authorization`,
            { orderId },
            {
                headers: {
                    'X-CLIENT-ID': MERCHANT_ID,
                    'X-CLIENT-KEY': API_KEY,
                    'X-SECRET-KEY': SECRET_KEY,
                    'Content-Type': 'application/json'
                },
                timeout: 5000
            }
        );
        console.log(`✅ Success! ResponseCode: ${authResponse.data?.responseCode}, message: ${authResponse.data?.responseMessage}`);
        console.log("Token:", authResponse.data?.data?.token);
    } catch (e) {
        console.log(`❌ Fail: Status ${e.response?.status}, Body:`, JSON.stringify(e.response?.data || e.message));
    }
}

testAuthUnique();
