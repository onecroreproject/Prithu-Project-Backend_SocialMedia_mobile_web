const crypto = require("crypto");
const { v4: uuidv4 } = require("uuid");
const { logUserDevice } = require('../controllers/deviceDetailController');
const { timeAgo } = require('../middlewares/userStatusTimeAgo');
const StoreUserDevice=require('../models/devicetrackingModel')

function makeSessionService(UserModel) {

  // Create a new session
  async function createSession( id,role,roleRef,token, req ) {
    
    const deviceId = uuidv4();
    const user1={
      _id:id,
      role,
      roleRef,
      token,
      deviceId
    }
    // Log device info
    await logUserDevice(user1, req);
  

    // Fetch user
    const user = await UserModel.findById(id);
   
    if (!user) throw new Error("User not found");
 
    // Create session ID
    const sessionId = crypto.randomBytes(16).toString("hex");

    // Update user status
    user.activeSession = sessionId;
    user.isOnline = true;
    user.lastSeenAt = new Date();
    user.lastLoginAt = new Date();
    await user.save();


   
    return sessionId;

 
  }

  // List all sessions/devices for a user
  async function listSessions(userId) {
  const sessions = await StoreUserDevice.find({ userId }).lean();
  return sessions || [];
}


  // Remove a specific session/device
 async function removeSession(userId, deviceId) {
  await StoreUserDevice.findOneAndDelete({
    userId: userId,
    deviceId: deviceId
  });

  // Optional: check if user still has active devices
  const remainingDevices = await StoreUserDevice.find({ userId });
  if (remainingDevices.length === 0) {
    await UserModel.findByIdAndUpdate(userId, {
      isOnline: false,
      lastSeen: new Date()
    });
  }

    // Update isOnline depending on remaining devices
    const user = await UserModel.findById(userId).lean();
    if (!user || !user.devices || user.devices.length === 0) {
      await UserModel.findByIdAndUpdate(userId, { isOnline: false, lastSeenAt: new Date() });
    }
  }

  return {
    createSession,
    listSessions,
    removeSession,
  };

}

module.exports = makeSessionService;
