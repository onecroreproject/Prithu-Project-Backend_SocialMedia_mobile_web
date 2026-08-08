const sharp = require('sharp');
const axios = require('axios');
const fs = require('fs');

const SOCIAL_SLUGS = {
    'twitter': 'x',
    'linkedin': 'linkedin',
    'facebook': 'facebook',
    'instagram': 'instagram',
    'youtube': 'youtube',
    'github': 'github',
    'website': 'internetexplorer'
};

const SOCIAL_BRAND = {
    facebook: { bg: '#1877F2', icon: '#ffffff' },
    instagram: { bg: '#E4405F', icon: '#ffffff' },
    whatsapp: { bg: '#25D366', icon: '#ffffff' },
    youtube: { bg: '#FF0000', icon: '#ffffff' },
    twitter: { bg: '#000000', icon: '#ffffff' },
    linkedin: { bg: '#0A66C2', icon: '#ffffff' },
    github: { bg: '#333333', icon: '#ffffff' },
    website: { bg: '#4A90E2', icon: '#ffffff' },
    x: { bg: '#000000', icon: '#ffffff' }
};

const getSocialBrand = (platform = '') => {
    const key = platform.toLowerCase();
    return SOCIAL_BRAND[key] || SOCIAL_BRAND.website;
};

const downloadSocialIcon = async (platform, dest, size = 48) => {
    try {
        const slug = SOCIAL_SLUGS[platform.toLowerCase()] || platform.toLowerCase();
        const brand = getSocialBrand(platform);
        
        // Download white icon
        const iconUrl = `https://cdn.simpleicons.org/${slug}/ffffff`;
        const response = await axios({
            url: iconUrl,
            method: 'GET',
            responseType: 'arraybuffer',
            timeout: 10000
        });

        // 60% of total size for the inner icon
        const innerSize = Math.floor(size * 0.6);

        // SVG circle background
        const circleSvg = Buffer.from(
            `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
                <circle cx="${size/2}" cy="${size/2}" r="${size/2}" fill="${brand.bg}" />
             </svg>`
        );

        // Convert icon SVG to PNG buffer
        const innerIconBuffer = await sharp(response.data)
            .resize(innerSize, innerSize)
            .png()
            .toBuffer();

        // Composite them together
        await sharp(circleSvg)
            .composite([{ input: innerIconBuffer, gravity: 'center' }])
            .png()
            .toFile(dest);
            
        console.log(`Created ${dest} for ${platform}`);
        return true;
    } catch (err) {
        console.error(`Download failed for ${platform}:`, err.message);
        return false;
    }
};

(async () => {
    await downloadSocialIcon('facebook', 'fb_test.png', 64);
    await downloadSocialIcon('instagram', 'ig_test.png', 64);
    await downloadSocialIcon('twitter', 'x_test.png', 64);
})();
