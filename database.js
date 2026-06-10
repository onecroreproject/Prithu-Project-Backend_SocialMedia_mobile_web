const mongoose = require("mongoose");
require("dotenv").config(); // load .env variables

// 🟢 1. PRITHU Database (Main App DB)
const prithuDB = mongoose.createConnection(process.env.PRITHU_DB_URI, {
  maxPoolSize: 20,
  minPoolSize: 5,
  autoIndex: true,
});



// Connection logs
prithuDB.on("connected", () => console.log("✅ PRITHU DB connected"));

prithuDB.on("error", (err) => console.error("❌ PRITHU DB Error:", err));

module.exports = { prithuDB };
