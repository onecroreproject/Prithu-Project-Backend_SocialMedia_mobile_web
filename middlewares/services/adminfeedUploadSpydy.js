/*
|--------------------------------------------------------------------------
| ADMIN & CHILD-ADMIN PROFILE UPLOAD  (single file)
| ADMIN FEED UPLOAD                    (multiple files)
|--------------------------------------------------------------------------
*/

const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const { Readable } = require("stream");
const { v4: uuidv4 } = require("uuid");
const { getVideoDurationInSeconds } = require("get-video-duration");
const Feed = require("../../models/feedModel");

/* -------------------------------------------------------
| BASE DIRECTORIES
---------------------------------------------------------*/
const BASE_MEDIA_DIR = path.join(__dirname, "../../media");
const BASE_PROFILE_DIR = BASE_MEDIA_DIR;                 // media/admin | media/childAdmin
const BASE_FEED_DIR = path.join(BASE_MEDIA_DIR, "feed", "admin"); // media/feed/admin

if (!fs.existsSync(BASE_MEDIA_DIR)) fs.mkdirSync(BASE_MEDIA_DIR, { recursive: true });
if (!fs.existsSync(BASE_FEED_DIR)) fs.mkdirSync(BASE_FEED_DIR, { recursive: true });

/* -------------------------------------------------------
| TIMESTAMP HELPER
---------------------------------------------------------*/
const timestamp = () => {
  const now = new Date();
  return `${now.toISOString().split("T")[0]}_${now
    .toTimeString()
    .split(" ")[0]
    .replace(/:/g, "-")}`;
};

/* -------------------------------------------------------
|--------------------------------------------------------------------------
| 1️⃣ ADMIN / CHILD ADMIN PROFILE PIC UPLOAD (Single File)
|--------------------------------------------------------------------------
---------------------------------------------------------*/
const profileStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const id = req.Id;
    const isChild = req.role === "Child_Admin";

    const folder = isChild ? "childAdmin" : "admin";
    const uploadPath = path.join(BASE_PROFILE_DIR, folder, String(id), "profilepic");

    fs.mkdirSync(uploadPath, { recursive: true });

    req.uploadPath = uploadPath;
    req.uploadFolderType = folder;

    cb(null, uploadPath);
  },

  filename: (req, file, cb) => {
    const id = req.Id;
    const ext = path.extname(file.originalname);
    const fileName = `${id}_${timestamp()}_${uuidv4()}${ext}`;

    req.savedFileName = fileName;
    cb(null, fileName);
  }
});

const adminUploadProfile = multer({
  storage: profileStorage,
  limits: { fileSize: 200 * 1024 * 1024 }, // 10MB
});

// Attach uploaded file info
const attachAdminProfileFile = (req, res, next) => {
  if (!req.file) return next();

  const backendUrl = (process.env.BACKEND_URL || '').replace(/\/$/, "");
  const fileUrl = `${backendUrl}/media/${req.uploadFolderType}/${req.Id}/profilepic/${req.savedFileName}`;

  req.localFile = {
    url: fileUrl,
    path: path.join(req.uploadPath, req.savedFileName),
    filename: req.savedFileName,
    folder: req.uploadFolderType,
    uploadedAt: new Date(),
  };

  next();
};

// Delete local file
function deleteLocalProfileFile(filePath) {
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch (err) {
    console.log("❌ Failed to delete old profile:", err.message);
  }
}

/* -------------------------------------------------------
|--------------------------------------------------------------------------
| 2️⃣ ADMIN FEED UPLOAD (MULTIPLE FILES: image/video)
|--------------------------------------------------------------------------
---------------------------------------------------------*/
const feedStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const adminId = req.Id;
    const folderType = file.mimetype.startsWith("image/") ? "images" : "videos";
    const uploadPath = path.join(BASE_FEED_DIR, String(adminId), folderType);

    fs.mkdirSync(uploadPath, { recursive: true });

    file._folder = folderType;
    file._uploadPath = uploadPath;

    cb(null, uploadPath);
  },

  filename: (req, file, cb) => {
    const adminId = req.Id;
    const ext = path.extname(file.originalname);
    const filename = `${adminId}_${timestamp()}_${uuidv4()}${ext}`;

    file._savedName = filename;
    file._savedPath = path.join(file._uploadPath, filename);

    cb(null, filename);
  }
});

const adminUploadFeed = multer({
  storage: feedStorage,
  limits: { fileSize: 200 * 1024 * 1024 }, // 50MB
});

function deleteLocalAdminFile(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log("🗑 Deleted admin feed file:", filePath);
    }
  } catch (err) {
    console.error("❌ Failed:", err.message);
  }
}

const generateFileHash = (buffer) =>
  crypto.createHash("md5").update(buffer).digest("hex");

// Check duplicates & duration
const adminProcessFeedFile = async (req, res, next) => {
  const files = req.files || [];
  if (files.length === 0) return next();

  try {
    for (const file of files) {
      const buffer = fs.readFileSync(file._savedPath);

      const fileHash = generateFileHash(buffer);
      file._fileHash = fileHash;

      // Duplicate check
      const duplicateFeed = await Feed.findOne({ fileHash }).lean();
      if (duplicateFeed) {
        deleteLocalAdminFile(file._savedPath);
        return res.status(409).json({
          message: "This feed already exists",
          feedId: duplicateFeed._id,
        });
      }

      // Duration check
      if (file.mimetype.startsWith("video/")) {
        const duration = await getVideoDurationInSeconds(Readable.from(buffer));

        if (duration > 60) {
          deleteLocalAdminFile(file._savedPath);
          return res.status(400).json({ message: "Video exceeds 60 seconds" });
        }

        file._duration = duration;
      }
    }

    next();
  } catch (err) {
    console.error("Feed processing error:", err);
    return res.status(500).json({ message: "File processing failed" });
  }
};

// Attach feed files list
const attachAdminFeedFiles = (req, res, next) => {
  const files = req.files || [];
  if (files.length === 0) return next();

  const backendUrl = (process.env.BACKEND_URL || '').replace(/\/$/, "");

  req.localFiles = files.map((file) => ({
    url: `${backendUrl}/media/feed/admin/${req.Id}/${file._folder}/${file._savedName}`,
    filename: file._savedName,
    path: file._savedPath,
    folder: file._folder,
    fileHash: file._fileHash,
    duration: file._duration || null,
    mimetype: file.mimetype,
    originalname: file.originalname,
  }));

  next();
};

/* -------------------------------------------------------
| EXPORTS
---------------------------------------------------------*/
module.exports = {
  // Profile Upload
  adminUploadProfile,
  attachAdminProfileFile,
  deleteLocalProfileFile,

  // Feed Upload
  adminUploadFeed,
  adminProcessFeedFile,
  attachAdminFeedFiles,
  deleteLocalAdminFile,
};
