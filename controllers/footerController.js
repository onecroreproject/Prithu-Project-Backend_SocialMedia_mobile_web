const FooterConfig = require("../models/FooterConfig");
const { getIO } = require("../middlewares/webSocket");

exports.getFooterConfig = async (req, res) => {
    try {
        let config = await FooterConfig.findOne().sort({ createdAt: -1 });

        if (!config) {
            config = await FooterConfig.create({
                sections: [
                    {
                        title: "Company",
                        links: [
                            { label: "About Prithu", href: "/about" },
                            { label: "Privacy Policy", href: "/privacy-policy" },
                            { label: "Terms & Conditions", href: "/terms-conditions" },
                            { label: "Delete Data", href: "/delete-data" },
                        ],
                    },
                    {
                        title: "Features",
                        links: [
                            { label: "Subscription Plans", href: "/home/subscriptions" },
                            { label: "Referral Program", href: "/home/referral" },
                        ],
                    },
                    {
                        title: "Support",
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
            });
        }

        res.status(200).json({
            success: true,
            data: config,
        });
    } catch (err) {
        console.error("Get Footer Config Error:", err);
        res.status(500).json({
            success: false,
            message: "Server error",
        });
    }
};

exports.updateFooterConfig = async (req, res) => {
    try {
        const {
            logo,
            brandName,
            description,
            sections,
            socialLinks,
            email,
            phone,
            address,
            paymentTitle,
            paymentIcons,
            kycNote
        } = req.body;
        const adminId = req.userId;

        let config = await FooterConfig.findOne().sort({ createdAt: -1 });

        if (!config) {
            config = new FooterConfig();
        }

        config.logo = logo !== undefined ? logo : config.logo;
        config.brandName = brandName || config.brandName;
        config.description = description || config.description;
        config.sections = sections || config.sections;
        config.socialLinks = socialLinks || config.socialLinks;
        config.email = email || config.email;
        config.phone = phone || config.phone;
        config.address = address || config.address;
        config.paymentTitle = paymentTitle || config.paymentTitle;
        config.paymentIcons = paymentIcons || config.paymentIcons;
        config.kycNote = kycNote || config.kycNote;
        config.lastUpdatedBy = adminId;

        await config.save();

        // Emit socket event for live update
        const io = getIO();
        if (io) {
            io.emit("footerUpdated", config);
        }

        res.status(200).json({
            success: true,
            message: "Footer configuration updated",
            data: config,
        });
    } catch (err) {
        console.error("Update Footer Config Error:", err);
        res.status(500).json({
            success: false,
            message: "Server error",
        });
    }
};
