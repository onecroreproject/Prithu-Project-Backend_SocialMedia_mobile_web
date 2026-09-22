const AppVersionConfig = require('../models/AppVersionConfig');

// Compare two semver strings: returns 1 if v1 > v2, -1 if v1 < v2, 0 if equal
const compareVersions = (v1 = '0.0.0', v2 = '0.0.0') => {
    const p1 = String(v1).replace(/[^0-9.]/g, '').split('.').map(n => parseInt(n, 10) || 0);
    const p2 = String(v2).replace(/[^0-9.]/g, '').split('.').map(n => parseInt(n, 10) || 0);
    const maxLen = Math.max(p1.length, p2.length);

    for (let i = 0; i < maxLen; i++) {
        const num1 = p1[i] || 0;
        const num2 = p2[i] || 0;
        if (num1 > num2) return 1;
        if (num1 < num2) return -1;
    }
    return 0;
};

// GET /api/app/version-check or /user/app/version-check
// Query params: currentVersion, versionCode, platform ('android'|'ios')
exports.checkAppVersion = async (req, res) => {
    try {
        const { currentVersion = '2.0.5', versionCode = 25, platform = 'android' } = req.query;

        let config = await AppVersionConfig.findOne({ platform: platform.toLowerCase(), isActive: true });
        if (!config) {
            config = await AppVersionConfig.findOne({ platform: 'android' });
        }

        // Default fallback if no database record exists yet
        if (!config) {
            config = {
                platform: 'android',
                latestVersion: '2.0.6',
                latestVersionCode: 26,
                minRequiredVersion: '2.0.0',
                minRequiredVersionCode: 20,
                forceUpdate: false,
                title: 'New Version Available! 🚀',
                message: 'A new and improved version of Prithu is available on the Play Store.',
                releaseNotes: [
                    '🎨 New HD poster templates & daily special day greetings',
                    '⚡ Faster media download and smooth sharing',
                    '🔔 Instant real-time notifications',
                    '🛠️ Performance improvements and bug fixes',
                ],
                playStoreUrl: 'https://play.google.com/store/apps/details?id=com.dlktechnologies.Prithu',
                playStorePackage: 'com.dlktechnologies.Prithu',
                apkDownloadUrl: '',
                isActive: true,
            };
        }

        const isNewer = compareVersions(config.latestVersion, currentVersion) > 0 || (Number(versionCode) < config.latestVersionCode);
        const isBelowMin = compareVersions(config.minRequiredVersion, currentVersion) > 0 || (Number(versionCode) < config.minRequiredVersionCode);
        const isForceUpdate = Boolean(config.forceUpdate || isBelowMin);

        return res.status(200).json({
            success: true,
            updateAvailable: isNewer,
            forceUpdate: isForceUpdate,
            currentVersion: String(currentVersion),
            latestVersion: config.latestVersion,
            latestVersionCode: config.latestVersionCode,
            minRequiredVersion: config.minRequiredVersion,
            title: config.title || 'New Version Available! 🚀',
            message: config.message || 'Please update to the latest version of Prithu for the best experience.',
            releaseNotes: Array.isArray(config.releaseNotes) && config.releaseNotes.length > 0 ? config.releaseNotes : [
                '🎨 New HD poster templates & daily special day greetings',
                '⚡ Faster media download and smooth sharing',
                '🔔 Instant real-time notifications',
                '🛠️ Performance improvements and bug fixes',
            ],
            playStoreUrl: config.playStoreUrl || 'https://play.google.com/store/apps/details?id=com.dlktechnologies.Prithu',
            playStorePackage: config.playStorePackage || 'com.dlktechnologies.Prithu',
            apkDownloadUrl: config.apkDownloadUrl || '',
            playStoreIntent: `market://details?id=${config.playStorePackage || 'com.dlktechnologies.Prithu'}`,
        });
    } catch (error) {
        console.error('Error checking app version:', error);
        return res.status(500).json({
            success: false,
            message: 'Server error checking version',
            error: error.message,
        });
    }
};

// Admin: GET /api/admin/app-version
exports.adminGetAppVersionConfig = async (req, res) => {
    try {
        let config = await AppVersionConfig.findOne({ platform: 'android' });
        if (!config) {
            config = await AppVersionConfig.create({
                platform: 'android',
                latestVersion: '2.0.6',
                latestVersionCode: 26,
                minRequiredVersion: '2.0.0',
                minRequiredVersionCode: 20,
                forceUpdate: false,
                title: 'New Version Available! 🚀',
                message: 'A new and improved version of Prithu is available on the Play Store.',
                releaseNotes: [
                    '🎨 New HD poster templates & daily special day greetings',
                    '⚡ Faster media download and smooth sharing',
                    '🔔 Instant real-time notifications',
                    '🛠️ Performance improvements and bug fixes',
                ],
                playStoreUrl: 'https://play.google.com/store/apps/details?id=com.dlktechnologies.Prithu',
                playStorePackage: 'com.dlktechnologies.Prithu',
            });
        }
        return res.status(200).json({ success: true, config });
    } catch (error) {
        console.error('Error getting admin app version config:', error);
        return res.status(500).json({ success: false, message: 'Server error', error: error.message });
    }
};

// Admin: PUT /api/admin/app-version
exports.adminUpdateAppVersionConfig = async (req, res) => {
    try {
        const {
            platform = 'android',
            latestVersion,
            latestVersionCode,
            minRequiredVersion,
            minRequiredVersionCode,
            forceUpdate,
            title,
            message,
            releaseNotes,
            playStoreUrl,
            playStorePackage,
            apkDownloadUrl,
            isActive,
        } = req.body;

        const updateData = {};
        if (latestVersion !== undefined) updateData.latestVersion = String(latestVersion).trim();
        if (latestVersionCode !== undefined) updateData.latestVersionCode = Number(latestVersionCode);
        if (minRequiredVersion !== undefined) updateData.minRequiredVersion = String(minRequiredVersion).trim();
        if (minRequiredVersionCode !== undefined) updateData.minRequiredVersionCode = Number(minRequiredVersionCode);
        if (forceUpdate !== undefined) updateData.forceUpdate = Boolean(forceUpdate);
        if (title !== undefined) updateData.title = String(title).trim();
        if (message !== undefined) updateData.message = String(message).trim();
        if (releaseNotes !== undefined) {
            updateData.releaseNotes = Array.isArray(releaseNotes)
                ? releaseNotes.map(n => String(n).trim()).filter(Boolean)
                : String(releaseNotes).split('\n').map(n => n.trim()).filter(Boolean);
        }
        if (playStoreUrl !== undefined) updateData.playStoreUrl = String(playStoreUrl).trim();
        if (playStorePackage !== undefined) updateData.playStorePackage = String(playStorePackage).trim();
        if (apkDownloadUrl !== undefined) updateData.apkDownloadUrl = String(apkDownloadUrl).trim();
        if (isActive !== undefined) updateData.isActive = Boolean(isActive);

        const config = await AppVersionConfig.findOneAndUpdate(
            { platform: platform.toLowerCase() },
            { $set: updateData },
            { new: true, upsert: true }
        );

        return res.status(200).json({
            success: true,
            message: 'App version configuration updated successfully',
            config,
        });
    } catch (error) {
        console.error('Error updating admin app version config:', error);
        return res.status(500).json({ success: false, message: 'Server error', error: error.message });
    }
};
