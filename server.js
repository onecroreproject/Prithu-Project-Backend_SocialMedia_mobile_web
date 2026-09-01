require("dotenv").config();
require("./Config/ffmpegConfig");
const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const path = require("path");
const http = require("http");
const startCrons = require("./corn/index");
const { initSocket } = require("./middlewares/webSocket");
const { monitorMiddleware } = require("./middlewares/monitor");
const { sharePostOG } = require("./controllers/feedControllers/userActionsFeedController");
const adminRoot = require("./roots/adminRoot");
const userRoot = require("./roots/userRoot");
const paymentRoutes = require("./routes/paymentRoutes");

// 🟢 Background Workers
require("./workers/videoCompressionWorker");

// 🟢 MULTI-DB Connection
require("./database");

const { autoSeedPrompts } = require("./controllers/promptController");
autoSeedPrompts();

const { autoSeedCategories } = require("./controllers/aiCategoryController");
autoSeedCategories();

const app = express();
const server = http.createServer(app);
initSocket(server);


const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:5174",
  "http://localhost:5175",
  "http://192.168.1.28:5000",
  "http://192.168.1.29:5173",
  "https://admin.prithu.app",
  "https://www.prithu.app",
  "https://prithu.app",
];


// 🟢 CORS
app.use(
  cors({
    origin: function (origin, callback) {
      // allow server-to-server, curl, postman
      if (!origin) return callback(null, true);

      if (
        allowedOrigins.includes(origin) ||
        origin.startsWith("http://localhost:") ||
        origin.startsWith("http://127.0.0.1:") ||
        origin.startsWith("http://192.168.")
      ) {
        return callback(null, true);
      }

      console.error("❌ CORS blocked:", origin);
      return callback(null, false); // IMPORTANT: do NOT throw error
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// app.options("*", cors());

app.use(express.json({ limit: "200mb" }));
app.use(express.urlencoded({ limit: "200mb", extended: true }));
app.use(cookieParser());

app.use("/logo", express.static(path.join(__dirname, "logo")));
// 🟢 Static files (IMPORTANT for OG images)
app.use("/media", express.static(path.join(__dirname, "media"), {
  setHeaders: (res, path) => {
    // Set proper cache headers for media files
    if (path.endsWith('.jpg') || path.endsWith('.jpeg') || path.endsWith('.png') || path.endsWith('.webp')) {
      res.setHeader('Cache-Control', 'public, max-age=31536000'); // 1 year
    }
  }
}));

app.use("/uploads", express.static(path.join(__dirname, "uploads"), {
  setHeaders: (res, path) => {
    // Allow CORS for images and videos since they're used in OG tags/previews
    if (path.match(/\.(jpg|jpeg|png|webp|mp4)$/)) {
      res.setHeader('Access-Control-Allow-Origin', '*');
      if (path.endsWith('.mp4')) {
        res.setHeader('Content-Type', 'video/mp4');
      }
    }
  }
}));

app.use(monitorMiddleware);

//
// 🔥🔥🔥 DIGITAL ASSET LINKS & UNIVERSAL APP LINKS
//
app.get("/.well-known/assetlinks.json", (req, res) => {
  res.setHeader("Content-Type", "application/json");
  res.json([
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: {
        namespace: "android_app",
        package_name: "com.dlktechnologies.Prithu",
        sha256_cert_fingerprints: [
          "14:6D:E9:7D:0F:52:AB:E7:A0:0E:7B:22:87:B6:68:6B:0C:08:BB:EB:5B:97:B0:12:3C:AB:3D:B1:A6:4D:65:94",
          "FA:C6:17:45:DC:09:03:78:6F:B9:ED:E6:2A:96:2B:39:9F:73:48:F0:BB:6F:89:9B:83:32:66:75:91:03:3B:9C"
        ]
      }
    }
  ]);
});

app.get("/.well-known/apple-app-site-association", (req, res) => {
  res.setHeader("Content-Type", "application/json");
  res.json({
    applinks: {
      apps: [],
      details: [
        {
          appID: "TEAMID.com.dlktechnologies.Prithu",
          paths: ["/share/post/*", "/profile/*", "/ai/prompt/*"]
        }
      ]
    }
  });
});

//
// 🔥🔥🔥 OG SHARE ROUTE (MUST BE BEFORE /api)
//
app.get("/share/post/:feedId", sharePostOG);

const { shareCardOG } = require("./controllers/visitingCardController");
app.get("/share/card/:identifier", shareCardOG);

//
// 🟢 API ROUTES
//
app.use("/api", adminRoot);
app.use("/web/api", userRoot);
app.use("/web/api/payment", paymentRoutes);

const walletRoutes = require("./routes/walletRoutes");
app.use("/web/api/wallet", walletRoutes);

const aiImageRoutes = require("./routes/aiImageRoutes");
app.use("/web/api/media", aiImageRoutes);
app.use("/api/ai", aiImageRoutes);
app.use("/api/admin/ai", aiImageRoutes);

const chatRoutes = require("./routes/chatRoutes");
app.use("/api/chat", chatRoutes);

const visitingCardRoutes = require("./routes/visitingCardRoutes");
app.use("/web/api/visiting-card", visitingCardRoutes);
app.use("/api/visiting-card", visitingCardRoutes);



// 🟢 Cron
startCrons();

// 🟢 Start server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

// 🟢 Graceful shutdown for nodemon restarts and termination signals
process.once("SIGUSR2", () => {
  server.close(() => {
    process.kill(process.pid, "SIGUSR2");
  });
});

process.on("SIGINT", () => {
  server.close(() => {
    process.exit(0);
  });
});

process.on("SIGTERM", () => {
  server.close(() => {
    process.exit(0);
  });
});

