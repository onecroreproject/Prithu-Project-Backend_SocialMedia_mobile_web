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

const getBrightness = (hex) => {
    if (!hex) return 0;
    const cleanHex = hex.replace('#', '');
    if (cleanHex.length !== 6) return 0;
    const r = parseInt(cleanHex.substring(0, 2), 16);
    const g = parseInt(cleanHex.substring(2, 4), 16);
    const b = parseInt(cleanHex.substring(4, 6), 16);
    return (r * 299 + g * 587 + b * 114) / 1000;
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

/**
 * Specialized Poster Media Processor:
 * Handles Birthday, Anniversary, and Politics categories with specific overlay handling.
 */
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
        return absolutePath.replace(/\\/g, "/").replace(/([:])/, "\\\\$1");
    };
    const FONT_PATH = getEscapedFontPath("Outfit.ttf");

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
    const actualMediaW = Math.round(sourceMeta.width * scaleFactor);
    const actualMediaH = Math.round(sourceMeta.height * scaleFactor);
    const paddingX = (OUT_W - actualMediaW) / 2;
    const finalOUT_H = actualMediaH + footerH;
    const footerY = actualMediaH;

    const footerBgColor = normalizeFfmpegColor(footerConfig?.backgroundColor || "#1a1a1a");

    const ffmpegCommand = ffmpeg(tempSourcePath).inputOptions(["-err_detect ignore_err", "-fflags +genpts"]);
    const duration = sourceMeta.duration && sourceMeta.duration !== 'N/A' ? sourceMeta.duration : 8;
    if (isImagePost) ffmpegCommand.inputOptions(["-loop", "1", "-t", duration.toString()]);

    let currentBase = "base";
    const combinedFilters = [
        { filter: "scale", options: `w=${OUT_W}:h=${actualMediaH}:force_original_aspect_ratio=decrease`, inputs: "0:v", outputs: "scaled_base" },
        { filter: "pad", options: `w=${OUT_W}:h=${actualMediaH}:x=(ow-iw)/2:y=0:color=black`, inputs: "scaled_base", outputs: "padded_base" },
        { filter: "pad", options: `w=${OUT_W}:h=${finalOUT_H}:x=0:y=0:color=black`, inputs: "padded_base", outputs: "rgba_base" },
        { filter: "format", options: "rgba", inputs: "rgba_base", outputs: currentBase }
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
                    console.log(`[Processor] Using local overlay: ${localOverlayPath}`);
                    fs.copyFileSync(localOverlayPath, overlayDest);
                } else {
                    await downloadFile(getMediaUrl(url), overlayDest);
                }

                // Frame-Centric Coordinates (Relative to 720px wide frame)
                const xRaw = Math.round((el.xPercent / 100) * OUT_W);
                const yRaw = Math.round((el.yPercent / 100) * actualMediaH);
                const scaleW = Math.max(10, Math.round((el.wPercent || 22) / 100 * OUT_W));
                const scaleH = el.hPercent ? Math.round((el.hPercent / 100) * actualMediaH) : scaleW;

                const fmtLabel = `fmt${filterIndex}`, overlayLabel = `over${filterIndex}`;
                let currentOverlayInput = `${overlayInputIndex}:v`;

                combinedFilters.push({ filter: 'format', options: 'rgba', inputs: currentOverlayInput, outputs: fmtLabel });
                currentOverlayInput = fmtLabel;

                if (el.type === 'avatar') {
                    const shape = el.avatarConfig?.shape || 'circle';
                    const isRound = shape === 'circle' || shape === 'round';
                    const maskedAvatarPath = path.join(tempDir, `masked_${overlayInputIndex}.png`);

                    const maskSvg = Buffer.from(isRound
                        ? `<svg width="${scaleW}" height="${scaleH}"><defs><linearGradient id="f" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="85%" stop-color="white"/><stop offset="100%" stop-color="transparent"/></linearGradient></defs><ellipse cx="${scaleW / 2}" cy="${scaleH / 2}" rx="${scaleW / 2}" ry="${scaleH / 2}" fill="url(#f)"/></svg>`
                        : `<svg width="${scaleW}" height="${scaleH}"><defs><linearGradient id="f" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="85%" stop-color="white"/><stop offset="100%" stop-color="transparent"/></linearGradient></defs><rect x="0" y="0" width="${scaleW}" height="${scaleH}" fill="url(#f)"/></svg>`
                    );

                    await sharp(overlayDest)
                        .resize(scaleW, scaleH, { fit: 'cover' })
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
            const content = el.type === 'username' ? viewer?.userName : el.textConfig?.content;
            if (content) {
                const xRaw = Math.round((el.xPercent / 100) * OUT_W);
                const yRaw = Math.round((el.yPercent / 100) * actualMediaH);
                const boxW = Math.round((el.wPercent / 100) * OUT_W);
                const boxH = Math.round((el.hPercent / 100) * actualMediaH);
                const fontSize = Math.round((el.textConfig?.fontSize || 24) * 2.0);
                const textLabel = `text${filterIndex}`;

                combinedFilters.push({
                    filter: 'drawtext',
                    options: {
                        text: escapeDrawText(content),
                        x: `(${Math.round(xRaw)}) + ((${boxW}-tw)/2)`,
                        y: `(${Math.round(yRaw)}) + ((${boxH}-th)/2)`,
                        fontsize: fontSize,
                        fontcolor: normalizeFfmpegColor(el.textConfig?.color || "white"),
                        fontfile: FONT_PATH,
                        shadowcolor: 'black@0.8', shadowx: 2, shadowy: 2
                    },
                    inputs: currentBase, outputs: textLabel
                });
                currentBase = textLabel;
                filterIndex++;
            }
        }
    }

    // Footer
    if (footerEnabled) {
        // Footer background should span full OUT_W (720px) to match card preview
        combinedFilters.push({ filter: "drawbox", options: { x: 0, y: footerY, w: OUT_W, h: footerH, c: footerBgColor, t: "fill" }, inputs: currentBase, outputs: "footer_bg" });
        currentBase = "footer_bg";

        const showElements = footerConfig?.showElements || {};
        const isLightBg = getBrightness(footerConfig?.backgroundColor) > 128;
        const textColor = isLightBg ? "black" : "white";
        const iconColor = isLightBg ? "000000" : "ffffff";

        const ROW_1_Y = footerY + Math.round(15 * 1.8);
        const ROW_2_Y = footerY + Math.round(45 * 1.8);

        let activeFontPath = FONT_PATH;
        const family = footerConfig?.fontFamily || "";
        if (family.includes('Dancing Script')) activeFontPath = getEscapedFontPath("DancingScript.ttf");
        else if (family.includes('Pacifico')) activeFontPath = getEscapedFontPath("Pacifico.ttf");
        else if (family.includes('Montserrat')) activeFontPath = getEscapedFontPath("Montserrat.ttf");

        if (showElements.name && viewer.userName) {
            const truncated = viewer.userName.length > 25 ? viewer.userName.substring(0, 22) + "..." : viewer.userName;
            combinedFilters.push({
                filter: "drawtext",
                options: {
                    text: escapeDrawText(truncated),
                    x: (showElements.socialIcons) ? Math.round(20) : '(w-text_w)/2',
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
            let curX = OUT_W - Math.round(20 * 1.8) - size;
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
                    x: Math.round(20), y: Math.round(ROW_2_Y - (eSize / 2)),
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
                    x: `${Math.round(OUT_W - 20)}-text_w`,
                    y: Math.round(ROW_2_Y - (pSize / 2)),
                    fontsize: pSize, fontcolor: textColor, fontfile: `'${activeFontPath}'`
                },
                inputs: currentBase, outputs: "fph"
            });
            currentBase = "fph";
        }
    }

    ffmpegCommand.complexFilter(combinedFilters);
    ffmpegCommand.outputOptions(["-map", `[${currentBase}]`, "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "veryfast", "-f", "mp4"]);
    if (isVideoPost) ffmpegCommand.outputOptions(["-map", "0:a?", "-c:a", "aac"]);

    return { ffmpegCommand, tempSourcePath };
};
