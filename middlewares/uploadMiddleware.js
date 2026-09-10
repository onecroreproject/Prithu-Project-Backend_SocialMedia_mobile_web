const multer = require("multer");
const path = require("path");
const crypto = require("crypto");
const { v4: uuidv4 } = require("uuid");
const { getVideoDurationInSeconds } = require("get-video-duration");
const { Readable } = require("stream");
const sharp = require("sharp");
const ffmpeg = require("fluent-ffmpeg");
const ffprobeInstaller = require("@ffprobe-installer/ffprobe");
ffmpeg.setFfprobePath(ffprobeInstaller.path);

// Use memory storage so we can process the buffer and then decide where to save it
const storage = multer.memoryStorage();

const validateFile = (file) => {
    const allowedImageTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    const allowedVideoTypes = ['video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/webm', 'video/x-matroska'];
    const allowedAudioTypes = ['audio/mpeg', 'audio/mp3', 'audio/wav'];

    if (file.mimetype.startsWith('image/') && !allowedImageTypes.includes(file.mimetype)) throw new Error('Invalid image format');
    if (file.mimetype.startsWith('video/') && !allowedVideoTypes.includes(file.mimetype)) throw new Error('Invalid video format');
    if (file.mimetype.startsWith('audio/') && !allowedAudioTypes.includes(file.mimetype)) throw new Error('Invalid audio format');

    return true;
};

const upload = multer({
    storage,
    limits: { fileSize: 200 * 1024 * 1024 }, // 100MB max
    fileFilter: (req, file, cb) => {
        try {
            validateFile(file);
            cb(null, true);
        } catch (error) {
            cb(error);
        }
    }
});

/**
 * Middleware to attach basic file info and hash
 */
const processUploadedFiles = async (req, res, next) => {
    const files = req.files;
    if (!files) return next();

    try {
        const processFile = async (file) => {
            const hash = crypto.createHash('md5').update(file.buffer).digest('hex');
            file.fileHash = hash;

            // Extract dimensions and duration
            if (file.mimetype.startsWith('image/')) {
                try {
                    const metadata = await sharp(file.buffer).metadata();
                    file.dimensions = {
                        width: metadata.width,
                        height: metadata.height,
                        ratio: (metadata.width / metadata.height).toFixed(4)
                    };
                } catch (err) {
                    console.error("Sharp metadata failed:", err);
                    file.dimensions = null;
                }
            } else if (file.mimetype.startsWith('video/')) {
                try {
                    // Extract duration
                    const duration = await getVideoDurationInSeconds(Readable.from(file.buffer));
                    file.duration = duration;

                    // Extract dimensions using ffprobe
                    const metadata = await new Promise((resolve, reject) => {
                        const stream = Readable.from(file.buffer);
                        ffmpeg.ffprobe(stream, (err, metadata) => {
                            if (err) reject(err);
                            else resolve(metadata);
                        });
                    });

                    const videoStream = metadata.streams.find(s => s.codec_type === 'video');
                    if (videoStream) {
                        file.dimensions = {
                            width: videoStream.width,
                            height: videoStream.height,
                            ratio: (videoStream.width / videoStream.height).toFixed(4)
                        };
                    }
                } catch (err) {
                    console.error("Video processing failed:", err);
                    file.duration = null;
                    file.dimensions = null;
                }
            } else if (file.mimetype.startsWith('audio/')) {
                try {
                    const duration = await getVideoDurationInSeconds(Readable.from(file.buffer));
                    file.duration = duration;
                } catch (err) {
                    console.error("Audio duration extraction failed:", err);
                    file.duration = null;
                }
            }

            return file;
        };

        if (Array.isArray(files)) {
            // Use Promise.all since processFile is now async
            req.localFilesArr = await Promise.all(files.map(processFile));
            req.localFiles = req.localFilesArr;
        } else if (typeof files === 'object') {
            // For .fields() or .array()
            req.localFiles = {};
            for (const fieldname in files) {
                req.localFiles[fieldname] = await Promise.all(files[fieldname].map(processFile));
            }

            // Flatten for controllers that expect req.localFiles as an array (like adminFeedUpload)
            if (files['files']) {
                req.localFilesArr = await Promise.all(files['files'].map(processFile));
            } else {
                // If there are other file fields, maybe flatten them all?
                // For now, let's keep it specific to the known fields
                let flattened = [];
                for (const fieldname in req.localFiles) {
                    flattened = flattened.concat(req.localFiles[fieldname]);
                }
                req.localFilesArr = flattened;
            }

            if (files['audio']) {
                req.localAudioFile = await processFile(files['audio'][0]);
            }
        } else if (req.file) {
            // For .single()
            req.localFile = await processFile(req.file);
            req.localFilesArr = [req.localFile];
        }

        next();
    } catch (err) {
        next(err);
    }
};

module.exports = {
    upload,
    processUploadedFiles,
    validateFile
};
