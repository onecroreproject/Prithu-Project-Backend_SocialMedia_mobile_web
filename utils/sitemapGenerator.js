const { SitemapStream, streamToPromise } = require('sitemap');
const { Readable } = require('stream');
const fs = require('fs');
const path = require('path');
const StaticPage = require('../models/StaticPage');
const Feed = require('../models/feedModel');

/**
 * Sitemap Generator Utility
 */
const generateSitemap = async (baseUrl) => {
    try {
        const links = [];

        // 1. Add Home page
        links.push({ url: '/', changefreq: 'daily', priority: 1.0 });

        // 2. Add Static Pages
        const pages = await StaticPage.find({ 'seo.isIndexed': { $ne: false } });
        pages.forEach(page => {
            links.push({
                url: `/${page.slug}`,
                changefreq: 'weekly',
                priority: 0.8
            });
        });

        // 3. Add Feeds (Important for Prithu)
        const feeds = await Feed.find({
            isApproved: true,
            status: 'published',
            'seoMetadata.isIndexed': { $ne: false }
        });

        feeds.forEach(feed => {
            if (feed.seoMetadata && feed.seoMetadata.slug) {
                links.push({
                    url: `/post/${feed.seoMetadata.slug}`,
                    changefreq: 'monthly',
                    priority: 0.6,
                    img: feed.mediaUrl ? [{ url: feed.mediaUrl }] : []
                });
            }
        });

        // Create stream
        const stream = new SitemapStream({ hostname: baseUrl });

        // Return promise
        const data = await streamToPromise(Readable.from(links).pipe(stream));

        // Optionally save to public folder if it exists
        const publicDir = path.join(__dirname, '../public');
        if (fs.existsSync(publicDir)) {
            fs.writeFileSync(path.join(publicDir, 'sitemap.xml'), data.toString());
        }

        return data.toString();
    } catch (error) {
        console.error('Sitemap Generation Error:', error);
        throw error;
    }
};

module.exports = { generateSitemap };
