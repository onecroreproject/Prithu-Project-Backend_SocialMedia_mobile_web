const multer = require("multer");
const { saveFile } = require("../../utils/storageEngine");

const storage = multer.memoryStorage();

const upload = multer({
    storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max for profile pics
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Only images are allowed'), false);
        }
    }
});

const processChildAdminAvatar = async (req, res, next) => {
    if (!req.file) return next();

    try {
        const { id } = req.params;
        const result = await saveFile(req.file, {
            type: 'child-admin',
            id: id,
            subType: 'avatar'
        });

        req.childAdminAvatar = result;
        next();
    } catch (error) {
        console.error("Error processing child admin avatar:", error);
        res.status(500).json({ message: "Error processing avatar upload" });
    }
};

module.exports = {
    childAdminAvatarUpload: upload.single('file'),
    processChildAdminAvatar
};
