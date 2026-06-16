const path = require('path');
const { processFeedMedia } = require('./utils/feedMediaProcessor');

async function testProcessor() {
  const viewer = { userName: 'TestUser', email: 'test@example.com', profileAvatar: '/logo/prithulogo.png' };
  const designMetadata = {
    overlayElements: [
      {
        type: 'avatar',
        xPercent: 10,
        yPercent: 10,
        wPercent: 20,
        animation: { enabled: true, direction: 'left', speed: 1 }
      },
      {
        type: 'text',
        textConfig: { content: 'Hello', color: 'white', fontSize: 24 },
        xPercent: 50,
        yPercent: 50,
        animation: { enabled: true, direction: 'bottom', speed: 1 }
      }
    ],
    footerConfig: { enabled: true, heightPercent: 10, showElements: { name: true } }
  };

  const imageFeed = {
    postType: 'image',
    mediaUrl: '/temp_test/dummy.jpg',
    files: [{ path: path.join(__dirname, 'temp_test', 'dummy.jpg') }]
  };

  const videoFeed = {
    postType: 'video',
    mediaUrl: '/temp_test/dummy.mp4',
    files: [{ path: path.join(__dirname, 'temp_test', 'dummy.mp4') }]
  };

  console.log("=== TESTING IMAGE FEED ===");
  const resImage = await processFeedMedia({
    feed: imageFeed,
    viewer,
    designMetadata,
    tempDir: path.join(__dirname, 'temp_test', 'out_img'),
  });

  console.log("Ext:", resImage.ext);
  
  await new Promise((resolve) => {
    resImage.ffmpegCommand
      .on('start', (cmd) => {
        console.log("Image CMD:", cmd);
        console.log("Checking for -loop 1:", cmd.includes('-loop 1'));
        console.log("Checking for fade filter (animation):", cmd.includes('fade='));
        resolve();
      })
      .on('error', (e) => {
        console.log("Err", e.message);
        resolve();
      })
      .save(path.join(__dirname, 'temp_test', 'out_img.jpg'));
  });

  console.log("\n=== TESTING VIDEO FEED ===");
  const resVideo = await processFeedMedia({
    feed: videoFeed,
    viewer,
    designMetadata,
    tempDir: path.join(__dirname, 'temp_test', 'out_vid'),
  });

  console.log("Ext:", resVideo.ext);
  
  await new Promise((resolve) => {
    resVideo.ffmpegCommand
      .on('start', (cmd) => {
        console.log("Video CMD:", cmd);
        console.log("Checking for -loop 1:", cmd.includes('-loop 1'));
        console.log("Checking for fade filter (animation):", cmd.includes('fade='));
        resolve();
      })
      .on('error', (e) => {
        console.log("Err", e.message);
        resolve();
      })
      .save(path.join(__dirname, 'temp_test', 'out_vid.mp4'));
  });
}

testProcessor().catch(console.error);
