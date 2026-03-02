const multer = require("multer");
const { saveFile } = require("../../utils/storageEngine");

const storage = multer.memoryStorage();

const upload = multer({
    storage,
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB max
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Only images are allowed'), false);
        }
    }
});

const processBlogImage = async (req, res, next) => {
    if (!req.file) return next();

    try {
        const result = await saveFile(req.file, {
            type: 'blog',
            subType: 'image'
        });

        req.blogImage = result;
        next();
    } catch (error) {
        console.error("Error processing blog image:", error);
        res.status(500).json({ message: "Error processing image upload" });
    }
};

module.exports = {
    blogUpload: upload.single('image'),
    processBlogImage
};
