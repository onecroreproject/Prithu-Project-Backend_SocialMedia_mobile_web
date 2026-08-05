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
  "http://127.0.0.1:5173",
  "http://127.0.0.1:5174",
  "http://127.0.0.1:5175",
  "http://192.168.1.16:5000",
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

      if (allowedOrigins.includes(origin)) {
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
    // Allow CORS for media files
    if (path.match(/\.(jpg|jpeg|png|webp|mp4)$/)) {
      res.setHeader('Access-Control-Allow-Origin', '*');
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
// 🔥🔥🔥 OG SHARE ROUTE (MUST BE BEFORE /api)
//
app.get("/share/post/:feedId", sharePostOG);

//
// 🟢 API ROUTES
//
app.use("/api", adminRoot);
app.use("/web/api", userRoot);
app.use("/web/api/payment", paymentRoutes);

const walletRoutes = require("./routes/walletRoutes");
app.use("/web/api/wallet", walletRoutes);


const chatRoutes = require("./routes/chatRoutes");
app.use("/api/chat", chatRoutes);



// 🟢 Cron
startCrons();

// 🟢 Start server
server.listen(process.env.PORT || 5000, () => {
  console.log(`🚀 Server running on port ${process.env.PORT || 5000}`);
});
