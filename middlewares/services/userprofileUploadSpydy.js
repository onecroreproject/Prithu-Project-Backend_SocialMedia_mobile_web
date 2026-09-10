const multer = require("multer");
const { saveFile } = require("../../utils/storageEngine");

// Use memory storage as storageEngine will handle saving to disk
const storage = multer.memoryStorage();

// Multer handler
const userUpload = multer({
  storage,
  limits: { fileSize: 200 * 1024 * 1024 }, // 10MB max
});

// Attach final file info
const attachUserFile = async (req, res, next) => {
  if (!req.file) return next();

  try {
    const userId = req.Id;
    if (!userId) throw new Error("User ID is required for upload");

    const isCover = req.baseUrl.includes("/cover") || req.path.includes("/cover");

    // users/{userId}/avatar/{original|modifyavatar}
    // We use isModify: true for 'modifyavatar' (e.g. background removed)
    // Here we use isCover to possibly distinguish, but let's stick to 'original' for standard uploads
    const savedFile = await saveFile(req.file, {
      type: 'user',
      id: userId.toString(),
      isModify: false
    });

    req.localFile = {
      url: savedFile.url, // Full absolute URL
      filename: savedFile.filename,
      path: savedFile.path,
      uploadedAt: new Date(),
    };

    next();
  } catch (err) {
    console.error("❌ Profile upload failed:", err.message);
    res.status(500).json({ success: false, message: "Upload failed", error: err.message });
  }
};

const fs = require('fs');
function deleteLocalFile(filePath) {
  try {
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log("🗑 Deleted local file:", filePath);
    }
  } catch (err) {
    console.error("❌ Failed to delete local file:", err.message);
  }
}

module.exports = { userUpload, attachUserFile, deleteLocalFile };
