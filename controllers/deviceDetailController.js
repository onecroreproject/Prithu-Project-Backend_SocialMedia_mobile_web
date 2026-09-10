const UserDevice = require("../models/devicetrackingModel");
const { extractDeviceInfo } = require('../middlewares/deviceTracking');
const User = require('../models/userModels/userModel');

exports.logUserDevice = async (user1, req) => {
  try {
    const deviceInfo = extractDeviceInfo(req);

    // Define filter: match by userId + roleRef + deviceId (safe unique key per device)
    const deviceFilter = {
      userId: user1._id,
      roleRef: user1.roleRef,
      deviceId: user1.deviceId, // Must come from client/device
    };

    // Define update
    const deviceUpdate = {
      ...deviceInfo,
      roleRef: user1.roleRef,
      lastLoginAt: new Date(),
    };

    // Upsert device (insert if new, update if exists)
    const updatedDevice = await UserDevice.findOneAndUpdate(
      deviceFilter,
      { $set: deviceUpdate },
      { new: true, upsert: true }
    );

    // Add device reference to User if roleRef is "User"
    if (user1.roleRef === 'User') {
      await User.findByIdAndUpdate(
        {_id:user1._id,_id:updatedDevice._id},
        { $addToSet: { devices: updatedDevice._id } } // prevent duplicate refs
      );
    }

    return updatedDevice;
  } catch (error) {
    console.error("Error logging user device:", error);
    throw error;
  }
};
