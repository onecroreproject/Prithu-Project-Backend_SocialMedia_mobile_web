const path = require('path');
const { processFeedMedia } = require('./utils/feedMediaProcessor');

async function testProcessor() {
  const viewer = { userName: 'TestUser_Overlay', email: 'test@example.com', profileAvatar: '/logo/prithulogo.png' };
  
  // MOCKING THE EXACT DB DUMP
  const designMetadata = {
    overlayElements: [
      {
        id: "avatar_wjay7a",
        type: "avatar",
        visible: true,
        xPercent: 32.99, yPercent: 71.35, wPercent: 33.73, hPercent: 23.55
      },
      {
        id: "logo_ht77r5",
        type: "logo",
        visible: false,
        xPercent: 80, yPercent: 5, wPercent: 10, hPercent: 10
      },
      {
        id: "username_d3chmf",
        type: "username",
        visible: false,
        xPercent: 10, yPercent: 80, wPercent: 30, hPercent: 5
      }
    ],
    footerConfig: {
      enabled: false // Let's turn off footer to see if overlay STILL draws
    }
  };

  const videoFeed = {
    postType: 'video',
    mediaUrl: '/temp_test/dummy.mp4',
    files: [{ path: path.join(__dirname, 'temp_test', 'dummy.mp4') }]
  };

  const resVideo = await processFeedMedia({
    feed: videoFeed,
    viewer,
    designMetadata,
    tempDir: path.join(__dirname, 'temp_test', 'out_vid'),
  });

  let cmdString = "";
  await new Promise((resolve) => {
    resVideo.ffmpegCommand
      .on('start', (cmd) => {
        cmdString = cmd;
        console.log("Checking if TestUser_Overlay is drawn...");
        console.log("Found TestUser_Overlay:", cmd.includes('TestUser_Overlay'));
        console.log("Checking if drawtext filter is used at all:");
        console.log("Found drawtext filter:", cmd.includes('drawtext'));
        resolve();
      })
      .on('error', (e) => { resolve(); })
      .save(path.join(__dirname, 'temp_test', 'out_vid.mp4'));
  });
}

testProcessor().catch(console.error);
