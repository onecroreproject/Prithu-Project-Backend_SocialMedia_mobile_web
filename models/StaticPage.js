const mongoose = require("mongoose");
const { prithuDB } = require("../database");

const staticPageSchema = new mongoose.Schema(
    {
        slug: {
            type: String,
            required: true,
            unique: true,
            lowercase: true,
            trim: true
        },
        title: {
            type: String,
            required: true
        },
        content: {
            type: String,
            required: true
        },
        lastUpdatedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Admin"
        },
        seo: {
            metaTitle: { type: String, default: "" },
            metaDescription: { type: String, default: "" },
            focusKeyword: { type: String, default: "" },
            canonicalUrl: { type: String, default: "" },
            isIndexed: { type: Boolean, default: true },
            ogTitle: { type: String, default: "" },
            ogDescription: { type: String, default: "" },
            ogImage: { type: String, default: "" },
            twitterCard: { type: String, default: "summary_large_image" },
            jsonLd: { type: String, default: "" }
        }
    },
    { timestamps: true }
);

module.exports = prithuDB.model("StaticPage", staticPageSchema, "StaticPage");
