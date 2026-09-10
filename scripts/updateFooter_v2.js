require("dotenv").config();
const mongoose = require("mongoose");
const { prithuDB } = require("../database");
const FooterConfig = require("../models/FooterConfig");

async function updateFooter() {
    try {
        console.log("Connecting to database...");

        // Wait for connection
        if (prithuDB.readyState !== 1) {
            await new Promise((resolve) => prithuDB.once("connected", resolve));
        }

        console.log("Updating footer configuration...");

        const updatedConfig = {
            sections: [
                {
                    title: "Column 1 – Company",
                    links: [
                        { label: "About Prithu", href: "/about-us" },
                        { label: "Privacy Policy", href: "/privacy-policy" },
                        { label: "Terms & Conditions", href: "/terms-conditions" },
                    ],
                },
                {
                    title: "Column 2 – Features",
                    links: [
                        { label: "Subscription Plans", href: "/home/subscriptions" },
                        { label: "Referral Program", href: "/home/referral" },
                    ],
                },
                {
                    title: "Column 3 – Support",
                    links: [
                        { label: "Feedback & Support", href: "/home/feedback-support" },
                        { label: "Contact Us", href: "/contact" },
                    ],
                },
            ],
            paymentTitle: "Secure & Verified Payments",
            paymentIcons: ["Visa", "Mastercard", "UPI", "PayPal"],
            kycNote: "Identity verification is required for high-volume transactions to ensure platform safety.",
            socialLinks: [
                { platform: "Facebook", url: "#", icon: "Facebook" },
                { platform: "Twitter", url: "#", icon: "Twitter" },
                { platform: "Instagram", url: "#", icon: "Instagram" },
                { platform: "Linkedin", url: "#", icon: "Linkedin" },
            ]
        };

        let config = await FooterConfig.findOne().sort({ createdAt: -1 });

        if (config) {
            Object.assign(config, updatedConfig);
            await config.save();
            console.log("✅ Footer configuration updated successfully.");
        } else {
            await FooterConfig.create(updatedConfig);
            console.log("✅ New footer configuration created successfully.");
        }

        process.exit(0);
    } catch (error) {
        console.error("❌ Error updating footer:", error);
        process.exit(1);
    }
}

updateFooter();
