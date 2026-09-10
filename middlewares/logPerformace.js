const fs = require("fs");
const path = require("path");

function logPerformance(line) {
  try {
    const logDir = path.join(__dirname, "../logs");
    if (!fs.existsSync(logDir)) fs.mkdirSync(logDir);
    const fileName = `${new Date().toISOString().slice(0, 10)}.log`;
    const filePath = path.join(logDir, fileName);
    fs.appendFileSync(filePath, line + "\n", "utf8");
  } catch (err) {
    console.error("⚠️ Error writing performance log:", err.message);
  }
}

module.exports = { logPerformance };
