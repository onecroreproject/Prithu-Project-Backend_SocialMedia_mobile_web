require("dotenv").config();
const mongoose = require("mongoose");
const { prithuDB } = require("../database"); // Adjust path if needed
const { triggerTaskManually } = require("../corn/index");

async function testReminder() {
    try {
        console.log("🚀 Manually triggering Subscription Expiry Reminder task...");
        const result = await triggerTaskManually("subscription_expiry_reminder");
        console.log("✅ Task triggered successfully:", result);
        process.exit(0);
    } catch (err) {
        console.error("❌ Failed to trigger task:", err);
        process.exit(1);
    }
}

// Wait for DB connection
const checkConnection = setInterval(() => {
    if (mongoose.connection.readyState === 1) {
        clearInterval(checkConnection);
        testReminder();
    }
}, 500);
