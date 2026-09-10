// const Account = require('../models/accountSchemaModel');
// const User = require('../models/userModels/userModel');
// const jwt = require('jsonwebtoken');
// const { v4: uuidv4 } = require('uuid');
// const Session = require('../models/userModels/userSession-Device/usersessionSchema');
// const { getIO } = require("../middlewares/webSocket");
 
 
// // Add a new account (User → Business/Creator)
// // exports.addAccount = async (req, res) => {
// //   try {
// //     const userId = req.Id; // from auth middleware
// //     const { type, deviceId, deviceType,refreshToken } = req.body;
 
// //     if (!type) return res.status(400).json({ message: "Account type is required" });
 
// //     const formattedType = type.charAt(0).toUpperCase() + type.slice(1).toLowerCase();
 
// //     // Check if account already exists
// //     let account = await Account.findOne({ userId, type: formattedType });
// //     if (account) return res.status(400).json({ message: `${formattedType} account already exists` });
 
// //     // Create new account
// //     account = new Account({ userId, type: formattedType });
// //     await account.save();
 
// //     // Update user's roles array and activeAccount
// //     const user = await User.findById(userId);
// //     if (!user.roles.includes(formattedType)) user.roles.push(formattedType);
// //     user.activeAccount = account._id;
// //     user.isOnline = true; // mark user online
// //     user.lastSeenAt = null;
// //     await user.save();
 
// //     // Generate JWT token
// //     const token = jwt.sign(
// //       { userId, role: formattedType, accountId: account._id, userName: user.userName },
// //       process.env.JWT_SECRET,
// //       { expiresIn: '32d' }
// //     );
 
// //     let session = await Session.findOne({ userId, deviceId });
// //     if (!session) {
// //       session = await Session.create({
// //         userId,
// //         deviceId: deviceId || require('uuid').v4(),
// //         deviceType: deviceType || 'web',
// //         isOnline: true,
// //         accountId: account._id,
// //         lastSeenAt: null,
// //         refreshToken: refreshToken, // optional
// //       });
// //     } else {
// //       session.role = formattedType;
// //       session.accountId = account._id;
// //       session.isOnline = true;
// //       session.lastSeenAt = null;
// //       await session.save();
// //     }
 
// //     // Optional: emit socket event
// //      const io = getIO();
// //      io.emit("userOnline", { userId });
 
// //     res.status(201).json({ message: `${formattedType} account created`, account, token, sessionId: session._id });
 
// //   } catch (err) {
// //     console.error("AddAccount Error:", err);
// //     res.status(500).json({ message: "Error creating account", error: err.message });
// //   }
// // };
 
 
 
 
// // exports.switchToCreator = async (req, res) => {
// //   try {
// //     const userId = req.Id;// from auth middleware
// //     const deviceId = req.body.deviceId;
// //     const refreshToken = req.body.refreshToken;
// //     const deviceType=req.body.deviceType;// deviceId from frontend
 
// //     if (!userId) return res.status(400).json({ message: "User ID is required" });
 
// //     // 1️⃣ Find Creator account
// //     const account = await Account.findOne({ userId, type: "Creator" });
// //     if (!account) return res.status(404).json({ message: "Creator account not found" });
 
// //     // 2️⃣ Update activeAccount in User
// //     const user = await User.findById(userId);
// //     user.activeAccount = account._id;
// //     user.isOnline = true;
// //     user.lastSeenAt = null;
// //     await user.save();
 
// //     // 3️⃣ Update / Create Session
// //     let session = await Session.findOne({ userId, deviceId });
// //     if (!session) {
// //       session = await Session.create({
// //         userId,
// //         deviceId: deviceId || uuidv4(),
// //         deviceType: deviceType || "web",
// //         isOnline: true,
// //         accountId: account._id,
// //         role: "Creator",
// //         lastSeenAt: new Date(),
// //         refreshToken: refreshToken, // optional: add refresh token if needed
// //       });
// //     } else {
// //       session.role = "Creator";
// //       session.accountId = account._id;
// //       session.isOnline = true;
// //       session.lastSeenAt = new Date();
// //       await session.save();
// //     }
 
// //     // 4️⃣ Generate JWT token for switched account
// //     const token = jwt.sign(
// //       { userId, role: "Creator", accountId: account._id, userName: user.userName },
// //       process.env.JWT_SECRET,
// //       { expiresIn: "32d" }
// //     );
 
// //     // 5️⃣ Optional: Emit Socket.IO event for admin/friends
// //      const io = getIO();
// //      io.emit("userSwitchedAccount", { userId, newRole: "Creator" });
 
// //     res.status(200).json({ message: "Switched to Creator account", account, token, sessionId: session._id });
 
// //   } catch (err) {
// //     console.error("SwitchToCreator Error:", err);
// //     res.status(500).json({ message: "Error switching account", error: err.message });
// //   }
// // };
 
 
 
 
// exports.switchToUserAccount = async (req, res) => {
//   try {
//     const userId = req.Id;
//     const accountId=req.accountId// from auth middleware
//     const deviceId = req.body.deviceId;
//     const refreshToken = req.body.refreshToken;
//     const deviceType=req.body.deviceType;// deviceId from frontend
 
//     if (!userId) return res.status(400).json({ message: "User ID is required" });
 
//     // 1️⃣ Clear active account in User
//     const user = await User.findById(userId);
//     user.activeAccount = null;
//     user.isOnline = true; // keep user online
//     user.lastSeenAt = new Date();
//     await user.save();
 
//     // 2️⃣ Update / Create Session
//     let session = await Session.findOne({ userId, deviceId });
//     if (!session) {
//       session = await Session.create({
//         userId,
//         deviceId,
//         deviceType: deviceType || "web",
//         role: "User",
//         accountId: accountId,
//         isOnline: true,
//         lastSeenAt: new Date(),
//         refreshToken: refreshToken, // optional
//       });
//     } else {
//       session.role = "User";
//       session.accountId = accountId;
//       session.isOnline = true;
//       session.lastSeenAt = new Date();
//       await session.save();
//     }
 
//     // 3️⃣ Generate JWT token for switched account
//     const token = jwt.sign(
//       { userId, role: "User", userName: user.userName },
//       process.env.JWT_SECRET,
//       { expiresIn: "32d" }
//     );
 
//     // 4️⃣ Optional: Emit Socket.IO event for admin/friends
//      const io = getIO();
//     io.emit("userSwitchedAccount", { userId, newRole: "User" });
 
//     res.status(200).json({ message: "Switched back to User account", token, sessionId: session._id });
 
//   } catch (err) {
//     console.error("switchToUserAccount Error:", err);
//     res.status(500).json({ message: "Error switching to User account", error: err.message });
//   }
// };
 
 
 
 
// exports.checkAccountStatus = async (req, res) => {
//   try {
//     const userId = req.Id; // from auth middleware
//     if (!userId) {
//       return res.status(400).json({ message: "User ID is required" });
//     }
 
//     // Fetch user with activeAccount type only
//     const user = await User.findById(userId)
//       .populate({
//         path: "activeAccount",
//         select: "type",
//         options: { lean: true },
//       })
//       .lean(); // lean() for faster performance
 
//     if (!user) {
//       return res.status(404).json({ message: "User not found" });
//     }
 
//     // Fetch all accounts' types for the user
//     const accounts = await Account.find({ userId }).select("type").lean();
//     const roles = accounts.map(acc => acc.type);
 
//     res.status(200).json({
//       message: "Account status fetched successfully",
//       roles,                         // all account types
//       activeAccountType: user.activeAccount?.type || null, // current active account
//       hasAccounts: roles.length > 0, // true if user has any accounts
//     });
//   } catch (err) {
//     console.error("CheckAccountStatus Error:", err);
//     res.status(500).json({ message: "Server error", error: err.message });
//   }
// };