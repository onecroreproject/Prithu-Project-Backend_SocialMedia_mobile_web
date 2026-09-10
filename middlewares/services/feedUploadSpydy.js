const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const { Readable } = require("stream");
const { v4: uuidv4 } = require("uuid");
const { getVideoDurationInSeconds } = require("get-video-duration");
const Feed = require("../../models/feedModel");

// Base folder -> media/feed (No user folder)
const BASE_DIR = path.join(__dirname, "../../media/feed");
if (!fs.existsSync(BASE_DIR)) fs.mkdirSync(BASE_DIR, { recursive: true });

// timestamp helper
const timestamp = () => {
  const now = new Date();
  return `${now.toISOString().split("T")[0]}_${now
    .toTimeString()
    .split(" ")[0]
    .replace(/:/g, "-")}`;
};

// multer storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const userId = req.Id || req.body.userId;
    const isImage = file.mimetype.startsWith("image/");
    const typeFolder = isImage ? "image" : "video"; // singular per request

    // Structure: media/feed/image or media/feed/video
    const uploadPath = path.join(
      BASE_DIR,
      typeFolder
    );

    fs.mkdirSync(uploadPath, { recursive: true });

    req.feedFolderType = typeFolder;   // images | videos
    req.feedUploadPath = uploadPath;

    cb(null, uploadPath);
  },

  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const userId = req.Id || req.body.userId;

    const filename = `${userId}_${timestamp()}_${uuidv4()}${ext}`;

    req.feedSavedName = filename;
    req.feedSavedPath = path.join(req.feedUploadPath, filename);

    cb(null, filename);
  }
});

// multer instance
const feedUpload = multer({
  storage,
  limits: { fileSize: 500 * 1024 * 1024 } // 500MB max for videos
});

// hash generator
const generateFileHash = (buffer) =>
  crypto.createHash("md5").update(buffer).digest("hex");

// DELETE FUNCTION (You will use this in controllers)
function deleteFeedFile(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log("🗑️ Deleted feed file:", filePath);
    }
  } catch (err) {
    console.error("❌ Error deleting feed file:", err.message);
  }
}

// duplicate + video duration check
const userProcessFeedFile = async (req, res, next) => {
  if (!req.file) return next();

  try {
    const buffer = fs.readFileSync(req.feedSavedPath);

    const fileHash = generateFileHash(buffer);
    req.fileHash = fileHash;

    // duplicate check
    const existing = await Feed.findOne({ fileHash }).lean();
    if (existing) {
      deleteFeedFile(req.feedSavedPath);
      return res.status(409).json({
        message: "This file already exists",
        feedId: existing._id,
      });
    }

    // video duration check
    if (req.file.mimetype.startsWith("video/")) {
      const duration = await getVideoDurationInSeconds(
        Readable.from(buffer)
      );

      if (duration > 60) {
        deleteFeedFile(req.feedSavedPath);
        return res
          .status(400)
          .json({ message: "Video duration exceeds 60 seconds" });
      }

      req.videoDuration = duration;
    }

    next();
  } catch (err) {
    console.error("Feed processing error:", err);
    return res.status(500).json({ message: "Feed processing failed" });
  }
};

// attach final file info
const attachFeedFile = (req, res, next) => {
  if (!req.file) return next();

  // ✅ Use centralized storage engine to generate correct URL
  const { getMediaUrl } = require("../../utils/storageEngine");

  // Construct relative path for DB (e.g. /media/feed/image/...)
  const relativePath = `/media/feed/${req.feedFolderType}/${req.feedSavedName}`;

  req.localFile = {
    url: getMediaUrl(relativePath), // Let storageEngine handle domain & prefixes
    filename: req.feedSavedName,
    folder: req.feedFolderType,
    path: req.feedSavedPath,     // full local path
    uploadedAt: new Date(),
    fileHash: req.fileHash,
    videoDuration: req.videoDuration || null,
  };

  next();
};

module.exports = {
  feedUpload,
  userProcessFeedFile,
  attachFeedFile,
  deleteFeedFile  // EXPORT DELETE FUNCTION
};
