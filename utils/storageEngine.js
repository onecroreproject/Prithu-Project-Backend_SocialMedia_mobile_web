const fs = require('fs');
const path = require('path');

const BASE_MEDIA_DIR = path.join(__dirname, '../media');

/**
 * Ensure directory exists
 */
const ensureDir = (dirPath) => {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
};

/**
 * Generate a timestamped filename
 */
const generateFilename = (originalName) => {
    const now = new Date();

    // Format: YYYYMMDD_HHMMSS
    const dateStr = now.getFullYear() +
        String(now.getMonth() + 1).padStart(2, '0') +
        String(now.getDate()).padStart(2, '0');

    const timeStr = String(now.getHours()).padStart(2, '0') +
        String(now.getMinutes()).padStart(2, '0') +
        String(now.getSeconds()).padStart(2, '0') +
        String(now.getMilliseconds()).padStart(3, '0');

    // Sanitize and limit original name
    const baseName = path.parse(originalName).name
        .replace(/[^a-z0-9]/gi, '_')
        .toLowerCase()
        .substring(0, 30);

    const random = Math.random().toString(36).substring(2, 7);
    const ext = path.extname(originalName) || '.jpg';

    return `${baseName}_${dateStr}_${timeStr}_${random}${ext}`;
};

/**
 * Save file to local storage based on the requested structure
 */
exports.saveFile = async (file, options = {}) => {
    const {
        type, // 'user', 'admin', 'child-admin', 'feed', 'upload', 'temp'
        id,   // userId, adminId, etc.
        subType, // 'avatar', 'video', 'image', etc.
        categorySlug, // for feeds
        jobId, // for temp
        isModify = false
    } = options;

    let targetDir = BASE_MEDIA_DIR;

    switch (type) {
        case 'user':
            targetDir = path.join(BASE_MEDIA_DIR, 'user', id, isModify ? 'modify' : '');
            break;
        case 'admin':
            targetDir = path.join(BASE_MEDIA_DIR, 'admins', id, 'avatar');
            break;
        case 'child-admin':
            targetDir = path.join(BASE_MEDIA_DIR, 'child-admins', id, 'avatar');
            break;
        case 'feed':
            // Flattened structure: media/feed/image/filename
            const startFolder = subType === 'image' ? 'image' : (subType === 'video' ? 'video' : 'media');
            targetDir = path.join(BASE_MEDIA_DIR, 'feed', startFolder);
            break;
        case 'upload':
            targetDir = path.join(BASE_MEDIA_DIR, 'uploads', subType === 'video' ? 'videos' : 'images');
            break;
        case 'temp':
            targetDir = path.join(BASE_MEDIA_DIR, 'temp', jobId || 'default');
            break;
        case 'blog':
            targetDir = path.join(BASE_MEDIA_DIR, 'blogs');
            break;
        case 'update':
            targetDir = path.join(BASE_MEDIA_DIR, 'updates');
            break;
        default:
            targetDir = path.join(BASE_MEDIA_DIR, 'uploads', 'others');
    }

    ensureDir(targetDir);

    const fileName = generateFilename(file.originalname);
    const filePath = path.join(targetDir, fileName);

    // If file has buffer (from memoryStorage)
    if (file.buffer) {
        fs.writeFileSync(filePath, file.buffer);
    } else if (file.path) {
        // If file is already on disk (from diskStorage) - move it
        fs.renameSync(file.path, filePath);
    } else {
        throw new Error('No file content found for saving');
    }

    // Generate relative path for URL (relative to the base media directory)
    const relativePath = path.relative(BASE_MEDIA_DIR, filePath).replace(/\\/g, '/');
    const dbPath = `/media/${relativePath}`;
    const backendUrl = process.env.BACKEND_URL || '';

    return {
        path: filePath, // Absolute FS path
        dbPath: dbPath,  // Path to store in DB (/media/...)
        url: exports.getMediaUrl(dbPath), // Full URL for immediate response
        filename: fileName,
        mimeType: file.mimetype,
        size: file.size
    };
};

exports.getMediaUrl = (pathOrUrl) => {
    if (!pathOrUrl || typeof pathOrUrl !== 'string') return '';

    // If it's already an absolute URL or base64 data, return it
    if (pathOrUrl.startsWith('http://') || pathOrUrl.startsWith('https://') || pathOrUrl.startsWith('data:')) {
        return pathOrUrl;
    }

    const backendUrl = process.env.BACKEND_URL || '';
    const cleanBaseUrl = backendUrl.endsWith('/') ? backendUrl.slice(0, -1) : backendUrl;

    // Ensure the path starts with a single slash
    let normalizedPath = pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`;

    // 🛡️ SANITIZATION FIX: Remove any accidental prefixes (profileAvatar, modifyAvatar, etc.)
    // and replace legacy/incorrect domains if present
    normalizedPath = normalizedPath
        .replace(/^(profileAvatar|modifyAvatar)\s+/i, "") // Remove known prefixes
        .replace(/^https?:\/\/[^\/]+/, "") // Remove potential existing domain to force fresh one
        .trim();

    // Ensure it starts with / after cleaning
    if (!normalizedPath.startsWith('/')) normalizedPath = `/${normalizedPath}`;

    // Force strict API URL if env var is suspicious, otherwise use env
    // Use the user's requested correct domain if BACKEND_URL seems wrong
    let finalBaseUrl = backendUrl;

    // 🛡️ Extra Sanitization for Env Var
    finalBaseUrl = finalBaseUrl.replace(/^(profileAvatar|modifyAvatar)\s+/i, "").trim();

    // ✅ Enforce correct live URL if env var is missing or invalid
    if (!finalBaseUrl || finalBaseUrl === "" || finalBaseUrl === "/") {
        finalBaseUrl = "https://api.prithu.app";
    }

    return `${finalBaseUrl}${normalizedPath}`;
};

exports.urlToPath = (url) => {
    if (!url || typeof url !== 'string') return null;
    
    // Remove domain if present
    let relativePath = url.replace(/^https?:\/\/[^\/]+/, "");
    
    // Remove /media/ prefix to get path relative to BASE_MEDIA_DIR
    relativePath = relativePath.replace(/^\/media\//, "");
    
    // Replace forward slashes with system-specific separator
    const normalizedRelative = relativePath.replace(/\//g, path.sep);
    
    return path.join(BASE_MEDIA_DIR, normalizedRelative);
};

exports.BASE_MEDIA_DIR = BASE_MEDIA_DIR;
