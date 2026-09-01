const User = require('../../models/userModels/userModel');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const bcrypt = require('bcrypt');
if (!global.otpStore) global.otpStore = new Map();
const { startUpProcessCheck } = require('../../middlewares/services/User Services/userStartUpProcessHelper');
const Device = require("../../models/userModels/userSession-Device/deviceModel");
const Session = require("../../models/userModels/userSession-Device/sessionModel");
const UserReferral = require('../../models/userModels/userRefferalModels/userReferralModel');
const UserEarning = require('../../models/userModels/userRefferalModels/referralEarnings.js');
const ProfileSettings = require("../../models/profileSettingModel");
const fs = require("fs");
const path = require("path");
const { sendTemplateEmail } = require("../../utils/templateMailer");
const { checkAndClearDeactivatedUser } = require("../../controllers/userControllers/userDeleteController");
const checkActiveSubscription = require("../../middlewares/subscriptionMiddlewares/checkActiveSubscription");
const { processReferralReward } = require("../../middlewares/helper/directReferalFunction");



exports.createNewUser = async (req, res) => {
  try {
    let { username, email, password, referralCode, phone, whatsapp } = req.body;
    email = email?.toLowerCase();

    // ✅ Validate inputs
    if (!username || !email || !password) {
      return res.status(400).json({ message: "All required fields must be provided" });
    }



    // ✅ Check for existing user
    const existingUser = await User.findOne({
      $or: [{ email }, { userName: username }],
    }).lean();

    if (existingUser) {
      return res.status(400).json({
        message:
          existingUser.email === email
            ? "Email already registered"
            : "Username already taken",
      });
    }

    // ✅ Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // ✅ Generate referral code (e.g., ARU234)
    const letters = username.replace(/\s+/g, "").slice(0, 3).toUpperCase() || "USR";
    const digits = Math.floor(100 + Math.random() * 900);
    const generatedCode = `${letters}${digits}`;

    // ✅ Create new user
    const user = new User({
      userName: username.replace(/\s+/g, "").trim(),
      email,
      passwordHash,
      referralCode: generatedCode,
      referralCodeIsValid: false, // Remains false until user subscribes to a paid plan
    });

    // ✅ If referral code provided
    if (referralCode) {
      const cleanRef = referralCode.trim().toUpperCase();
      const parent = await User.findOne({ referralCode: cleanRef });

      if (parent) {
        user.referredByUserId = parent._id;
      }
    }

    await user.save();

    // ✅ Add referral to parent's active cycle (pending subscription)
    if (user.referredByUserId) {
      try {
        const { addReferralToCycle } = require("../../services/referralCycleService");
        if (typeof addReferralToCycle === 'function') {
          addReferralToCycle(user.referredByUserId, user._id).catch((err) =>
            console.error("❌ Add to referral cycle failed:", err)
          );
        }
      } catch (cycleErr) {
        console.error("❌ Failed to invoke addReferralToCycle:", cycleErr);
      }

      // Process reward if already applicable
      processReferralReward(user._id).catch((err) =>
        console.error("❌ Referral Reward Processing failed:", err)
      );
    }


    // ✅ Create profile settings
    ProfileSettings.create({
      userId: user._id,
      userName: username.replace(/\s+/g, "").trim(),
      displayName: username,
      phoneNumber: phone,
      whatsAppNumber: whatsapp,
    }).catch((err) => console.error("❌ Failed to create ProfileSettings:", err));

    // ✅ Send registration confirmation email
    sendTemplateEmail({
      templateName: "registration-confirmation.html",
      to: email,
      subject: "🎉 Welcome to Prithu - Registration Confirmed!",
      placeholders: {
        username,
        email,
        password,
        referralCode: generatedCode,
      },
      embedLogo: false,
    }).catch((err) => console.error("❌ Registration Email failed:", err));

    // ✅ Send welcome email (additional)
    sendTemplateEmail({
      templateName: "welcome.html",
      to: email,
      subject: "✨ Welcome to Prithu!",
      placeholders: {
        username,
      },
      embedLogo: false,
    }).catch((err) => console.error("❌ Welcome Email failed:", err));

    // ✅ Final response
    res.status(201).json({
      success: true,
      message: "User registered successfully",
      referralCode: generatedCode,
    });
  } catch (err) {
    console.error("❌ Error creating user:", err);
    res.status(500).json({ message: "Server error" });
  }
};









exports.userLogin = async (req, res) => {
  try {
    let { identifier, password, deviceId, deviceType, os, browser, sessionId } = req.body;
    identifier = identifier?.toLowerCase();

    if (!identifier || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    // 1️⃣ Find user
    const user = await User.findOne({ email: identifier });
    if (!user) {
      return res.status(400).json({ error: "Invalid username" });
    }

    await checkAndClearDeactivatedUser(user._id);

    // 2️⃣ Validate password
    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      return res.status(400).json({ error: "Invalid password" });
    }

    if (user.isBlocked) {
      return res.status(403).json({ error: "User is blocked. Contact admin." });
    }

    // 3️⃣ Startup checks
    const userStart = await startUpProcessCheck(user._id);

    // 4️⃣ Generate tokens
    const accessToken = jwt.sign(
      {
        userName: user.userName,
        userId: user._id,
        role: "User",
        referralCode: user.referralCode,
      },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );

    const refreshToken = jwt.sign(
      { userId: user._id },
      process.env.JWT_REFRESH_SECRET,
      { expiresIn: "30d" }
    );

    // 5️⃣ Device Handling
    const currentDeviceId = deviceId;
    const deviceName = `${os || "Unknown OS"} - ${browser || "Unknown Browser"}`;

    let device = await Device.findOne({ userId: user._id, deviceId: currentDeviceId });

    if (!device) {
      device = await Device.create({
        userId: user._id,
        deviceId: currentDeviceId,
        deviceType: deviceType || "web",
        os: os || "Unknown OS",
        browser: browser || "Unknown Browser",
        deviceName,
        ipAddress: req.ip,
        isOnline: true,
        lastActiveAt: new Date(),
      });
      console.log("🆕 New device registered:", device.deviceName);
    } else {
      device.deviceType = deviceType || device.deviceType;
      device.os = os || device.os;
      device.browser = browser || device.browser;
      device.deviceName = deviceName;
      device.ipAddress = req.ip;
      device.isOnline = true;
      device.lastActiveAt = new Date();
      await device.save();
      console.log("♻️ Existing device login:", device.deviceName);
    }

    // 6️⃣ SESSION HANDLING (updated logic)
    let session = null;

    // 📌 Find if a session already exists for this device
    session = await Session.findOne({
      userId: user._id,
      deviceId: device._id,
    });

    if (session) {
      // 🔁 Reuse existing session
      console.log("🔁 Reusing session:", session._id);

      session.refreshToken = refreshToken;
      session.isOnline = true;
      session.lastSeenAt = new Date();
      await session.save();
    } else {
      // 🆕 Create a new session (only one per device)
      session = await Session.create({
        userId: user._id,
        deviceId: device._id,
        refreshToken,
        isOnline: true,
        lastSeenAt: new Date(),
      });

      console.log("🆕 New session created:", session._id);
    }

    // 7️⃣ Link device → session
    device.sessionId = session._id;
    await device.save();

    // 8️⃣ User online
    await User.findByIdAndUpdate(user._id, {
      isOnline: true,
      lastSeenAt: new Date(),
    });

    // 🔔 Send login email
    sendTemplateEmail({
      templateName: "login.html",
      to: user.email,
      subject: "👋 Welcome Back!",
      placeholders: {
        username: user.userName,
        dashboardLink: `${process.env.FRONTEND_URL.split(',')[0]}/dashboard`,
      },
      embedLogo: false,
    }).catch((err) => console.error("Email error:", err));

    // 9️⃣ Final Response
    return res.status(200).json({
      success: true,
      message: "Login successful",
      accessToken,
      refreshToken,
      userId: user._id,
      sessionId: session._id,
      deviceId: device.deviceId,
      deviceType: device.deviceType,
      os: device.os,
      browser: device.browser,
      deviceName: device.deviceName,
      appLanguage: userStart.appLanguage,
      feedLanguage: userStart.feedLanguage,
      gender: userStart.gender,
      category: userStart.hasInterestedCategory,
      role: "user",
    });

  } catch (error) {
    console.error("❌ Login error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};













exports.userSendOtp = async (req, res) => {
  let { email } = req.body;
  email = email?.toLowerCase();

  if (!email) {
    return res.status(400).json({ error: "Email is required" });
  }

  try {
    // Generate 6-digit OTP and expiry (10 mins)
    const tempOtp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    let username = "User";
    let templateName = "otp-verification.html";
    let subject = "Prithu - OTP Verification Code";

    const user = await User.findOne({ email: email.toLowerCase() });

    if (user) {
      // Existing user → Reset Password OTP
      username = user.userName || "User";
      user.otpCode = tempOtp;
      user.otpExpiresAt = otpExpires;
      await user.save();

      templateName = "reset-password-otp.html";
      subject = "Prithu - Password Reset OTP";
    } else {
      // New user → Store OTP temporarily
      otpStore.set(email, { tempOtp, expires: otpExpires });
      console.log("Temporary OTP saved for unregistered user:", email);
    }

    // Send OTP email
    await sendTemplateEmail({
      templateName,
      to: email,
      subject,
      placeholders: { username, otp: tempOtp },
    });

    console.log(`✅ OTP sent to ${email} | OTP: ${tempOtp}`);
    res.json({ message: "OTP sent successfully to email" });
  } catch (error) {
    console.error("❌ Error in userSendOtp:", error);
    res.status(500).json({ error: error.message });
  }
};


// Verify OTP for new (unregistered) users

exports.newUserVerifyOtp = async (req, res) => {
  try {
    let { otp, email } = req.body;
    email = email?.toLowerCase();

    if (!otp || !email) {
      return res.status(400).json({ error: "Email and OTP are required" });
    }

    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({ message: "Email already exists" });
    }

    const record = otpStore.get(email);
    if (!record) {
      return res.status(400).json({ error: "No OTP found. Please request a new one." });
    }

    if (Date.now() > record.expires) {
      otpStore.delete(email);
      return res.status(400).json({ error: "OTP has expired" });
    }

    if (record.tempOtp !== otp) {
      return res.status(400).json({ error: "Invalid OTP" });
    }

    // Success
    otpStore.delete(email);
    res.status(200).json({
      verified: true,
      message: "OTP verified successfully. You can now register.",
    });
  } catch (error) {
    console.error("❌ Error in newUserVerifyOtp:", error);
    res.status(500).json({ error: error.message });
  }
};


exports.existUserVerifyOtp = async (req, res) => {
  try {
    const { otp } = req.body;

    if (!otp) {
      return res.status(400).json({ error: "OTP is required" });
    }

    const user = await User.findOne({ otpCode: otp });
    if (!user) {
      return res.status(400).json({ error: "Invalid OTP" });
    }

    if (!user.otpCode || !user.otpExpiresAt || user.otpExpiresAt < new Date()) {
      return res.status(400).json({ error: "Invalid or expired OTP" });
    }

    res.json({
      message: "OTP verified successfully",
      email: user.email,
    });
  } catch (error) {
    console.error("❌ Error in existUserVerifyOtp:", error);
    res.status(500).json({ error: error.message });
  }
};


exports.userPasswordReset = async (req, res) => {
  try {
    let { email, newPassword } = req.body;
    email = email?.toLowerCase();

    if (!email || !newPassword) {
      return res.status(400).json({ error: "Email and new password are required" });
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    user.passwordHash = passwordHash;

    // Clear OTP after successful reset
    user.otpCode = undefined;
    user.otpExpiresAt = undefined;

    await user.save();

    // Send password reset success email
    await sendTemplateEmail({
      templateName: "password-reset-sucessfull.html",
      to: user.email,
      subject: "Your Prithu Password Has Been Reset",
      placeholders: { username: user.userName || "User" },
      embedLogo: false,
    });

    res.json({ message: "Password reset successful" });
  } catch (error) {
    console.error("❌ Error in userPasswordReset:", error);
    res.status(500).json({ error: error.message });
  }
};

exports.userLogOut = async (req, res) => {
  try {
    const userId = req.Id || req.userId; // Extracted from JWT middleware
    const { deviceId } = req.body;

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized: Invalid or missing token" });
    }

    if (!deviceId) {
      return res.status(400).json({ error: "deviceId is required for logout" });
    }

    // 1️⃣ Find the device by userId + deviceId
    const device = await Device.findOne({ userId, deviceId });
    if (!device) {
      return res.status(404).json({ error: "Device not found" });
    }

    // 2️⃣ Find all sessions linked to this device
    const sessions = await Session.find({ userId, deviceId: device._id });

    if (sessions.length > 0) {
      // 🔥 Update isOnline=false instead of deleting session
      await Session.updateMany(
        { userId, deviceId: device._id },
        { $set: { isOnline: false, lastActiveAt: new Date() } }
      );

      console.log(`🟡 Updated ${sessions.length} session(s) to isOnline=false for device ${deviceId}`);
    } else {
      console.log("ℹ️ No active sessions found for this device.");
    }

    // 3️⃣ Mark device as offline
    device.isOnline = false;
    device.lastActiveAt = new Date();
    device.sessionId = null;
    await device.save();

    // 4️⃣ Check if any other active sessions exist for the user
    const activeSessions = await Session.find({ userId, isOnline: true });
    const userStillOnline = activeSessions.length > 0;

    // 5️⃣ Update user status accordingly
    await User.findByIdAndUpdate(userId, {
      isOnline: userStillOnline,
      lastSeenAt: new Date(),
      ...(userStillOnline ? {} : { refreshToken: null }), // Clear refreshToken only if user fully offline
    });

    return res.status(200).json({
      success: true,
      message: "Logout successful",
      deviceStatus: "Device marked offline",
      sessionsUpdated: sessions.length,
      userStatusChanged: !userStillOnline,
    });

  } catch (error) {
    console.error("❌ Logout error:", error);
    return res.status(500).json({ error: error.message });
  }
};
















exports.validateReferralCode = async (req, res) => {
  try {
    const code = req.params.code || req.query.code || req.body.code || req.body.referralCode;

    if (!code || !code.trim()) {
      return res.status(400).json({ success: false, valid: false, message: "Referral code is required" });
    }

    const cleanCode = code.trim().toUpperCase();
    const user = await User.findOne({
      referralCode: cleanCode,
    }).select("userName _id referralCodeIsValid").lean();

    if (!user) {
      return res.status(200).json({
        success: false,
        valid: false,
        status: "not_found",
        message: "Invalid referral code. Please check and try again."
      });
    }

    // Check if referrer's subscription is active using central helper
    const result = await checkActiveSubscription(user._id);
    const isPaidActive = result.hasActive && result.planType !== 'trial';
    const isVip = isPaidActive || user.referralCodeIsValid;

    if (!isVip) {
      return res.status(200).json({
        success: false,
        valid: false,
        status: "pending_subscription",
        referrerName: user.userName,
        message: `Referrer @${user.userName}'s subscription is pending. Only active VIP members can invite friends.`
      });
    }

    return res.status(200).json({
      success: true,
      valid: true,
      status: "active_vip",
      referrerName: user.userName,
      referrerActive: true,
      message: `Valid Referral Code! (@${user.userName} • Active VIP)`
    });

  } catch (err) {
    console.error("❌ Error validating referral code:", err);
    return res.status(500).json({ success: false, valid: false, message: "Server error checking referral code" });
  }
};
