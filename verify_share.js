const Module = require('module');
const originalRequire = Module.prototype.require;

// Mock modules BEFORE they are required
Module.prototype.require = function (path) {
    if (path.includes('database')) {
        return { prithuDB: { model: () => ({}) } };
    }
    if (path.includes('feedModel')) {
        return {
            findById: (id) => ({
                lean: () => {
                    if (id === 'valid-id') {
                        return {
                            _id: 'valid-id',
                            mediaUrl: '/uploads/video.mp4',
                            caption: 'Test Caption',
                            files: [{ thumbnail: '/uploads/thumb.jpg' }]
                        };
                    }
                    return null;
                }
            })
        };
    }
    if (path.includes('storageEngine')) {
        return {
            getMediaUrl: (p) => p ? `https://api.test.app${p}` : ""
        };
    }
    // Mock other potentially problematic modules
    if (path.includes('ffmpegConfig') || path.includes('jwtAuthentication') || path.includes('creatorAccountactiveStatus') || path.includes('webSocket') || path.includes('monitor')) {
        return {};
    }
    return originalRequire.apply(this, arguments);
};

const { sharePostOG } = require('r:/Suriya.DLK/newProject/be/controllers/feedControllers/userActionsFeedController');

async function runTests() {
    console.log('Running sharePostOG tests...');
    process.env.BACKEND_URL = 'https://api.test.app';

    const res = {
        status: function (s) { this.statusCode = s; return this; },
        send: function (content) { this.sentContent = content; return this; },
        statusCode: null,
        sentContent: null
    };

    // Test 1: Feed not found
    await sharePostOG({ params: { feedId: 'invalid' }, query: {}, headers: {} }, res);
    if (res.statusCode === 404) {
        console.log('✅ Test 1 Passed: 404 for invalid feed');
    } else {
        console.log('❌ Test 1 Failed: expected 404, got', res.statusCode);
    }

    // Test 2: Crawler detection (WhatsApp)
    await sharePostOG({
        params: { feedId: 'valid-id' },
        query: {},
        headers: { 'user-agent': 'WhatsApp/2.21.12.21 A' }
    }, res);
    if (res.statusCode === 200 && res.sentContent.includes('og:video')) {
        console.log('✅ Test 2 Passed: OG tags for crawler');
    } else {
        console.log('❌ Test 2 Failed: expected OG tags, got status', res.statusCode);
    }

    // Test 3: Normal user detection
    await sharePostOG({
        params: { feedId: 'valid-id' },
        query: {},
        headers: { 'user-agent': 'Mozilla/5.0' }
    }, res);
    if (res.statusCode === 200 && res.sentContent.includes('<video')) {
        console.log('✅ Test 3 Passed: Video player for normal user');
    } else {
        console.log('❌ Test 3 Failed: expected video player, got status', res.statusCode);
    }
}

runTests().catch(err => console.error('Error during testing:', err));
