// config/firebaseAdmin.js
const admin = require("firebase-admin");

const initFirebaseAdmin = () => {
  if (admin.apps.length) {
    console.log("⚙️ Firebase Admin already initialized");
    return admin;
  }

  try {
    console.log("🚀 Initializing Firebase Admin...");

    const base64 = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!base64) throw new Error("Missing FIREBASE_SERVICE_ACCOUNT in environment");

    // Decode Base64 and parse JSON
    const decoded = Buffer.from(base64, "base64").toString("utf8");
    const serviceAccount = JSON.parse(decoded);

    // Fix escaped newlines
    if (serviceAccount.private_key?.includes("\\n")) {
      serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, "\n");
    }

    // Initialize Admin SDK
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });

    console.log("✅ Firebase Admin initialized successfully");
  } catch (error) {
    console.error("🔥 Firebase Admin initialization failed:", error);
  }

  return admin;
};

module.exports = initFirebaseAdmin();
