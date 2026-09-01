const mongoose = require('mongoose');
const { prithuDB } = require('../database');

const serviceProductSchema = new mongoose.Schema({
    id: { type: String, default: () => Math.random().toString(36).substring(2, 9) },
    title: { type: String, required: true },
    description: { type: String, default: '' },
    price: { type: String, default: '' },
    image: { type: String, default: '' },
    badge: { type: String, default: '' }, // e.g. 'Featured', 'Best Seller', 'New'
    link: { type: String, default: '' },
    isAvailable: { type: Boolean, default: true }
}, { _id: false });

const galleryItemSchema = new mongoose.Schema({
    id: { type: String, default: () => Math.random().toString(36).substring(2, 9) },
    imageUrl: { type: String, required: true },
    title: { type: String, default: '' }
}, { _id: false });

const visitingCardSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        unique: true,
        index: true
    },
    slug: {
        type: String,
        unique: true,
        sparse: true,
        trim: true,
        lowercase: true
    },
    businessName: { type: String, default: 'My Business' },
    personName: { type: String, default: '' },
    designation: { type: String, default: 'Founder / Business Owner' },
    tagline: { type: String, default: '' },
    category: { type: String, default: 'Business & Services' },
    about: { type: String, default: '' },
    
    // Branding Media
    profileImage: { type: String, default: '' },
    bannerImage: { type: String, default: '' },
    
    // Contact & Location
    contact: {
        phone: { type: String, default: '' },
        whatsapp: { type: String, default: '' },
        email: { type: String, default: '' },
        website: { type: String, default: '' },
        address: { type: String, default: '' },
        city: { type: String, default: '' },
        state: { type: String, default: '' },
        pincode: { type: String, default: '' },
        googleMapsUrl: { type: String, default: '' },
        lat: { type: Number, default: null },
        lng: { type: Number, default: null }
    },
    
    // Social Links
    socialLinks: {
        instagram: { type: String, default: '' },
        facebook: { type: String, default: '' },
        linkedin: { type: String, default: '' },
        youtube: { type: String, default: '' },
        twitter: { type: String, default: '' },
        pinterest: { type: String, default: '' }
    },
    
    // Services & Products
    services: [serviceProductSchema],
    
    // Gallery
    gallery: [galleryItemSchema],
    
    // Template & Theme
    templateId: {
        type: String,
        enum: ['template_1', 'template_2', 'template_3', 'template_4', 'template_5'],
        default: 'template_3' // SOAPERB Modern Vibrant default
    },
    themeConfig: {
        primaryColor: { type: String, default: '#10B981' },
        secondaryColor: { type: String, default: '#0F172A' },
        accentColor: { type: String, default: '#3B82F6' },
        backgroundColor: { type: String, default: '#F8FAFC' },
        textColor: { type: String, default: '#0F172A' },
        fontFamily: { type: String, default: 'sans' }
    },
    
    // Analytics & Stats
    stats: {
        viewsCount: { type: Number, default: 0 },
        sharesCount: { type: Number, default: 0 },
        savesCount: { type: Number, default: 0 }
    },
    
    // Dedicated Profile Card Subscription
    subscription: {
        isSubscribed: { type: Boolean, default: false, index: true },
        subscribedAt: { type: Date },
        expiresAt: { type: Date, index: true },
        amountPaid: { type: Number, default: 0 },
        paymentMethod: { type: String, default: 'wallet' }, // 'wallet' | 'payment_gateway' | 'admin_grant'
        paymentId: { type: String, default: '' },
        planName: { type: String, default: 'Profile Card Pro Pass' }
    },

    // 3 Days Free Trial
    trial: {
        isTrialUsed: { type: Boolean, default: false },
        trialStartedAt: { type: Date },
        trialExpiresAt: { type: Date, index: true }
    },
    
    isActive: { type: Boolean, default: true }
}, {
    timestamps: true
});

module.exports = prithuDB.model('VisitingCard', visitingCardSchema, 'visitingcards');
