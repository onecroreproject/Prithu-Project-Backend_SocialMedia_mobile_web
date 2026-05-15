const axios = require('axios');

const API_KEY = "DBD49E9214DA85120D4D940D0E839180";
const SECRET_KEY = "0aeb11051263e3d03c631eaa987f6ed47683b24ca33ba280c50ee201d36cc0a463e3e5de29001c285d790a49eedbcf276a2597228f4cf2fc0745493ddec4e336";
const BASE_URL = "https://api.instifi.com/api/v1/Instifi";

async function testInstifi() {
    try {
        const BASE_URL = "https://api.instifi.com/live/api/v1/Instifi";
        console.log("--- Testing Instifi Authorization ---");
        const orderId = "1000000001";

        const authResponse = await axios.post(`${BASE_URL}/Authorization`,
            { orderId },
            {
                headers: {
                    'X-CLIENT-ID': API_KEY,
                    'X-CLIENT-KEY': API_KEY,
                    'X-SECRET-KEY': SECRET_KEY,
                    'Content-Type': 'application/json'
                }
            }
        );

        console.log("Auth Response Status:", authResponse.status);
        console.log("Auth Response Data:", JSON.stringify(authResponse.data, null, 2));

        if (authResponse.data && authResponse.data.data && authResponse.data.data.token) {
            const token = authResponse.data.data.token;
            console.log("\n--- Testing Instifi CreateOrder ---");

            const createOrderResponse = await axios.post(`${BASE_URL}/CreateOrder`,
                {
                    payMode: "upi", // Test with UPI
                    merchantId: API_KEY, // Research suggested Client ID might be Merchant ID
                    amount: 1, // 1 INR
                    OrderId: orderId,
                    merchantTxnId: "TXN_" + Date.now(),
                    redirectionURL: "https://example.com/verify",
                    // Additional typical fields might be needed
                },
                {
                    headers: {
                        'ACCESS-TOKEN': token,
                        'Content-Type': 'application/json'
                    }
                }
            );

            console.log("CreateOrder Response Status:", createOrderResponse.status);
            console.log("CreateOrder Response Data:", JSON.stringify(createOrderResponse.data, null, 2));
        } else {
            console.error("Failed to get token from Authorization step.");
        }

    } catch (error) {
        console.error("Error during test:");
        if (error.response) {
            console.error("Response Data:", JSON.stringify(error.response.data, null, 2));
            console.error("Response Status:", error.response.status);
        } else {
            console.error(error.message);
        }
    }
}

testInstifi();
