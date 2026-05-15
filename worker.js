// worker.js - Main entry point for background workers
require("dotenv").config();
require("./database"); // Connect to DB

console.log("🛠️ Starting Background Workers...");

// Import workers to start them
require("./workers/videoCompressionWorker");

// Add other workers here as needed
// require("./queue/feedPostQueue"); // If moving Bull v3 workers to separate process

console.log("🚀 Workers are running and listening for jobs.");
