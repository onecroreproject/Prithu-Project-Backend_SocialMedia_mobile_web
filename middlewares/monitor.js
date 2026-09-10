const { randomUUID } = require("crypto");
const mongoose = require("mongoose");
const { logPerformance } = require("./logPerformace");

// ✅ Global Metrics Store (In-Memory)
const metrics = {
  totalRequests: 0,
  totalErrors: 0,
  responseTimes: [], // Sliding window of last 100 response times
  requestTimestamps: [], // Sliding window of timestamps for last 1 minute
  endpointMap: {}, // Frequency of endpoints
};

let totalDbCalls = 0;

// ✅ Attach MongoDB Command Monitor once (global)
if (mongoose.connection && !mongoose.connection.__monitorAttached) {
  mongoose.connection.on("commandStarted", (event) => {
    totalDbCalls++;
  });
  mongoose.connection.__monitorAttached = true;
}

function monitorMiddleware(req, res, next) {
  metrics.totalRequests++;
  const now = Date.now();
  
  // Track RPM (Cleanup old timestamps > 1 min)
  metrics.requestTimestamps.push(now);
  const oneMinuteAgo = now - 60000;
  while (metrics.requestTimestamps.length > 0 && metrics.requestTimestamps[0] < oneMinuteAgo) {
    metrics.requestTimestamps.shift();
  }

  // Track Endpoint Frequency
  const endpoint = `${req.method} ${req.route?.path || req.originalUrl.split('?')[0]}`;
  metrics.endpointMap[endpoint] = (metrics.endpointMap[endpoint] || 0) + 1;

  const reqId = randomUUID().slice(0, 8);
  const start = now;
  const dbCallsBefore = totalDbCalls;

  res.on("finish", () => {
    const duration = Date.now() - start;
    const dbCalls = totalDbCalls - dbCallsBefore;

    // Track Response Times (Sliding window of 100)
    metrics.responseTimes.push(duration);
    if (metrics.responseTimes.length > 100) {
      metrics.responseTimes.shift();
    }

    // Track Errors
    if (res.statusCode >= 400) {
      metrics.totalErrors++;
    }

    const logLine = `🚀 [#${metrics.totalRequests}] [${reqId}] ${req.method} ${req.originalUrl} → ${res.statusCode} | ⏱️ ${duration}ms | 💾 DB Calls: ${dbCalls}`;

    if (duration > 800 || dbCalls > 20) {
      console.warn("⚠️  SLOW/CHATTY:", logLine);
      logPerformance(logLine);
    } else {
      console.log(logLine);
    }
  });

  next();
}

module.exports = { monitorMiddleware, metrics };
