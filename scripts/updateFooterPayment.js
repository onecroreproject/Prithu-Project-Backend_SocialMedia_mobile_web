const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

const mongoose = require("mongoose");
const { prithuDB } = require("../database");
const FooterConfig = require("../models/FooterConfig");

async function updateFooterPayment() {
    try {
        console.log("Connecting to database...");

        if (prithuDB.readyState !== 1) {
            await new Promise((resolve) => prithuDB.once("connected", resolve));
        }

        console.log("Updating footer payment configuration...");

        const updatedConfig = {
            paymentTitle: "Payment Accepted",
            paymentIcons: ["Visa", "Mastercard", "Maestro", "PayPal", "RuPay"],
        };

        let config = await FooterConfig.findOne().sort({ createdAt: -1 });

        if (config) {
            Object.assign(config, updatedConfig);
            await config.save();
            console.log("✅ Footer payment configuration updated successfully.");
        } else {
            console.log("❌ Footer configuration not found. Please run initial setup first.");
        }

        process.exit(0);
    } catch (error) {
        console.error("❌ Error updating footer payment:", error);
        process.exit(1);
    }
}

updateFooterPayment();
