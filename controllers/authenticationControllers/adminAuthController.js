const Admin = require('../../models/adminModels/adminModel');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
require('dotenv').config();
const bcrypt = require('bcrypt');
const otpStore = new Map();
const ChildAdmin = require('../../models/childAdminModel');
const ChildAdminActivity = require('../../models/childAdminActivityModel');
const ProfileSettings = require("../../models/profileSettingModel");
const { sendTemplateEmail } = require("../../utils/templateMailer");
const mongoose = require('mongoose');


// Create nodemailer transporter
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.MAIL_USER,
    pass: process.env.MAIL_PASS,
  },
});

// Register New Admin
exports.newAdmin = async (req, res) => {
  try {
    const { username, email, password, adminType } = req.body;
    const parentAdminId = req.Id || null;

    if (!username || !email || !password || !adminType) {
      return res.status(400).json({ error: "All fields are required" });
    }

    // ✅ 1. Check for existing user (both Admin & ChildAdmin)
    const [existingAdmin, existingChild] = await Promise.all([
      Admin.findOne({ $or: [{ userName: username }, { email }] }).lean(),
      ChildAdmin.findOne({ $or: [{ userName: username }, { email }] }).lean(),
    ]);

    if (existingAdmin || existingChild) {
      const duplicate = existingAdmin || existingChild;
      return res.status(400).json({
        error:
          duplicate.userName === username
            ? "Username already exists"
            : "Email already registered",
      });
    }

    // ✅ 2. Hash password once (avoid repeating bcrypt)
    const passwordHash = await bcrypt.hash(password, 10);

    let createdAdmin, profilePayload;

    // ✅ 3. Separate Creation Logic
    if (adminType === "Child_Admin") {
      const lastChild = await ChildAdmin.findOne({}, { childAdminId: 1 })
        .sort({ createdAt: -1 })
        .lean();

      const newIdNumber = lastChild?.childAdminId
        ? parseInt(lastChild.childAdminId.replace("CA", "")) + 1
        : 1;
      const childAdminId = "CA" + String(newIdNumber).padStart(4, "0");

      createdAdmin = await ChildAdmin.create({
        childAdminId,
        userName: username.replace(/\s+/g, "").trim(),
        email,
        passwordHash,
        adminType,
        parentAdminId,
        createdBy: parentAdminId,
      });

      profilePayload = { childAdminId: createdAdmin._id };
    } else {
      // ✅ 4. Handle Master/Super Admin creation
      createdAdmin = await Admin.create({
        userName: username.replace(/\s+/g, "").trim(),
        email,
        passwordHash,
        adminType,
      });

      profilePayload = { adminId: createdAdmin._id };
    }


    // ✅ 5. Create ProfileSettings (no need for await if not required immediately)
    ProfileSettings.create({
      ...profilePayload,
      userName: username.replace(/\s+/g, "").trim(),
      displayName: username.replace(/\s+/g, "").trim(),
    }).catch((err) => console.error("Profile creation failed:", err));

    // ✅ 6. Return clean response
    return res.status(201).json({
      message: `${adminType} registered successfully`,
      admin: {
        id: createdAdmin._id,
        username: createdAdmin.userName.replace(/\s+/g, "").trim(),
        email: createdAdmin.email,
        adminType: createdAdmin.adminType,
        ...(createdAdmin.childAdminId && {
          childAdminId: createdAdmin.childAdminId,
        }),
      },
    });
  } catch (error) {
    console.error("❌ Error creating new admin:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};


// Admin Login
exports.adminLogin = async (req, res) => {
  try {
    const { identifier, password } = req.body;
    if (!identifier || !password)
      return res.status(400).json({ error: "Identifier and password required" });

    let payload = {};
    let grantedPermissions = [];

    // 1️⃣ Check Admin collection
    const admin = await Admin.findOne({
      $or: [{ userName: identifier }, { email: identifier }],
    });

    if (admin) {
      const isMatch = await bcrypt.compare(password, admin.passwordHash);
      if (!isMatch) return res.status(400).json({ error: "Invalid password" });

      payload = {
        role: "Admin",
        userName: admin.userName,
        userId: admin._id.toString(),
      };
      // Admins have all permissions
      grantedPermissions = ["ALL"];
    } else {
      // 2️⃣ Check Child Admin collection
      const child = await ChildAdmin.findOne({ email: identifier }).lean();
      if (!child) return res.status(400).json({ error: "Invalid credentials" });

      const isMatch = await bcrypt.compare(password, child.passwordHash);
      if (!isMatch) return res.status(400).json({ error: "Invalid password" });

      payload = {
        role: "Child_Admin",
        userName: child.userName,
        userId: child._id.toString(),
        adminCode: child.childAdminId,
      };

      // Get granted permissions from child admin
      grantedPermissions = child.grantedPermissions || [];

      // ✅ Close previous offline record if exists
      const now = new Date();
      const lastOffline = await ChildAdminActivity.findOne({
        childAdminId: child._id,
        offlineTo: null
      }).sort({ createdAt: -1 });

      if (lastOffline) {
        lastOffline.offlineTo = now;
        const durationMs = now - lastOffline.offlineFrom;
        const hours = Math.floor(durationMs / (1000 * 60 * 60));
        const minutes = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60));
        lastOffline.duration = `${hours}h ${minutes}m`;
        lastOffline.status = "Offline"; // Record is now a completed "Offline" period
        await lastOffline.save();
      }

      await ChildAdmin.findByIdAndUpdate(child._id, {
        isOnline: true,
        lastLoginTime: now,
        lastActivityTime: now
      });

      // ✅ Create a new "Online" activity record
      await ChildAdminActivity.create({
        childAdminId: child._id,
        date: now.toISOString().split('T')[0],
        loginTime: now,
        status: "Online"
      });
    }

    // 3️⃣ Generate JWT
    const token = jwt.sign(
      { ...payload, grantedPermissions },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    res.json({
      token,
      admin: payload,
      grantedPermissions, // send granted permissions to frontend
    });
  } catch (error) {
    console.error("Admin login error:", error);
    res.status(500).json({ error: error.message });
  }
};


// Request Password Reset OTP
exports.adminSendOtp = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: "Email is required" });
    }

    // Generate OTP
    const tempOtp = Math.floor(1000 + Math.random() * 9000).toString();
    const otpExpires = Date.now() + 5 * 60 * 1000; // 5 minutes

    // Check user in Admin or ChildAdmin
    let user = await Admin.findOne({ email: email.trim().toLowerCase() });
    let isChild = false;

    if (!user) {
      user = await ChildAdmin.findOne({ email: email.trim().toLowerCase() });
      if (user) isChild = true;
    }

    if (isChild) {
      return res.status(403).json({
        error: "Child admins cannot reset passwords via this flow. Please contact your Super Admin."
      });
    }

    /* -----------------------------------------------------
     * 1️⃣ Save OTP to DB if user exists
     * ----------------------------------------------------- */
    if (user) {
      user.otpCode = tempOtp;
      user.otpExpiresAt = new Date(otpExpires);
      await user.save();
    } else {
      /* -----------------------------------------------------
       * 2️⃣ Save OTP in memory for non-existing emails
       * ----------------------------------------------------- */
      otpStore.set(email, {
        tempOtp,
        expires: otpExpires,
      });
    }

    /* -----------------------------------------------------
     * 3️⃣ Send Template Email
     * ----------------------------------------------------- */
    await sendTemplateEmail({
      templateName: "childAdminOtp.html", // your template filename
      to: email,
      subject: "Your Prithu OTP Code",
      embedLogo: true,
      placeholders: {
        otp: tempOtp,
        email: email,
        expiry: "5 minutes",
      },
    });

    console.log("OTP sent:", tempOtp);

    return res.json({
      success: true,
      message: "OTP sent to email",
    });

  } catch (error) {
    console.error("OTP sending error:", error);
    return res.status(500).json({ error: error.message });
  }
};


exports.newAdminVerifyOtp = async (req, res) => {
  const { otp, email } = req.body;

  const record = otpStore.get(email);

  if (!record) {
    return res.status(400).json({ error: 'No OTP requested for this email' });
  }

  if (Date.now() > record.expires) {
    otpStore.delete(email);
    return res.status(400).json({ error: 'OTP has expired' });
  }

  if (record.tempOtp === otp) {
    otpStore.delete(email);
    return res.status(200).json({
      verified: true,
      message: 'OTP verified successfully. You can now register.',
    });
  } else {
    return res.status(400).json({ error: 'Invalid OTP' });
  }
};

// Verify OTP
exports.existAdminVerifyOtp = async (req, res) => {
  try {
    const { otp, email } = req.body;
    if (!otp || !email) {
      return res.status(400).json({ error: 'Email and OTP are required' });
    }

    const admin = await Admin.findOne({ email: email.trim().toLowerCase(), otpCode: otp });
    const child = !admin ? await ChildAdmin.findOne({ email: email.trim().toLowerCase(), otpCode: otp }) : null;
    const user = admin || child;

    if (!user) {
      return res.status(400).json({ error: 'Invalid email or OTP' });
    }

    if (!user.otpCode || !user.otpExpiresAt || user.otpCode !== otp || user.otpExpiresAt < new Date()) {
      return res.status(400).json({ error: 'Invalid or expired OTP' });
    }

    res.json({ message: 'OTP verified successfully', email: user.email });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};



// Reset Password with OTP
exports.adminPasswordReset = async (req, res) => {
  try {
    const { email, newPassword } = req.body;
    let user = await Admin.findOne({ email: email.trim().toLowerCase() });
    if (!user) {
      user = await ChildAdmin.findOne({ email: email.trim().toLowerCase() });
    }

    if (!user) {
      return res.status(400).json({ error: 'Invalid email' });
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    user.passwordHash = passwordHash;

    // Clear OTP fields after successful reset
    user.otpCode = undefined;
    user.otpExpiresAt = undefined;

    await user.save();

    res.json({ message: 'Password reset successful' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};




// controllers/adminAuthController.js
exports.verifyToken = async (req, res) => {
  try {
    // values set by your auth middleware
    const role = req.role;
    const id = req.Id;
    const userName = req.userName;

    if (!id || !role || !userName) {
      return res.status(401).json({ error: "Admin not found or token invalid" });
    }

    return res.status(200).json({
      message: "Token verified successfully",
      admin: {
        id,
        role,
        userName,
      },
    });
  } catch (err) {
    console.error("Verify token error:", err);
    return res.status(401).json({ error: "Invalid or expired token" });
  }
};



exports.checkAvailability = async (req, res) => {
  try {
    const { email, userName } = req.query;

    if (!email && !userName) {
      return res.status(400).json({
        success: false,
        message: "email or userName is required",
      });
    }

    // Build search query
    const query = {};
    if (email) query.email = email.toLowerCase().trim();
    if (userName) query.userName = userName.trim();

    /* -------------------------------------------------------
     * 1️⃣ CHECK IN ADMIN TABLE
     * ------------------------------------------------------- */
    const adminExists = await Admin.findOne(query).select(
      "_id email userName adminType"
    );

    if (adminExists) {
      return res.status(200).json({
        success: true,
        exists: true,
        foundIn: "Admin",
        message: "Already taken in Admin",
        data: adminExists,
      });
    }

    /* -------------------------------------------------------
     * 2️⃣ CHECK IN CHILD ADMIN TABLE
     * ------------------------------------------------------- */
    const childExists = await ChildAdmin.findOne(query).select(
      "_id email userName childAdminId parentAdminId isActive"
    );

    if (childExists) {
      return res.status(200).json({
        success: true,
        exists: true,
        foundIn: "ChildAdmin",
        message: "Already taken in ChildAdmin",
        data: childExists,
      });
    }

    /* -------------------------------------------------------
     * 3️⃣ AVAILABLE
     * ------------------------------------------------------- */
    return res.status(200).json({
      success: true,
      exists: false,
      message: "Available",
    });

  } catch (error) {
    console.error("Availability check error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
      error: error.message,
    });
  }
};



// Admin Logout
exports.adminLogout = async (req, res) => {
  try {
    const adminId = req.Id;
    const role = req.role;

    if (role === 'Child_Admin') {
      const now = new Date();

      // 1. Close the current "Online" record if it exists
      const lastOnline = await ChildAdminActivity.findOne({
        childAdminId: adminId,
        status: "Online",
        offlineTo: null // Assuming this is how we track "still online"
      }).sort({ createdAt: -1 });

      if (lastOnline) {
        lastOnline.offlineTo = now;
        lastOnline.logoutTime = now;
        const durationMs = now - lastOnline.loginTime;
        const hours = Math.floor(durationMs / (1000 * 60 * 60));
        const minutes = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60));
        lastOnline.duration = `${hours}h ${minutes}m`;
        // Keep status as "Online" to indicate it was a successful session
        await lastOnline.save();
      }

      // 2. Create new offline record starting now (for dashboard duration tracking)
      await ChildAdminActivity.create({
        childAdminId: adminId,
        date: now.toISOString().split('T')[0],
        offlineFrom: now,
        loginTime: now, // For schema compliance
        status: "Offline"
      });

      await ChildAdmin.findByIdAndUpdate(adminId, {
        isOnline: false,
        lastLogoutTime: now,
      });
    }

    // In a stateless JWT, we can't "invalidate" the token server-side without a blacklist.
    // However, the client is responsible for discarding it.
    // Steps here are mainly to update the online status.

    return res.status(200).json({ success: true, message: "Logged out successfully" });
  } catch (error) {
    console.error("Logout error:", error);
    return res.status(500).json({ error: "Logout failed" });
  }
};

// Heartbeat for activity tracking
exports.childAdminHeartbeat = async (req, res) => {
  try {
    const adminId = req.Id;
    const role = req.role;

    if (role !== 'Child_Admin') {
      return res.status(200).json({ success: true }); // Ignore for main admin
    }

    const now = new Date();
    const child = await ChildAdmin.findById(adminId);

    if (!child) return res.status(404).json({ error: "Child Admin not found" });

    // If was offline, mark online and close offline record
    if (!child.isOnline) {
      const lastOffline = await ChildAdminActivity.findOne({
        childAdminId: child._id,
        offlineTo: null
      }).sort({ createdAt: -1 });

      if (lastOffline) {
        lastOffline.offlineTo = now;
        const durationMs = now - lastOffline.offlineFrom;
        const hours = Math.floor(durationMs / (1000 * 60 * 60));
        const minutes = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60));
        lastOffline.duration = `${hours}h ${minutes}m`;
        await lastOffline.save();
      }
      child.isOnline = true;

      // ✅ Create a new "Online" activity record
      await ChildAdminActivity.create({
        childAdminId: child._id,
        date: now.toISOString().split('T')[0],
        loginTime: now,
        status: "Online"
      });
    }

    child.lastActivityTime = now;
    await child.save();

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error("Heartbeat error:", error);
    return res.status(500).json({ error: "Heartbeat failed" });
  }
};

// Admin Dashboard Stats
exports.getChildAdminStats = async (req, res) => {
  try {
    if (req.role !== 'Admin') {
      return res.status(403).json({ error: "Access denied" });
    }

    const totalChildAdmins = await ChildAdmin.countDocuments();
    const onlineChildAdmins = await ChildAdmin.countDocuments({ isOnline: true });

    // Get offline history (recent 50)
    const offlineHistory = await ChildAdminActivity.find({ status: "Offline" })
      .populate('childAdminId', 'userName email')
      .sort({ createdAt: -1 })
      .limit(50);

    return res.status(200).json({
      totalChildAdmins,
      onlineChildAdmins,
      offlineHistory
    });
  } catch (error) {
    console.error("Stats error:", error);
    return res.status(500).json({ error: "Failed to fetch stats" });
  }
};
