const mongoose = require('mongoose');
const { prithuDB } = require('../database');

const appVersionConfigSchema = new mongoose.Schema({
    platform: {
        type: String,
        enum: ['android', 'ios', 'all'],
        default: 'android',
        unique: true,
    },
    latestVersion: {
        type: String,
        default: '2.0.6',
        trim: true,
    },
    latestVersionCode: {
        type: Number,
        default: 26,
    },
    minRequiredVersion: {
        type: String,
        default: '2.0.0',
        trim: true,
    },
    minRequiredVersionCode: {
        type: Number,
        default: 20,
    },
    forceUpdate: {
        type: Boolean,
        default: false,
    },
    title: {
        type: String,
        default: 'New Version Available! 🚀',
        trim: true,
    },
    message: {
        type: String,
        default: 'A new and improved version of Prithu is available on the Play Store with exciting new features and improvements.',
        trim: true,
    },
    releaseNotes: {
        type: [String],
        default: [
            '🎨 New HD poster templates & daily special day greetings',
            '⚡ Faster media download and smooth sharing',
            '🔔 Instant real-time notifications',
            '🛠️ Performance improvements and bug fixes',
        ],
    },
    playStoreUrl: {
        type: String,
        default: 'https://play.google.com/store/apps/details?id=com.dlktechnologies.Prithu',
        trim: true,
    },
    playStorePackage: {
        type: String,
        default: 'com.dlktechnologies.Prithu',
        trim: true,
    },
    apkDownloadUrl: {
        type: String,
        default: '',
        trim: true,
    },
    isActive: {
        type: Boolean,
        default: true,
    },
}, {
    timestamps: true,
});

module.exports = prithuDB.model('AppVersionConfig', appVersionConfigSchema);
