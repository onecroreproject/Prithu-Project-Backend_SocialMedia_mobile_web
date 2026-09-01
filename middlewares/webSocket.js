const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");
const User = require("../models/userModels/userModel");
const Session = require("../models/userModels/userSession-Device/sessionModel");
const ChildAdmin = require("../models/childAdminModel");

let io;

const initSocket = (server) => {
  io = new Server(server, {
    cors: {
      origin: "*", // ✅ Allow all frontend origins (change in prod)
      methods: ["GET", "POST"],
    },
    transports: ["websocket", "polling"], // Allow polling fallback
  });

  // 🔐 Middleware to verify JWT
  io.use(async (socket, next) => {
    const token = socket.handshake.auth?.token;
    // Session ID is only for End Users, not Admins
    const sessionId = socket.handshake.auth?.sessionId;

    if (!token) return next(new Error("No token provided"));

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.userId = decoded.userId;
      socket.role = decoded.role || "User"; // Default to User if no role
      socket.sessionId = sessionId;
      next();
    } catch (err) {
      console.log("⚠️ Socket auth error:", err.message);
      next(new Error("Invalid or expired token"));
    }
  });

  // 🎯 When a user/admin connects
  io.on("connection", async (socket) => {
    console.log(`✅ ${socket.role} connected: ${socket.userId}`);

    // ➕ Join personal room
    socket.join(socket.userId);

    // ➕ Join role-based and global rooms for updates
    socket.join('all');
    if (socket.role) {
      socket.join(socket.role);
    }

    // -----------------------------
    // 👤 HANDLE END USERS
    // -----------------------------
    if (socket.role === "User") {
      const now = new Date();
      if (socket.sessionId) {
        // 🟢 Mark specific session as online
        await Session.findByIdAndUpdate(socket.sessionId, {
          isOnline: true,
          lastSeenAt: now,
          lastActiveAt: now,
        });
      }

      // 🟢 Mark user as online and update lastActiveAt & lastSeenAt
      if (socket.userId) {
        await User.findByIdAndUpdate(socket.userId, {
          isOnline: true,
          lastSeenAt: now,
          lastActiveAt: now,
        });
      }

      // 🔔 Notify all clients that user is online
      io.emit("userOnline", { userId: socket.userId });
    }

    // -----------------------------
    // 🛡️ HANDLE CHILD ADMINS
    // -----------------------------
    if (socket.role === "Child_Admin") {
      await ChildAdmin.findByIdAndUpdate(socket.userId, {
        isOnline: true,
        lastLoginTime: new Date(),
      });

      // 🔔 Notify admins that child admin is online
      io.emit("childAdminOnline", { adminId: socket.userId });
    }

    // 🫀 Heartbeat from client (keep alive)
    socket.on("heartbeat", async () => {
      const now = new Date();
      if (socket.role === "User") {
        if (socket.sessionId) {
          await Session.findByIdAndUpdate(socket.sessionId, {
            lastSeenAt: now,
            lastActiveAt: now,
            isOnline: true,
          });
        }
        if (socket.userId) {
          await User.findByIdAndUpdate(socket.userId, {
            lastSeenAt: now,
            lastActiveAt: now,
            isOnline: true,
          });
        }
      } else if (socket.role === "Child_Admin") {
        // Optional: Update last active time for admin if needed
        // await ChildAdmin.findByIdAndUpdate(socket.userId, { lastActive: new Date() });
      }
    });

    // 📨 Handle “markAsRead”
    socket.on("markAsRead", (userId) => {
      console.log(`📩 Notifications marked as read by ${userId}`);
      io.to(userId).emit("notificationRead", { userId });
    });

    // ❌ When a user/admin disconnects
    socket.on("disconnect", async (reason) => {
      console.log(`❌ ${socket.role} Disconnected: ${socket.userId}`);

      // -----------------------------
      // 👤 HANDLE END USERS
      // -----------------------------
      if (socket.role === "User") {
        const now = new Date();
        if (socket.sessionId) {
          // 1️⃣ Mark the current session offline
          await Session.findByIdAndUpdate(socket.sessionId, {
            isOnline: false,
            lastSeenAt: now,
            lastActiveAt: now,
          });
        }

        // 2️⃣ Check if the user still has any other online sessions
        const activeSessions = socket.userId ? await Session.find({
          userId: socket.userId,
          isOnline: true,
        }) : [];

        if (activeSessions.length === 0 && socket.userId) {
          // 🟥 Mark user offline globally with updated lastSeenAt and lastActiveAt
          await User.findByIdAndUpdate(socket.userId, {
            isOnline: false,
            lastSeenAt: now,
            lastActiveAt: now,
          });
          io.emit("userOffline", { userId: socket.userId });
        }
      }

      // -----------------------------
      // 🛡️ HANDLE CHILD ADMINS
      // -----------------------------
      if (socket.role === "Child_Admin") {
        await ChildAdmin.findByIdAndUpdate(socket.userId, {
          isOnline: false,
          lastLogoutTime: new Date(),
        });

        io.emit("childAdminOffline", { adminId: socket.userId });
      }
    });
  });

  console.log("🚀 Socket.io initialized successfully");
};

/**
 * ✅ Helper to send notification to a specific user
 */
const sendNotification = (userId, notification) => {
  if (!io) return console.error("❌ Socket.io not initialized");
  console.log(`📢 Sending real-time notification to ${userId}`);
  io.to(userId).emit("newNotification", notification);
};

/**
 * ✅ Export getIO to access socket instance elsewhere
 */
module.exports = {
  initSocket,
  getIO: () => io,
  sendNotification,
};
