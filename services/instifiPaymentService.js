const axios = require('axios');

class InstifiPaymentService {
   constructor() {
    this.baseURL =
      process.env.INSTIFI_BASE_URL;

    this.apiKey =
      process.env.INSTIFI_CLIENT_KEY || process.env.INSTIFI_API_KEY;

    this.secretKey =
      process.env.INSTIFI_SECRET_KEY;

    this.clientId =
      process.env.INSTIFI_CLIENT_ID || process.env.INSTIFI_MERCHANT_ID;

    // Numeric merchantId required by CreateOrder API (e.g. "349" not "INFI349")
    const rawMerchantId = process.env.INSTIFI_MERCHANT_ID || this.clientId;
    this.merchantId = rawMerchantId ? rawMerchantId.replace(/\D/g, '') : null;

    if (
        !this.baseURL ||
        !this.apiKey ||
        !this.secretKey ||
        !this.clientId
    ) {
        throw new Error(
            "Instifi env missing: INSTIFI_BASE_URL, INSTIFI_CLIENT_KEY/INSTIFI_API_KEY, INSTIFI_SECRET_KEY, INSTIFI_CLIENT_ID are required."
        );
    }
}

    /**
     * 1. Authorize and get Access Token
     */
async getAccessToken(orderId) {
    try {
        const url =
`${this.baseURL}/api/v1/Instify/Authorization`;

        const headers = {
            "Content-Type":
                "application/json",

            "X-CLIENT-KEY":
                this.apiKey,

            "X-CLIENT-ID":
                this.clientId,

            "X-SECRET-KEY":
                this.secretKey
        };

        const payload = {
            orderId: String(orderId)
        };

        const response =
        await axios.post(
            url,
            payload,
            {
                headers,
                timeout: 30000
            }
        );



        if (
          response.data?.responseCode
          === "200"
        ) {
            return response.data.data.token;
        }

        throw new Error(
            response.data
            ?.responseMessage
        );

    } catch (error) {
        console.error(
          "Instifi auth error:",
          error.response?.data
        );

        throw error;
    }
}

    /**
     * 2. Create Order / Initialize Payment
    /**
     * 2. Create Order / Initialize Payment
     */
    async createOrder(token, orderData) {
        try {
            const url = `${this.baseURL}/api/v1/Instify/CreateOrder`;

            const frontendURL = process.env.FRONTEND_URL?.split(",")[0];

            if (!frontendURL) {
                throw new Error("FRONTEND_URL missing in .env");
            }

            const headers = {
                "Content-Type": "application/json",
                "ACCESS-TOKEN": token
            };

            // Sanitize customerName: Instifi strictly requires alphabets and single spaces only (min 3 chars)
            let sanitizedName = (orderData.customerName || "Valued Customer");
            if (typeof sanitizedName !== 'string') sanitizedName = "Valued Customer";
            sanitizedName = sanitizedName.replace(/[^a-zA-Z\s]/g, ' ').replace(/\s+/g, ' ').trim();
            if (sanitizedName.length < 3) {
                sanitizedName = "Valued Customer";
            }
            sanitizedName = sanitizedName.slice(0, 50).trim();

            // Sanitize customerMobile: 10 digits
            let sanitizedMobile = String(orderData.customerMobile || "9999999999").replace(/\D/g, '');
            if (sanitizedMobile.length > 10) sanitizedMobile = sanitizedMobile.slice(-10);
            if (sanitizedMobile.length < 10) sanitizedMobile = "9999999999";

            // Sanitize customerEmail
            let sanitizedEmail = (orderData.customerEmail || "customer@prithu.app").trim();
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(sanitizedEmail)) {
                sanitizedEmail = "customer@prithu.app";
            }

            const payload = {
                amount: String(orderData.amount),
                merchantTxnId: orderData.merchantTxnId,
                orderId: orderData.orderId,
                payMode: orderData.payMode || "all",
                merchantId: this.merchantId || this.clientId.replace(/\D/g, ''),
                productInfo: (orderData.productInfo || "Product Purchase")
                    .replace(/[^a-zA-Z0-9 ]/g, '')
                    .trim()
                    .slice(0, 30),
                customerName: sanitizedName,
                customerMobile: sanitizedMobile,
                customerEmail: sanitizedEmail,
                redirectionURL: `${frontendURL}/subscription`,
                currencyCode: "INR"
            };

            const response = await axios.post(
                url,
                payload,
                {
                    headers,
                    timeout: 30000
                }
            );

            if (response.data?.responseCode === "200") {
                return response.data.data;
            }

            throw new Error(response.data?.responseMessage || response.data?.message || "Order creation failed at gateway");

        } catch (error) {
            console.error("Create order error:", {
                message: error.message,
                response: error.response?.data,
                status: error.response?.status
            });
            const customErr = new Error(error.response?.data?.responseMessage || error.response?.data?.message || error.message);
            customErr.response = error.response;
            throw customErr;
        }
    }

    /**
     * 3. Check Payment Status
     */
async checkStatus(orderId, transactionId = "") {
    try {

        const url =
`${this.baseURL}/api/v1/Instify/GetStatus`;

        const headers = {
            "Content-Type":
                "application/json",

            "X-CLIENT-KEY":
                this.apiKey,

            "X-CLIENT-ID":
                this.clientId,

            "X-SECRET-KEY":
                this.secretKey
        };

        const payload = {
            searchType: transactionId ? "2" : "1",
            orderId: transactionId ? "" : orderId,
            transactionId: transactionId || ""
        };

        const response =
        await axios.post(
            url,
            payload,
            {
                headers,
                timeout: 30000
            }
        );



        return response.data;

    } catch (error) {
        console.error(
          "Status error:",
          error.response?.data
        );

        throw error;
    }
}
}

module.exports = new InstifiPaymentService();
