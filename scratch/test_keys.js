const axios = require('axios');

const API_KEY = "DBD49E9214DA85120D4D940D0E839180";
const SECRET_KEY = "0aeb11051263e3d03c631eaa987f6ed47683b24ca33ba280c50ee201d36cc0a463e3e5de29001c285d790a49eedbcf276a2597228f4cf2fc0745493ddec4e336";
const MERCHANT_ID = "INFI349";

async function testMerchantKeys() {
    const baseUrl = "https://api.instifi.com/live/api/v1/Instify";
    const orderId = "ORD" + Date.now().toString().slice(-8);
    
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
    } catch (e) {
        console.error("Auth failed:", e.message);
        return;
    }

    if (!token) {
        console.error("No token received.");
        return;
    }

    const testMerchantKeysList = [
        "merchantId",
        "MerchantId",
        "merchantID",
        "MerchantID",
        "mid",
        "MID"
    ];

    const testMerchantValues = {
        "MERCHANT_ID (INFI349)": MERCHANT_ID,
        "API_KEY (DBD49...)": API_KEY,
        "SECRET_KEY (0aeb...)": SECRET_KEY
    };

    for (const key of testMerchantKeysList) {
        for (const [valLabel, val] of Object.entries(testMerchantValues)) {
            console.log(`\nTesting: ${key} = ${valLabel}`);
            
            const payload = {
                amount: "1.00",
                orderId: orderId,
                merchantTxnId: "TXN" + Date.now().toString().slice(-8) + Math.floor(Math.random() * 100),
                payMode: "all",
                productInfo: "Subscription Purchase",
                customerName: "Test Customer",
                customerMobile: "9999999999",
                customerEmail: "customer@example.com",
                redirectionURL: "http://localhost:5174/subscription",
                currencyCode: "INR"
            };
            payload[key] = val;

            try {
                const createOrderResponse = await axios.post(`${baseUrl}/CreateOrder`,
                    payload,
                    {
                        headers: {
                            'ACCESS-TOKEN': token,
                            'Content-Type': 'application/json'
                        },
                        timeout: 10000
                    }
                );
                console.log(`✅ SUCCESS with ${key} = ${valLabel}:`, JSON.stringify(createOrderResponse.data, null, 2));
                return; // Stop if success
            } catch (error) {
                console.log(`❌ Failed with ${key} = ${valLabel}:`, error.response?.data?.responseMessage || error.message);
            }
        }
    }
}

testMerchantKeys();
