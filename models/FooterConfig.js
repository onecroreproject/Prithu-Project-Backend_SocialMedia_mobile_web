const mongoose = require("mongoose");
const { prithuDB } = require("../database");

const footerConfigSchema = new mongoose.Schema(
    {
        logo: {
            type: String,
            default: "/prithulogo.png",
        },
        brandName: {
            type: String,
            default: "Prithu",
        },
        description: {
            type: String,
            default: "Empowering creators and businesses with a premium SaaS experience. Connect, share, and grow with Prithu.",
        },
        sections: [
            {
                title: String,
                links: [
                    { label: String, href: String }
                ]
            }
        ],
        socialLinks: [
            { platform: String, url: String, icon: String }
        ],
        email: {
            type: String,
            default: "support@prithu.app",
        },
        phone: {
            type: String,
            default: "+91 00000 00000",
        },
        address: {
            type: String,
            default: "Chennai, Tamil Nadu, India",
        },
        paymentTitle: {
            type: String,
            default: "Secure & Verified Payments",
        },
        paymentIcons: [String],
        lastUpdatedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Admin"
        }
    },
    { timestamps: true }
);

module.exports = prithuDB.model("FooterConfig", footerConfigSchema, "FooterConfig");
