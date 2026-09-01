const jwt = require("jsonwebtoken");
const User = require("../models/userModels/userModel");
require("dotenv").config();

// Throttle map to avoid unnecessary db writes on every rapid sub-request (once per 60s per user)
const userActivityThrottleMap = new Map();

const touchUserActivity = (userId) => {
  if (!userId) return;
  const now = Date.now();
  const lastUpdated = userActivityThrottleMap.get(userId.toString()) || 0;
  if (now - lastUpdated > 60 * 1000) {
    userActivityThrottleMap.set(userId.toString(), now);
    User.findByIdAndUpdate(userId, {
      $set: {
        lastActiveAt: new Date(now),
        lastSeenAt: new Date(now),
        isOnline: true,
      },
    }).catch(() => {});
  }
};

exports.auth = (req, res, next) => {
  const authHeader = req.headers.authorization;
  let token = null;

  // 1️⃣ Try Authorization header first (web app / normal API calls)
  if (authHeader?.startsWith("Bearer ")) {
    token = authHeader.split(" ")[1];
  } else if (req.query.token) {
    // 2️⃣ Fallback: query-param token for mobile native downloads
    // (mobile apps cannot attach Authorization headers during native file download)
    token = req.query.token;
  }

  // Quick check for missing/invalid token
  if (!token) {
    return res.status(401).json({ message: "Token missing or invalid" });
  }

  try {
    // 2️⃣ Verify JWT (synchronously — very fast for short payloads)
    const decoded = jwt.verify(token, process.env.JWT_SECRET || "your_secret_key");

    // 3️⃣ Attach decoded info directly
    req.Id = decoded.userId;
    req.role = decoded.role;
    req.accountId = decoded.accountId;
    req.userName = decoded.userName;
    req.grantedPermissions = decoded.grantedPermissions || [];

    // 🕒 Update real-time Last Active & Last Seen timestamps
    if (decoded.userId) {
      touchUserActivity(decoded.userId);
    }

    return next();
  } catch (err) {
    // 4️⃣ Handle specific JWT errors efficiently
    const message =
      err.name === "TokenExpiredError"
        ? "Your session expired, please login again."
        : err.name === "JsonWebTokenError"
          ? "Invalid token, please login again."
          : "Token verification failed.";

    return res.status(401).json({ message });
  }
};

exports.optionalAuth = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith("Bearer ")) {
    return next();
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || "your_secret_key");
    req.Id = decoded.userId;
    req.role = decoded.role;
    req.accountId = decoded.accountId;
    req.userName = decoded.userName;
    req.grantedPermissions = decoded.grantedPermissions || [];
    return next();
  } catch (err) {
    // If token is invalid/expired but was provided, we still continue but without user info
    // Alternatively, we could fail if a token was provided but is invalid.
    // For now, let's just proceed to next().
    return next();
  }
};
