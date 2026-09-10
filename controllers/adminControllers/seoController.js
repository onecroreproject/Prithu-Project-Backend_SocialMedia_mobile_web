const SEOConfig = require('../../models/SEOConfig');
const Redirect = require('../../models/Redirect');
const StaticPage = require('../../models/StaticPage');
const Feed = require('../../models/feedModel');
const { clearFeedsCache } = require('../feedControllers/feedsController');
const { generateSitemap } = require('../../utils/sitemapGenerator');
const GoogleSeoApi = require('../../utils/googleApi');
const { calculateSeoScore } = require('../../utils/seoScorer');
const fs = require('fs');
const path = require('path');

/**
 * SEO Management Controller
 */

// 1. SEO Dashboard Stats
exports.getSeoDashboardStats = async (req, res) => {
    try {
        const config = await SEOConfig.findOne();

        // Counts for missing data
        const totalPages = await StaticPage.countDocuments();
        const pagesMissingTitle = await StaticPage.countDocuments({ 'seo.metaTitle': { $in: ["", null] } });
        const pagesMissingDesc = await StaticPage.countDocuments({ 'seo.metaDescription': { $in: ["", null] } });

        const totalFeeds = await Feed.countDocuments({ isApproved: true, status: 'published' });
        const feedsMissingTitle = await Feed.countDocuments({
            isApproved: true,
            status: 'published',
            'seoMetadata.title': { $in: ["", null] }
        });

        const redirectsCount = await Redirect.countDocuments({ isActive: true });

        // Mocking some stats for now until Google API is active
        const stats = {
            totalIndexedPages: totalPages + totalFeeds,
            pagesMissingTitle: pagesMissingTitle + feedsMissingTitle,
            pagesMissingDescription: pagesMissingDesc, // Simplified
            redirectsActive: redirectsCount,
            sitemapLastGenerated: config?.updatedAt || null,
            averageSeoScore: 0 // Will calculate properly in a full scan
        };

        // Real Google Data if available
        let googleData = null;
        if (config && config.googleCredentials && config.googleSearchConsoleCode) {
            const googleApi = new GoogleSeoApi(config.googleCredentials);
            const endDate = new Date().toISOString().split('T')[0];
            const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

            googleData = await googleApi.getSearchConsoleData(config.canonicalUrl, startDate, endDate);
        }

        res.status(200).json({
            success: true,
            data: {
                stats,
                googleData
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// 2. SEO Global Settings
exports.getSeoConfig = async (req, res) => {
    try {
        let config = await SEOConfig.findOne();
        if (!config) {
            config = await SEOConfig.create({});
        }
        res.status(200).json({ success: true, data: config });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.updateSeoConfig = async (req, res) => {
    try {
        const config = await SEOConfig.findOneAndUpdate({}, req.body, { upsert: true, new: true });
        res.status(200).json({ success: true, data: config });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// 3. Page SEO Management
exports.getAllPagesSeo = async (req, res) => {
    try {
        const pages = await StaticPage.find({}, 'title slug seo');
        res.status(200).json({ success: true, data: pages });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// 3.1 Feed SEO Management
exports.getAllFeedsSeo = async (req, res) => {
    try {
        const feeds = await Feed.find({ isApproved: true, status: 'published' }, 'caption seoMetadata mediaUrl createdAt');
        res.status(200).json({ success: true, data: feeds });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.updateFeedSeo = async (req, res) => {
    try {
        const { seoMetadata } = req.body;
        const feed = await Feed.findByIdAndUpdate(req.params.id, { seoMetadata }, { new: true });

        // 🟢 Invalidate User Feeds Cache
        await clearFeedsCache();

        res.status(200).json({ success: true, data: feed });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// 3.2 Media SEO Management
exports.getMediaSeo = async (req, res) => {
    try {
        const feeds = await Feed.find({ isApproved: true }, 'files mediaUrl postType caption createdAt');
        // Extract all media files
        const media = [];
        feeds.forEach(feed => {
            if (feed.files && feed.files.length > 0) {
                feed.files.forEach(file => {
                    media.push({
                        id: file._id,
                        feedId: feed._id,
                        url: file.url,
                        type: file.type,
                        size: file.size,
                        alt: feed.caption || "", // Defaulting alt to caption for now
                        createdAt: feed.createdAt
                    });
                });
            } else if (feed.mediaUrl) {
                media.push({
                    id: feed._id,
                    feedId: feed._id,
                    url: feed.mediaUrl,
                    type: feed.postType === 'video' ? 'video' : 'image',
                    alt: feed.caption || "",
                    createdAt: feed.createdAt
                });
            }
        });
        res.status(200).json({ success: true, data: media });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// 4. Redirect Manager
exports.getAllRedirects = async (req, res) => {
    try {
        const redirects = await Redirect.find().sort({ createdAt: -1 });
        res.status(200).json({ success: true, data: redirects });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.createRedirect = async (req, res) => {
    try {
        const redirect = await Redirect.create(req.body);
        res.status(201).json({ success: true, data: redirect });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.deleteRedirect = async (req, res) => {
    try {
        await Redirect.findByIdAndDelete(req.params.id);
        res.status(200).json({ success: true, message: "Redirect deleted" });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// 5. Sitemap & Robots.txt
exports.triggerSitemapGeneration = async (req, res) => {
    try {
        const config = await SEOConfig.findOne();
        const baseUrl = config?.canonicalUrl || `${req.protocol}://${req.get('host')}`;
        const sitemap = await generateSitemap(baseUrl);
        res.status(200).json({ success: true, message: "Sitemap generated successfully" });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.updateRobotsTxt = async (req, res) => {
    try {
        const { content } = req.body;
        await SEOConfig.findOneAndUpdate({}, { robotsTxt: content }, { upsert: true });

        // Also update file in public if exists
        const publicDir = path.join(__dirname, '../../public');
        if (fs.existsSync(publicDir)) {
            fs.writeFileSync(path.join(publicDir, 'robots.txt'), content);
        }

        res.status(200).json({ success: true, message: "Robots.txt updated" });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
