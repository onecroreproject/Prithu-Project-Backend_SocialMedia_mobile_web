/* --------------------------------------------------
   CONTROLLER: GOOGLE DRIVE DISABLED
-------------------------------------------------- */
exports.getDriveDashboard = async (req, res) => {
  return res.json({
    success: true,
    driveAccount: "Disabled",
    storage: { limitGB: 0, usedGB: 0, freeGB: 0, usagePercent: 0 },
    usage: { imagesGB: 0, videosGB: 0 },
    roles: {
      admin: { imagesGB: 0, videosGB: 0, files: 0 },
      childAdmin: { imagesGB: 0, videosGB: 0, files: 0 },
      users: { imagesGB: 0, videosGB: 0, files: 0 },
    },
    recentUploads: [],
    oauth: { status: "inactive", mode: "disabled", lastChecked: new Date() },
    message: "Google Drive storage is disabled."
  });
};

exports.driveCommand = async (req, res) => {
  return res.status(400).json({
    success: false,
    message: "Google Drive commands are disabled."
  });
};

