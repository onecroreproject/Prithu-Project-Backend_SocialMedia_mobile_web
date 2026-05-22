require("dotenv").config();
const instifiService = require("../services/instifiPaymentService");

async function run() {
  try {
    const status = await instifiService.checkStatus("", "PND2252026153612614924");
    console.log("Instifi Status Response:", JSON.stringify(status, null, 2));
  } catch (error) {
    console.error("Error querying status:", error.message, error.response?.data);
  }
}

run();
