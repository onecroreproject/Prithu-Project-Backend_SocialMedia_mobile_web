const ffmpeg = require("fluent-ffmpeg");
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

    if (url.startsWith('data:')) {
        try {
            const matches = url.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
            if (!matches || matches.length !== 3) {
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
            console.error(`[FS] Failed to process data URL:`, err.message);
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
    return new Promise((resolve, reject) => {
        ffmpeg.ffprobe(filePath, (err, metadata) => {
            if (err) return reject(err);
            const stream = metadata.streams.find(s => s.codec_type === 'video');
            resolve({
                width: stream?.width || 0,
                height: stream?.height || 0,
                duration: metadata.format.duration
            });
        });
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

const getBrightness = (color) => {
    if (!color) return 0;
    const s = String(color).trim();
    // Handle rgb() / rgba()
    const rgbMatch = s.match(/rgba?\((\d+)[,\s]+(\d+)[,\s]+(\d+)/);
    if (rgbMatch) {
        const r = parseInt(rgbMatch[1]), g = parseInt(rgbMatch[2]), b = parseInt(rgbMatch[3]);
        return (r * 299 + g * 587 + b * 114) / 1000;
    }
    // Handle hex
    const cleanHex = s.replace('#', '');
    if (cleanHex.length === 3) {
        const r = parseInt(cleanHex[0] + cleanHex[0], 16);
        const g = parseInt(cleanHex[1] + cleanHex[1], 16);
        const b = parseInt(cleanHex[2] + cleanHex[2], 16);
        return (r * 299 + g * 587 + b * 114) / 1000;
    }
    if (cleanHex.length === 6) {
        const r = parseInt(cleanHex.substring(0, 2), 16);
        const g = parseInt(cleanHex.substring(2, 4), 16);
        const b = parseInt(cleanHex.substring(4, 6), 16);
        return (r * 299 + g * 587 + b * 114) / 1000;
    }
    return 0;
};

const downloadSocialIcon = async (platform, dest, color = 'white', size = 48) => {
    try {
        const slug = platform.toLowerCase() === 'twitter' ? 'x' : platform.toLowerCase();
        const iconUrl = `https://cdn.simpleicons.org/${slug}/${color}`;
        const response = await axios({ url: iconUrl, method: 'GET', responseType: 'arraybuffer', timeout: 10000 });
        const iconBuffer = await sharp(response.data).resize(Math.round(size * 0.6), Math.round(size * 0.6)).png().toBuffer();
        const background = Buffer.from(`<svg width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="rgba(255,255,255,0.2)" /></svg>`);
        await sharp(background).composite([{ input: iconBuffer, gravity: 'center' }]).png().toFile(dest);
        return true;
    } catch (err) { return false; }
};


exports.processPosterMedia = async ({
    feed,
    viewer,
    designMetadata,
    tempDir,
    onProgress
}) => {
    const OUT_W = 720;
    const OUT_H = 1280;

    const getEscapedFontPath = (fileName) => {
        const absolutePath = path.resolve(__dirname, "..", "assets", fileName);
        if (!fs.existsSync(absolutePath)) return null;
        return absolutePath.replace(/\\/g, "/").replace(/([:])/, "\\\\$1");
    };

    // 🚀 NEW: Robust Font Resolver
    const getFontPath = (family = "", weight = "normal", style = "normal") => {
        const f = family.toLowerCase();
        const isBold = weight === "bold" || weight === "700";
        const isItalic = style === "italic";

        // Mapping frontend names to backend assets
        let baseName = "Outfit.ttf"; // Default
        if (f.includes("dancing")) baseName = "DancingScript.ttf";
        else if (f.includes("oswald")) baseName = "Montserrat.ttf"; // Fallback Clean
        else if (f.includes("montserrat")) baseName = "Montserrat.ttf";
        else if (f.includes("playfair")) baseName = "PlayfairDisplay.ttf";
        else if (f.includes("pacifico")) baseName = "Pacifico.ttf";
        else if (f.includes("roboto")) baseName = "RobotoMono.ttf";
        else if (f.includes("inter")) baseName = "Outfit.ttf"; // Fallback Modern

        // Check for specific variants if they existed (e.g. Montserrat-Bold.ttf)
        // Since we only have base files, we'll use the base and maybe simulate bold if needed
        // but for now, we just resolve the best available file.
        const resolved = getEscapedFontPath(baseName) || getEscapedFontPath("Outfit.ttf");
        return resolved;
    };

    const DEFAULT_FONT = getFontPath("Outfit");

    ensureDir(tempDir);

    const mediaUrl = feed.mediaUrl;
    const postType = feed.postType || "image";
    const isVideoPost = postType === "video";
    const isImagePost = !isVideoPost;
    const tempSourcePath = path.join(tempDir, isVideoPost ? "source.mp4" : "source.jpg");

    // Download/Copy Source
    const localPath = feed.storage?.paths?.media || feed.files?.[0]?.path;
    if (localPath && fs.existsSync(localPath)) {
        fs.copyFileSync(localPath, tempSourcePath);
    } else {
        await downloadFile(mediaUrl, tempSourcePath);
    }

    const BACKEND_URL = process.env.BACKEND_URL || "";
    // Optimization: Resolve local path if URL points to our own backend
    const resolveLocalPath = (url) => {
        if (!url || typeof url !== 'string') return null;
        if (url.startsWith('/media/')) return path.join(process.cwd(), url);
        if (BACKEND_URL && url.startsWith(BACKEND_URL)) {
            const relPath = url.replace(BACKEND_URL, '');
            return path.join(process.cwd(), relPath);
        }
        return null;
    };

    const sourceMeta = await getVideoMetadata(tempSourcePath);
    const footerConfig = designMetadata?.footerConfig;
    const footerEnabled = !!footerConfig?.enabled;
    const baseFooterH = 54;
    const footerH = footerEnabled ? Math.round(baseFooterH * 1.8 * (footerConfig.usernameScale || 1)) : 0;

    if (isImagePost) {
        sourceMeta.width = sourceMeta.width || OUT_W;
        sourceMeta.height = sourceMeta.height || (OUT_H - footerH);
    }

    const maxMediaH = (footerEnabled) ? (OUT_H - footerH) : OUT_H;
    const scaleFactor = Math.min(OUT_W / sourceMeta.width, maxMediaH / sourceMeta.height);
    let actualMediaW = Math.round(sourceMeta.width * scaleFactor);
    if (actualMediaW % 2 !== 0) actualMediaW -= 1;
    let actualMediaH = Math.round(sourceMeta.height * scaleFactor);
    if (actualMediaH % 2 !== 0) actualMediaH -= 1;

    const paddingX = (OUT_W - actualMediaW) / 2;
    let finalOUT_H = actualMediaH + footerH;
    if (finalOUT_H % 2 !== 0) finalOUT_H += 1;
    const footerY = actualMediaH;

    const footerBgColor = normalizeFfmpegColor(footerConfig?.backgroundColor || "#1a1a1a");

    const ffmpegCommand = ffmpeg(tempSourcePath);
    const duration = sourceMeta.duration && sourceMeta.duration !== 'N/A' ? sourceMeta.duration : 8;
    if (isImagePost) ffmpegCommand.inputOptions(["-loop", "1", "-t", duration.toString()]);

    let currentBase = "rgba_base";
    const combinedFilters = [
        { filter: "scale", options: `w=${OUT_W}:h=${actualMediaH}:force_original_aspect_ratio=decrease`, inputs: "0:v", outputs: "scaled_base" },
        { filter: "pad", options: `w=${OUT_W}:h=${actualMediaH}:x=(ow-iw)/2:y=0:color=black`, inputs: "scaled_base", outputs: "padded_base" },
        { filter: "pad", options: `w=${OUT_W}:h=${finalOUT_H}:x=0:y=0:color=black`, inputs: "padded_base", outputs: "rgba_padded" },
        { filter: "format", options: "rgba", inputs: "rgba_padded", outputs: currentBase }
    ];

    let overlayInputIndex = 1;
    const overlayElements = [...(designMetadata?.overlayElements || [])]
        .filter(el => el.visible !== false)
        .sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0));

    let filterIndex = 1;
    for (const el of overlayElements) {
        if (el.type === 'avatar' || el.type === 'logo') {
            let url = el.type === 'avatar' ? (el.mediaConfig?.url || viewer?.profileAvatar) : el.mediaConfig?.url;
            if (!url) continue;

            const overlayDest = path.join(tempDir, `overlay_${overlayInputIndex}.png`);
            try {
                // TRY LOCAL RESOLUTION FIRST
                const localOverlayPath = resolveLocalPath(url);
                if (localOverlayPath && fs.existsSync(localOverlayPath)) {

                    fs.copyFileSync(localOverlayPath, overlayDest);
                } else {
                    await downloadFile(getMediaUrl(url), overlayDest);
                }

                // 🚀 FIX: Map from 9:16 Editor Coords (Canvas-relative) to Media-Relative FFmpeg Coords
                // The specialized editor (birthday, etc.) uses a fixed 9:16 box (720x1280 virtual)
                const VIRTUAL_CANVAS_W = 720;
                const VIRTUAL_CANVAS_H = 1280; // 9:16 relative to 720w

                const xCanvas = ((el.xPercent ?? el.x ?? 10) / 100) * VIRTUAL_CANVAS_W;
                const yCanvas = ((el.yPercent ?? el.y ?? 10) / 100) * VIRTUAL_CANVAS_H;

                const mediaTopInCanvas = (VIRTUAL_CANVAS_H - actualMediaH) / 2;
                const mediaLeftInCanvas = (VIRTUAL_CANVAS_W - actualMediaW) / 2;

                // xRaw: relative to output frame (720w), matching the xCanvas if centered properly
                const xRaw = Math.round(xCanvas - mediaLeftInCanvas + paddingX);
                const yRaw = Math.round(yCanvas - mediaTopInCanvas);

                const scaleW = Math.max(10, Math.round(((el.wPercent ?? el.w ?? 22)) / 100 * VIRTUAL_CANVAS_W));
                const scaleH = el.type === 'avatar' ? scaleW : Math.round(((el.hPercent ?? el.h ?? el.wPercent ?? el.w ?? 22)) / 100 * VIRTUAL_CANVAS_H);

                const fmtLabel = `fmt${filterIndex}`, overlayLabel = `over${filterIndex}`;
                let currentOverlayInput = `${overlayInputIndex}:v`;

                combinedFilters.push({ filter: 'format', options: 'rgba', inputs: currentOverlayInput, outputs: fmtLabel });
                currentOverlayInput = fmtLabel;

                if (el.type === 'avatar') {
                    const shape = el.avatarConfig?.shape || 'circle';
                    const isRound = shape === 'circle' || shape === 'round';
                    const noFade = !!el.noFade; // leaders/party-logos skip the bottom fade
                    const maskedAvatarPath = path.join(tempDir, `masked_${overlayInputIndex}.png`);

                    // Sharp clip (no fade) for leaders; gradient fade for profile avatars
                    const maskSvg = Buffer.from(
                        noFade
                            ? (isRound
                                ? `<svg width="${scaleW}" height="${scaleW}"><ellipse cx="${scaleW / 2}" cy="${scaleW / 2}" rx="${scaleW / 2}" ry="${scaleW / 2}" fill="white"/></svg>`
                                : `<svg width="${scaleW}" height="${scaleW}"><rect x="0" y="0" width="${scaleW}" height="${scaleW}" rx="${Math.round(scaleW * 0.1)}" ry="${Math.round(scaleW * 0.1)}" fill="white"/></svg>`)
                            : (isRound
                                ? `<svg width="${scaleW}" height="${scaleW}"><defs><linearGradient id="f" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="85%" stop-color="white"/><stop offset="100%" stop-color="transparent"/></linearGradient></defs><ellipse cx="${scaleW / 2}" cy="${scaleW / 2}" rx="${scaleW / 2}" ry="${scaleW / 2}" fill="url(#f)"/></svg>`
                                : `<svg width="${scaleW}" height="${scaleW}"><defs><linearGradient id="f" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="85%" stop-color="white"/><stop offset="100%" stop-color="transparent"/></linearGradient></defs><rect x="0" y="0" width="${scaleW}" height="${scaleW}" fill="url(#f)"/></svg>`)
                    );

                    await sharp(overlayDest)
                        .resize(scaleW, scaleW, { fit: 'cover' }) // Force scaleH=scaleW for avatars
                        .composite([{ input: maskSvg, blend: 'dest-in' }])
                        .png().toFile(maskedAvatarPath);

                    ffmpegCommand.input(maskedAvatarPath).inputOptions(["-loop", "1", "-t", duration.toString()]);
                } else {
                    combinedFilters.push({ filter: 'scale', options: `w=${scaleW}:h=${scaleH}`, inputs: currentOverlayInput, outputs: `scaled_logo_${filterIndex}` });
                    currentOverlayInput = `scaled_logo_${filterIndex}`;
                    ffmpegCommand.input(overlayDest).inputOptions(["-loop", "1", "-t", duration.toString()]);
                }

                combinedFilters.push({ filter: 'overlay', options: { x: xRaw, y: yRaw, eval: 'frame' }, inputs: [currentBase, currentOverlayInput], outputs: overlayLabel });
                currentBase = overlayLabel;
                overlayInputIndex++;
                filterIndex++;
            } catch (e) { console.error(`Overlay failed: ${el.type}`, e.message); }
        }

        if (el.type === 'username' || el.type === 'text') {
            const textStyle = el.style || el.textConfig || {};
            const content = el.content || textStyle.content || (el.type === 'username' ? viewer?.userName : "");

            if (content) {
                // 🚀 FIX: Map from 9:16 Editor Coords to Media-Relative FFmpeg Coords
                const VIRTUAL_CANVAS_W = 720;
                const VIRTUAL_CANVAS_H = 1280;

                const xCanvas = ((el.xPercent ?? el.x ?? 10) / 100) * VIRTUAL_CANVAS_W;
                const yCanvas = ((el.yPercent ?? el.y ?? 10) / 100) * VIRTUAL_CANVAS_H;

                const mediaTopInCanvas = (VIRTUAL_CANVAS_H - actualMediaH) / 2;
                const mediaLeftInCanvas = (VIRTUAL_CANVAS_W - actualMediaW) / 2;

                const xRaw = Math.round(xCanvas - mediaLeftInCanvas + paddingX);
                const yRaw = Math.round(yCanvas - mediaTopInCanvas);
                const boxW = Math.round(((el.wPercent ?? el.w ?? 40) / 100) * VIRTUAL_CANVAS_W);
                const boxH = Math.round(((el.hPercent ?? el.h ?? 10) / 100) * VIRTUAL_CANVAS_H);
                const fontSize = Math.round((textStyle.fontSize || 24) * 1.8);

                // 🚀 Resolve Font Path dynamically
                const activeFontPath = getFontPath(
                    textStyle.fontFamily,
                    textStyle.fontWeight,
                    textStyle.fontStyle
                );

                const textLabel = `text${filterIndex}`;

                combinedFilters.push({
                    filter: 'drawtext',
                    options: {
                        text: escapeDrawText(content),
                        x: `(${Math.round(xRaw)}) + ((${boxW}-tw)/2)`,
                        y: `(${Math.round(yRaw)}) + ((${boxH}-th)/2)`,
                        fontsize: fontSize,
                        fontcolor: normalizeFfmpegColor(textStyle.color || "white"),
                        fontfile: activeFontPath,
                        shadowcolor: 'black@0.8', shadowx: 2, shadowy: 2
                    },
                    inputs: currentBase, outputs: textLabel
                });
                currentBase = textLabel;
                filterIndex++;
            }
        }
    }

    // Footer background — spans media content width only (not the black side padding)
    if (footerEnabled) {
        combinedFilters.push({ filter: "drawbox", options: { x: Math.round(paddingX), y: footerY, w: actualMediaW, h: footerH, c: footerBgColor, t: "fill" }, inputs: currentBase, outputs: "footer_bg" });
        currentBase = "footer_bg";

        const showElements = footerConfig?.showElements || {};
        const isLightBg = getBrightness(footerConfig?.backgroundColor) > 128;
        const textColor = isLightBg ? "black" : "white";
        const iconColor = isLightBg ? "000000" : "ffffff";

        const ROW_1_Y = footerY + Math.round(15 * 1.8);
        const ROW_2_Y = footerY + Math.round(45 * 1.8);

        // 🚀 Use uniform Font Resolver for footer too
        const activeFontPath = getFontPath(footerConfig?.fontFamily);

        if (showElements.name && viewer.userName) {
            const truncated = viewer.userName.length > 25 ? viewer.userName.substring(0, 22) + "..." : viewer.userName;
            combinedFilters.push({
                filter: "drawtext",
                options: {
                    text: escapeDrawText(truncated),
                    x: (showElements.socialIcons) ? Math.round(paddingX + 20) : `(${Math.round(paddingX)} + (${actualMediaW}-text_w)/2)`,
                    y: ROW_1_Y,
                    fontsize: Math.round(14 * 1.8 * (footerConfig.usernameScale || 1)),
                    fontcolor: textColor, fontfile: `'${activeFontPath}'`,
                    shadowcolor: isLightBg ? 'white@0.3' : 'black@0.5', shadowx: 1, shadowy: 1
                },
                inputs: currentBase, outputs: "fnm"
            });
            currentBase = "fnm";
        }

        if (showElements.socialIcons && footerConfig.socialIcons?.length > 0) {
            const visible = footerConfig.socialIcons.filter(s => s.visible);
            const size = Math.round(26 * 1.2 * (footerConfig.socialScale || 1));
            let curX = Math.round(paddingX + actualMediaW) - Math.round(20 * 1.8) - size;
            for (let i = 0; i < visible.length; i++) {
                const iPath = path.join(tempDir, `soc_${i}.png`);
                if (await downloadSocialIcon(visible[i].platform, iPath, iconColor, size)) {
                    ffmpegCommand.input(iPath).inputOptions(["-loop", "1", "-t", duration.toString()]);
                    const idx = overlayInputIndex++;
                    combinedFilters.push(
                        { filter: 'format', options: 'rgba', inputs: `${idx}:v`, outputs: `sf${i}` },
                        { filter: 'overlay', options: `x=${Math.round(curX)}:y=${Math.round(ROW_1_Y)}`, inputs: [currentBase, `sf${i}`], outputs: `so${i}` }
                    );
                    currentBase = `so${i}`;
                    curX -= (size + 10);
                }
            }
        }

        if (showElements.email && viewer.email) {
            const eSize = Math.round(12 * 1.2 * (footerConfig.emailScale || 1));
            combinedFilters.push({
                filter: "drawtext",
                options: {
                    text: escapeDrawText(viewer.email),
                    x: Math.round(paddingX + 20), y: Math.round(ROW_2_Y - (eSize / 2)),
                    fontsize: eSize, fontcolor: textColor, fontfile: `'${activeFontPath}'`
                },
                inputs: currentBase, outputs: "fem"
            });
            currentBase = "fem";
        }
        if (showElements.phone && (viewer.phone || viewer.phoneNumber)) {
            const pSize = Math.round(12 * 1.2 * (footerConfig.phoneScale || 1));
            combinedFilters.push({
                filter: "drawtext",
                options: {
                    text: escapeDrawText(viewer.phone || viewer.phoneNumber),
                    x: `${Math.round(paddingX + actualMediaW - 20)}-text_w`,
                    y: Math.round(ROW_2_Y - (pSize / 2)),
                    fontsize: pSize, fontcolor: textColor, fontfile: `'${activeFontPath}'`
                },
                inputs: currentBase, outputs: "fph"
            });
            currentBase = "fph";
        }
    }

    ffmpegCommand.complexFilter(combinedFilters);
    ffmpegCommand.outputOptions([
        "-map", `[${currentBase}]`,
        "-c:v", "libx264",
        "-pix_fmt", "yuv420p",
        "-profile:v", "main",
        "-level:v", "3.1",
        "-preset", "veryfast",
        "-crf", "23",
        "-movflags", "+faststart",
        "-r", "30"
    ]);
    if (isVideoPost) {
        ffmpegCommand.outputOptions([
            "-map", "0:a?",
            "-c:a", "aac",
            "-b:a", "128k",
            "-ar", "44100",
            "-ac", "2",
            "-shortest"
        ]);
    }

    return { ffmpegCommand, tempSourcePath };
};
