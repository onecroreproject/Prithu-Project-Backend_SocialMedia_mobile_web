const ffmpeg = require("fluent-ffmpeg");
require("../Config/ffmpegConfig");
const fs = require("fs");
const path = require("path");
const axios = require("axios");
const sharp = require("sharp");
const { pipeline } = require('stream/promises');
const { getMediaUrl } = require("./storageEngine");
const footerStyle = require("../Config/footerStyleConfig");

// Helper: Ensure directory exists
const ensureDir = (dir) => {
    try {
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    } catch (err) {
        console.error(`[FS] Failed to create directory ${dir}:`, err.message);
    }
};

// Helper: Download file from URL
const downloadFile = async (url, dest) => {
    if (!url) return false;

    // Handle Base64 Data URLs
    if (url.startsWith('data:')) {
        try {
            const matches = url.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
            if (!matches || matches.length !== 3) {
                // Try simple split as fallback
                const parts = url.split(',');
                if (parts.length < 2) throw new Error('Invalid data URL');
                const buffer = Buffer.from(parts[1], 'base64');
                fs.writeFileSync(dest, buffer);
                return true;
            }
            const buffer = Buffer.from(matches[2], 'base64');
            fs.writeFileSync(dest, buffer);
            return true;
        } catch (err) {
            console.error(`[FS] Failed to process base64 data URL:`, err.message);
            throw err;
        }
    }

    let writer;
    try {
        writer = fs.createWriteStream(dest);
        const response = await axios({
            url,
            method: 'GET',
            responseType: 'stream',
            timeout: 30000
        });
        await pipeline(response.data, writer);
        return true;
    } catch (err) {
        console.error(`[FS] Download failed for ${url}:`, err.message);
        if (writer) {
            writer.destroy();
            if (fs.existsSync(dest)) try { fs.unlinkSync(dest); } catch (e) { }
        }
        throw new Error(`Failed to download file from ${url}: ${err.message}`);
    }
};

const getVideoMetadata = (filePath) => {
    return new Promise((resolve) => {
        ffmpeg.ffprobe(filePath, async (err, metadata) => {
            let width = 0;
            let height = 0;
            let duration = 0;
            if (!err && metadata) {
                const stream = metadata.streams?.find(s => s.codec_type === 'video');
                width = stream?.width || 0;
                height = stream?.height || 0;
                duration = metadata.format?.duration || 0;
            }
            if ((!width || !height) && typeof sharp === 'function') {
                try {
                    const sharpMeta = await sharp(filePath).metadata();
                    width = sharpMeta.width || width;
                    height = sharpMeta.height || height;
                } catch (_) {}
            }
            resolve({ width, height, duration });
        });
    });
};

const extractDominantColor = (filePath) => {
    return new Promise((resolve) => {
        const tempPath = filePath + "_1x1.png";
        ffmpeg(filePath)
            .frames(1)
            .seekInput(0)
            .videoFilters('scale=1:1')
            .on('end', () => {
                try {
                    ffmpeg(filePath)
                        .frames(1)
                        .seekInput(0)
                        .videoFilters('scale=1:1')
                        .format('rawvideo')
                        .pix_fmt('rgb24')
                        .on('error', () => resolve("#1a1a1a"))
                        .pipe(require('stream').Writable({
                            write(chunk, enc, next) {
                                if (chunk.length >= 3) {
                                    const r = chunk[0].toString(16).padStart(2, '0');
                                    const g = chunk[1].toString(16).padStart(2, '0');
                                    const b = chunk[2].toString(16).padStart(2, '0');
                                    resolve(`#${r}${g}${b}`);
                                }
                                next();
                            }
                        }));
                    if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
                } catch (e) { resolve("#1a1a1a"); }
            })
            .on('error', () => resolve("#1a1a1a"))
            .save(tempPath);
    });
};

const escapeDrawText = (txt = "") => {
    return String(txt)
        .replace(/\\/g, "\\\\")
        .replace(/:/g, "\\:")
        .replace(/'/g, "\\'")
        .replace(/,/g, "\\,")
        .replace(/\n/g, " ")
        .replace(/\[/g, "\\[")
        .replace(/\]/g, "\\]")
        .replace(/\{/g, "\\{")
        .replace(/\}/g, "\\}")
        .trim();
};

const normalizeFfmpegColor = (c) => {
    if (!c) return "black";
    if (c.includes("@")) return c;

    const m = c.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/i);
    if (m) {
        const r = Number(m[1]), g = Number(m[2]), b = Number(m[3]);
        const a = m[4] !== undefined ? Number(m[4]) : 1;
        const hex = ((r << 16) | (g << 8) | b).toString(16).padStart(6, "0");
        if (a >= 0.99) return `0x${hex}`;
        return `0x${hex}@${a}`;
    }

    const hexMatch = c.match(/^#?([A-Fa-f0-9]{6})([A-Fa-f0-9]{2})?$/);
    if (hexMatch) {
        const hex = hexMatch[1];
        const aVal = hexMatch[2] ? (parseInt(hexMatch[2], 16) / 255) : 1;
        if (aVal >= 0.99) return `0x${hex}`;
        return `0x${hex}@${aVal.toFixed(2)}`;
    }

    if (/^[a-zA-Z]+$/.test(c)) return c;
    return "black";
};

// Helper: Calculate brightness (0-255) to determine contrast
const getBrightness = (hex) => {
    if (!hex) return 0;
    const cleanHex = hex.replace('#', '');
    if (cleanHex.length !== 6) return 0;
    const r = parseInt(cleanHex.substring(0, 2), 16);
    const g = parseInt(cleanHex.substring(2, 4), 16);
    const b = parseInt(cleanHex.substring(4, 6), 16);
    return (r * 299 + g * 587 + b * 114) / 1000;
};

// Helper: Download social icon and convert SVG to PNG
const SOCIAL_SLUGS = {
    'twitter': 'x',
    'linkedin': 'linkedin',
    'facebook': 'facebook',
    'instagram': 'instagram',
    'youtube': 'youtube',
    'github': 'github',
    'website': 'internetexplorer',
    'x': 'x',
    'whatsapp': 'whatsapp'
};

const SOCIAL_BRAND = {
    facebook: { bg: '#1877F2', icon: '#ffffff' },
    instagram: { bg: '#E4405F', icon: '#ffffff' },
    whatsapp: { bg: '#25D366', icon: '#ffffff' },
    youtube: { bg: '#FF0000', icon: '#ffffff' },
    twitter: { bg: '#000000', icon: '#ffffff' },
    linkedin: { bg: '#0A66C2', icon: '#ffffff' },
    github: { bg: '#333333', icon: '#ffffff' },
    website: { bg: '#4A90E2', icon: '#ffffff' },
    x: { bg: '#000000', icon: '#ffffff' }
};

const getSocialBrand = (platform = '') => {
    const key = platform.toLowerCase();
    return SOCIAL_BRAND[key] || SOCIAL_BRAND.website;
};

const SOCIAL_ICONS_SVG = {
    facebook: `<path fill="#ffffff" d="M14 13.5h2.5l1-4H14v-2c0-1.03 0-2 2-2h1.5V2.14c-.326-.043-1.52-.14-2.8-.14-2.73 0-4.7 1.67-4.7 4.86V9.5H7.5v4H10V22h4v-8.5z"/>`,
    instagram: `<path fill="#ffffff" d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>`,
    twitter: `<path fill="#ffffff" d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>`,
    x: `<path fill="#ffffff" d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>`,
    youtube: `<path fill="#ffffff" d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>`,
    whatsapp: `<path fill="#ffffff" d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981z"/>`,
};

const downloadSocialIcon = async (platform, dest, color = null, size = 48, shadowOptions = {}) => {
    try {
        const pKey = platform.toLowerCase();
        const brand = getSocialBrand(pKey);
        const innerSize = Math.floor(size * 0.6);

        let innerIconBuffer = null;
        if (SOCIAL_ICONS_SVG[pKey]) {
            const svgIcon = Buffer.from(
                `<svg width="${innerSize}" height="${innerSize}" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    ${SOCIAL_ICONS_SVG[pKey]}
                 </svg>`
            );
            innerIconBuffer = await sharp(svgIcon).png().toBuffer();
        } else {
            const slug = SOCIAL_SLUGS[pKey] || pKey;
            const iconUrl = `https://cdn.simpleicons.org/${slug}/ffffff`;
            try {
                const response = await axios({ url: iconUrl, method: 'GET', responseType: 'arraybuffer', timeout: 5000 });
                innerIconBuffer = await sharp(response.data).resize(innerSize, innerSize).png().toBuffer();
            } catch (_) {}
        }

        const shadowEnabled = shadowOptions.enabled !== false;
        const shadowOpacity = shadowOptions.opacity ?? 0.5;
        const shadowBlur = shadowOptions.blur ?? 3.5;
        const shadowOffsetX = shadowOptions.offsetX ?? 0;
        const shadowOffsetY = shadowOptions.offsetY ?? 3;
        const shadowColor = shadowOptions.color || '#000000';

        const pad = shadowEnabled ? Math.ceil(shadowBlur * 2) : 0;
        const totalSize = size + (pad * 2);
        const cx = totalSize / 2;
        const cy = totalSize / 2;
        const r = size / 2;

        const filterDef = shadowEnabled
            ? `<defs>
                <filter id="bgShadow" x="-30%" y="-30%" width="160%" height="160%">
                    <feDropShadow dx="${shadowOffsetX}" dy="${shadowOffsetY}" stdDeviation="${shadowBlur}" flood-color="${shadowColor}" flood-opacity="${shadowOpacity}" />
                </filter>
               </defs>`
            : '';

        const circleSvg = Buffer.from(
            `<svg width="${totalSize}" height="${totalSize}" xmlns="http://www.w3.org/2000/svg">
                ${filterDef}
                <circle cx="${cx}" cy="${cy}" r="${r}" fill="${brand.bg}" ${shadowEnabled ? 'filter="url(#bgShadow)"' : ''} />
             </svg>`
        );

        if (innerIconBuffer) {
            await sharp(circleSvg)
                .composite([{ input: innerIconBuffer, gravity: 'center' }])
                .png()
                .toFile(dest);
        } else {
            await sharp(circleSvg)
                .png()
                .toFile(dest);
        }
            
        return { success: true, pad, totalSize };
    } catch (err) {
        console.error(`[FS] Icon generation failed for ${platform}:`, err.message);
        return { success: false, pad: 0, totalSize: size };
    }
};

const createIconSvg = async (type, dest, color, size = 48) => {
    try {
        let svgStr = '';
        const iconColor = color || 'ffffff';
        if (type === 'email') {
            svgStr = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${size}" height="${size}"><path fill="#${iconColor}" d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/></svg>`;
        } else if (type === 'phone') {
            svgStr = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${size}" height="${size}"><path fill="#${iconColor}" d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/></svg>`;
        }
        await sharp(Buffer.from(svgStr))
            .resize(size, size)
            .png()
            .toFile(dest);
        return true;
    } catch (err) {
        console.error(`[FS] Icon creation failed for ${type}:`, err.message);
        return false;
    }
};

/**
 * Core Media Processing Logic
 */
exports.processFeedMedia = async ({
    feed,
    viewer,
    designMetadata,
    tempDir,
    onProgress,
    isStreaming = false
}) => {
    const OUT_W = 720;
    const OUT_H = 1280;
    const BACKEND_URL = process.env.BACKEND_URL || '';

    // Optimization: Resolve local path if URL points to our own backend
    const resolveLocalPath = (url) => {
        if (!url || typeof url !== 'string') return null;
        if (url.startsWith('data:')) return null; // Base64 cannot be a local path
        
        try {
            if (fs.existsSync(url)) return url;
            const absPath = path.resolve(__dirname, '..', url);
            if (fs.existsSync(absPath)) return absPath;
            
            // 1. Check for "/media/" folder
            const mediaIdx = url.indexOf('/media/');
            if (mediaIdx !== -1) {
                const relPath = url.substring(mediaIdx);
                const projRootPath = path.join(__dirname, '..', relPath);
                if (fs.existsSync(projRootPath)) return projRootPath;
                const cwdPath = path.join(process.cwd(), relPath);
                if (fs.existsSync(cwdPath)) return cwdPath;
            }
            
            // 2. Check for "/uploads/" folder
            const uploadsIdx = url.indexOf('/uploads/');
            if (uploadsIdx !== -1) {
                const relPath = url.substring(uploadsIdx);
                const projRootPath = path.join(__dirname, '..', relPath);
                if (fs.existsSync(projRootPath)) return projRootPath;
                const cwdPath = path.join(process.cwd(), relPath);
                if (fs.existsSync(cwdPath)) return cwdPath;
            }

            // 3. Check direct starting slash paths
            if (url.startsWith('/media/') || url.startsWith('/uploads/') || url.startsWith('/logo/')) {
                const projRootPath = path.join(__dirname, '..', url);
                if (fs.existsSync(projRootPath)) return projRootPath;
                const cwdPath = path.join(process.cwd(), url);
                if (fs.existsSync(cwdPath)) return cwdPath;
            }
            
            // 4. Fallback: replace BACKEND_URL
            if (BACKEND_URL && url.startsWith(BACKEND_URL)) {
                const relPath = url.replace(BACKEND_URL, '');
                const projRootPath = path.join(__dirname, '..', relPath);
                if (fs.existsSync(projRootPath)) return projRootPath;
                const cwdPath = path.join(process.cwd(), relPath);
                if (fs.existsSync(cwdPath)) return cwdPath;
            }
        } catch (e) {
            // Ignore ENAMETOOLONG or other fs errors
            return null;
        }
        return null;
    };

    // Use content-aware dominant color extraction
    const getDominantColor = async (filePath, isVideo, tempDir) => {
        try {
            if (isVideo) {
                const tempFramePath = path.join(tempDir, "extract_frame.jpg");
                await new Promise((resolve, reject) => {
                    ffmpeg(filePath)
                        .seekInput(0.5) // Sample from 0.5s
                        .frames(1)
                        .on('error', (err) => {
                            console.warn("[Processor] Frame export error:", err.message);
                            resolve(); // Resolve to let it fallback
                        })
                        .on('end', () => resolve())
                        .save(tempFramePath);
                });

                if (fs.existsSync(tempFramePath)) {
                    const buffer = await sharp(tempFramePath).resize(1, 1).raw().toBuffer();
                    if (buffer.length >= 3) {
                        const r = buffer[0], g = buffer[1], b = buffer[2];
                        return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
                    }
                }
                return "#1a1a1a";
            } else {
                const buffer = await sharp(filePath).resize(1, 1).raw().toBuffer();
                if (buffer.length >= 3) {
                    const r = buffer[0], g = buffer[1], b = buffer[2];
                    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
                }
                return "#1a1a1a";
            }
        } catch (e) {
            console.warn("[Processor] Dominant color extraction failed:", e.message);
            return "#1a1a1a";
        }
    };

    // Use configurable font path - Robust escaping for Windows
    const FONT_PATH = footerStyle.fontFile.replace(/\\/g, "/").replace(/:/g, "\\\\:");

    ensureDir(tempDir);

    const mediaUrl = getMediaUrl(feed.mediaUrl);
    let localPath = feed.storage?.paths?.media || feed.files?.[0]?.path;

    // Enhanced local path resolution
    if (!localPath || !fs.existsSync(localPath)) {
        localPath = resolveLocalPath(mediaUrl);
    }



    const postType = feed.postType || "image";
    const isVideoPost = postType === "video";
    const isImagePost = postType === "image" || postType === "image+audio";
    const isStaticImage = postType === "image";
    const tempSourcePath = path.join(tempDir, isVideoPost ? "source.mp4" : "source.jpg");

    if (localPath && fs.existsSync(localPath)) {

        fs.copyFileSync(localPath, tempSourcePath);
    } else {

        await downloadFile(mediaUrl, tempSourcePath);
    }

    if (onProgress) onProgress(30);

    // 2. METADATA & DIMENSIONS

    const sourceMeta = await getVideoMetadata(tempSourcePath);


    const footerConfig = designMetadata?.footerConfig;
    const showElements = footerConfig?.showElements || {};
    const visibleSocialIcons = (footerConfig?.socialIcons || []).filter(i => i && i.visible);

    const displayName = String(viewer?.name || viewer?.userName || '').trim();
    const email = String(viewer?.email || '').trim();
    const phone = String(viewer?.phoneNumber || viewer?.phone || '').trim();

    const isNameVisible = (showElements.name === true || showElements.name === 'true') && displayName.length > 0;
    const isEmailVisible = (showElements.email === true || showElements.email === 'true') && email.length > 0;
    const isPhoneVisible = (showElements.phone === true || showElements.phone === 'true') && phone.length > 0;
    const isSocialVisible = (showElements.socialIcons === true || showElements.socialIcons === 'true') && visibleSocialIcons.length > 0;

    const hasAnyFooterContent = isNameVisible || isEmailVisible || isPhoneVisible || isSocialVisible;
    const isExplicitlyOff = designMetadata?.hasFooter === false || 
                            footerConfig?.enabled === false || 
                            footerConfig?.enabled === 'false' || 
                            footerConfig?.showFooter === false || 
                            footerConfig?.showFooter === 'false';
    const footerEnabled = !isExplicitlyOff && (footerConfig?.enabled === true || footerConfig?.enabled === 'true') && hasAnyFooterContent;
    const footerH = (footerEnabled && hasAnyFooterContent) ? (footerStyle.footerHeight || Math.round(((footerConfig?.heightPercent || 10) / 100) * OUT_H)) : 0;
    const maxMediaH = (footerEnabled && hasAnyFooterContent) ? (OUT_H - footerH) : OUT_H;

    if (isImagePost) {
        sourceMeta.width = sourceMeta.width || OUT_W;
        sourceMeta.height = sourceMeta.height || maxMediaH;
    }

    // Scale width to exactly OUT_W to eliminate left/right black space
    const scaleFactor = OUT_W / sourceMeta.width;
    const actualMediaW = OUT_W;
    let actualMediaH = Math.round(sourceMeta.height * scaleFactor);
    // Ensure height is even for x264 compatibility
    actualMediaH = actualMediaH % 2 === 0 ? actualMediaH : actualMediaH + 1;
    const paddingX = 0;

    // Removal of unwanted space: Make canvas height exactly fit the combined block
    const combinedBlockH = actualMediaH + footerH;
    const finalOUT_H = combinedBlockH % 2 === 0 ? combinedBlockH : combinedBlockH + 1;
    const yOffset = 0; // Start at the very top (remove top space)
    const footerY = actualMediaH; // Footer sits exactly below media



    let dominantColor = footerConfig?.backgroundColor || "#1a1a1a";
    // Only extract dominant color if no background color is provided and it's not explicitly disabled
    if (!footerConfig?.backgroundColor && footerConfig?.useDominantColor !== false) {
        dominantColor = await getDominantColor(tempSourcePath, isVideoPost, tempDir);
    }
    const footerBgColor = normalizeFfmpegColor(dominantColor);

    // 3. FFMPEG SETUP
    const ffmpegCommand = ffmpeg(tempSourcePath)
        .inputOptions([
            "-err_detect ignore_err",
            "-fflags +genpts"
        ]);
    const duration = sourceMeta.duration && sourceMeta.duration !== 'N/A' ? sourceMeta.duration : 8;
    if (isImagePost && !isStaticImage) ffmpegCommand.inputOptions(["-loop", "1", "-t", duration.toString()]);

    let currentBase = "base";
    const combinedFilters = [];


    let overlayInputIndex = 1;

    // Audio
    let audioInputIndex = null;
    if (postType === "image+audio") {
        const audioUrl = feed.audioFile?.url || designMetadata?.audioConfig?.url;
        if (audioUrl) {
            const audioDest = path.join(tempDir, "audio.mp3");
            try {
                await downloadFile(audioUrl, audioDest);
                ffmpegCommand.input(audioDest);
                audioInputIndex = overlayInputIndex++;
            } catch (e) { console.warn("Audio download failed", e.message); }
        }
    }

    // Base Canvas: Normalize to RGBA without any extra bottom padding
    if (footerEnabled && hasAnyFooterContent && footerH > 0) {
        combinedFilters.push(
            { filter: "scale", options: `w=${OUT_W}:h=${actualMediaH}`, inputs: "0:v", outputs: "scaled_base" },
            { filter: "pad", options: `w=${OUT_W}:h=${finalOUT_H}:x=0:y=0:color=black`, inputs: "scaled_base", outputs: "rgba_base" },
            { filter: "format", options: "rgba", inputs: "rgba_base", outputs: currentBase }
        );
    } else {
        combinedFilters.push(
            { filter: "scale", options: `w=${OUT_W}:h=${finalOUT_H}`, inputs: "0:v", outputs: "scaled_base" },
            { filter: "format", options: "rgba", inputs: "scaled_base", outputs: currentBase }
        );
    }

    // 4. OVERLAYS
    const customMetadata = feed?.customMetadata || {};
    console.log(`[DEBUG] customMetadata.overlayElements received:`, customMetadata?.overlayElements ? customMetadata.overlayElements.length : 0);
    
    let mergedOverlayElements = [...(designMetadata?.overlayElements || [])];
    if (customMetadata?.overlayElements?.length > 0) {
        customMetadata.overlayElements.forEach(customEl => {
            console.log(`[DEBUG] Found custom element:`, customEl.type, `has URL:`, !!customEl.mediaConfig?.url);
            const existingIdx = mergedOverlayElements.findIndex(el => 
                (el.id && customEl.id && el.id === customEl.id) || 
                (el.type && customEl.type && el.type === customEl.type)
            );
            if (existingIdx > -1) {
                mergedOverlayElements[existingIdx] = { ...mergedOverlayElements[existingIdx], ...customEl };
            } else {
                mergedOverlayElements.push(customEl);
            }
        });
    }

    const overlayElements = mergedOverlayElements
        .filter(el => {
            const isVisible = el.visible !== false && el.visible !== "false" && el.visible !== "0";
            return isVisible;
        })
        .sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0));

    console.log(`[DEBUG] Final merged overlayElements count:`, overlayElements.length);


    let filterIndex = 1;

    const getFontFile = (family = "") => {
        const f = family.toLowerCase();
        if (f.includes('pacifico')) return path.join(__dirname, '../assets/Pacifico.ttf');
        if (f.includes('dancing script')) return path.join(__dirname, '../assets/DancingScript.ttf');
        if (f.includes('montserrat')) return path.join(__dirname, '../assets/Montserrat.ttf');
        if (f.includes('playfair display')) return path.join(__dirname, '../assets/PlayfairDisplay.ttf');
        if (f.includes('fira code') || f.includes('mono')) return path.join(__dirname, '../assets/RobotoMono.ttf');
        if (f.includes('arial')) return path.join(__dirname, '../assets/arial.ttf');
        return path.join(__dirname, '../assets/Outfit.ttf');
    };

    for (const el of overlayElements) {
        let overlayMediaUrl = null;
        const isCalendar = el.type === 'calendar';
        if (el.type === 'avatar') overlayMediaUrl = el.mediaConfig?.url || viewer?.profileAvatar;
        else if (el.type === "logo") overlayMediaUrl = el.mediaConfig?.url || "/logo/prithulogo.png";
        else if (isCalendar) overlayMediaUrl = el.mediaConfig?.url;

        if (overlayMediaUrl) {
            const overlayDest = path.join(tempDir, `overlay_${overlayInputIndex}.png`);

            try {
                // Try local resolution first to prevent loopback download failures/timeouts
                const localOverlayPath = resolveLocalPath(overlayMediaUrl);
                if (localOverlayPath && fs.existsSync(localOverlayPath)) {
                    fs.copyFileSync(localOverlayPath, overlayDest);
                } else {
                    await downloadFile(getMediaUrl(overlayMediaUrl), overlayDest);
                }
                const xPct = el.xPercent ?? el.x ?? (isCalendar ? 80 : 0);
                const yPct = el.yPercent ?? el.y ?? (isCalendar ? 10 : 0);
                let wPct = el.wPercent ?? el.w;
                let hPct = el.hPercent ?? el.h;
                if (isCalendar && !wPct) wPct = 12; // default 12% width for calendar

                const xRaw = Math.round((xPct / 100) * OUT_W);
                const yRaw = Math.round(yOffset + ((yPct / 100) * actualMediaH));
                
                const scaleW = Math.max(10, Math.round((wPct || 20) / 100 * OUT_W));
                const scaleH = hPct ? Math.round((hPct / 100) * actualMediaH) : (isCalendar ? Math.round(scaleW * 1.25) : scaleW);

                let xExpr = `${xRaw}`, yExpr = `${yRaw}`;
                const dur = Number(el.animation?.speed || 1);
                const delay = Number(el.animation?.delay || 0);

                if (!isStaticImage && el.animation?.enabled && el.animation.direction !== "none") {
                    const dir = el.animation.direction;
                    let startX = xRaw, startY = yRaw;
                    if (dir.includes('left')) startX = -scaleW;
                    if (dir.includes('right')) startX = OUT_W;
                    if (dir.includes('top')) startY = yOffset - scaleW;
                    if (dir.includes('bottom')) startY = yOffset + actualMediaH;

                    if (startX !== xRaw) xExpr = `if(lt(t,${delay}),(${startX}),if(lt(t,${delay + dur}),(${startX})+(${xRaw}-(${startX}))*(t-${delay})/${dur},${xRaw}))`;
                    if (startY !== yRaw) yExpr = `if(lt(t,${delay}),(${startY}),if(lt(t,${delay + dur}),(${startY})+(${yRaw}-(${startY}))*(t-${delay})/${dur},${yRaw}))`;
                }

                const shape = el.avatarConfig?.shape || el.shape || 'circle';
                const isRound = el.type === 'avatar' && (shape === 'circle' || shape === 'round');
                const maskedAvatarPath = path.join(tempDir, `masked_${overlayInputIndex}.png`);

                const rx = Math.round(scaleW * 0.15); // rounded corner radius (15% of width)
                const maskSvg = Buffer.from(isRound
                    ? `<svg width="${scaleW}" height="${scaleH}">
                        <ellipse cx="${scaleW / 2}" cy="${scaleH / 2}" rx="${scaleW / 2}" ry="${scaleH / 2}" fill="white"/>
                      </svg>`
                    : `<svg width="${scaleW}" height="${scaleH}">
                        <rect x="0" y="0" rx="${rx}" ry="${rx}" width="${scaleW}" height="${scaleH}" fill="white"/>
                      </svg>`
                );

                if (el.type === 'avatar') {
                    await sharp(overlayDest)
                        .resize(scaleW, scaleH, { fit: 'cover' })
                        .composite([{ input: maskSvg, blend: 'dest-in' }])
                        .png()
                        .toFile(maskedAvatarPath);
                    ffmpegCommand.input(maskedAvatarPath);
                    ffmpegCommand.inputOptions(["-loop", "1", "-t", duration.toString()]);
                } else {
                    const cleanOverlayPath = path.join(tempDir, `clean_overlay_${overlayInputIndex}.png`);
                    await sharp(overlayDest)
                        .rotate() // removes EXIF and auto-rotates
                        .png()
                        .toFile(cleanOverlayPath);
                    ffmpegCommand.input(cleanOverlayPath);
                    ffmpegCommand.inputOptions(["-loop", "1", "-t", duration.toString()]);
                }

                const fmtLabel = `fmt${filterIndex}`, rawLabel = `raw${filterIndex}`, maskedLabel = `masked${filterIndex}`, overlayLabel = `over${filterIndex}`;
                let currentOverlayInput = `${overlayInputIndex}:v`;

                // CRITICAL: Normalize every image input to RGBA immediately
                combinedFilters.push({ filter: 'format', options: 'rgba', inputs: currentOverlayInput, outputs: fmtLabel });
                currentOverlayInput = fmtLabel;

                overlayInputIndex++;

                if (!isRound && el.type !== 'avatar') {
                    combinedFilters.push({ filter: 'scale', options: `w=${scaleW}:h=-1`, inputs: currentOverlayInput, outputs: rawLabel });
                    currentOverlayInput = rawLabel;
                }

                if (!isStaticImage && el.animation?.enabled) {
                    combinedFilters.push({ filter: 'fade', options: { t: 'in', st: 0, d: dur, alpha: 1 }, inputs: currentOverlayInput, outputs: maskedLabel });
                    currentOverlayInput = maskedLabel;
                }

                combinedFilters.push({ filter: 'overlay', options: { x: xExpr, y: yExpr, eval: 'frame' }, inputs: [currentBase, currentOverlayInput], outputs: overlayLabel });
                currentBase = overlayLabel;
                filterIndex++;
            } catch (e) { console.error(`Overlay failed: ${el.type}`, e.message); }
        }

        if (el.type === 'text') {
            const content = el.textConfig?.content || el.content || '';
            if (content) {
                const xPct = el.xPercent ?? el.x ?? 50;
                const yPct = el.yPercent ?? el.y ?? 50;
                const xRaw = (xPct / 100) * OUT_W, yRaw = yOffset + ((yPct / 100) * actualMediaH);
                const fontSize = Math.round((el.textConfig?.fontSize || 24) * 2.5);
                const textLabel = `text${filterIndex}`;

                let xExpr = `${Math.round(xRaw)}`, yExpr = `${Math.round(yRaw)}`;
                if (!isStaticImage && el.animation?.enabled && el.animation.direction !== "none") {
                    const dur = Number(el.animation?.speed || 1);
                    const delay = Number(el.animation?.delay || 0);
                    const dir = el.animation.direction;
                    const scaleW = fontSize * content.length * 0.6; // Rough estimate of text width for animation bounds

                    let startX = xRaw, startY = yRaw;
                    if (dir.includes('left')) startX = -scaleW;
                    if (dir.includes('right')) startX = OUT_W;
                    if (dir.includes('top')) startY = yOffset - fontSize;
                    if (dir.includes('bottom')) startY = yOffset + actualMediaH;

                    if (startX !== xRaw) xExpr = `if(lt(t,${delay}),(${startX}),if(lt(t,${delay + dur}),(${startX})+(${xRaw}-(${startX}))*(t-${delay})/${dur},${xRaw}))`;
                    if (startY !== yRaw) yExpr = `if(lt(t,${delay}),(${startY}),if(lt(t,${delay + dur}),(${startY})+(${yRaw}-(${startY}))*(t-${delay})/${dur},${yRaw}))`;
                }

                combinedFilters.push({
                    filter: 'drawtext',
                    options: {
                        text: escapeDrawText(content),
                        x: xExpr,
                        y: yExpr,
                        fontsize: fontSize,
                        fontcolor: normalizeFfmpegColor(el.textConfig?.color || "white"),
                        fontfile: `'${FONT_PATH}'`,
                        shadowcolor: 'black@0.8',
                        shadowx: 2,
                        shadowy: 2
                    },
                    inputs: currentBase, outputs: textLabel
                });
                currentBase = textLabel;
                filterIndex++;
            }
        }
    }

    // 5. FOOTER
    if (footerEnabled && hasAnyFooterContent && footerH > 0) {

        combinedFilters.push({ filter: "drawbox", options: { x: Math.round(paddingX), y: footerY, w: Math.round(actualMediaW), h: footerH, c: footerBgColor, t: "fill" }, inputs: currentBase, outputs: "footer_bg" });
        currentBase = "footer_bg";

        const showElements = footerConfig?.showElements || {};
        const visibleSocialIcons = (footerConfig?.socialIcons || []).filter(i => i.visible);

        // Adaptive coloring based on background brightness
        const brightness = getBrightness(dominantColor);
        const isLightBg = brightness > 128; // Changed to mid-range for better detection
        const adaptiveTextColor = isLightBg ? "black" : "white";
        const adaptiveIconColor = isLightBg ? "000000" : "ffffff";
        const adaptiveShadowColor = isLightBg ? "white@0.4" : "black@0.6";

        // Configurable Vertical Alignment using row1Offset/row2Offset from config
        const ROW_1_Y = Math.round(footerY + (footerH * (footerStyle.row1Offset || 0.33)));
        const ROW_2_Y = Math.round(footerY + (footerH * (footerStyle.row2Offset || 0.66)));

        const textColor = normalizeFfmpegColor(footerConfig?.textColor || adaptiveTextColor);
        const shadowColor = normalizeFfmpegColor(footerStyle.shadowColor || adaptiveShadowColor);

        // Map font family
        const ACTIVE_FONT = getFontFile(footerConfig.fontFamily).replace(/\\/g, "/").replace(/([:])/, "\\\\$1");

        const displayName = String(viewer?.name || viewer?.userName || '').trim();
        const isNameVisible = (showElements.name === true || showElements.name === 'true') && displayName.length > 0;

        if (isNameVisible) {
            const nameSize = Math.round(footerStyle.nameSize * (footerConfig.usernameScale || 1));
            const nameLabel = `footer_name`;
            combinedFilters.push({ filter: "drawtext", options: { text: escapeDrawText(displayName), x: (!showElements.socialIcons || visibleSocialIcons.length === 0) ? '(w-text_w)/2' : Math.round(paddingX + footerStyle.paddingLeft), y: Math.round(ROW_1_Y - (nameSize / 2)), fontsize: nameSize, fontcolor: textColor, borderw: 1, bordercolor: textColor, fontfile: `'${ACTIVE_FONT}'`, shadowcolor: shadowColor, shadowx: footerStyle.shadowX, shadowy: footerStyle.shadowY }, inputs: currentBase, outputs: nameLabel });
            currentBase = nameLabel;
        }

        if (showElements.socialIcons && visibleSocialIcons.length > 0) {
            const iconSize = footerStyle.iconSize || 36;
            const spacing = footerStyle.socialIconSpacing || 44;
            const totalWidth = (visibleSocialIcons.length * iconSize) + ((visibleSocialIcons.length - 1) * (spacing - iconSize));
            const startIconX = Math.round(paddingX + actualMediaW - footerStyle.paddingRight - totalWidth);

            const shadowOptions = {
                enabled: footerStyle.iconShadow !== false,
                opacity: footerStyle.iconShadowOpacity || 0.5,
                blur: footerStyle.iconShadowBlur || 3.5,
                offsetX: footerStyle.iconShadowOffsetX || 0,
                offsetY: footerStyle.iconShadowOffsetY || 3,
                color: footerStyle.iconShadowColor || '#000000'
            };

            for (let i = 0; i < visibleSocialIcons.length; i++) {
                const iconPath = path.join(tempDir, `social_${i}.png`);
                try {
                    const platform = visibleSocialIcons[i].platform.toLowerCase();
                    const iconResult = await downloadSocialIcon(platform, iconPath, null, iconSize, shadowOptions);
                    if (!iconResult.success) continue;

                    // Social icons must be looped to match video duration
                    ffmpegCommand.input(iconPath);
                    if (!isStaticImage) ffmpegCommand.inputOptions(["-loop", "1", "-t", duration.toString()]);
                    const iconIdx = overlayInputIndex++;
                    const iconLabel = `social_over_${i}`;
                    const pad = iconResult.pad || 0;
                    const currentX = startIconX + (i * spacing) - pad;
                    const currentY = Math.round(ROW_1_Y - (iconSize / 2)) - pad;
                    combinedFilters.push(
                        { filter: 'format', options: 'rgba', inputs: `${iconIdx}:v`, outputs: `sf${i}` },
                        { filter: 'overlay', options: `x=${currentX}:y=${currentY}`, inputs: [currentBase, `sf${i}`], outputs: iconLabel }
                    );
                    currentBase = iconLabel;
                } catch (e) {
                    console.error(`[Processor] Error processing social icon ${visibleSocialIcons[i].platform}:`, e.message);
                }
            }
        }

        if (showElements.email && viewer.email) {
            const emailSize = Math.round(footerStyle.emailSize * (footerConfig.emailScale || 1));
            const emailLabel = `footer_email`;
            combinedFilters.push({ filter: "drawtext", options: { text: escapeDrawText(viewer.email), x: Math.round(paddingX + footerStyle.paddingLeft), y: Math.round(ROW_2_Y - (emailSize / 2)), fontsize: emailSize, fontcolor: textColor, borderw: 1, bordercolor: textColor, fontfile: `'${ACTIVE_FONT}'`, shadowcolor: shadowColor, shadowx: footerStyle.shadowX, shadowy: footerStyle.shadowY }, inputs: currentBase, outputs: emailLabel });
            currentBase = emailLabel;
        }
        if (showElements.phone && (viewer.phone || viewer.phoneNumber)) {
            const phoneSize = Math.round(footerStyle.phoneSize * (footerConfig.phoneScale || 1));
            const phoneLabel = `footer_phone`;
            const phoneText = viewer.phone || viewer.phoneNumber;
            combinedFilters.push({ filter: "drawtext", options: { text: escapeDrawText(phoneText), x: `${Math.round(paddingX + actualMediaW - footerStyle.paddingRight)}-text_w`, y: Math.round(ROW_2_Y - (phoneSize / 2)), fontsize: phoneSize, fontcolor: textColor, borderw: 1, bordercolor: textColor, fontfile: `'${ACTIVE_FONT}'`, shadowcolor: shadowColor, shadowx: footerStyle.shadowX, shadowy: footerStyle.shadowY }, inputs: currentBase, outputs: phoneLabel });
            currentBase = phoneLabel;
        }
    }

    // 6. FINAL BUILD

    ffmpegCommand.complexFilter(combinedFilters);


    let outputOptions = [];
    let ext = "mp4";

    if (isStaticImage) {
        ext = "jpg";
        outputOptions = [
            "-map", `[${currentBase}]`,
            "-vframes", "1",
            "-q:v", "2",
            "-f", "image2"
        ];
    } else {
        outputOptions = [
            "-map", `[${currentBase}]`,
            "-c:v", "libx264",
            "-profile:v", "main",
            "-pix_fmt", "yuv420p",
            "-b:v", "2500k",
            "-maxrate", "2500k",
            "-bufsize", "5000k",
            "-preset", isStreaming ? "ultrafast" : "veryfast",
            "-movflags", "+faststart" + (isStreaming ? "+frag_keyframe+empty_moov" : ""),
            "-f", "mp4"
        ];
        if (postType === "image+audio" && audioInputIndex !== null) {
            outputOptions.push("-shortest", "-map", `${audioInputIndex}:a`, "-c:a", "aac", "-b:a", "128k");
        } else if (isVideoPost) {
            // When streaming, re-encoding audio to aac is safer for piped MP4
            outputOptions.push("-map", "0:a?", "-c:a", "aac", "-b:a", "128k", "-shortest");
        } else if (isImagePost && !isStaticImage) {
            // Ensure image-only output also terminates at shortest input
            outputOptions.push("-shortest");
        }
    }

    ffmpegCommand.outputOptions(outputOptions);

    return { ffmpegCommand, tempSourcePath, ext };
};
