const ffmpeg = require('fluent-ffmpeg');
const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
const ffprobeInstaller = require('@ffprobe-installer/ffprobe');

// In production, we need a full FFmpeg build to support 'drawtext' filter.
// You can provide FFMPEG_PATH in your .env, or it will default to the system's /usr/bin/ffmpeg in production.
const customFfmpegPath = process.env.FFMPEG_PATH || (process.env.NODE_ENV === 'production' ? '/usr/bin/ffmpeg' : ffmpegInstaller.path);

ffmpeg.setFfmpegPath(customFfmpegPath);
ffmpeg.setFfprobePath(ffprobeInstaller.path);

console.log(`FFmpeg path configured to: ${customFfmpegPath}`);
console.log('FFprobe path configured correctly.');
