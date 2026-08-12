const mongoose = require('mongoose');
const { prithuDB } = require('./database');
const Feed = require('./models/feedModel');

async function checkFeeds() {
    console.log('Connecting to DB...');
    const feeds = await Feed.find({ 'designMetadata.overlayElements': { $elemMatch: { type: 'calendar' } } }).sort({ createdAt: -1 }).limit(5);
    
    console.log('Found ' + feeds.length + ' feeds with calendar.');
    feeds.forEach((f, idx) => {
        const cal = f.designMetadata.overlayElements.find(e => e.type === 'calendar');
        console.log('\n--- Feed ' + idx + ' (ID: ' + f._id + ', Created: ' + f.createdAt + ') ---');
        console.log(JSON.stringify(cal, null, 2));
    });
    process.exit(0);
}
checkFeeds().catch(console.error);
