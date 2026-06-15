const ffmpeg = require('fluent-ffmpeg');
const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
const ffprobeInstaller = require('@ffprobe-installer/ffprobe');
const os = require('os');

// PM2 often caches old .env variables, making NODE_ENV unreliable.
// Since you develop on Windows and deploy to Linux, we can just check the OS.
// If it's Linux, forcefully use the system's ffmpeg. Otherwise, use the local npm binary.
const isLinux = os.platform() === 'linux';
const customFfmpegPath = isLinux ? '/usr/bin/ffmpeg' : ffmpegInstaller.path;

ffmpeg.setFfmpegPath(customFfmpegPath);
ffmpeg.setFfprobePath(ffprobeInstaller.path);

console.log(`FFmpeg path configured to: ${customFfmpegPath} (Linux detected: ${isLinux})`);
console.log('FFprobe path configured correctly.');
