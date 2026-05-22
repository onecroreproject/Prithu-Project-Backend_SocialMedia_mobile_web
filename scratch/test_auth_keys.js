const axios = require('axios');

const API_KEY = "22788E6CE127140ADFC5F2DAB17EA08C";
const SECRET_KEY = "5dca64dccd1f57519f62952639903af8e9f4e0fa625476c4127189ab677673c3afbeb81b419a587d4c740bed47104caeab3e711c36dd346d88efaecba7bd7a17";
const MERCHANT_ID = "INFI349";

async function testAuthKeys() {
    const baseUrl = "https://api.instifi.com/live/api/v1/Instify";
    
    // We will test several combinations of Authorization payload and CreateOrder payload
    const combinations = [
        {
            name: "Auth: { orderId }, CreateOrder: { orderId, merchantTxnId, merchantId }",
            authPayload: (orderId, txnId) => ({ orderId }),
            createPayload: (orderId, txnId) => ({
                amount: "1.00",
                payMode: "all",
                productInfo: "Subscription Purchase",
                customerName: "Test Customer",
                customerMobile: "9999999999",
                customerEmail: "customer@example.com",
                redirectionURL: "http://localhost:5174/subscription",
                currencyCode: "INR",
                orderId: orderId,
                merchantTxnId: txnId,
                merchantId: MERCHANT_ID
            })
        },
        {
            name: "Auth: { orderId }, CreateOrder: { orderId, merchantRefId, merchantId }",
            authPayload: (orderId, txnId) => ({ orderId }),
            createPayload: (orderId, txnId) => ({
                amount: "1.00",
                payMode: "all",
                productInfo: "Subscription Purchase",
                customerName: "Test Customer",
                customerMobile: "9999999999",
                customerEmail: "customer@example.com",
                redirectionURL: "http://localhost:5174/subscription",
                currencyCode: "INR",
                orderId: orderId,
                merchantRefId: txnId,
                merchantId: MERCHANT_ID
            })
        },
        {
            name: "Auth: { OrderId }, CreateOrder: { OrderId, merchantTxnId, merchantId }",
            authPayload: (orderId, txnId) => ({ OrderId: orderId }),
            createPayload: (orderId, txnId) => ({
                amount: "1.00",
                payMode: "all",
                productInfo: "Subscription Purchase",
                customerName: "Test Customer",
                customerMobile: "9999999999",
                customerEmail: "customer@example.com",
                redirectionURL: "http://localhost:5174/subscription",
                currencyCode: "INR",
                OrderId: orderId,
                merchantTxnId: txnId,
                merchantId: MERCHANT_ID
            })
        },
        {
            name: "Auth: { OrderId }, CreateOrder: { OrderId, merchantRefId, merchantId }",
            authPayload: (orderId, txnId) => ({ OrderId: orderId }),
            createPayload: (orderId, txnId) => ({
                amount: "1.00",
                payMode: "all",
                productInfo: "Subscription Purchase",
                customerName: "Test Customer",
                customerMobile: "9999999999",
                customerEmail: "customer@example.com",
                redirectionURL: "http://localhost:5174/subscription",
                currencyCode: "INR",
                OrderId: orderId,
                merchantRefId: txnId,
                merchantId: MERCHANT_ID
            })
        },
        {
            name: "Auth: { merchantRefId }, CreateOrder: { orderId, merchantRefId, merchantId }",
            authPayload: (orderId, txnId) => ({ merchantRefId: txnId }),
            createPayload: (orderId, txnId) => ({
                amount: "1.00",
                payMode: "all",
                productInfo: "Subscription Purchase",
                customerName: "Test Customer",
                customerMobile: "9999999999",
                customerEmail: "customer@example.com",
                redirectionURL: "http://localhost:5174/subscription",
                currencyCode: "INR",
                orderId: orderId,
                merchantRefId: txnId,
                merchantId: MERCHANT_ID
            })
        },
        {
            name: "Auth: { MerchantRefID }, CreateOrder: { orderId, MerchantRefID, merchantId }",
            authPayload: (orderId, txnId) => ({ MerchantRefID: txnId }),
            createPayload: (orderId, txnId) => ({
                amount: "1.00",
                payMode: "all",
                productInfo: "Subscription Purchase",
                customerName: "Test Customer",
                customerMobile: "9999999999",
                customerEmail: "customer@example.com",
                redirectionURL: "http://localhost:5174/subscription",
                currencyCode: "INR",
                orderId: orderId,
                MerchantRefID: txnId,
                merchantId: MERCHANT_ID
            })
        },
        {
            name: "Auth: { orderId, merchantRefId }, CreateOrder: { orderId, merchantRefId, merchantId }",
            authPayload: (orderId, txnId) => ({ orderId, merchantRefId: txnId }),
            createPayload: (orderId, txnId) => ({
                amount: "1.00",
                payMode: "all",
                productInfo: "Subscription Purchase",
                customerName: "Test Customer",
                customerMobile: "9999999999",
                customerEmail: "customer@example.com",
                redirectionURL: "http://localhost:5174/subscription",
                currencyCode: "INR",
                orderId: orderId,
                merchantRefId: txnId,
                merchantId: MERCHANT_ID
            })
        },
        {
            name: "Auth: { orderId, merchantTxnId }, CreateOrder: { orderId, merchantTxnId, merchantId }",
            authPayload: (orderId, txnId) => ({ orderId, merchantTxnId: txnId }),
            createPayload: (orderId, txnId) => ({
                amount: "1.00",
                payMode: "all",
                productInfo: "Subscription Purchase",
                customerName: "Test Customer",
                customerMobile: "9999999999",
                customerEmail: "customer@example.com",
                redirectionURL: "http://localhost:5174/subscription",
                currencyCode: "INR",
                orderId: orderId,
                merchantTxnId: txnId,
                merchantId: MERCHANT_ID
            })
        }
    ];

    for (const combo of combinations) {
        console.log(`\nTesting Combination: ${combo.name}`);
        const orderId = "ORD" + Date.now().toString().slice(-8);
        const txnId = "TXN" + Date.now().toString().slice(-8);

        const aPayload = combo.authPayload(orderId, txnId);
        const cPayload = combo.createPayload(orderId, txnId);

        let token = "";
        try {
            const authRes = await axios.post(`${baseUrl}/Authorization`, 
                aPayload,
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
        } catch (e) {
            console.log(`❌ Auth step failed:`, e.response?.data || e.message);
            continue;
        }

        if (token) {
            try {
                const res = await axios.post(`${baseUrl}/CreateOrder`, cPayload, {
                    headers: {
                        'ACCESS-TOKEN': token,
                        'Content-Type': 'application/json'
                    }
                });
                console.log(`🎉 SUCCESS! Response:`, res.data);
                return;
            } catch (error) {
                console.log(`❌ CreateOrder step failed:`, error.response?.data || error.message);
            }
        }
    }
    console.log("All combinations finished.");
}

testAuthKeys();
