const express = require('express');
const router = express.Router();
const { auth } = require('../middlewares/jwtAuthentication');
const { checkPermission } = require('../middlewares/rbacMiddleware');
const {
    upload: adminUploadFeed,
    processUploadedFiles: attachAdminFeedFiles
} = require('../middlewares/uploadMiddleware');

const {
    newAdmin,
    adminLogin,
    adminSendOtp,
    existAdminVerifyOtp,
    newAdminVerifyOtp,
    adminPasswordReset,
    verifyToken,
    checkAvailability,
    adminLogout,
    childAdminHeartbeat,
    getChildAdminStats,
} = require('../controllers/authenticationControllers/adminAuthController');

const {
    getUsersStatus,
    getUsersByDate,
    getAllUserDetails,
    searchAllUserDetails,
    getAnaliticalCountforUser,
    getUserLikedFeedsforAdmin,
    getUserSocialMeddiaDetailWithIdForAdmin,
    getUserAnalyticalData,
    getUserProfileDashboardMetricCount,
    deleteUserAndAllRelated,
    getUserProfileDetailforAdmin,
    getUserDeleteLogs,
} = require('../controllers/adminControllers/adminUserControllers');

const {
    createPlan,
    updatePlan,
    deletePlan,
    getAllPlans
} = require('../controllers/adminControllers/adminSubscriptionController');

const {
    adminFeedUpload,
    childAdminFeedUpload,
    getAllFeedAdmin,
    getUsersWillingToPost,
    updateUserPostPermission,
    bulkFeedUpload,
    getUploadProgress,
    removeFeedCategory,
    getFeedWithDesign,
    updateFeedDesign,
} = require('../controllers/adminControllers/adminfeedController');

const {
    adminGetTrendingFeeds,
} = require('../controllers/creatorControllers/creatorDetailController');

const {
    getTrendingFeeds,
} = require('../controllers/feedControllers/feedsController');
const {
    adminAddCategory,
    deleteCategory,
    updateCategory,
} = require('../controllers/adminControllers/adminCatagoryController');

const {
    getDashboardMetricCount,
    getDashUserRegistrationRatio,
    getDashUserSubscriptionRatio,
    getDashboardHeartbeat,
} = require('../controllers/adminControllers/dashboardController');

const {
    addReportQuestion,
    getQuestionsByType,
    createReportType,
    adminGetReportTypes,
    updateReportStatus,
    getReportLogs,
    getQuestionById,
    deleteQuestion,
    toggleReportType,
    deleteReportType,
    getReports,
    linkNextQuestion,
    adminTakeActionOnReport,
    getAllQuestions,
    getAllReports
} = require("../controllers/adminControllers/adminReportController");

const {
    sendAdminNotification,
} = require('../controllers/adminControllers/notificationController');

const analyticsDashboardController = require("../controllers/adminControllers/analyticsDashboardController");

const {
    getSystemMetrics,
} = require('../controllers/adminControllers/systemMetricsController');

const {
    getChildAdmins,
    getChildAdminPermissions,
    updateChildAdminPermissions,
    getChildAdminById,
    blockChildAdmin,
    deleteChildAdmin,
    updateChildAdminProfileById,
} = require('../controllers/adminControllers/adminChildAdminController');

const {
    getAnalytics,
    getRecentSubscriptionUsers,
    getRecentWithdrawalUsers,
    getTopReferralUsers,
    getUserAndSubscriptionCountsDaily,
} = require("../controllers/adminControllers/SalesDashboard/salesDashboardMetricksController");



const { getPostVolumeWeekly,
    getPostVolumeDaily,
    getPostVolumeMonthly,
} = require('../controllers/feedControllers/feedVolumController');

const { getDriveDashboard, driveCommand } = require('../controllers/adminControllers/driverStatusController');
const { getServerStats, manageProcess, getLogs, flushLogs } = require('../controllers/adminControllers/serverMonitorController');
const { exploreFolder } = require('../controllers/adminControllers/folderExplorerController');
const { getDatabaseStats, triggerBackup } = require('../controllers/adminControllers/dbManagementController');
const { getRedisStats, flushRedis, deleteByPrefix, getKeyInfo } = require('../controllers/adminControllers/redisManagementController');
const { getCronStatus, triggerCron } = require('../controllers/adminControllers/cronManagementController');

const {
    getTopCategories,
    getTopFeeds,
    getEngagementTrends,
} = require('../controllers/adminControllers/analyticsDashboardController');

const {
    getHelpFAQ,
    createHelpSection,
    updateHelpSection,
    deleteHelpSection,
    bulkCreateHelpFAQ,
} = require("../controllers/adminControllers/adminHelpController");

const { getAllUserFeedback, updateFeedbackStatus, getAllSupportQueries, updateSupportQueryStatus } = require('../controllers/feedBackController');
const { updateFooterConfig } = require('../controllers/footerController');
const { updatePageBySlug } = require('../controllers/staticPageController');
const {
    getAllBlogsAdmin,
    createBlog,
    updateBlog,
    deleteBlog,
    toggleBlogStatus
} = require('../controllers/blogController');

const {
    getAllUpdatesAdmin,
    createUpdate,
    updateUpdate,
    deleteUpdate
} = require('../controllers/adminControllers/updateController');

const {
    blogUpload,
    processBlogImage
} = require('../middlewares/services/blogUpload');

const {
    childAdminAvatarUpload,
    processChildAdminAvatar
} = require('../middlewares/services/childAdminUpload');

const {
    getSeoDashboardStats,
    getSeoConfig,
    updateSeoConfig,
    getAllPagesSeo,
    getAllFeedsSeo,
    updateFeedSeo,
    getMediaSeo,
    getAllRedirects,
    createRedirect,
    deleteRedirect,
    triggerSitemapGeneration,
    updateRobotsTxt
} = require('../controllers/adminControllers/seoController');

const {
    getAdminProfileDetail,
    getUserProfileDetail,
} = require('../controllers/profileControllers/profileController');

const {
    getCompressionStats,
    triggerBulkCompression,
    retryCompression,
    toggleQueue,
    stopAllCompression
} = require('../controllers/adminControllers/videoCompressionController');

const {
    getPromoDashboardStats,
    getPromotionTemplates,
    getTemplateContent,
    saveTemplate,
    deleteTemplate,
    triggerManualBatch,
    toggleCampaignStatus
} = require('../controllers/adminControllers/adminEmailController');

const {
    getAllParties,
    createParty,
    updateParty,
    deleteParty,
} = require('../controllers/adminControllers/adminPartyController');

const {
    fetchUserFeeds,
    fetchUserFollowing,
    fetchUserInterested,
    fetchUserHidden,
    fetchUserLiked,
    fetchUserDisliked,
    fetchUserCommented,
    fetchUserShared,
    fetchUserDownloaded,
    getUserAnalyticsSummary,
    fetchUserNonInterested,
} = require('../controllers/userControllers/userFeedController');

const { getUserActivitiesForAdmin } = require('../controllers/userControllers/userActivitController');

const { exportFeedInteractionsCSV } = require('../controllers/adminControllers/adminExportController');

const { getAllCategories } = require('../controllers/categoriesController');
const { deleteFeed } = require('../controllers/feedControllers/feedsController');

/* --------------------- Admin Export API --------------------- */
router.get("/export/csv", auth, checkPermission('canManageFeeds'), exportFeedInteractionsCSV);

/* --------------------- Admin Authentication --------------------- */
router.post('/auth/admin/register', auth, newAdmin); // This was CHILD_ADMIN_REGISTER probably
router.post('/auth/admin/login', adminLogin);
router.post('/auth/admin/sent-otp', adminSendOtp);
router.post('/auth/exist/admin/verify-otp', existAdminVerifyOtp);
router.post('/auth/new/admin/verify-otp', newAdminVerifyOtp);
router.post('/auth/admin/reset-password', adminPasswordReset);
router.get('/admin/verify-token', auth, verifyToken);
router.get("/auth/check-availability", checkAvailability);
router.post('/auth/admin/logout', auth, adminLogout);
router.post('/auth/child-admin/heartbeat', auth, childAdminHeartbeat);
router.get('/admin/child-admin-stats', auth, getChildAdminStats);

/* --------------------- Admin Profile API --------------------- */
router.get('/admin/profile', auth, getAdminProfileDetail);

/* --------------------- Admin Feed API --------------------- */
router.post(
    '/admin/feed-upload',
    auth,
    adminUploadFeed.fields([
        { name: "files", maxCount: 20 },
        { name: "file", maxCount: 20 },
        { name: "media", maxCount: 20 },
        { name: "image", maxCount: 20 },
        { name: "video", maxCount: 20 },
        { name: "audio", maxCount: 1 }
    ]),
    attachAdminFeedFiles,
    checkPermission('canManageUpload'),
    adminFeedUpload
);
router.get("/admin/get/all/feed", auth, checkPermission('canManageFeeds'), getAllFeedAdmin);
router.get("/admin/feed/:feedId/design", auth, checkPermission('canManageFeeds'), getFeedWithDesign);
router.put("/admin/feed/:feedId/design", auth, checkPermission('canManageFeeds'), updateFeedDesign);
router.patch("/admin/feed/:feedId/schedule", auth, checkPermission('canManageFeeds'), require('../controllers/adminControllers/adminfeedController').updateFeedSchedule);
router.get("/admin/get/trending/creator", auth, checkPermission('canTrendingCreators'), adminGetTrendingFeeds); // Match key ADMIN_GET_TRENDING_CREATOR
router.delete("/admin/delete/feed", auth, checkPermission('canManageFeeds'), deleteFeed);
router.delete("/admin/feed/:feedId/category/:categoryId", auth, checkPermission('canManageCategories'), removeFeedCategory);
router.get("/get/trending/feed", auth, checkPermission('canManageTrendingFeeds'), adminGetTrendingFeeds);
/* --------------------- Admin Category API --------------------- */
router.post('/admin/add/feed/category', auth, checkPermission('canManageCategories'), adminAddCategory);
router.delete('/admin/feed/category/:id', auth, checkPermission('canManageCategories'), deleteCategory);
router.delete('/admin/delete/category/:id', auth, checkPermission('canManageCategories'), deleteCategory);
router.delete('/delete/category/:id', auth, checkPermission('canManageCategories'), deleteCategory);
router.delete('/delete/category', auth, checkPermission('canManageCategories'), deleteCategory); // For body-based ID
router.get('/admin/get/feed/category', auth, checkPermission('canManageCategories'), getAllCategories);
router.put('/admin/update/category', auth, checkPermission('canManageCategories'), updateCategory);

/* --------------------- Admin Subscription API --------------------- */
router.post('/admin/subscription/create', auth, checkPermission('canManageSubscriptions'), createPlan);
router.put('/admin/subscription/update/:id', auth, checkPermission('canManageSubscriptions'), updatePlan);
router.delete('/admin/subscription/delete/:id', auth, checkPermission('canManageSubscriptions'), deletePlan);
router.get('/admin/subscription/all', auth, checkPermission('canManageSubscriptions'), getAllPlans);
router.get('/admin/getall/subscriptions', auth, checkPermission('canManageSubscriptions'), getAllPlans); // Alias

/* --------------------- Admin User API --------------------- */
router.get('/admin/getall/users', auth, checkPermission('canManageUsers'), getAllUserDetails);
router.get("/admin/search/user", auth, checkPermission('canManageUsers'), searchAllUserDetails);
router.get('/admin/get/user/social/media/profile/detail/:id', auth, checkPermission('canManageUsers'), getUserSocialMeddiaDetailWithIdForAdmin);
router.get("/admin/users/status", auth, checkPermission('canManageUsers'), getUsersStatus);
router.get("/admin/user/detail/by-date", auth, checkPermission('canManageUsers'), getUsersByDate);
router.get('/admin/user/analytical-count/:userId', auth, checkPermission('canManageUsers'), getAnaliticalCountforUser);
router.get('/admin/get/user/analytical/data/:userId', auth, checkPermission('canManageUsers'), getUserAnalyticalData);

router.patch("/admin/block/user/:userId", auth, checkPermission('canManageUsers'), require('../controllers/userControllers/userDetailController').blockUserById);
router.get('/admin/user/profile/metricks', auth, checkPermission('canManageUsers'), getUserProfileDashboardMetricCount);
router.get('/admin/user/likes/:userId', auth, checkPermission('canManageUsers'), getUserLikedFeedsforAdmin);
router.delete('/admin/delete/user/:userId', auth, checkPermission('canManageUsers'), deleteUserAndAllRelated);
router.get('/admin/user/delete-logs', auth, checkPermission('canManageUsers'), getUserDeleteLogs);
router.get("/user/list/willingtopost", auth, checkPermission('canManageUserFeedRequest'), getUsersWillingToPost);
router.put("/update/user/post/status/:userId", auth, checkPermission('canManageUserFeedRequest'), updateUserPostPermission);
router.get("/admin/user/activities/:userId", auth, checkPermission('canManageUsers'), getUserActivitiesForAdmin);

/* --------------------- User Analytics API --------------------- */
router.get("/admin/summary/:userId", auth, checkPermission('canManageUsers'), getUserAnalyticsSummary);
router.get("/admin/feeds/:userId", auth, checkPermission('canManageUsers'), fetchUserFeeds);
router.get("/admin/following/:userId", auth, checkPermission('canManageUsers'), fetchUserFollowing);
router.get("/admin/interested/:userId", auth, checkPermission('canManageUsers'), fetchUserInterested);
router.get("/admin/hidden/:userId", auth, checkPermission('canManageUsers'), fetchUserHidden);
router.get("/admin/liked/:userId", auth, checkPermission('canManageUsers'), fetchUserLiked);
router.get("/admin/disliked/:userId", auth, checkPermission('canManageUsers'), fetchUserDisliked);
router.get("/admin/commented/:userId", auth, checkPermission('canManageUsers'), fetchUserCommented);
router.get("/admin/shared/:userId", auth, checkPermission('canManageUsers'), fetchUserShared);
router.get("/admin/downloaded/:userId", auth, checkPermission('canManageUsers'), fetchUserDownloaded);
router.get("/admin/nonInterested/:userId", auth, checkPermission('canManageUsers'), fetchUserNonInterested);

// Aliases for New Admin Panel (short paths)
router.get("/summary/:userId", auth, checkPermission('canManageUsers'), getUserAnalyticsSummary);
router.get("/feeds/:userId", auth, checkPermission('canManageUsers'), fetchUserFeeds);
router.get("/following/:userId", auth, checkPermission('canManageUsers'), fetchUserFollowing);
router.get("/interested/:userId", auth, checkPermission('canManageUsers'), fetchUserInterested);
router.get("/hidden/:userId", auth, checkPermission('canManageUsers'), fetchUserHidden);
router.get("/liked/:userId", auth, checkPermission('canManageUsers'), fetchUserLiked);
router.get("/disliked/:userId", auth, checkPermission('canManageUsers'), fetchUserDisliked);
router.get("/commented/:userId", auth, checkPermission('canManageUsers'), fetchUserCommented);
router.get("/shared/:userId", auth, checkPermission('canManageUsers'), fetchUserShared);
router.get("/downloaded/:userId", auth, checkPermission('canManageUsers'), fetchUserDownloaded);
router.get("/nonInterested/:userId", auth, checkPermission('canManageUsers'), fetchUserNonInterested);

/* --------------------- Admin DashBoard API --------------------- */
router.get("/admin/dashboard/metricks/counts", auth, getDashboardMetricCount); // Generic dashboard, auth only
router.get("/admin/users/monthly-registrations", auth, checkPermission('canManageUsers'), getDashUserRegistrationRatio);
router.get("/admin/dashboard/heartbeat", auth, getDashboardHeartbeat);
router.get("/admin/dashboard/user-subscription-counts", auth, checkPermission('canManageSalesDashboard'), getUserAndSubscriptionCountsDaily);
router.get("/admin/analytics/recommendation-kpis", auth, checkPermission('canManageSalesDashboard'), analyticsDashboardController.getRecommendationKPIs);
router.get("/admin/analytics/feed-performance", auth, checkPermission('canManageSalesDashboard'), analyticsDashboardController.getFeedPerformanceTable);
router.get("/admin/analytics/search-analytics", auth, checkPermission('canManageSalesDashboard'), analyticsDashboardController.getSearchAnalytics);
router.get("/admin/analytics/live-monitoring", auth, checkPermission('canManageSalesDashboard'), analyticsDashboardController.getLiveMonitoring);
router.get("/admin/analytics/recommendation-performance", auth, checkPermission('canManageSalesDashboard'), analyticsDashboardController.getRecommendationPerformance);
router.post("/admin/analytics/trigger-ml-training", auth, checkPermission('canManageSalesDashboard'), analyticsDashboardController.triggerMLTraining);

router.get("/admin/analytics/top-categories", auth, checkPermission('canManageSalesDashboard'), analyticsDashboardController.getTopCategories);
router.get("/admin/analytics/top-feeds", auth, checkPermission('canManageSalesDashboard'), analyticsDashboardController.getTopFeeds);
router.get("/admin/analytics/engagement-trends", auth, checkPermission('canManageSalesDashboard'), analyticsDashboardController.getEngagementTrends);
router.get("/admin/analytics/time-insights", auth, checkPermission('canManageSalesDashboard'), analyticsDashboardController.getTimeOfDayInsights);
router.get("/admin/analytics/day-insights", auth, checkPermission('canManageSalesDashboard'), analyticsDashboardController.getDayOfWeekInsights);
router.get("/admin/analytics/export-csv", auth, checkPermission('canManageSalesDashboard'), analyticsDashboardController.exportAnalyticsCSV);
router.get("/admin/analytics/search-users", auth, checkPermission('canManageSalesDashboard'), analyticsDashboardController.searchUsersForExport);
router.get("/admin/analytics/get-feed-analysis/:feedId", auth, checkPermission('canManageSalesDashboard'), analyticsDashboardController.getFeedAnalysis);

/* --------------------- Admin Creator API --------------------- */
router.get('/admin/getall/creators', auth, checkPermission('canManageCreators'), require('../controllers/creatorControllers/creatorDetailController').getAllCreatorDetails);

/* --------------------- Admin Sales Dashboard ------------------ */
router.get("/admin/sales/dashboard/analytics", auth, checkPermission('canManageSalesDashboard'), getAnalytics);
router.get("/get/recent/subscribers", auth, checkPermission('canManageSalesDashboard'), getRecentSubscriptionUsers);
router.get("/get/recent/withdrawals", auth, checkPermission('canManageSalesDashboard'), getRecentWithdrawalUsers);
router.get("/sales/dashboard/analytics", auth, checkPermission('canManageSalesDashboard'), getAnalytics);
router.get("/admin/top/referral/users", auth, checkPermission('canManageSalesDashboard'), getTopReferralUsers);
router.get("/admin/dashboard/user-subscription-counts", auth, checkPermission('canManageSalesDashboard'), getUserAndSubscriptionCountsDaily);

// Aliases for Sales Dashboard
router.get("/top/referral/users", auth, checkPermission('canManageSalesDashboard'), getTopReferralUsers);
router.get("/dashboard/user-subscription-counts", auth, checkPermission('canManageSalesDashboard'), getUserAndSubscriptionCountsDaily);
router.delete("/delete/feed", auth, checkPermission('canManageFeeds'), deleteFeed);

/* --------------------- Admin Report API --------------------- */
router.post("/admin/add/report/questions", auth, checkPermission('canManageAddReport'), addReportQuestion);
router.get("/admin/get/Questions/ByType", auth, checkPermission('canManageReport'), getQuestionsByType);
router.patch("/admin/linkNextQuestion", auth, checkPermission('canManageAddReport'), linkNextQuestion);
router.get("/admin/get/QuestionById", auth, checkPermission('canManageReport'), getQuestionById);
router.get("/admin/getAllQuestions", auth, checkPermission('canManageReport'), getAllQuestions);
router.post("/admin/report-type", auth, checkPermission('canManageAddReport'), createReportType);
router.get("/admin/get/ReportTypes", auth, checkPermission('canManageReport'), adminGetReportTypes);
router.patch("/admin/toggleReportType", auth, checkPermission('canManageAddReport'), toggleReportType);
router.delete("/admin/deleteReportType", auth, checkPermission('canManageAddReport'), deleteReportType);
router.delete("/admin/deleteQuestion", auth, checkPermission('canManageAddReport'), deleteQuestion);
router.put("/admin/report/:reportId/status", auth, checkPermission('canManageReport'), updateReportStatus);
router.get("/admin/report/:reportId/logs", auth, getReportLogs);
router.get('/admin/user/report', auth, checkPermission('canManageReport'), getAllReports);
router.put("/admin/report/action/update/:reportId", auth, adminTakeActionOnReport);



/* --------------------- Admin Notification API ------------------- */
router.post("/admin/send/notification", auth, checkPermission('canManageUsers'), sendAdminNotification);

/* --------------------- Child Admin Profile API --------------------- */
router.get("/admin/childadmin/list", auth, checkPermission('canManageChildAdmins'), getChildAdmins);
router.get("/admin/childadmin/permissions/:childAdminId", auth, checkPermission('canManageChildAdmins'), getChildAdminPermissions);
router.put("/admin/childadmin/permissions/:id", auth, checkPermission('canManageChildAdmins'), updateChildAdminPermissions);
router.get("/admin/childadmin/:id", auth, getChildAdminById);
router.patch("/admin/block/childadmin/:id", auth, checkPermission('canManageChildAdmins'), blockChildAdmin);
router.delete("/admin/delete/childadmin/:id", auth, checkPermission('canManageChildAdmins'), deleteChildAdmin);

// Aliases for Child Admin
router.get("/child/admin/:id", auth, getChildAdminById);
router.delete("/delete/child/admin/:id", auth, checkPermission('canManageChildAdmins'), deleteChildAdmin);
router.patch("/block/child/admin/:id", auth, checkPermission('canManageChildAdmins'), blockChildAdmin);
router.put("/child/admin/profile/update/:id", auth, childAdminAvatarUpload, processChildAdminAvatar, updateChildAdminProfileById);

/* --------------------- Admin Driver API ---------------------- */
router.get("/admin/drive/dashboard", auth, getDriveDashboard);
router.post("/admin/drive/command", auth, driveCommand);

/* --------------------- Admin Server Monitor --------------------- */
router.get("/admin/server/status", auth, getServerStats);
router.get("/admin/server/explore", auth, exploreFolder);
router.post("/admin/server/process/manage", auth, manageProcess);
router.get("/admin/server/logs", auth, getLogs);
router.post("/admin/server/logs/flush", auth, flushLogs);

/* --------------------- Admin Database Management ----------------- */
router.get("/admin/db/stats", auth, getDatabaseStats);
router.post("/admin/db/backup", auth, triggerBackup);

/* --------------------- Admin Redis Management ------------------- */
router.get("/admin/redis/stats", auth, getRedisStats);
router.post("/admin/redis/flush", auth, flushRedis);
router.post("/admin/redis/delete-by-prefix", auth, deleteByPrefix);
router.get("/admin/redis/key-info", auth, getKeyInfo);

/* --------------------- Admin Cron Management -------------------- */
router.get("/admin/cron/status", auth, checkPermission('canViewSystemLogs'), getCronStatus);
router.post("/admin/cron/trigger", auth, checkPermission('canViewSystemLogs'), triggerCron);

/* --------------------- Admin Help FAQ --------------------- */
router.post("/admin/help", auth, checkPermission('canManageFAQs'), createHelpSection);
router.put("/admin/help/:id", auth, checkPermission('canManageFAQs'), updateHelpSection);
router.delete("/admin/help/:id", auth, checkPermission('canManageFAQs'), deleteHelpSection);
router.post("/admin/help/bulk", auth, checkPermission('canManageFAQs'), bulkCreateHelpFAQ);
router.get("/admin/help", auth, checkPermission('canManageFAQs'), getHelpFAQ);

/* --------------------- Admin Feedback --------------------- */
router.get("/admin/feedback", auth, checkPermission('canManageUserFeedbacks'), getAllUserFeedback);
router.put("/admin/feedback/:id", auth, checkPermission('canManageUserFeedbacks'), updateFeedbackStatus);
router.get("/admin/support-queries", auth, checkPermission('canManageUserFeedbacks'), getAllSupportQueries);
router.put("/admin/support-queries/:id", auth, checkPermission('canManageUserFeedbacks'), updateSupportQueryStatus);

/* --------------------- Admin Footer --------------------- */
router.put("/admin/footer", auth, checkPermission('canManageFooter'), updateFooterConfig);


router.get('/admin/get/user/detail', auth, checkPermission('canManageUsers'), getUserProfileDetailforAdmin);

router.post('/admin/static-page/:slug', auth, updatePageBySlug);

/* --------------------- Admin SEO API --------------------- */
router.get('/admin/seo/stats', auth, checkPermission('canViewSEODashboard'), getSeoDashboardStats);
router.get('/admin/seo/config', auth, checkPermission('canManageSEOGlobal'), getSeoConfig);
router.put('/admin/seo/config', auth, checkPermission('canManageSEOGlobal'), updateSeoConfig);
router.get('/admin/seo/pages', auth, checkPermission('canManageSEO'), getAllPagesSeo);
router.get('/admin/seo/feeds', auth, checkPermission('canManageSEOFeeds'), getAllFeedsSeo);
router.put('/admin/seo/feeds/:id', auth, checkPermission('canManageSEOFeeds'), updateFeedSeo);
router.get('/admin/seo/media', auth, checkPermission('canManageSEOMedia'), getMediaSeo);
router.get('/admin/seo/redirects', auth, checkPermission('canManageSEORedirects'), getAllRedirects);
router.post('/admin/seo/redirects', auth, checkPermission('canManageSEORedirects'), createRedirect);
router.delete('/admin/seo/redirects/:id', auth, checkPermission('canManageSEORedirects'), deleteRedirect);
router.post('/admin/seo/sitemap', auth, checkPermission('canManageSEO'), triggerSitemapGeneration);
router.post('/admin/seo/robots', auth, checkPermission('canManageSEO'), updateRobotsTxt);

/* --------------------- Admin Party API --------------------- */
router.get('/admin/parties', auth, checkPermission('canManageParties'), getAllParties);
router.post('/admin/party', auth, checkPermission('canManageParties'), adminUploadFeed.fields([
    { name: 'partyLogo', maxCount: 1 },
    { name: 'leaderPhotos', maxCount: 10 }
]), createParty);
router.put('/admin/party/:id', auth, checkPermission('canManageParties'), adminUploadFeed.fields([
    { name: 'partyLogo', maxCount: 1 },
    { name: 'leaderPhotos', maxCount: 10 }
]), updateParty);
router.delete('/admin/party/:id', auth, checkPermission('canManageParties'), deleteParty);

/* --------------------- Admin Blog Management --------------------- */
router.get('/admin/blogs/all', auth, checkPermission('canManageBlogList'), getAllBlogsAdmin);
router.post('/admin/blogs/create', auth, checkPermission('canManageBlogAdd'), blogUpload, processBlogImage, createBlog);
router.put('/admin/blogs/update/:id', auth, checkPermission('canManageBlogs'), blogUpload, processBlogImage, updateBlog);
router.delete('/admin/blogs/delete/:id', auth, checkPermission('canManageBlogs'), deleteBlog);
router.patch('/admin/blogs/toggle-status/:id', auth, checkPermission('canManageBlogs'), toggleBlogStatus);

/* --------------------- Admin Email Management API --------------------- */
router.get('/admin/email/promo/stats', auth, checkPermission('canManageEmails'), getPromoDashboardStats);
router.get('/admin/email/promo/templates', auth, checkPermission('canManageEmails'), getPromotionTemplates);
router.get('/admin/email/promo/templates/:fileName', auth, checkPermission('canManageEmails'), getTemplateContent);
router.post('/admin/email/promo/templates', auth, checkPermission('canManageEmails'), saveTemplate);
router.delete('/admin/email/promo/templates/:fileName', auth, checkPermission('canManageEmails'), deleteTemplate);
router.post('/admin/email/promo/trigger-batch', auth, checkPermission('canManageEmails'), triggerManualBatch);
router.patch('/admin/email/promo/toggle-status', auth, checkPermission('canManageEmails'), toggleCampaignStatus);

/* --------------------- Admin Update API ------------------- */
router.get('/admin/updates/all', auth, checkPermission('canManageUpdates'), getAllUpdatesAdmin);
router.post('/admin/updates/create', auth, checkPermission('canManageUpdates'), adminUploadFeed.single('media'), createUpdate);
router.put('/admin/updates/update/:id', auth, checkPermission('canManageUpdates'), adminUploadFeed.single('media'), updateUpdate);
router.delete('/admin/updates/delete/:id', auth, checkPermission('canManageUpdates'), deleteUpdate);

// System Metrics
router.get("/admin/system/metrics", auth, checkPermission('canViewSystemLogs'), getSystemMetrics);

/* --------------------- Admin Video Compression API --------------------- */
router.get("/admin/video-compression/stats", auth, checkPermission('canManageFeeds'), getCompressionStats);
router.post("/admin/video-compression/bulk-start", auth, checkPermission('canManageFeeds'), triggerBulkCompression);
router.post("/admin/video-compression/toggle-queue", auth, checkPermission('canManageFeeds'), toggleQueue);
router.post("/admin/video-compression/stop-all", auth, checkPermission('canManageFeeds'), stopAllCompression);
router.post("/admin/video-compression/retry/:feedId", auth, checkPermission('canManageFeeds'), retryCompression);

module.exports = router;
