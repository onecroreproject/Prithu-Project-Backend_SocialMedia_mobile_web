const axios = require('axios');

class InstifiPaymentService {
   constructor() {
    this.baseURL =
      process.env.INSTIFI_BASE_URL;

    this.apiKey =
      process.env.INSTIFI_API_KEY;

    this.secretKey =
      process.env.INSTIFI_SECRET_KEY;

    this.clientId =
      process.env.INSTIFI_CLIENT_ID;

    if (
        !this.baseURL ||
        !this.apiKey ||
        !this.secretKey ||
        !this.clientId
    ) {
        throw new Error(
            "Instifi env missing"
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
     */
async createOrder(token, orderData) {
    try {

        const url =
`${this.baseURL}/api/v1/Instify/CreateOrder`;

        const frontendURL =
process.env.FRONTEND_URL?.split(",")[0];

        if (!frontendURL) {
            throw new Error(
              "FRONTEND_URL missing in .env"
            );
        }

        const headers = {
            "Content-Type":
                "application/json",

            "ACCESS-TOKEN":
                token
        };

        const payload = {
            amount:
              String(orderData.amount),

            merchantTxnId:
              orderData.merchantTxnId,

            orderId:
              orderData.orderId,

            payMode:
              orderData.payMode || "all",

            merchantId:
              this.clientId,

            productInfo:
              orderData.productInfo
              || "Product Purchase",

            customerName:
              orderData.customerName,

            customerMobile:
              orderData.customerMobile,

            customerEmail:
              orderData.customerEmail,

            redirectionURL:
`${frontendURL}/payment-verification`,

            currencyCode:
              "INR"
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
            return response.data.data;
        }

        throw new Error(
          response.data
          ?.responseMessage
        );

    } catch (error) {
        console.error(
          "Create order error:",
          {
             message:
               error.message,
             response:
               error.response?.data,
             status:
               error.response?.status
          }
        );

        throw error;
    }
}

    /**
     * 3. Check Payment Status
     */
async checkStatus(orderId) {
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
            searchType: "1",
            orderId: orderId,
            transactionId: ""
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
