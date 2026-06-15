const express = require('express');
const router = express.Router();
const chatController = require('../controllers/chatController');
// Assuming there might be an auth middleware, but we allow public searches
// const auth = require('../middlewares/auth'); 

// User Facing Routes
router.post('/search', chatController.searchQuery);
router.post('/lead', chatController.captureLead);
router.get('/history', chatController.getHistory);

// Admin Dashboard Routes
// In a real app, protect these with admin auth middleware
router.get('/analytics', chatController.getAnalytics);
router.get('/unanswered', chatController.getUnansweredQuestions);
router.get('/leads', chatController.getLeads);

module.exports = router;
