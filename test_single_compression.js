require('dotenv').config();
const mongoose = require('mongoose');
const Feed = require('./models/feedModel');
const videoCompressionQueue = require('./queues/videoCompressionQueue');
const { prithuDB } = require('./database');
const fs = require('fs');
const path = require('path');

async function test() {
  try {
    console.log('Connecting to DB...');
    await new Promise(r => prithuDB.once('connected', r));
    console.log('Connected.');

    const localFile = 'video_0912__1__20260304_155804381_h9kvr.mp4';
    const mediaUrl = `https://api.prithu.app/media/feed/video/${localFile}`;

    let feed = await Feed.findOne({ mediaUrl });

    if (!feed) {
      console.log('Creating dummy feed for local file...');
      const catId = new mongoose.Types.ObjectId();
      const userId = new mongoose.Types.ObjectId();

      feed = new Feed({
        uploadType: 'normal',
        postType: 'video',
        mediaUrl: mediaUrl,
        category: [catId],
        postedBy: {
            userId: userId,
            name: 'Test Admin',
            role: 'Admin'
        },
        roleRef: 'Admin',
        isCompressed: false,
        compressionStatus: 'pending'
      });
      await feed.save();
      console.log('Dummy feed created.');
    } else {
      console.log('Found existing feed for local file.');
      feed.isCompressed = false;
      feed.compressionStatus = 'pending';
      feed.compressionLocked = false;
      await feed.save();
    }

    console.log(`Testing with feed: ${feed._id}`);
    
    // Capture original size
    const filePath = path.join(__dirname, 'media', 'feed', 'video', localFile);
    if (!fs.existsSync(filePath)) {
        throw new Error(`File not found at ${filePath}`);
    }
    const originalSize = fs.statSync(filePath).size;
    console.log(`Original Size: ${(originalSize / 1024 / 1024).toFixed(2)} MB`);

    // Queue for compression
    console.log('Adding to queue...');
    const job = await videoCompressionQueue.add('compress', { feedId: feed._id.toString() });
    console.log(`Job added to queue. Job ID: ${job.id}`);

    console.log('Waiting for status update (polling DB)...');
    let lastStatus = '';
    for (let i = 0; i < 60; i++) {
      const updatedFeed = await Feed.findById(feed._id);
      
      const currentStatus = updatedFeed.compressionStatus || 'pending';
      if (currentStatus !== lastStatus) {
        console.log(`\nStatus changed: ${currentStatus}`);
        lastStatus = currentStatus;
      }
      process.stdout.write('.');
      
      if (updatedFeed.isCompressed) {
        console.log('\nSUCCESS: Video compressed successfully!');
        const newSize = fs.statSync(filePath).size;
        console.log(`New Size: ${(newSize / 1024 / 1024).toFixed(2)} MB`);
        console.log(`Reduction: ${((1 - (newSize / originalSize)) * 100).toFixed(2)}%`);
        break;
      }
      
      if (updatedFeed.compressionStatus === 'failed') {
        console.log(`\nFAILED: ${updatedFeed.compressionError}`);
        break;
      }
      
      await new Promise(r => setTimeout(r, 2000));
    }

    process.exit(0);
  } catch (error) {
    console.error('\nError during test:', error);
    process.exit(1);
  }
}

test();
