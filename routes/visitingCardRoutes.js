const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const { auth, optionalAuth } = require('../middlewares/jwtAuthentication');
const {
    getMyCard,
    updateMyCard,
    syncProfileFromUserDetails,
    getPublicCard,
    trackCardMetric,
    generateVCard,
    uploadMedia,
    adminGetVisitingCardStats,
    adminGetVisitingCards,
    getProfileCardPlan,
    startProfileCardTrial,
    subscribeProfileCard,
    createInstifiProfileCardOrder,
    verifyInstifiProfileCardOrder,
    adminGetProfileCardPlan,
    adminUpdateProfileCardPlan,
    adminGetSubscribers,
    adminGrantSubscription
} = require('../controllers/visitingCardController');

// Multer Storage Setup for Visiting Card Media
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadDir = path.join(__dirname, '../uploads/visiting-card');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname) || '.jpg';
        cb(null, 'card-' + uniqueSuffix + ext);
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 15 * 1024 * 1024 } // 15MB max
});

// Authenticated User Routes
router.get('/my-card', auth, getMyCard);
router.put('/my-card', auth, updateMyCard);
router.post('/sync-profile', auth, syncProfileFromUserDetails);
router.post('/upload-media', auth, upload.single('image'), uploadMedia);
router.post('/trial', auth, startProfileCardTrial);
router.post('/subscribe', auth, subscribeProfileCard);

// Instifi Real-Time Payment Routes
router.post('/instifi/create-order', auth, createInstifiProfileCardOrder);
router.post('/instifi/verify-order', auth, verifyInstifiProfileCardOrder);

// Admin Routes
router.get('/admin/stats', auth, adminGetVisitingCardStats);
router.get('/admin/list', auth, adminGetVisitingCards);
router.get('/admin/plan', auth, adminGetProfileCardPlan);
router.put('/admin/plan', auth, adminUpdateProfileCardPlan);
router.get('/admin/subscribers', auth, adminGetSubscribers);
router.post('/admin/grant-subscription', auth, adminGrantSubscription);

// Public Routes
router.get('/plan', getProfileCardPlan);
router.get('/public/:identifier', optionalAuth, getPublicCard);
router.post('/track/:identifier', trackCardMetric);
router.get('/vcard/:identifier', generateVCard);

module.exports = router;
