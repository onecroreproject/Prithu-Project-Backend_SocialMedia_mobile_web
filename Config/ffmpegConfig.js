const ffmpeg = require('fluent-ffmpeg');
const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
const ffprobeInstaller = require('@ffprobe-installer/ffprobe');
const os = require('os');

ffmpeg.setFfmpegPath('/usr/bin/ffmpeg');
ffmpeg.setFfprobePath(ffprobeInstaller.path);

console.log(`FFmpeg path configured to: /usr/bin/ffmpeg`);
console.log('FFprobe path configured correctly.');
