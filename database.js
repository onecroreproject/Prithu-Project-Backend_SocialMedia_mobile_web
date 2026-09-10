const dns = require("dns");
const mongoose = require("mongoose");
require("dotenv").config(); // load .env variables

// 🔧 Prefer IPv4 to prevent Node.js 17+ hanging on Windows with MongoDB Atlas
if (dns.setDefaultResultOrder) {
  dns.setDefaultResultOrder("ipv4first");
}

// 🔧 Set reliable DNS servers for Atlas SRV lookup
try {
  dns.setServers(["8.8.8.8", "8.8.4.4", "1.1.1.1"]);
} catch (e) {
  console.warn("⚠️ Could not set custom DNS servers, using system default:", e.message);
}

// 🟢 1. PRITHU Database (Main App DB)
const prithuDB = mongoose.createConnection(process.env.PRITHU_DB_URI, {
  maxPoolSize: 20,
  minPoolSize: 5,
  autoIndex: true,
  serverSelectionTimeoutMS: 20000,
  socketTimeoutMS: 45000,
});

// Connection lifecycle logs
prithuDB.on("connecting", () => console.log("⏳ Connecting to PRITHU DB..."));
prithuDB.on("connected", () => console.log("✅ PRITHU DB connected successfully"));
prithuDB.on("error", (err) => {
  console.error("❌ PRITHU DB Error:", err.message || err);
  console.error("💡 Hint: If connecting fails, ensure your current IP address is whitelisted in MongoDB Atlas Network Access.");
});
prithuDB.on("disconnected", () => console.warn("⚠️ PRITHU DB disconnected"));

// Helper to run tasks only after DB is fully connected
function onDBReady(cb) {
  if (prithuDB.readyState === 1) {
    process.nextTick(cb);
  } else {
    prithuDB.once("connected", cb);
  }
}

// Promise-based helper for external scripts (seedAdmin, etc.)
const connectPrithuDB = async () => {
  if (prithuDB.readyState === 1) return prithuDB;
  return new Promise((resolve, reject) => {
    prithuDB.once("connected", () => resolve(prithuDB));
    prithuDB.once("error", (err) => reject(err));
  });
};

module.exports = { prithuDB, onDBReady, connectPrithuDB };
