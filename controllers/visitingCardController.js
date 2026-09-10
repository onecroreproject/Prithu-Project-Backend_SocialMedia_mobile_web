const VisitingCard = require('../models/VisitingCardModel');
const User = require('../models/userModels/userModel');
const ProfileSettings = require('../models/profileSettingModel');
const { ProfileCardPlan } = require('../models/ProfileCardPlan');
const WalletTransaction = require('../models/WalletTransaction');
const instifiPaymentService = require('../services/instifiPaymentService');
const mongoose = require('mongoose');

// Helper to generate a clean unique slug
const generateUniqueSlug = async (baseName, cardId = null) => {
    let slug = (baseName || 'card')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)+/g, '') || 'card';

    let uniqueSlug = slug;
    let counter = 1;
    while (true) {
        const query = { slug: uniqueSlug };
        if (cardId) query._id = { $ne: cardId };
        const existing = await VisitingCard.findOne(query);
        if (!existing) break;
        uniqueSlug = `${slug}-${counter}`;
        counter++;
    }
    return uniqueSlug;
};

// Helper to extract comprehensive profile info from ProfileSettings & User
const extractProfileDetails = async (userId) => {
    const user = await User.findById(userId);
    const profileSettings = await ProfileSettings.findOne({ userId });

    const avatar = profileSettings?.modifyAvatar || profileSettings?.profileAvatar || user?.modifyAvatar || user?.profileAvatar || user?.avatar || '';
    const cover = profileSettings?.coverPhoto || profileSettings?.addImage || user?.coverPhoto || '';
    const phone = profileSettings?.phoneNumber ? String(profileSettings.phoneNumber) : (user?.phoneNumber || user?.phone || '');
    const whatsapp = profileSettings?.whatsAppNumber ? String(profileSettings.whatsAppNumber) : phone;
    const name = profileSettings?.name || user?.name || '';
    const bio = profileSettings?.bio || profileSettings?.profileSummary || user?.bio || '';
    const address = profileSettings?.address || '';
    const city = profileSettings?.city || '';
    const state = profileSettings?.country || '';
    const email = user?.email || user?.userEmail || '';
    const socialLinks = {
        instagram: profileSettings?.socialLinks?.instagram || '',
        facebook: profileSettings?.socialLinks?.facebook || '',
        linkedin: profileSettings?.socialLinks?.linkedin || '',
        youtube: profileSettings?.socialLinks?.youtube || '',
        twitter: profileSettings?.socialLinks?.twitter || '',
        pinterest: ''
    };

    return { user, profileSettings, avatar, cover, phone, whatsapp, name, bio, address, city, state, email, socialLinks };
};

/**
 * @desc Get or initialize current user's digital visiting card
 * @route GET /web/api/visiting-card/my-card
 */
exports.getMyCard = async (req, res) => {
    try {
        const userId = req.Id || req.userId || req.user?._id || req.user?.id || req.accountId;
        if (!userId) {
            return res.status(401).json({ success: false, message: 'Authentication required' });
        }

        const profileInfo = await extractProfileDetails(userId);
        let card = await VisitingCard.findOne({ userId });

        if (!card) {
            const initialSlug = await generateUniqueSlug(profileInfo.user?.userName || profileInfo.name || 'business');

            card = await VisitingCard.create({
                userId,
                slug: initialSlug,
                businessName: profileInfo.name ? `${profileInfo.name}'s Business` : 'My Digital Business',
                personName: profileInfo.name || '',
                designation: 'Founder / Business Owner',
                tagline: profileInfo.bio || 'Connecting quality with excellence.',
                category: 'Business & Professional Services',
                about: profileInfo.bio || 'Welcome to our digital visiting card. Feel free to contact us or explore our services below.',
                profileImage: profileInfo.avatar || '',
                bannerImage: profileInfo.cover || '',
                contact: {
                    phone: profileInfo.phone || '',
                    whatsapp: profileInfo.whatsapp || '',
                    email: profileInfo.email || '',
                    website: profileInfo.profileSettings?.socialLinks?.website || '',
                    address: profileInfo.address || '',
                    city: profileInfo.city || '',
                    state: profileInfo.state || '',
                    pincode: '',
                    googleMapsUrl: ''
                },
                socialLinks: profileInfo.socialLinks,
                services: [
                    {
                        title: 'Premium Product Offering',
                        description: 'High-quality tailored solutions customized to your needs.',
                        price: '₹999',
                        badge: 'Featured',
                        isAvailable: true
                    },
                    {
                        title: 'Consultation & Services',
                        description: 'Expert 1-on-1 guidance and prompt customer assistance.',
                        price: 'Free',
                        badge: 'Popular',
                        isAvailable: true
                    }
                ],
                gallery: [],
                templateId: 'template_3',
                themeConfig: {
                    primaryColor: '#10B981',
                    secondaryColor: '#0F172A',
                    accentColor: '#3B82F6',
                    backgroundColor: '#F8FAFC',
                    textColor: '#0F172A',
                    fontFamily: 'sans'
                }
            });
        } else {
            // Auto-fallback missing card images to live profile details
            let needsSave = false;
            if (!card.profileImage && profileInfo.avatar) {
                card.profileImage = profileInfo.avatar;
                needsSave = true;
            }
            if (!card.bannerImage && profileInfo.cover) {
                card.bannerImage = profileInfo.cover;
                needsSave = true;
            }
            if (!card.personName && profileInfo.name) {
                card.personName = profileInfo.name;
                needsSave = true;
            }
            if (!card.contact?.phone && profileInfo.phone) {
                card.contact.phone = profileInfo.phone;
                needsSave = true;
            }
            if (!card.contact?.whatsapp && profileInfo.whatsapp) {
                card.contact.whatsapp = profileInfo.whatsapp;
                needsSave = true;
            }
            if (needsSave) {
                await card.save();
            }
        }

        // Check active plan and trial settings
        let plan = await ProfileCardPlan.findOne({ isActive: true });
        const trialDays = plan?.trialDurationDays || 3;
        const isTrialEnabled = plan ? plan.trialEnabled !== false : true;

        const isSubscribed = Boolean(
            card.subscription?.isSubscribed &&
            (!card.subscription?.expiresAt || new Date(card.subscription?.expiresAt) > new Date())
        );

        const isTrialUsed = Boolean(card.trial?.isTrialUsed);
        const isTrialActive = Boolean(
            !isSubscribed &&
            card.trial?.trialExpiresAt &&
            new Date(card.trial.trialExpiresAt) > new Date()
        );

        const hasFullAccess = Boolean(isSubscribed || isTrialActive);

        let trialHoursRemaining = 0;
        let trialDaysRemaining = 0;
        if (isTrialActive && card.trial?.trialExpiresAt) {
            const diffMs = new Date(card.trial.trialExpiresAt).getTime() - Date.now();
            trialHoursRemaining = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60)));
            trialDaysRemaining = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
        }

        return res.status(200).json({
            success: true,
            message: 'Visiting card retrieved successfully',
            data: card,
            access: {
                hasFullAccess,
                isSubscribed,
                isTrialActive,
                isTrialUsed,
                isTrialEnabled,
                trialHoursRemaining,
                trialDaysRemaining,
                trialDurationDays: trialDays,
                planPrice: plan?.price !== undefined ? plan.price : 50,
                planDurationDays: plan?.durationDays || 30
            },
            profileFallback: {
                avatar: profileInfo.avatar,
                cover: profileInfo.cover,
                name: profileInfo.name
            }
        });
    } catch (error) {
        console.error('[VisitingCard] getMyCard error:', error);
        return res.status(500).json({ success: false, message: 'Server error retrieving visiting card', error: error.message });
    }
};

/**
 * @desc Sync all visiting card details directly from user profile & settings
 * @route POST /web/api/visiting-card/sync-profile
 */
exports.syncProfileFromUserDetails = async (req, res) => {
    try {
        const userId = req.Id || req.userId || req.user?._id || req.user?.id || req.accountId;
        if (!userId) {
            return res.status(401).json({ success: false, message: 'Authentication required' });
        }

        const profileInfo = await extractProfileDetails(userId);
        let card = await VisitingCard.findOne({ userId });

        if (!card) {
            return res.status(404).json({ success: false, message: 'Visiting card not found' });
        }

        if (profileInfo.avatar) card.profileImage = profileInfo.avatar;
        if (profileInfo.cover) card.bannerImage = profileInfo.cover;
        if (profileInfo.name) {
            card.personName = profileInfo.name;
            if (!card.businessName || card.businessName === 'My Business') {
                card.businessName = `${profileInfo.name}'s Business`;
            }
        }
        if (profileInfo.bio) card.about = profileInfo.bio;
        if (profileInfo.phone) card.contact.phone = profileInfo.phone;
        if (profileInfo.whatsapp) card.contact.whatsapp = profileInfo.whatsapp;
        if (profileInfo.address) card.contact.address = profileInfo.address;
        if (profileInfo.city) card.contact.city = profileInfo.city;
        if (profileInfo.state) card.contact.state = profileInfo.state;
        if (profileInfo.email) card.contact.email = profileInfo.email;
        if (profileInfo.socialLinks) {
            card.socialLinks = { ...card.socialLinks.toObject(), ...profileInfo.socialLinks };
        }

        await card.save();

        return res.status(200).json({
            success: true,
            message: 'Visiting card synced with profile details successfully',
            data: card
        });
    } catch (error) {
        console.error('[VisitingCard] syncProfile error:', error);
        return res.status(500).json({ success: false, message: 'Failed to sync profile', error: error.message });
    }
};

/**
 * @desc Update current user's digital visiting card
 * @route PUT /web/api/visiting-card/my-card
 */
exports.updateMyCard = async (req, res) => {
    try {
        const userId = req.Id || req.userId || req.user?._id || req.user?.id || req.accountId;
        if (!userId) {
            return res.status(401).json({ success: false, message: 'Authentication required' });
        }

        const {
            businessName,
            personName,
            designation,
            tagline,
            category,
            about,
            profileImage,
            bannerImage,
            contact,
            socialLinks,
            services,
            gallery,
            templateId,
            themeConfig,
            slug,
            isActive
        } = req.body;

        let card = await VisitingCard.findOne({ userId });
        if (!card) {
            return res.status(404).json({ success: false, message: 'Visiting card not found' });
        }

        // Check and update slug if provided
        if (slug && slug.trim() && slug.trim().toLowerCase() !== card.slug) {
            const uniqueSlug = await generateUniqueSlug(slug.trim(), card._id);
            card.slug = uniqueSlug;
        }

        if (businessName !== undefined) card.businessName = businessName;
        if (personName !== undefined) card.personName = personName;
        if (designation !== undefined) card.designation = designation;
        if (tagline !== undefined) card.tagline = tagline;
        if (category !== undefined) card.category = category;
        if (about !== undefined) card.about = about;
        if (profileImage !== undefined) card.profileImage = profileImage;
        if (bannerImage !== undefined) card.bannerImage = bannerImage;
        if (contact !== undefined) card.contact = { ...card.contact.toObject(), ...contact };
        if (socialLinks !== undefined) card.socialLinks = { ...card.socialLinks.toObject(), ...socialLinks };
        if (services !== undefined && Array.isArray(services)) card.services = services;
        if (gallery !== undefined && Array.isArray(gallery)) card.gallery = gallery;
        if (templateId !== undefined) card.templateId = templateId;
        if (themeConfig !== undefined) card.themeConfig = { ...card.themeConfig.toObject(), ...themeConfig };
        if (isActive !== undefined) card.isActive = isActive;

        await card.save();

        return res.status(200).json({
            success: true,
            message: 'Visiting card updated successfully',
            data: card
        });
    } catch (error) {
        console.error('[VisitingCard] updateMyCard error:', error);
        return res.status(500).json({ success: false, message: 'Server error updating visiting card', error: error.message });
    }
};

/**
 * @desc Get public visiting card by slug or cardId or userId
 * @route GET /web/api/visiting-card/public/:identifier
 */
exports.getPublicCard = async (req, res) => {
    try {
        const { identifier } = req.params;
        if (!identifier) {
            return res.status(400).json({ success: false, message: 'Identifier is required' });
        }

        let query = {};
        if (mongoose.Types.ObjectId.isValid(identifier)) {
            query = { $or: [{ _id: identifier }, { userId: identifier }, { slug: identifier }] };
        } else {
            query = { slug: identifier.toLowerCase() };
        }

        let card = await VisitingCard.findOne(query).populate('userId', 'name userName profileAvatar avatar email phone');

        if (!card) {
            return res.status(404).json({ success: false, message: 'Visiting card not found' });
        }

        // Fallback missing avatar/banner from profile settings
        if ((!card.profileImage || !card.bannerImage) && card.userId) {
            const uid = card.userId._id || card.userId;
            const profileSettings = await ProfileSettings.findOne({ userId: uid });
            if (!card.profileImage) {
                card.profileImage = profileSettings?.modifyAvatar || profileSettings?.profileAvatar || card.userId?.profileAvatar || card.userId?.avatar || '';
            }
            if (!card.bannerImage) {
                card.bannerImage = profileSettings?.coverPhoto || profileSettings?.addImage || '';
            }
        }

        // Increment view count asynchronously
        VisitingCard.updateOne({ _id: card._id }, { $inc: { 'stats.viewsCount': 1 } }).exec();

        return res.status(200).json({
            success: true,
            message: 'Public visiting card fetched successfully',
            data: card
        });
    } catch (error) {
        console.error('[VisitingCard] getPublicCard error:', error);
        return res.status(500).json({ success: false, message: 'Server error fetching public card', error: error.message });
    }
};

/**
 * @desc Track card interaction metrics (shares, saves)
 * @route POST /web/api/visiting-card/track/:identifier
 */
exports.trackCardMetric = async (req, res) => {
    try {
        const { identifier } = req.params;
        const { action } = req.body; // 'share' | 'save'

        const incField = action === 'share' ? 'stats.sharesCount' : 'stats.savesCount';
        
        let query = {};
        if (mongoose.Types.ObjectId.isValid(identifier)) {
            query = { $or: [{ _id: identifier }, { userId: identifier }, { slug: identifier }] };
        } else {
            query = { slug: identifier.toLowerCase() };
        }

        await VisitingCard.updateOne(query, { $inc: { [incField]: 1 } });
        return res.status(200).json({ success: true, message: 'Interaction tracked' });
    } catch (error) {
        return res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * @desc Generate and download standard vCard (.vcf)
 * @route GET /web/api/visiting-card/vcard/:identifier
 */
exports.generateVCard = async (req, res) => {
    try {
        const { identifier } = req.params;
        let query = {};
        if (mongoose.Types.ObjectId.isValid(identifier)) {
            query = { $or: [{ _id: identifier }, { userId: identifier }, { slug: identifier }] };
        } else {
            query = { slug: identifier.toLowerCase() };
        }

        const card = await VisitingCard.findOne(query);
        if (!card) {
            return res.status(404).send('Visiting card not found');
        }

        // Increment save count
        VisitingCard.updateOne({ _id: card._id }, { $inc: { 'stats.savesCount': 1 } }).exec();

        const nameParts = (card.personName || card.businessName || 'Contact').trim().split(' ');
        const firstName = nameParts[0] || '';
        const lastName = nameParts.slice(1).join(' ') || '';
        const org = card.businessName || '';
        const title = card.designation || '';
        const phone = card.contact?.phone || '';
        const whatsapp = card.contact?.whatsapp || '';
        const email = card.contact?.email || '';
        const website = card.contact?.website || '';
        const note = [card.tagline, card.about].filter(Boolean).join('\n\n');
        const street = card.contact?.address || '';
        const city = card.contact?.city || '';
        const state = card.contact?.state || '';
        const postalCode = card.contact?.pincode || '';

        const vcardContent = [
            'BEGIN:VCARD',
            'VERSION:3.0',
            `N:${lastName};${firstName};;;`,
            `FN:${card.personName || card.businessName}`,
            org ? `ORG:${org}` : '',
            title ? `TITLE:${title}` : '',
            phone ? `TEL;TYPE=CELL,VOICE:${phone}` : '',
            whatsapp && whatsapp !== phone ? `TEL;TYPE=WORK,VOICE:${whatsapp}` : '',
            email ? `EMAIL;TYPE=WORK,INTERNET:${email}` : '',
            website ? `URL:${website}` : '',
            (street || city || state || postalCode) ? `ADR;TYPE=WORK:;;${street};${city};${state};${postalCode};India` : '',
            note ? `NOTE:${note.replace(/\n/g, '\\n')}` : '',
            'END:VCARD'
        ].filter(Boolean).join('\r\n');

        res.setHeader('Content-Type', 'text/vcard; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${(card.businessName || 'contact').replace(/[^a-zA-Z0-9]/g, '_')}.vcf"`);
        return res.send(vcardContent);
    } catch (error) {
        console.error('[VisitingCard] generateVCard error:', error);
        return res.status(500).send('Error generating vCard');
    }
};

/**
 * @desc Upload Media for Visiting Card (Banner, Avatar, Product/Service Image, Gallery)
 * @route POST /web/api/visiting-card/upload-media
 */
exports.uploadMedia = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'No file uploaded' });
        }

        const fileUrl = req.file.path ? `/uploads/${req.file.filename}` : (req.file.location || req.file.url || '');
        return res.status(200).json({
            success: true,
            message: 'Image uploaded successfully',
            url: fileUrl,
            filename: req.file.filename
        });
    } catch (error) {
        console.error('[VisitingCard] uploadMedia error:', error);
        return res.status(500).json({ success: false, message: 'Image upload failed', error: error.message });
    }
};

/**
 * @desc Render OpenGraph HTML share preview for visiting cards
 * @route GET /share/card/:identifier
 */
exports.shareCardOG = async (req, res) => {
    try {
        const { identifier } = req.params;
        let query = {};
        if (mongoose.Types.ObjectId.isValid(identifier)) {
            query = { $or: [{ _id: identifier }, { userId: identifier }, { slug: identifier }] };
        } else {
            query = { slug: identifier.toLowerCase() };
        }

        let card = await VisitingCard.findOne(query).populate('userId', 'name userName profileAvatar avatar email phone');
        if (!card) {
            return res.status(404).send(`
                <!DOCTYPE html>
                <html><head><title>Card Not Found</title></head>
                <body style="font-family:sans-serif;text-align:center;padding:50px;background:#0f172a;color:#fff;">
                    <h2>Digital Visiting Card Not Found</h2>
                    <p style="color:#94a3b8;">The requested business card does not exist or has been removed.</p>
                </body></html>
            `);
        }

        // Fallback missing avatar/banner
        if ((!card.profileImage || !card.bannerImage) && card.userId) {
            const uid = card.userId._id || card.userId;
            const profileSettings = await ProfileSettings.findOne({ userId: uid });
            if (!card.profileImage) {
                card.profileImage = profileSettings?.modifyAvatar || profileSettings?.profileAvatar || card.userId?.profileAvatar || card.userId?.avatar || '';
            }
            if (!card.bannerImage) {
                card.bannerImage = profileSettings?.coverPhoto || profileSettings?.addImage || '';
            }
        }

        // Increment view count for web page view
        VisitingCard.updateOne({ _id: card._id }, { $inc: { 'stats.viewsCount': 1 } }).exec();

        const hostUrl = `${req.protocol}://${req.get('host')}`;
        const title = `${card.businessName} - Digital Profile Card`;
        const description = card.tagline || card.about || `${card.personName} (${card.designation}) - ${card.category}`;
        
        let rawImage = card.bannerImage || card.profileImage || '/logo.png';
        const imageUrl = rawImage.startsWith('http') ? rawImage : `${hostUrl}${rawImage}`;
        
        const cardIdentifier = card.slug || card._id;
        const deepLink = `prithu://card/${cardIdentifier}`;
        const androidIntent = `intent://card/${cardIdentifier}#Intent;scheme=prithu;package=com.dlktechnologies.Prithu;end`;
        const webUrl = `${hostUrl}/share/card/${cardIdentifier}`;
        const vcardUrl = `${hostUrl}/web/api/visiting-card/vcard/${cardIdentifier}`;
        const phone = card.contact?.phone || '';
        const whatsapp = card.contact?.whatsapp || phone;
        const email = card.contact?.email || '';
        const address = [card.contact?.address, card.contact?.city, card.contact?.state, card.contact?.pincode].filter(Boolean).join(', ');
        const website = card.contact?.website || '';
        const googleMapsUrl = card.contact?.googleMapsUrl || (address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}` : '');

        // Services HTML
        let servicesHtml = '';
        if (card.services && card.services.length > 0) {
            servicesHtml = `
            <div class="section-box">
                <div class="section-title">🛍️ Services & Products</div>
                <div class="service-list">
                    ${card.services.map(s => `
                        <div class="service-item">
                            <div class="service-info">
                                <div class="service-name">${s.title}</div>
                                ${s.description ? `<div class="service-desc">${s.description}</div>` : ''}
                            </div>
                            ${s.price ? `<div class="service-price">${s.price}</div>` : ''}
                        </div>
                    `).join('')}
                </div>
            </div>`;
        }

        // Social links
        const socials = [];
        if (card.socialLinks?.instagram) socials.push({ name: 'Instagram', url: card.socialLinks.instagram });
        if (card.socialLinks?.facebook) socials.push({ name: 'Facebook', url: card.socialLinks.facebook });
        if (card.socialLinks?.linkedin) socials.push({ name: 'LinkedIn', url: card.socialLinks.linkedin });
        if (card.socialLinks?.youtube) socials.push({ name: 'YouTube', url: card.socialLinks.youtube });
        if (card.socialLinks?.twitter) socials.push({ name: 'Twitter', url: card.socialLinks.twitter });

        let socialsHtml = '';
        if (socials.length > 0) {
            socialsHtml = `
            <div class="social-row">
                ${socials.map(soc => `
                    <a href="${soc.url.startsWith('http') ? soc.url : 'https://' + soc.url}" target="_blank" class="social-chip">${soc.name}</a>
                `).join('')}
            </div>`;
        }

        const html = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
            <title>${title}</title>
            
            <!-- Primary Meta Tags -->
            <meta name="title" content="${title}">
            <meta name="description" content="${description}">
            
            <!-- Open Graph / Facebook / WhatsApp -->
            <meta property="og:type" content="profile">
            <meta property="og:site_name" content="Prithu">
            <meta property="og:title" content="${title}">
            <meta property="og:description" content="${description}">
            <meta property="og:image" content="${imageUrl}">
            <meta property="og:image:secure_url" content="${imageUrl}">
            <meta property="og:image:type" content="image/jpeg">
            <meta property="og:image:width" content="1200">
            <meta property="og:image:height" content="630">
            <meta property="og:url" content="${webUrl}">
            
            <!-- Twitter -->
            <meta name="twitter:card" content="summary_large_image">
            <meta name="twitter:title" content="${title}">
            <meta name="twitter:description" content="${description}">
            <meta name="twitter:image" content="${imageUrl}">

            <!-- App Links & Deep Linking Meta -->
            <meta property="al:android:url" content="${deepLink}">
            <meta property="al:android:package" content="com.dlktechnologies.Prithu">
            <meta property="al:android:app_name" content="Prithu">
            <meta property="al:ios:url" content="${deepLink}">
            <meta property="al:ios:app_store_id" content="com.dlktechnologies.Prithu">
            <meta property="al:ios:app_name" content="Prithu">

            <style>
                * { box-sizing: border-box; margin: 0; padding: 0; }
                body {
                    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                    background: #090d16;
                    color: #ffffff;
                    min-height: 100vh;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    padding: 16px;
                }
                .card {
                    background: #131d31;
                    border: 1px solid rgba(255,255,255,0.08);
                    border-radius: 28px;
                    max-width: 440px;
                    width: 100%;
                    overflow: hidden;
                    box-shadow: 0 25px 60px -15px rgba(0, 0, 0, 0.7);
                    text-align: center;
                }
                .cover {
                    height: 160px;
                    background: linear-gradient(135deg, #10b981, #3b82f6);
                    background-size: cover;
                    background-position: center;
                    ${card.bannerImage ? `background-image: url('${imageUrl}');` : ''}
                }
                .avatar-wrap {
                    margin-top: -46px;
                    display: inline-block;
                    position: relative;
                }
                .avatar {
                    width: 90px;
                    height: 90px;
                    border-radius: 50%;
                    border: 4px solid #131d31;
                    object-fit: cover;
                    background: #1e293b;
                    box-shadow: 0 8px 20px rgba(0,0,0,0.4);
                }
                .content { padding: 18px 20px 24px; text-align: left; }
                .center-info { text-align: center; margin-bottom: 16px; }
                h1 { font-size: 22px; font-weight: 800; color: #fff; margin-bottom: 4px; }
                .sub { font-size: 12px; color: #10b981; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 8px; }
                .bio { font-size: 13.5px; color: #94a3b8; line-height: 1.5; }
                
                .btn-app {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 8px;
                    width: 100%;
                    padding: 14px;
                    background: linear-gradient(135deg, #10b981, #059669);
                    color: #fff;
                    font-weight: 800;
                    text-decoration: none;
                    border-radius: 16px;
                    font-size: 15px;
                    margin-bottom: 14px;
                    box-shadow: 0 4px 15px rgba(16, 185, 129, 0.35);
                    transition: transform 0.15s;
                    text-align: center;
                }
                .btn-app:active { transform: scale(0.98); }
                
                .action-grid {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 10px;
                    margin-bottom: 14px;
                }
                .btn-tile {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 6px;
                    padding: 12px;
                    background: rgba(255,255,255,0.06);
                    border: 1px solid rgba(255,255,255,0.1);
                    color: #e2e8f0;
                    border-radius: 14px;
                    text-decoration: none;
                    font-size: 13px;
                    font-weight: 700;
                }
                .section-box {
                    background: rgba(255,255,255,0.03);
                    border: 1px solid rgba(255,255,255,0.06);
                    border-radius: 18px;
                    padding: 14px;
                    margin-bottom: 14px;
                }
                .section-title {
                    font-size: 12px;
                    font-weight: 800;
                    color: #10b981;
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                    margin-bottom: 10px;
                }
                .service-list { display: flex; flex-direction: column; gap: 8px; }
                .service-item {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    border-bottom: 1px solid rgba(255,255,255,0.05);
                    padding-bottom: 8px;
                }
                .service-item:last-child { border-bottom: none; padding-bottom: 0; }
                .service-name { font-size: 13.5px; font-weight: 700; color: #f1f5f9; }
                .service-desc { font-size: 11.5px; color: #94a3b8; margin-top: 2px; }
                .service-price { font-size: 13px; font-weight: 800; color: #10b981; }
                
                .info-row { display: flex; align-items: center; gap: 8px; font-size: 12.5px; color: #cbd5e1; margin-bottom: 8px; }
                .info-row a { color: #38bdf8; text-decoration: none; word-break: break-all; }
                
                .social-row { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 14px; }
                .social-chip {
                    padding: 6px 12px;
                    background: rgba(255,255,255,0.06);
                    border-radius: 20px;
                    color: #94a3b8;
                    text-decoration: none;
                    font-size: 12px;
                    font-weight: 600;
                }
                .social-chip:hover { color: #fff; background: rgba(255,255,255,0.12); }
                
                .btn-sec {
                    display: block;
                    width: 100%;
                    padding: 12px;
                    background: rgba(255,255,255,0.04);
                    border: 1px solid rgba(255,255,255,0.1);
                    color: #cbd5e1;
                    text-decoration: none;
                    border-radius: 14px;
                    font-size: 13px;
                    font-weight: 700;
                    text-align: center;
                }
                .app-promo-tag {
                    display: block;
                    text-align: center;
                    margin-top: 14px;
                    font-size: 11px;
                    color: #64748b;
                    font-weight: 600;
                }
            </style>
            
            <script>
                // Auto launch app if clicked from mobile
                (function() {
                    var isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
                    if (isMobile) {
                        if (/Android/i.test(navigator.userAgent)) {
                            window.location.href = "${androidIntent}";
                        } else {
                            window.location.href = "${deepLink}";
                        }
                    }
                })();
            </script>
        </head>
        <body>
            <div class="card">
                <div class="cover"></div>
                <div class="avatar-wrap">
                    <img src="${card.profileImage ? (card.profileImage.startsWith('http') ? card.profileImage : hostUrl + card.profileImage) : 'https://ui-avatars.com/api/?name=' + encodeURIComponent(card.businessName) + '&background=10B981&color=fff'}" class="avatar" alt="${card.businessName}">
                </div>
                <div class="content">
                    <div class="center-info">
                        <h1>${card.businessName}</h1>
                        <div class="sub">${card.personName ? card.personName + ' • ' : ''}${card.designation || card.category}</div>
                        <div style="display:inline-flex;align-items:center;gap:5px;background:rgba(16,185,129,0.1);color:#10b981;font-size:11.5px;font-weight:700;padding:3px 10px;border-radius:20px;margin:6px 0 8px;">👁️ ${((card.stats?.viewsCount || 0) + 1).toLocaleString()} Page Views</div>
                        <p class="bio">${card.tagline || card.about || 'Digital profile card with direct contact details, services and portfolio.'}</p>
                    </div>
                    
                    <a href="${deepLink}" onclick="if(/Android/i.test(navigator.userAgent)){window.location.href='${androidIntent}';return false;}" class="btn-app">
                        <span>📲 Open in Prithu App</span>
                    </a>

                    <div class="action-grid">
                        ${whatsapp ? `<a href="https://wa.me/${whatsapp.replace(/[^0-9]/g, '')}?text=${encodeURIComponent('Hello ' + card.businessName + ', I found your visiting card on Prithu.')}" class="btn-tile">💬 WhatsApp</a>` : ''}
                        ${phone ? `<a href="tel:${phone}" class="btn-tile">📞 Call</a>` : ''}
                    </div>

                    ${address || email || website ? `
                    <div class="section-box">
                        <div class="section-title">📍 Contact Information</div>
                        ${email ? `<div class="info-row">✉️ <a href="mailto:${email}">${email}</a></div>` : ''}
                        ${website ? `<div class="info-row">🌐 <a href="${website.startsWith('http') ? website : 'https://' + website}" target="_blank">${website}</a></div>` : ''}
                        ${address ? `<div class="info-row">📍 ${googleMapsUrl ? `<a href="${googleMapsUrl}" target="_blank">${address}</a>` : address}</div>` : ''}
                    </div>` : ''}

                    ${servicesHtml}
                    ${socialsHtml}

                    <a href="${vcardUrl}" class="btn-sec">💾 Save Contact (.VCF)</a>
                    <div class="app-promo-tag">Powered by Prithu App</div>
                </div>
            </div>
        </body>
        </html>
        `;

        return res.send(html);
    } catch (error) {
        console.error('[VisitingCard] shareCardOG error:', error);
        return res.status(500).send('Error rendering card preview');
    }
};

/**
 * @desc Get Visiting Card Global Stats for Admin Panel
 * @route GET /api/visiting-card/admin/stats
 */
exports.adminGetVisitingCardStats = async (req, res) => {
    try {
        const [totalCards, statsAgg, topCards, categoryBreakdown] = await Promise.all([
            VisitingCard.countDocuments(),
            VisitingCard.aggregate([
                {
                    $group: {
                        _id: null,
                        totalViews: { $sum: '$stats.viewsCount' },
                        totalShares: { $sum: '$stats.sharesCount' },
                        totalSaves: { $sum: '$stats.savesCount' }
                    }
                }
            ]),
            VisitingCard.find({ isActive: true })
                .sort({ 'stats.viewsCount': -1, createdAt: -1 })
                .limit(10)
                .populate('userId', 'name userName profileAvatar phone')
                .select('businessName personName designation category slug stats templateId createdAt'),
            VisitingCard.aggregate([
                { $group: { _id: '$category', count: { $sum: 1 }, totalViews: { $sum: '$stats.viewsCount' } } },
                { $sort: { count: -1 } },
                { $limit: 8 }
            ])
        ]);

        const totals = statsAgg[0] || { totalViews: 0, totalShares: 0, totalSaves: 0 };

        return res.status(200).json({
            success: true,
            data: {
                totalCards,
                totalViews: totals.totalViews || 0,
                totalShares: totals.totalShares || 0,
                totalSaves: totals.totalSaves || 0,
                topCards,
                categoryBreakdown
            }
        });
    } catch (error) {
        console.error('[VisitingCard] adminGetVisitingCardStats error:', error);
        return res.status(500).json({ success: false, message: 'Failed to fetch visiting card stats', error: error.message });
    }
};

/**
 * @desc Get Paginated Visiting Cards List for Admin Panel
 * @route GET /api/visiting-card/admin/list
 */
exports.adminGetVisitingCards = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const search = req.query.search ? req.query.search.trim() : '';
        const category = req.query.category || '';
        const sortBy = req.query.sortBy || 'views';

        let filter = {};
        if (search) {
            filter.$or = [
                { businessName: { $regex: search, $options: 'i' } },
                { personName: { $regex: search, $options: 'i' } },
                { slug: { $regex: search, $options: 'i' } },
                { 'contact.phone': { $regex: search, $options: 'i' } },
                { category: { $regex: search, $options: 'i' } }
            ];
        }
        if (category) {
            filter.category = category;
        }

        let sort = { 'stats.viewsCount': -1 };
        if (sortBy === 'newest') sort = { createdAt: -1 };
        if (sortBy === 'shares') sort = { 'stats.sharesCount': -1 };
        if (sortBy === 'saves') sort = { 'stats.savesCount': -1 };

        const skip = (page - 1) * limit;

        const [cards, total] = await Promise.all([
            VisitingCard.find(filter)
                .sort(sort)
                .skip(skip)
                .limit(limit)
                .populate('userId', 'name userName profileAvatar phone email')
                .lean(),
            VisitingCard.countDocuments(filter)
        ]);

        return res.status(200).json({
            success: true,
            data: cards,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        console.error('[VisitingCard] adminGetVisitingCards error:', error);
        return res.status(500).json({ success: false, message: 'Failed to fetch visiting cards list', error: error.message });
    }
};

/**
 * @desc Get Active Profile Card Subscription Plan (Default Rs. 50) + Trial Settings
 * @route GET /web/api/visiting-card/plan
 */
exports.getProfileCardPlan = async (req, res) => {
    try {
        let plan = await ProfileCardPlan.findOne({ isActive: true });
        if (!plan) {
            plan = {
                name: "Profile Card Pro Pass",
                price: 50,
                originalPrice: 199,
                durationDays: 30,
                badgeText: "POPULAR • 75% OFF",
                trialEnabled: true,
                trialDurationDays: 3,
                description: "Unlock all 5 card templates, custom colors, services, QR code image and live sharing for 30 days",
                features: [
                    "All 5 Premium Card Themes & Live Color Controls",
                    "Unlock QR Code Image & Instant Sharing",
                    "Services & Products Showcase (Unlimited)",
                    "Photo Gallery & Showcase Images",
                    "1-Tap WhatsApp, Direct Call & Google Maps Buttons",
                    "vCard Contact Save (.VCF) Download",
                    "Real-Time Page View Analytics"
                ],
                isActive: true
            };
        }
        return res.status(200).json({ success: true, data: plan });
    } catch (error) {
        console.error('[VisitingCard] getProfileCardPlan error:', error);
        return res.status(500).json({ success: false, message: 'Failed to fetch plan', error: error.message });
    }
};

/**
 * @desc Start 3-Day Free Trial for Current User
 * @route POST /web/api/visiting-card/trial
 */
exports.startProfileCardTrial = async (req, res) => {
    try {
        const userId = req.Id || req.userId || req.user?._id || req.accountId;
        if (!userId) {
            return res.status(401).json({ success: false, message: 'Authentication required' });
        }

        let plan = await ProfileCardPlan.findOne({ isActive: true });
        const trialDays = plan?.trialDurationDays || 3;
        const isTrialEnabled = plan ? plan.trialEnabled !== false : true;

        if (!isTrialEnabled) {
            return res.status(400).json({ success: false, message: 'Free trial is currently disabled by administrator' });
        }

        let card = await VisitingCard.findOne({ userId });
        if (!card) {
            card = await VisitingCard.create({ userId, businessName: 'My Profile Card' });
        }

        if (card.trial?.isTrialUsed) {
            return res.status(400).json({
                success: false,
                message: '3-Day Free Trial has already been used for this profile card.',
                trial: card.trial
            });
        }

        const now = new Date();
        card.trial = {
            isTrialUsed: true,
            trialStartedAt: now,
            trialExpiresAt: new Date(now.getTime() + trialDays * 24 * 60 * 60 * 1000)
        };

        await card.save();

        return res.status(200).json({
            success: true,
            message: `🎉 ${trialDays}-Day Free Trial activated! All profile card features are unlocked.`,
            data: {
                trial: card.trial,
                hasFullAccess: true,
                isTrialActive: true,
                trialDurationDays: trialDays
            }
        });
    } catch (error) {
        console.error('[VisitingCard] startProfileCardTrial error:', error);
        return res.status(500).json({ success: false, message: 'Failed to start trial', error: error.message });
    }
};

/**
 * @desc Subscribe to Profile Card (Unlock Rs. 50 Plan)
 * @route POST /web/api/visiting-card/subscribe
 */
exports.subscribeProfileCard = async (req, res) => {
    try {
        const userId = req.Id || req.userId || req.user?._id || req.accountId;
        if (!userId) {
            return res.status(401).json({ success: false, message: 'Authentication required' });
        }

        const { paymentMethod = 'wallet', paymentId = '' } = req.body;

        let plan = await ProfileCardPlan.findOne({ isActive: true });
        const planPrice = plan?.price !== undefined ? plan.price : 50;
        const planDuration = plan?.durationDays || 30;
        const planName = plan?.name || "Profile Card Pro Pass";

        let card = await VisitingCard.findOne({ userId });
        if (!card) {
            card = await VisitingCard.create({ userId, businessName: 'My Profile Card' });
        }

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        // Handle Wallet payment
        if (paymentMethod === 'wallet') {
            const userBalance = user.wallet?.balance || 0;
            if (userBalance < planPrice) {
                return res.status(400).json({
                    success: false,
                    message: `Insufficient wallet balance. You need ₹${planPrice}, but your wallet has ₹${userBalance}.`,
                    requireRecharge: true,
                    walletBalance: userBalance,
                    planPrice
                });
            }

            // Deduct from wallet
            user.wallet = user.wallet || { balance: 0, totalPurchasedCredits: 0, totalSpentCredits: 0 };
            const balanceBefore = user.wallet.balance;
            user.wallet.balance -= planPrice;
            user.wallet.totalSpentCredits = (user.wallet.totalSpentCredits || 0) + planPrice;
            await user.save();

            // Record transaction
            try {
                await WalletTransaction.create({
                    userId,
                    transactionType: 'PURCHASE',
                    credits: planPrice,
                    amount: planPrice,
                    balanceBefore,
                    balanceAfter: user.wallet.balance,
                    referenceId: card._id.toString(),
                    remarks: `Profile Card Subscription (₹${planPrice})`
                });
            } catch (tErr) {
                console.warn('WalletTransaction recording error:', tErr.message);
            }
        } else {
            // Record online payment transaction for transparency
            try {
                await WalletTransaction.create({
                    userId,
                    transactionType: 'PURCHASE',
                    credits: planPrice,
                    amount: planPrice,
                    balanceBefore: user.wallet?.balance || 0,
                    balanceAfter: user.wallet?.balance || 0,
                    referenceId: card._id.toString(),
                    remarks: `Profile Card Subscription via ${paymentMethod.toUpperCase()} (₹${planPrice})`
                });
            } catch (tErr) {
                console.warn('WalletTransaction recording error:', tErr.message);
            }
        }

        // Activate / Extend Subscription
        const now = new Date();
        const expiresAt = new Date(now.getTime() + planDuration * 24 * 60 * 60 * 1000);

        card.subscription = {
            isSubscribed: true,
            subscribedAt: now,
            expiresAt,
            amountPaid: planPrice,
            paymentMethod,
            paymentId: paymentId || `CARD_SUB_${Date.now()}`,
            planName
        };

        await card.save();

        return res.status(200).json({
            success: true,
            message: `🎉 Profile Card successfully unlocked for ₹${planPrice}! All features & sharing are now active for 30 days.`,
            data: {
                subscription: card.subscription,
                walletBalance: user.wallet?.balance
            }
        });
    } catch (error) {
        console.error('[VisitingCard] subscribeProfileCard error:', error);
        return res.status(500).json({ success: false, message: 'Subscription failed', error: error.message });
    }
};

/**
 * @desc Create Instifi Payment Gateway Order for Profile Card Subscription (Real-Time ₹50 Plan)
 * @route POST /web/api/visiting-card/instifi/create-order
 */
exports.createInstifiProfileCardOrder = async (req, res) => {
    try {
        const userId = req.Id || req.userId || req.user?._id || req.accountId;
        if (!userId) {
            return res.status(401).json({ success: false, message: 'Authentication required' });
        }

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        let plan = await ProfileCardPlan.findOne({ isActive: true });
        const planPrice = plan?.price !== undefined ? plan.price : 50;
        const planDuration = plan?.durationDays || 30;

        const orderId = `PC_ORD_${Date.now()}_${String(userId).slice(-4)}`;
        const merchantTxnId = `PC_TXN_${Date.now()}`;

        // Get Instifi Auth Token
        let token;
        try {
            token = await instifiPaymentService.getAccessToken(orderId);
        } catch (authErr) {
            console.error('[Instifi] Auth error:', authErr.message);
            return res.status(500).json({
                success: false,
                message: 'Failed to authenticate with Instifi gateway: ' + (authErr.message || 'Check gateway credentials')
            });
        }

        const customerName = user.name || user.username || 'Valued Customer';
        const customerMobile = user.mobile || user.phone || '9999999999';
        const customerEmail = user.email || 'customer@prithu.app';

        const orderData = {
            amount: planPrice,
            merchantTxnId,
            orderId,
            payMode: 'all',
            productInfo: 'Profile Card Pro Pass',
            customerName,
            customerMobile,
            customerEmail
        };

        const gatewayResult = await instifiPaymentService.createOrder(token, orderData);

        // Instifi returns payment link / payment URL
        const paymentUrl = gatewayResult?.paymentUrl || gatewayResult?.payment_url || gatewayResult?.redirectURL || gatewayResult?.url || gatewayResult?.paymentLink;

        return res.status(200).json({
            success: true,
            message: 'Instifi payment order initialized successfully',
            data: {
                orderId,
                merchantTxnId,
                amount: planPrice,
                durationDays: planDuration,
                paymentUrl,
                raw: gatewayResult
            }
        });
    } catch (error) {
        console.error('[VisitingCard] createInstifiProfileCardOrder error:', error);
        return res.status(500).json({
            success: false,
            message: error.message || 'Failed to create Instifi payment order'
        });
    }
};

/**
 * @desc Verify Instifi Payment Status & Activate Subscription
 * @route POST /web/api/visiting-card/instifi/verify-order
 */
exports.verifyInstifiProfileCardOrder = async (req, res) => {
    try {
        const userId = req.Id || req.userId || req.user?._id || req.accountId;
        if (!userId) {
            return res.status(401).json({ success: false, message: 'Authentication required' });
        }

        const { orderId, transactionId = '' } = req.body;
        if (!orderId) {
            return res.status(400).json({ success: false, message: 'orderId is required' });
        }

        let plan = await ProfileCardPlan.findOne({ isActive: true });
        const planPrice = plan?.price !== undefined ? plan.price : 50;
        const planDuration = plan?.durationDays || 30;
        const planName = plan?.name || "Profile Card Pro Pass";

        let card = await VisitingCard.findOne({ userId });
        if (!card) {
            card = await VisitingCard.create({ userId, businessName: 'My Profile Card' });
        }

        const user = await User.findById(userId);

        // Check status with Instifi Gateway
        let statusRes;
        try {
            statusRes = await instifiPaymentService.checkStatus(orderId, transactionId);
        } catch (sErr) {
            console.warn('[Instifi] Check status error:', sErr.message);
        }

        const responseCode = statusRes?.responseCode || statusRes?.code || statusRes?.status;
        const txnStatus = String(statusRes?.data?.status || statusRes?.data?.paymentStatus || statusRes?.responseMessage || '').toUpperCase();

        const isSuccess = (responseCode === '200' || responseCode === 200) ||
                          txnStatus.includes('SUCCESS') ||
                          txnStatus.includes('COMPLETED') ||
                          txnStatus.includes('PAID');

        if (!isSuccess && statusRes) {
            return res.status(400).json({
                success: false,
                message: statusRes.responseMessage || statusRes.message || 'Payment has not been completed yet.',
                statusData: statusRes
            });
        }

        // Activate 30-Day Pro Subscription
        const now = new Date();
        const expiresAt = new Date(now.getTime() + planDuration * 24 * 60 * 60 * 1000);

        card.subscription = {
            isSubscribed: true,
            subscribedAt: now,
            expiresAt,
            amountPaid: planPrice,
            paymentMethod: 'instifi',
            paymentId: orderId,
            planName
        };

        await card.save();

        // Record in ledger
        try {
            await WalletTransaction.create({
                userId,
                transactionType: 'PURCHASE',
                credits: planPrice,
                amount: planPrice,
                balanceBefore: user?.wallet?.balance || 0,
                balanceAfter: user?.wallet?.balance || 0,
                referenceId: card._id.toString(),
                remarks: `Profile Card Subscription via INSTIFI Gateway (₹${planPrice})`
            });
        } catch (tErr) {
            console.warn('WalletTransaction recording error:', tErr.message);
        }

        return res.status(200).json({
            success: true,
            message: `🎉 Profile Card successfully unlocked via Instifi for ₹${planPrice}! Active for 30 days.`,
            data: {
                subscription: card.subscription,
                isSubscribed: true
            }
        });
    } catch (error) {
        console.error('[VisitingCard] verifyInstifiProfileCardOrder error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to verify payment',
            error: error.message
        });
    }
};

/**
 * @desc Admin: Get Profile Card Plan Configuration
 * @route GET /api/visiting-card/admin/plan
 */
exports.adminGetProfileCardPlan = async (req, res) => {
    try {
        let plan = await ProfileCardPlan.findOne();
        if (!plan) {
            plan = await ProfileCardPlan.create({
                name: "Profile Card Pro Pass",
                price: 50,
                originalPrice: 199,
                durationDays: 30,
                badgeText: "POPULAR • 75% OFF",
                trialEnabled: true,
                trialDurationDays: 3,
                description: "Unlock all 5 card templates, custom colors, services, QR code image and live sharing for 30 days",
                features: [
                    "All 5 Premium Card Themes & Live Color Controls",
                    "Unlock QR Code Image & Instant Sharing",
                    "Services & Products Showcase (Unlimited)",
                    "Photo Gallery & Showcase Images",
                    "1-Tap WhatsApp, Direct Call & Google Maps Buttons",
                    "vCard Contact Save (.VCF) Download",
                    "Real-Time Page View Analytics"
                ],
                isActive: true
            });
        }
        return res.status(200).json({ success: true, data: plan });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Failed to fetch plan config', error: error.message });
    }
};

/**
 * @desc Admin: Update Profile Card Plan Configuration (Price, Duration, Features, Trial)
 * @route PUT /api/visiting-card/admin/plan
 */
exports.adminUpdateProfileCardPlan = async (req, res) => {
    try {
        const { name, price, originalPrice, durationDays, description, features, badgeText, trialEnabled, trialDurationDays, isActive } = req.body;

        let plan = await ProfileCardPlan.findOne();
        if (!plan) {
            plan = new ProfileCardPlan({});
        }

        if (name !== undefined) plan.name = name;
        if (price !== undefined) plan.price = Number(price);
        if (originalPrice !== undefined) plan.originalPrice = Number(originalPrice);
        if (durationDays !== undefined) plan.durationDays = Number(durationDays);
        if (description !== undefined) plan.description = description;
        if (features !== undefined) plan.features = features;
        if (badgeText !== undefined) plan.badgeText = badgeText;
        if (trialEnabled !== undefined) plan.trialEnabled = Boolean(trialEnabled);
        if (trialDurationDays !== undefined) plan.trialDurationDays = Number(trialDurationDays);
        if (isActive !== undefined) plan.isActive = Boolean(isActive);

        await plan.save();

        return res.status(200).json({
            success: true,
            message: `Profile Card plan updated successfully. New price: ₹${plan.price}, Trial: ${plan.trialEnabled ? `${plan.trialDurationDays} Days` : 'Disabled'}`,
            data: plan
        });
    } catch (error) {
        console.error('[VisitingCard] adminUpdateProfileCardPlan error:', error);
        return res.status(500).json({ success: false, message: 'Failed to update plan', error: error.message });
    }
};

/**
 * @desc Admin: Get Subscribed Users List for Profile Card
 * @route GET /api/visiting-card/admin/subscribers
 */
exports.adminGetSubscribers = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const search = req.query.search ? req.query.search.trim() : '';
        const status = req.query.status || 'all'; // 'all' | 'active' | 'expired'

        let filter = { 'subscription.isSubscribed': true };

        const now = new Date();
        if (status === 'active') {
            filter['subscription.expiresAt'] = { $gte: now };
        } else if (status === 'expired') {
            filter['subscription.expiresAt'] = { $lt: now };
        }

        if (search) {
            filter.$or = [
                { businessName: { $regex: search, $options: 'i' } },
                { personName: { $regex: search, $options: 'i' } },
                { slug: { $regex: search, $options: 'i' } },
                { 'contact.phone': { $regex: search, $options: 'i' } }
            ];
        }

        const skip = (page - 1) * limit;

        const [subscribers, total, statsAgg] = await Promise.all([
            VisitingCard.find(filter)
                .sort({ 'subscription.subscribedAt': -1 })
                .skip(skip)
                .limit(limit)
                .populate('userId', 'name userName profileAvatar phone email')
                .lean(),
            VisitingCard.countDocuments(filter),
            VisitingCard.aggregate([
                { $match: { 'subscription.isSubscribed': true } },
                {
                    $group: {
                        _id: null,
                        totalRevenue: { $sum: '$subscription.amountPaid' },
                        totalSubscribers: { $sum: 1 }
                    }
                }
            ])
        ]);

        const revenueStats = statsAgg[0] || { totalRevenue: 0, totalSubscribers: 0 };

        return res.status(200).json({
            success: true,
            data: subscribers,
            stats: {
                totalSubscribers: revenueStats.totalSubscribers || 0,
                totalRevenue: revenueStats.totalRevenue || 0
            },
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        console.error('[VisitingCard] adminGetSubscribers error:', error);
        return res.status(500).json({ success: false, message: 'Failed to fetch subscribers', error: error.message });
    }
};

/**
 * @desc Admin: Manually Grant or Revoke Profile Card Subscription
 * @route POST /api/visiting-card/admin/grant-subscription
 */
exports.adminGrantSubscription = async (req, res) => {
    try {
        const { userId, cardId, durationDays = 365, grant = true, amountPaid = 0 } = req.body;

        let query = {};
        if (cardId) query._id = cardId;
        else if (userId) query.userId = userId;
        else return res.status(400).json({ success: false, message: 'userId or cardId is required' });

        let card = await VisitingCard.findOne(query);
        if (!card) {
            if (userId) {
                card = await VisitingCard.create({ userId, businessName: 'My Profile Card' });
            } else {
                return res.status(404).json({ success: false, message: 'Profile card not found' });
            }
        }

        if (grant) {
            const now = new Date();
            card.subscription = {
                isSubscribed: true,
                subscribedAt: now,
                expiresAt: new Date(now.getTime() + Number(durationDays) * 24 * 60 * 60 * 1000),
                amountPaid: Number(amountPaid),
                paymentMethod: 'admin_grant',
                paymentId: `ADMIN_GRANT_${Date.now()}`,
                planName: 'Profile Card Pro Pass (Admin)'
            };
        } else {
            card.subscription = {
                isSubscribed: false,
                amountPaid: 0,
                paymentMethod: 'none',
                paymentId: ''
            };
        }

        await card.save();

        return res.status(200).json({
            success: true,
            message: grant ? 'Subscription granted successfully' : 'Subscription revoked successfully',
            data: card.subscription
        });
    } catch (error) {
        console.error('[VisitingCard] adminGrantSubscription error:', error);
        return res.status(500).json({ success: false, message: 'Action failed', error: error.message });
    }
};
