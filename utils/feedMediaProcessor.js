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
    'website': 'internetexplorer'
};

const downloadSocialIcon = async (platform, dest, color = 'white', size = 48) => {
    try {
        const slug = SOCIAL_SLUGS[platform.toLowerCase()] || platform.toLowerCase();
        // Use color suffix: 'white' or hex (e.g. '000000' for black)
        const iconUrl = `https://cdn.simpleicons.org/${slug}/${color}`;
        const response = await axios({
            url: iconUrl,
            method: 'GET',
            responseType: 'arraybuffer',
            timeout: 10000
        });

        // Convert SVG buffer to PNG and resize to specified size
        await sharp(response.data)
            .resize(size, size)
            .png()
            .toFile(dest);
        return true;
    } catch (err) {
        console.error(`[FS] Download failed for https://cdn.simpleicons.org/${platform}:`, err.message);
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
        if (url.startsWith('/media/')) return path.join(process.cwd(), url);
        if (BACKEND_URL && url.startsWith(BACKEND_URL)) {
            const relPath = url.replace(BACKEND_URL, '');
            return path.join(process.cwd(), relPath);
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

    const mediaUrl = feed.mediaUrl;
    let localPath = feed.storage?.paths?.media || feed.files?.[0]?.path;

    // Enhanced local path resolution
    if (!localPath || !fs.existsSync(localPath)) {
        localPath = resolveLocalPath(mediaUrl);
    }

    console.log(`[Processor] Resolved media source: ${localPath || mediaUrl}`);

    const postType = feed.postType || "image";
    const isVideoPost = postType === "video";
    const isImagePost = postType === "image" || postType === "image+audio";
    const tempSourcePath = path.join(tempDir, isVideoPost ? "source.mp4" : "source.jpg");

    if (localPath && fs.existsSync(localPath)) {
        console.log(`[Processor] Copying local file instead of downloading: ${localPath}`);
        fs.copyFileSync(localPath, tempSourcePath);
    } else {
        console.log(`[Processor] Downloading source media to: ${tempSourcePath}`);
        await downloadFile(mediaUrl, tempSourcePath);
    }
    console.log(`[Processor] Source media ready.`);
    if (onProgress) onProgress(30);

    // 2. METADATA & DIMENSIONS
    console.log(`[Processor] Extracting metadata from source...`);
    const sourceMeta = await getVideoMetadata(tempSourcePath);
    console.log(`[Processor] Metadata: ${JSON.stringify(sourceMeta)}`);

    const footerConfig = designMetadata?.footerConfig;
    const footerEnabled = !!footerConfig?.enabled;
    const footerH = footerStyle.footerHeight || (footerEnabled ? Math.round((footerConfig.heightPercent / 100) * OUT_H) : 0);
    const maxMediaH = OUT_H - footerH;

    if (isImagePost) {
        sourceMeta.width = sourceMeta.width || OUT_W;
        sourceMeta.height = sourceMeta.height || maxMediaH;
    }

    const scaleFactor = Math.min(OUT_W / sourceMeta.width, maxMediaH / sourceMeta.height);
    const actualMediaW = Math.round(sourceMeta.width * scaleFactor);
    const actualMediaH = Math.round(sourceMeta.height * scaleFactor);
    const paddingX = (OUT_W - actualMediaW) / 2;

    // Removal of unwanted space: Make canvas height exactly fit the combined block
    const combinedBlockH = actualMediaH + footerH;
    const finalOUT_H = combinedBlockH % 2 === 0 ? combinedBlockH : combinedBlockH + 1;
    const yOffset = 0; // Start at the very top (remove top space)
    const footerY = actualMediaH; // Footer sits exactly below media

    console.log(`[Processor] Dimensions: actualMediaH=${actualMediaH}, footerH=${footerH}, totalH=${combinedBlockH}, finalOUT_H=${finalOUT_H}, footerY=${footerY}`);

    let dominantColor = footerConfig?.backgroundColor || "#1a1a1a";
    if (footerConfig?.useDominantColor) {
        dominantColor = await getDominantColor(tempSourcePath, isVideoPost, tempDir);
        console.log(`[Processor] Content-aware dominant color: ${dominantColor}`);
    }
    const footerBgColor = normalizeFfmpegColor(dominantColor);

    // 3. FFMPEG SETUP
    const ffmpegCommand = ffmpeg(tempSourcePath)
        .inputOptions([
            "-err_detect ignore_err",
            "-fflags +genpts"
        ]);
    const duration = sourceMeta.duration && sourceMeta.duration !== 'N/A' ? sourceMeta.duration : 8;
    if (isImagePost) ffmpegCommand.inputOptions(["-loop", "1", "-t", duration.toString()]);

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

    // Base Canvas: Normalize to RGBA to prevent re-init errors with overlays
    console.log(`[Processor] Configuring base canvas filters...`);
    combinedFilters.push(
        { filter: "scale", options: `w=${OUT_W}:h=${actualMediaH}:force_original_aspect_ratio=decrease`, inputs: "0:v", outputs: "scaled_base" },
        { filter: "pad", options: `w=${OUT_W}:h=${actualMediaH}:x=(ow-iw)/2:y=oh-ih:color=black`, inputs: "scaled_base", outputs: "padded_base" },
        { filter: "pad", options: `w=${OUT_W}:h=${finalOUT_H}:x=0:y=0:color=black`, inputs: "padded_base", outputs: "rgba_base" },
        { filter: "format", options: "rgba", inputs: "rgba_base", outputs: currentBase }
    );

    // 4. OVERLAYS
    const overlayElements = [...(designMetadata?.overlayElements || []).filter(el => el.visible !== false)]
        .sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0));
    console.log(`[Processor] Processing ${overlayElements.length} overlay elements...`);

    let filterIndex = 1;

    const getFontFile = (family = "") => {
        const f = family.toLowerCase();
        if (f.includes('pacifico')) return path.join(__dirname, '../assets/Pacifico.ttf');
        if (f.includes('dancing script')) return path.join(__dirname, '../assets/DancingScript.ttf');
        if (f.includes('montserrat')) return path.join(__dirname, '../assets/Montserrat.ttf');
        if (f.includes('playfair display')) return path.join(__dirname, '../assets/PlayfairDisplay.ttf');
        if (f.includes('fira code') || f.includes('mono')) return path.join(__dirname, '../assets/RobotoMono.ttf');
        return path.join(__dirname, '../assets/Outfit.ttf');
    };

    for (const el of overlayElements) {
        let overlayMediaUrl = null;
        if (el.type === 'avatar') overlayMediaUrl = el.mediaConfig?.url || viewer?.profileAvatar;
        else if (el.type === "logo") overlayMediaUrl = el.mediaConfig?.url || "/logo/prithulogo.png";

        if (overlayMediaUrl) {
            overlayMediaUrl = getMediaUrl(overlayMediaUrl);
            const overlayDest = path.join(tempDir, `overlay_${overlayInputIndex}.png`);

            try {
                await downloadFile(overlayMediaUrl, overlayDest);
                const xRaw = ((el.xPercent / 100) * OUT_W);
                const yRaw = (yOffset + ((el.yPercent / 100) *maxMediaH));
                const scaleW = Math.max(10, Math.round((el.wPercent || 20) / 100 * OUT_W));
                const scaleH = el.hPercent ? Math.round((el.hPercent / 100) * maxMediaH) : scaleW;

                let xExpr = `${xRaw}`, yExpr = `${yRaw}`;
                const dur = Number(el.animation?.speed || 1);
                const delay = Number(el.animation?.delay || 0);

                if (el.animation?.enabled && el.animation.direction !== "none") {
                    const dir = el.animation.direction;
                    let startX = xRaw, startY = yRaw;
                    if (dir.includes('left')) startX = -scaleW;
                    if (dir.includes('right')) startX = OUT_W;
                    if (dir.includes('top')) startY = yOffset - scaleW;
                    if (dir.includes('bottom')) startY = yOffset + actualMediaH;

                    if (startX !== xRaw) xExpr = `if(lt(t,${delay}),(${startX}),if(lt(t,${delay + dur}),(${startX})+(${xRaw}-(${startX}))*(t-${delay})/${dur},${xRaw}))`;
                    if (startY !== yRaw) yExpr = `if(lt(t,${delay}),(${startY}),if(lt(t,${delay + dur}),(${startY})+(${yRaw}-(${startY}))*(t-${delay})/${dur},${yRaw}))`;
                }

                const fmtLabel = `fmt${filterIndex}`, rawLabel = `raw${filterIndex}`, maskedLabel = `masked${filterIndex}`, overlayLabel = `over${filterIndex}`;
                let currentOverlayInput = `${overlayInputIndex}:v`;

                // CRITICAL: Normalize every image input to RGBA immediately
                combinedFilters.push({ filter: 'format', options: 'rgba', inputs: currentOverlayInput, outputs: fmtLabel });
                currentOverlayInput = fmtLabel;

                const shape = el.avatarConfig?.shape || el.shape || 'circle';
                const isRound = el.type === 'avatar' && (shape === 'circle' || shape === 'round');
                const maskedAvatarPath = path.join(tempDir, `masked_${overlayInputIndex}.png`);

                // Create a "soft bottom" mask using SVG gradient
                // Fades from white (opaque) to transparent at the bottom (starting at 70%)
                // Dynamic SVG dimensions and path mapping
                const maskSvg = Buffer.from(isRound
                    ? `<svg width="${scaleW}" height="${scaleH}">
                        <defs>
                          <linearGradient id="fade" x1="0%" y1="0%" x2="0%" y2="100%">
                            <stop offset="70%" stop-color="white" />
                            <stop offset="100%" stop-color="transparent" />
                          </linearGradient>
                        </defs>
                        <ellipse cx="${scaleW / 2}" cy="${scaleH / 2}" rx="${scaleW / 2}" ry="${scaleH / 2}" fill="url(#fade)"/>
                      </svg>`
                    : `<svg width="${scaleW}" height="${scaleH}">
                        <defs>
                          <linearGradient id="fade" x1="0%" y1="0%" x2="0%" y2="100%">
                            <stop offset="70%" stop-color="white" />
                            <stop offset="100%" stop-color="transparent" />
                          </linearGradient>
                        </defs>
                        <rect x="0" y="0" width="${scaleW}" height="${scaleH}" fill="url(#fade)"/>
                      </svg>`
                );

                if (el.type === 'avatar') {
                    await sharp(overlayDest)
                        .resize(scaleW, scaleH, { fit: 'cover' })
                        .composite([{ input: maskSvg, blend: 'dest-in' }])
                        .png()
                        .toFile(maskedAvatarPath);
                    ffmpegCommand.input(maskedAvatarPath).inputOptions(["-loop", "1", "-t", duration.toString()]);
                } else {
                    // Non-avatar (logos) use standard download path
                    ffmpegCommand.input(overlayDest).inputOptions(["-loop", "1", "-t", duration.toString()]);
                }

                overlayInputIndex++;

                if (!isRound && el.type !== 'avatar') {
                    combinedFilters.push({ filter: 'scale', options: `w=${scaleW}:h=-1`, inputs: currentOverlayInput, outputs: rawLabel });
                    currentOverlayInput = rawLabel;
                }

                if (el.animation?.enabled) {
                    combinedFilters.push({ filter: 'fade', options: { t: 'in', st: 0, d: dur, alpha: 1 }, inputs: currentOverlayInput, outputs: maskedLabel });
                    currentOverlayInput = maskedLabel;
                }

                combinedFilters.push({ filter: 'overlay', options: { x: xExpr, y: yExpr, eval: 'frame' }, inputs: [currentBase, currentOverlayInput], outputs: overlayLabel });
                currentBase = overlayLabel;
                filterIndex++;
            } catch (e) { console.error(`Overlay failed: ${el.type}`, e.message); }
        }

        if (el.type === 'username' || el.type === 'text') {
            const content = el.type === 'username' ? (viewer?.userName) : (el.textConfig?.content);
            if (content) {
                const xRaw = (el.xPercent / 100) * OUT_W, yRaw = yOffset + ((el.yPercent / 100) * actualMediaH);
                const fontSize = Math.round((el.textConfig?.fontSize || 24) * 2.5);
                const textLabel = `text${filterIndex}`;

                let xExpr = `${Math.round(xRaw)}`, yExpr = `${Math.round(yRaw)}`;
                if (el.animation?.enabled && el.animation.direction !== "none") {
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
    if (footerEnabled) {
        console.log(`[Processor] Adding footer... footerConfig:`, JSON.stringify(footerConfig, null, 2));
        console.log(`[Processor] Viewer data:`, JSON.stringify(viewer, null, 2));
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

        const textColor = normalizeFfmpegColor(adaptiveTextColor); // Force automatic contrast
        const shadowColor = normalizeFfmpegColor(footerStyle.shadowColor || adaptiveShadowColor);

        // Map font family
        const ACTIVE_FONT = getFontFile(footerConfig.fontFamily).replace(/\\/g, "/").replace(/([:])/, "\\\\$1");

        if (showElements.name && viewer.userName) {
            const nameSize = Math.round(footerStyle.nameSize * (footerConfig.usernameScale || 1));
            const nameLabel = `footer_name`;
            combinedFilters.push({ filter: "drawtext", options: { text: escapeDrawText(viewer.userName), x: (!showElements.socialIcons || visibleSocialIcons.length === 0) ? '(w-text_w)/2' : Math.round(paddingX + footerStyle.paddingLeft), y: Math.round(ROW_1_Y - (nameSize / 2)), fontsize: nameSize, fontcolor: textColor, fontfile: `'${ACTIVE_FONT}'`, shadowcolor: shadowColor, shadowx: footerStyle.shadowX, shadowy: footerStyle.shadowY }, inputs: currentBase, outputs: nameLabel });
            currentBase = nameLabel;
        }

        if (showElements.socialIcons && visibleSocialIcons.length > 0) {
            const iconSize = footerStyle.iconSize || 48;
            let currentIconX = paddingX + actualMediaW - footerStyle.paddingRight - iconSize;
            for (let i = 0; i < visibleSocialIcons.length; i++) {
                const iconPath = path.join(tempDir, `social_${i}.png`);
                try {
                    const success = await downloadSocialIcon(visibleSocialIcons[i].platform, iconPath, adaptiveIconColor, footerStyle.iconSize || 48);
                    if (!success) continue;

                    // Social icons must be looped to match video duration
                    ffmpegCommand.input(iconPath).inputOptions(["-loop", "1", "-t", duration.toString()]);
                    const iconIdx = overlayInputIndex++;
                    const iconLabel = `social_over_${i}`;
                    const iconSize = footerStyle.iconSize || 48;
                    combinedFilters.push(
                        { filter: 'format', options: 'rgba', inputs: `${iconIdx}:v`, outputs: `sf${i}` },
                        { filter: 'overlay', options: `x=${Math.round(currentIconX)}:y=${Math.round(ROW_1_Y - (iconSize / 2))}`, inputs: [currentBase, `sf${i}`], outputs: iconLabel }
                    );
                    currentBase = iconLabel;
                    currentIconX -= footerStyle.socialIconSpacing;
                } catch (e) {
                    console.error(`[Processor] Error processing social icon ${visibleSocialIcons[i].platform}:`, e.message);
                }
            }
        }

        if (showElements.email && viewer.email) {
            const emailSize = Math.round(footerStyle.emailSize * (footerConfig.emailScale || 1));
            const emailLabel = `footer_email`;
            combinedFilters.push({ filter: "drawtext", options: { text: escapeDrawText(viewer.email), x: Math.round(paddingX + footerStyle.paddingLeft), y: Math.round(ROW_2_Y - (emailSize / 2)), fontsize: emailSize, fontcolor: textColor, fontfile: `'${ACTIVE_FONT}'`, shadowcolor: shadowColor, shadowx: footerStyle.shadowX, shadowy: footerStyle.shadowY }, inputs: currentBase, outputs: emailLabel });
            currentBase = emailLabel;
        }
        if (showElements.phone && (viewer.phone || viewer.phoneNumber)) {
            const phoneSize = Math.round(footerStyle.phoneSize * (footerConfig.phoneScale || 1));
            const phoneLabel = `footer_phone`;
            const phoneText = viewer.phone || viewer.phoneNumber;
            combinedFilters.push({ filter: "drawtext", options: { text: escapeDrawText(phoneText), x: `${Math.round(paddingX + actualMediaW - footerStyle.paddingRight)}-text_w`, y: Math.round(ROW_2_Y - (phoneSize / 2)), fontsize: phoneSize, fontcolor: textColor, fontfile: `'${ACTIVE_FONT}'`, shadowcolor: shadowColor, shadowx: footerStyle.shadowX, shadowy: footerStyle.shadowY }, inputs: currentBase, outputs: phoneLabel });
            currentBase = phoneLabel;
        }
    }

    // 6. FINAL BUILD
    console.log(`[Processor] Finalizing FFmpeg build...`);
    ffmpegCommand.complexFilter(combinedFilters);


    const outputOptions = [
        "-map", `[${currentBase}]`,
        "-c:v", "libx264",
        "-profile:v", "baseline",
        "-level", "3.0",
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
        outputOptions.push("-map", "0:a?", "-c:a", "aac", "-b:a", "128k");
    } else if (isImagePost) {
        // Ensure image-only output also terminates at shortest input
        outputOptions.push("-shortest");
    }

    ffmpegCommand.outputOptions(outputOptions);

    return { ffmpegCommand, tempSourcePath };
};
