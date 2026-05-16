require("dotenv").config();
const path = require("path");
// Ensure we are in the be root so .env and modules load correctly
process.chdir(path.join(__dirname, ".."));

const mongoose = require("mongoose");
const { prithuDB } = require("../database");

if (!process.env.PRITHU_DB_URI) {
    console.error("❌ Error: PRITHU_DB_URI is not defined in .env file.");
    process.exit(1);
}
const { taskRegistry } = require("../corn/index");

async function runNow() {
    try {
        console.log("🚀 Manual Trigger: ML Metadata Generation...");
        
        // Wait for DB connection
        if (prithuDB.readyState !== 1) {
            console.log("⏳ Waiting for DB connection...");
            await new Promise((resolve) => {
                prithuDB.once('open', resolve);
            });
        }

        const task = taskRegistry.find(t => t.id === "ml_metadata_generation");
        if (!task) {
            console.error("❌ Task 'ml_metadata_generation' not found in registry.");
            process.exit(1);
        }

        const result = await task.action();
        console.log("✅ Task triggered successfully:", result);
        
        console.log("ℹ️ Jobs have been added to the 'ml-metadata-analysis' queue.");
        console.log("ℹ️ The background worker is now processing them.");
        
        // Wait a bit to let the console logs show up from the worker
        setTimeout(() => {
            console.log("👋 Done. You can close this script. The worker will continue in the background of the main server.");
            process.exit(0);
        }, 5000);

    } catch (error) {
        console.error("❌ Error triggering task:", error);
        process.exit(1);
    }
}

runNow();
