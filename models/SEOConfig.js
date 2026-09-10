const mongoose = require("mongoose");
const { prithuDB } = require("../database");

const seoConfigSchema = new mongoose.Schema(
    {
        siteName: {
            type: String,
            default: "Prithu"
        },
        siteDescription: {
            type: String,
            default: ""
        },
        defaultKeywords: [{
            type: String
        }],
        author: {
            type: String,
            default: "Prithu Team"
        },
        canonicalUrl: {
            type: String,
            default: ""
        },
        googleAnalyticsId: {
            type: String,
            default: ""
        },
        googleTagManagerId: {
            type: String,
            default: ""
        },
        googleSearchConsoleCode: {
            type: String,
            default: ""
        },
        googleCredentials: {
            type: mongoose.Schema.Types.Mixed,
            default: null
        },
        robotsTxt: {
            type: String,
            default: "User-agent: *\nAllow: /"
        },
        sitemapUrl: {
            type: String,
            default: "/sitemap.xml"
        },
        lastUpdatedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Admin"
        }
    },
    { timestamps: true }
);

module.exports = prithuDB.model("SEOConfig", seoConfigSchema, "SEOConfig");
