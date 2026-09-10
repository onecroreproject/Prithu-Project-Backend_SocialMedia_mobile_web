
const makeSessionService =require ("../../services/sessionService.js");
const User =require( "../../models/userModels/userModel.js");

const sessionService = makeSessionService(User);

exports.listDevices=async(req, res)=> {
  try {
    const userId = req.user.sub;
    const devices = await sessionService.listSessions(userId);
    res.json({ devices });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "err" });
  }
}

exports.logoutDevice=async(req, res)=> {
  try {
    const userId = req.user.sub;
    const { deviceId } = req.body;
    if (!deviceId) return res.status(400).json({ message: "Missing deviceId" });
    await sessionService.removeSession(userId, deviceId);
    res.json({ message: "Device removed" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "err" });
  }
}
