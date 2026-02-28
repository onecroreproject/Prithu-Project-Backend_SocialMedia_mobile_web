const express = require('express');
const router = express.Router();
const { auth } = require('../middlewares/jwtAuthentication');
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

const {
    getChildAdmins,
    getChildAdminPermissions,
    updateChildAdminPermissions,
    getChildAdminById,
    blockChildAdmin,
    deleteChildAdmin,
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
    adminProfileDetailUpdate,
    getAdminProfileDetail,
    getUserProfileDetail,
} = require('../controllers/profileControllers/profileController');

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

const { getAllCategories } = require('../controllers/categoriesController');
const { deleteFeed } = require('../controllers/feedControllers/feedsController');

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
    adminFeedUpload
);
router.get("/admin/get/all/feed", getAllFeedAdmin);
router.get("/admin/feed/:feedId/design", auth, getFeedWithDesign);
router.put("/admin/feed/:feedId/design", auth, updateFeedDesign);
router.get("/admin/get/trending/creator", adminGetTrendingFeeds); // Match key ADMIN_GET_TRENDING_CREATOR
router.delete("/admin/delete/feed", deleteFeed);
router.delete("/admin/feed/:feedId/category/:categoryId", removeFeedCategory);
router.get("/get/trending/feed", adminGetTrendingFeeds);
/* --------------------- Admin Category API --------------------- */
router.post('/admin/add/feed/category', adminAddCategory);
router.delete('/admin/feed/category/:id', deleteCategory);
router.delete('/admin/delete/category/:id', deleteCategory);
router.delete('/delete/category/:id', deleteCategory);
router.delete('/delete/category', deleteCategory); // For body-based ID
router.get('/admin/get/feed/category', getAllCategories);
router.put('/admin/update/category', updateCategory);

/* --------------------- Admin Subscription API --------------------- */
router.post('/admin/subscription/create', createPlan);
router.put('/admin/subscription/update/:id', updatePlan);
router.delete('/admin/subscription/delete/:id', deletePlan);
router.get('/admin/subscription/all', getAllPlans);
router.get('/admin/getall/subscriptions', getAllPlans); // Alias

/* --------------------- Admin User API --------------------- */
router.get('/admin/getall/users', getAllUserDetails);
router.get("/admin/search/user", searchAllUserDetails);
router.get('/admin/get/user/social/media/profile/detail/:id', getUserSocialMeddiaDetailWithIdForAdmin);
router.get("/admin/users/status", getUsersStatus);
router.get("/admin/user/detail/by-date", getUsersByDate);
router.get('/admin/user/analytical-count/:userId', getAnaliticalCountforUser);
router.get('/admin/get/user/analytical/data/:userId', getUserAnalyticalData);

router.patch("/admin/block/user/:userId", auth, (req, res, next) => {
    next();
}, require('../controllers/userControllers/userDetailController').blockUserById);
router.get('/admin/user/profile/metricks', getUserProfileDashboardMetricCount);
router.get('/admin/user/likes/:userId', getUserLikedFeedsforAdmin);
router.delete('/admin/delete/user/:userId', deleteUserAndAllRelated);
router.get("/user/list/willingtopost", getUsersWillingToPost);
router.put("/update/user/post/status/:userId", updateUserPostPermission);
router.get("/admin/user/activities/:userId", getUserActivitiesForAdmin);

/* --------------------- User Analytics API --------------------- */
router.get("/admin/summary/:userId", getUserAnalyticsSummary);
router.get("/admin/feeds/:userId", fetchUserFeeds);
router.get("/admin/following/:userId", fetchUserFollowing);
router.get("/admin/interested/:userId", fetchUserInterested);
router.get("/admin/hidden/:userId", fetchUserHidden);
router.get("/admin/liked/:userId", fetchUserLiked);
router.get("/admin/disliked/:userId", fetchUserDisliked);
router.get("/admin/commented/:userId", fetchUserCommented);
router.get("/admin/shared/:userId", fetchUserShared);
router.get("/admin/downloaded/:userId", fetchUserDownloaded);
router.get("/admin/nonInterested/:userId", fetchUserNonInterested);

// Aliases for New Admin Panel (short paths)
router.get("/summary/:userId", getUserAnalyticsSummary);
router.get("/feeds/:userId", fetchUserFeeds);
router.get("/following/:userId", fetchUserFollowing);
router.get("/interested/:userId", fetchUserInterested);
router.get("/hidden/:userId", fetchUserHidden);
router.get("/liked/:userId", fetchUserLiked);
router.get("/disliked/:userId", fetchUserDisliked);
router.get("/commented/:userId", fetchUserCommented);
router.get("/shared/:userId", fetchUserShared);
router.get("/downloaded/:userId", fetchUserDownloaded);
router.get("/nonInterested/:userId", fetchUserNonInterested);

/* --------------------- Admin DashBoard API --------------------- */
router.get("/admin/dashboard/metricks/counts", getDashboardMetricCount);
router.get("/admin/users/monthly-registrations", getDashUserRegistrationRatio);
router.get("/admin/user/subscriptionration", getDashUserSubscriptionRatio);
router.get('/admin/posts/daily', getPostVolumeDaily);
router.get('/admin/posts/weekly', getPostVolumeWeekly);
router.get('/admin/posts/monthly', getPostVolumeMonthly);

/* --------------------- Admin Creator API --------------------- */
router.get('/admin/getall/creators', require('../controllers/creatorControllers/creatorDetailController').getAllCreatorDetails);

/* --------------------- Admin Sales Dashboard ------------------ */
router.get("/admin/sales/dashboard/analytics", getAnalytics);
router.get("/get/recent/subscribers", getRecentSubscriptionUsers);
router.get("/get/recent/withdrawals", getRecentWithdrawalUsers);
router.get("/sales/dashboard/analytics", getAnalytics);
router.get("/admin/top/referral/users", getTopReferralUsers);
router.get("/admin/dashboard/user-subscription-counts", getUserAndSubscriptionCountsDaily);

// Aliases for Sales Dashboard
router.get("/sales/dashboard/analytics", getAnalytics);
router.get("/top/referral/users", getTopReferralUsers);
router.get("/get/recent/subscribers", getRecentSubscriptionUsers);
router.get("/dashboard/user-subscription-counts", getUserAndSubscriptionCountsDaily);
router.delete("/delete/feed", deleteFeed);

/* --------------------- Admin Report API --------------------- */
router.post("/admin/add/report/questions", addReportQuestion);
router.get("/admin/get/Questions/ByType", getQuestionsByType);
router.patch("/admin/linkNextQuestion", linkNextQuestion);
router.get("/admin/get/QuestionById", getQuestionById);
router.get("/admin/getAllQuestions", getAllQuestions);
router.post("/admin/report-type", createReportType);
router.get("/admin/get/ReportTypes", adminGetReportTypes);
router.patch("/admin/toggleReportType", toggleReportType);
router.delete("/admin/deleteReportType", deleteReportType);
router.delete("/admin/deleteQuestion", deleteQuestion);
router.put("/admin/report/:reportId/status", updateReportStatus);
router.get("/admin/report/:reportId/logs", auth, getReportLogs);
router.get('/admin/user/report', getAllReports);
router.put("/admin/report/action/update/:reportId", auth, adminTakeActionOnReport);



/* --------------------- Admin Notification API ------------------- */
router.post("/admin/send/notification", sendAdminNotification);

/* --------------------- Child Admin Profile API --------------------- */
router.get("/admin/childadmin/list", auth, getChildAdmins);
router.get("/admin/childadmin/permissions/:childAdminId", getChildAdminPermissions);
router.put("/admin/childadmin/permissions/:id", updateChildAdminPermissions);
router.get("/admin/childadmin/:id", getChildAdminById);
router.patch("/admin/block/childadmin/:id", blockChildAdmin);
router.delete("/admin/delete/childadmin/:id", deleteChildAdmin);

// Aliases for Child Admin
router.get("/child/admin/:id", getChildAdminById);
router.delete("/delete/child/admin/:id", deleteChildAdmin);
router.patch("/block/child/admin/:id", blockChildAdmin);

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
router.get("/admin/cron/status", auth, getCronStatus);
router.post("/admin/cron/trigger", auth, triggerCron);

/* --------------------- Admin Help FAQ --------------------- */
router.post("/admin/help", createHelpSection);
router.put("/admin/help/:id", updateHelpSection);
router.delete("/admin/help/:id", deleteHelpSection);
router.post("/admin/help/bulk", bulkCreateHelpFAQ);
router.get("/admin/help", getHelpFAQ);

/* --------------------- Admin Feedback --------------------- */
router.get("/admin/feedback", getAllUserFeedback);
router.put("/admin/feedback/:id", updateFeedbackStatus);
router.get("/admin/support-queries", auth, getAllSupportQueries);
router.put("/admin/support-queries/:id", auth, updateSupportQueryStatus);

/* --------------------- Admin Footer --------------------- */
router.put("/admin/footer", auth, updateFooterConfig);


router.get('/admin/get/user/detail', getUserProfileDetailforAdmin);

router.post('/admin/static-page/:slug', auth, updatePageBySlug);

/* --------------------- Admin SEO API --------------------- */
router.get('/admin/seo/stats', auth, getSeoDashboardStats);
router.get('/admin/seo/config', auth, getSeoConfig);
router.put('/admin/seo/config', auth, updateSeoConfig);
router.get('/admin/seo/pages', auth, getAllPagesSeo);
router.get('/admin/seo/feeds', auth, getAllFeedsSeo);
router.put('/admin/seo/feeds/:id', auth, updateFeedSeo);
router.get('/admin/seo/media', auth, getMediaSeo);
router.get('/admin/seo/redirects', auth, getAllRedirects);
router.post('/admin/seo/redirects', auth, createRedirect);
router.delete('/admin/seo/redirects/:id', auth, deleteRedirect);
router.post('/admin/seo/sitemap', auth, triggerSitemapGeneration);
router.post('/admin/seo/robots', auth, updateRobotsTxt);

/* --------------------- Admin Party API --------------------- */
router.get('/admin/parties', auth, getAllParties);
router.post('/admin/party', auth, adminUploadFeed.fields([
    { name: 'partyLogo', maxCount: 1 },
    { name: 'leaderPhotos', maxCount: 10 }
]), createParty);
router.put('/admin/party/:id', auth, adminUploadFeed.fields([
    { name: 'partyLogo', maxCount: 1 },
    { name: 'leaderPhotos', maxCount: 10 }
]), updateParty);
router.delete('/admin/party/:id', auth, deleteParty);

/* --------------------- Admin Blog Management --------------------- */
router.get('/admin/blogs/all', auth, getAllBlogsAdmin);
router.post('/admin/blogs/create', auth, createBlog);
router.put('/admin/blogs/update/:id', auth, updateBlog);
router.delete('/admin/blogs/delete/:id', auth, deleteBlog);
router.patch('/admin/blogs/toggle-status/:id', auth, toggleBlogStatus);

module.exports = router;
