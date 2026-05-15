require('dotenv').config();
const mongoose = require('mongoose');
const Feed = require('./models/feedModel');
const { Queue, Worker } = require('bullmq');
const connection = require('./Config/redisConfig');
const { prithuDB } = require('./database');
const fs = require('fs');
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegStatic = require('ffmpeg-static');
const ffprobeStatic = require('ffprobe-static');

ffmpeg.setFfmpegPath(ffmpegStatic);
ffmpeg.setFfprobePath(ffprobeStatic.path);

async function test() {
  try {
    console.log('Connecting to DB...');
    await new Promise(r => prithuDB.once('connected', r));
    console.log('Connected.');

    const localFile = 'video_0912__1__20260304_155804381_h9kvr.mp4';
    const mediaUrl = `https://api.prithu.app/media/feed/video/${localFile}`;

    const feed = await Feed.findOne({ mediaUrl });
    if (!feed) throw new Error('Feed not found');

    const qName = 'testQueue_' + Date.now();
    console.log(`Using unique queue: ${qName}`);

    const testQueue = new Queue(qName, { connection });
    
    const testWorker = new Worker(qName, async (job) => {
        console.log('🎬 [Worker] JOB RECEIVED:', job.id);
        const { feedId } = job.data;
        
        const inputPath = path.join(__dirname, 'media', 'feed', 'video', localFile);
        const outputPath = path.join(__dirname, 'media', 'feed', 'video', 'test_compressed.mp4');
        
        if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);

        console.log('🎥 [Worker] Starting FFmpeg...');
        console.log('Input:', inputPath);

        try {
            await new Promise((resolve, reject) => {
                ffmpeg(inputPath)
                    .videoCodec('libx264')
                    .addOptions(['-crf 28', '-preset fast'])
                    .videoFilters("scale='min(720,iw)':-2")
                    .on('start', (cmd) => console.log('FFmpeg command:', cmd))
                    .on('progress', (p) => {
                        if (p.percent) console.log(`Progress: ${p.percent.toFixed(2)}%`);
                    })
                    .on('end', () => {
                        console.log('FFmpeg end event');
                        resolve();
                    })
                    .on('error', (err, stdout, stderr) => {
                        console.error('FFmpeg error:', err.message);
                        reject(err);
                    })
                    .save(outputPath);
            });

            console.log('\n✅ [Worker] Compression finished.');
            await Feed.updateOne({ _id: feedId }, { isCompressed: true, compressionStatus: 'completed' });
        } catch (e) {
            console.error('Worker task error:', e);
            throw e;
        }
    }, { connection });

    console.log('Adding job to test queue...');
    await testQueue.add('test', { feedId: feed._id.toString() });

    console.log('Waiting for completion...');
    for (let i = 0; i < 300; i++) {
        const updated = await Feed.findById(feed._id);
        if (updated.isCompressed) {
            console.log('\nSUCCESS: Test compression verified!');
            process.exit(0);
        }
        await new Promise(r => setTimeout(r, 2000));
    }

    console.log('\nTimed out.');
    process.exit(1);
  } catch (error) {
    console.error('\nGlobal Error:', error);
    process.exit(1);
  }
}

test();
