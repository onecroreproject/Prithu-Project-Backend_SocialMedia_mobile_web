const express = require('express');
const router = express.Router();
const { auth } = require('../middlewares/jwtAuthentication');
const {
    upload: feedUpload,
    processUploadedFiles: attachFeedFile
} = require("../middlewares/uploadMiddleware");
const { userUpload, attachUserFile } = require("../middlewares/services/userprofileUploadSpydy");

// Controllers
const {
    createNewUser,
    userLogin,
    userSendOtp,
    userPasswordReset,
    existUserVerifyOtp,
    newUserVerifyOtp,
    userLogOut,
    validateReferralCode,
} = require('../controllers/authenticationControllers/userAuthController');

const {
    creatorFeedUpload,
    creatorFeedDelete,
    creatorFeedScheduleUpload,
} = require('../controllers/feedControllers/creatorFeedController');

const {
    getAllFeedsByUserId,
    getFeedsByAccountId,
    getUserInfoAssociatedFeed,
    getUserHidePost,
    getTrendingFeeds,
    getSingleFeedById,
    getFeedsByCreator,
    deleteFeed,
    getFeedsByHashtag,
    singleFeedById,
    getBirthdayFeeds,
} = require('../controllers/feedControllers/feedsController');

const {
    getAllPublicFeeds
} = require('../controllers/feedControllers/publicFeedController');

const {
    getUserDetailWithId,
    setAppLanguage,
    getAppLanguage,
    getFeedLanguage,
    setFeedLanguage,
    checkUsernameAvailability,
    getUserReferalCode,
    checkEmailAvailability,
} = require('../controllers/userControllers/userDetailController');

const {
    userSelectCategory,
    userNotInterestedCategory,
    userInterestedCategory,
    getNonInterestedCategories,
    removeNonInterestedCategory,
} = require('../controllers/userControllers/userCategoryController');

const {
    getfeedWithCategoryWithId,
    getUserContentCategories,
    searchCategories,
    getCategoriesWithFeeds,
    getFeedLanguageCategories,
    getUserPostCategories,
    getFeedWithCategoryId,
    saveInterestedCategory
} = require('../controllers/categoriesController');

const {
    userProfileDetailUpdate,
    getUserProfileDetail,
    toggleFieldVisibility,
    getVisibilitySettings,
    updateCoverPhoto,
    deleteCoverPhoto,
    getProfileOverview,
    getVisibilitySettingsWeb,
    updateFieldVisibilityWeb,
    getProfileCompletion,
    getProfileByUsername,
    getUserVisibilityByUserId,
    getUserVisibilitySettings,
    updateUserVisibilitySettings,
} = require('../controllers/profileControllers/profileController');

const {
    likeFeed,
    toggleSaveFeed,
    requestDownloadFeed,
    postComment,
    postReplyComment,
    getUserSavedFeeds,
    getUserDownloadedFeeds,
    shareFeed,
    likeMainComment,
    likeReplyComment,
    getUserLikedFeeds,
    userHideFeed,
    getUserCategory,
    toggleDislikeFeed,
    generateShareLink,
    getVideoThumbnail,
    getDownloadJobStatus,
    checkDownloadLimit,
    directDownloadFeed,
    getUserLikedFeedsForSaved,
    birthdayDownloadFeed,
} = require('../controllers/feedControllers/userActionsFeedController');

const {
    subscribePlan,
    cancelSubscription,
    getAllSubscriptionPlans,
    getUserSubscriptionPlanWithId,
    userTrialPlanActive,
    checkUserActiveSubscription,
    checkTrialEligibility,
    createSubscriptionOrder,
    verifySubscriptionPayment,
    recordPaymentFailure,
    getUserInvoices,
} = require('../controllers/userControllers/userSubscriptionController');



const {
    getCreatorDetailWithId,
    getAllCreatorDetails,
    getAllTrendingCreators,
} = require('../controllers/creatorControllers/creatorDetailController');

const {
    followAccount,
    unFollowAccount,
    getAccountFollowers,
    getUserFollowersData,
    removeFollower,
    checkFollowStatus
} = require('../controllers/followersControllers.js/followerDetailController');

const {
    creatorSelectCategory,
    creatorUnSelectCategory,
} = require('../controllers/creatorControllers/creatorCategoryController');
const { getPageBySlug } = require('../controllers/staticPageController');
const { getAllBlogs, getBlogBySlug } = require('../controllers/blogController');

const {
    getCommentsByFeed,
    getRepliesForComment,
    getNestedReplies,
    deleteComment,
    deleteReply
} = require('../controllers/conmmentController');

const {
    userVideoViewCount,
    userImageViewCount,
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
    getUserdetailWithinTheFeed,
} = require('../controllers/userControllers/userFeedController');

const {
    getStartQuestion,
    getNextQuestion,
    getReportTypes,
    createFeedReport,
} = require('../controllers/adminControllers/userReportController');

const {
    getNotifications,
    markNotificationAsRead,
    saveToken,
    markAllRead,
    clearAllNotifications,
    deleteNotification,
} = require('../controllers/adminControllers/notificationController');

const {
    refreshAccessToken,
    heartbeat,
    userPresence,
} = require('../controllers/sessionController');

const {
    getUserEarnings,
    getUserBalance
} = require("../controllers/userControllers/userEarningsController");

const {
    logReferralActivity,
    getReferredPeople,
    getRecentActivities
} = require("../controllers/userControllers/userReferralActivityController");

const {
    getReferralCycles,
    getCycleDetails
} = require("../controllers/userControllers/userReferralCycleController");

const {
    getWithdrawalHistory,
    getBankDetails,
    saveBankDetails,
    requestWithdrawal,
    updateWithdrawalRequest
} = require("../controllers/userControllers/userWithdrawalController");

const { saveUserLocation,
    getUserLocation,
    getUpcomingEvents,
} = require("../controllers/userControllers/userLoactionController");

const {
} = require("../WebController/UserController/userFeedControllerWeb");

const {
    getUserFollowing,
    getUserFollowers,
} = require("../WebController/UserController/userFolloweController");

const {
    getMyActivities,
} = require("../controllers/userControllers/userActivitController");

const {
    globalSearch
} = require("../controllers/searchController");

const {
    deactivateUser,
    deleteUserNow
} = require("../controllers/userControllers/userDeleteController");

const {
    getTrendingHashtags,
} = require("../controllers/hashTagController");

const {
    getHiddenPosts,
    removeHiddenPost,
} = require("../controllers/userControllers/hiddenPostController");

router.get("/get/hidden-posts", auth, getHiddenPosts); // Frontend alias
router.post("/remove/hidden-post", auth, removeHiddenPost); // Frontend alias


const { getPostInterestStatus,
    requestPostInterest
} = require('../controllers/postIntrestedController');
const { getHelpFAQ } = require('../controllers/adminControllers/adminHelpController');
const { submitUserFeedback, getMyFeedbackAndReports, submitSupportQuery, getMySupportQueries } = require('../controllers/feedBackController');
const { getFooterConfig } = require('../controllers/footerController');
const { getUpcomingBirthdays } = require('../controllers/adminControllers/adminUserControllers');

/* --------------------- User Authentication --------------------- */
router.post('/auth/user/register', createNewUser);
router.post('/register', createNewUser); // Alias

router.post('/auth/user/login', userLogin);
router.post('/login', userLogin); // Alias

router.post('/auth/user/otp-send', userSendOtp);
router.post('/sent-otp', userSendOtp); // Alias

router.post('/auth/exist/user/verify-otp', existUserVerifyOtp);
router.post('/auth/new/user/verify-otp', newUserVerifyOtp);

router.post('/auth/user/password-reset', userPasswordReset);
router.post('/auth/user/reset-password', userPasswordReset); // Alias

router.post('/auth/user/logout', auth, userLogOut);
router.get('/auth/user/referral/validate/:code', validateReferralCode);

/* --------------------- Session & Tokens --------------------- */
router.post("/refresh-token", refreshAccessToken);
router.post("/auth/refresh-token", refreshAccessToken); // Alias
router.get("/api/admin/verify-token", auth, refreshAccessToken); // Alias for token verification


/* --------------------- User Referral & Earnings --------------------- */
router.get('/user/referal/code', auth, getUserReferalCode);
router.get('/user/earnings/total', auth, getUserEarnings);
router.get('/user/referred/people', auth, getReferredPeople);
router.post('/user/referral/activity/log', auth, logReferralActivity);
router.get('/user/balance/amount', auth, getUserBalance);
router.get('/user/withdrawal/details', auth, getWithdrawalHistory);
router.get('/user/referral/recent-activities', auth, getRecentActivities);
router.get('/user/bank/details', auth, getBankDetails);
router.post('/user/bank/save', auth, saveBankDetails);
router.post('/user/withdrawal/request', auth, requestWithdrawal);
router.patch('/user/withdrawal/update/:requestId', auth, updateWithdrawalRequest);
router.get('/user/referral/cycles', auth, getReferralCycles);
router.get('/user/referral/cycle/:cycleId/details', auth, getCycleDetails);

/* --------------------- User Profile --------------------- */
router.get('/user/profile/detail', auth, getUserProfileDetail);
router.get('/get/profile/detail', auth, getUserProfileDetail); // Alias
router.get('/user/single/profile/detail', getUserProfileDetail);
router.get('/get/single/profile/detail', getUserProfileDetail); // Alias

router.post('/user/profile/detail/update', auth, userUpload.single("file"), (req, res, next) => { req.baseUrl = "/profile"; next(); }, attachUserFile, userProfileDetailUpdate);
router.post('/user/profile/cover/update', auth, userUpload.single("coverPhoto"), (req, res, next) => { req.baseUrl = "/cover"; next(); }, attachUserFile, updateCoverPhoto);
router.delete('/user/profile/cover/delete', auth, deleteCoverPhoto);
router.get("/get/profile/overview", auth, getProfileOverview);
router.post("/single/get/profile/overview", getProfileOverview);
router.get("/get/profile/completion", auth, getProfileCompletion);
router.put("/put/profile/visibility", auth, toggleFieldVisibility);
router.get("/get/profile/visibility-settings", auth, getVisibilitySettings);

router.get("/user/get/visibility/settings", auth, getUserVisibilitySettings);
router.post("/user/update/visibility/settings", auth, updateUserVisibilitySettings);

/* --------------------- User Feed Actions --------------------- */
router.post('/user/feed/like', auth, likeFeed);
router.post("/user/feed/dislike", auth, toggleDislikeFeed);
router.post('/user/feed/save', auth, toggleSaveFeed);
router.post('/user/feed/share', auth, shareFeed);
router.post('/user/feed/hide', auth, userHideFeed);
router.post('/user/hide/feed', auth, userHideFeed); // Alias for frontend compatibility
router.post('/user/feed/download', auth, requestDownloadFeed);
router.get('/user/feed/liked', auth, getUserLikedFeeds);
router.get('/user/feed/saved', auth, getUserSavedFeeds);
router.get('/user/feed/downloaded', auth, getUserDownloadedFeeds);
router.get('/user/get/saved/feeds', auth, getUserLikedFeedsForSaved); // Alias for frontend compatibility (using liked feeds as requested)
router.get('/user/feed/share-link/:feedId', generateShareLink);
router.get('/user/feed/thumbnail/:feedId', getVideoThumbnail);
router.get('/user/feed/download-status/:jobId', auth, getDownloadJobStatus);
router.get('/user/feed/check-limit', auth, checkDownloadLimit);
router.post('/user/feed/:feedId/birthday-download', birthdayDownloadFeed); // 🎂 Birthday poster download
router.post('/user/feed/:feedId/direct-download', directDownloadFeed);

/* --------------------- Categories --------------------- */
router.get('/categories/all', auth, getUserContentCategories);
router.post('/categories/select', auth, userSelectCategory);
router.post('/categories/not-interested', auth, userNotInterestedCategory);
router.post('/categories/interested', auth, userInterestedCategory);
router.post("/categories/begin", auth, saveInterestedCategory);
router.get("/categories/not-interested/list", auth, getUserCategory);
router.get("/get/non-interested-categories", auth, getNonInterestedCategories); // Frontend alias
router.post("/remove/non-interested-category", auth, removeNonInterestedCategory); // Frontend alias

/* --------------------- Follow & Connections --------------------- */
router.post('/user/follow/creator', auth, followAccount);
router.post('/user/unfollow/creator', auth, unFollowAccount);
router.post('/user/follow', auth, followAccount); // Alignment with some frontend calls
router.post('/user/unfollow', auth, unFollowAccount); // Alignment with some frontend calls
router.get('/user/following/data', auth, getUserFollowersData);
router.post("/user/remove-follower", auth, removeFollower);
router.post("/user/check-follow-status", auth, checkFollowStatus);

/* --------------------- Comments --------------------- */
router.post('/comment', auth, postComment);
router.post('/reply', auth, postReplyComment);
router.post('/comment/like', auth, likeMainComment);
router.post('/reply/like', auth, likeReplyComment);
router.delete("/comment/:commentId", auth, deleteComment);
router.delete("/reply/:replyId", auth, deleteReply);
router.post('/comments/list', auth, getCommentsByFeed);
router.post('/replies/list', auth, getRepliesForComment);
router.post('/replies/nested', auth, getNestedReplies);

/* --------------------- Feed Fetching --------------------- */
router.get("/get/trending-v2/feeds", auth, (req, res, next) => { console.log("REQ: Trending v2 hit"); next(); }, getTrendingFeeds);
router.get("/get/trending/feeds", auth, (req, res, next) => { console.log("REQ: Trending hit"); next(); }, getTrendingFeeds);
router.get('/get/all/feeds/user', auth, getAllFeedsByUserId);
router.get('/get/all/public/feeds', getAllPublicFeeds);
router.get('/get/feed/with/category/:id', auth, getfeedWithCategoryWithId);
router.get('/get/user/info/associated/feed/:feedId', auth, getUserInfoAssociatedFeed);
router.get("/get/feed/category", getCategoriesWithFeeds);
router.get('/get/feed/:feedId', auth, getSingleFeedById);
router.get('/get/feeds/by/creator/:feedId', auth, getFeedsByCreator);
router.get('/get/feeds/by/hashtag/:tag', auth, getFeedsByHashtag);
router.get('/get/feeds/birthday', auth, getBirthdayFeeds); // 🎂 Birthday category feeds
router.post('/user/watching/vidoes', auth, userVideoViewCount);
router.post('/feed/view/video/:id', auth, userVideoViewCount); // Alias
router.post('/user/image/view/count', auth, userImageViewCount);
router.post('/feed/view/image/:id', auth, userImageViewCount); // Alias
router.post('/user/not-interested', auth, userNotInterestedCategory); // Alias
router.post('/user/block', auth, (req, res) => res.status(501).json({ message: "Block feature not implemented" })); // Placeholder for plan completeness

/* --------------------- Creator Specific --------------------- */
router.post("/creator/feed/upload", auth, feedUpload.single("file"), attachFeedFile, creatorFeedUpload);
router.post("/creator/feed/schedule", auth, feedUpload.single("file"), attachFeedFile, creatorFeedScheduleUpload);
router.get('/creator/feeds/all', auth, getFeedsByAccountId);

/* --------------------- Subscription --------------------- */
router.get('/subscription/plans', getAllSubscriptionPlans);
router.get('/subscription/active', auth, getUserSubscriptionPlanWithId);
router.post('/subscription/subscribe', auth, subscribePlan);
router.put('/subscription/cancel', auth, cancelSubscription);
router.post('/subscription/activate-trial', auth, userTrialPlanActive);
router.get('/subscription/check-active', auth, checkUserActiveSubscription);
router.get('/subscription/trial-eligible', auth, checkTrialEligibility);
router.post('/subscription/create-order', auth, createSubscriptionOrder);
router.post('/user/subscription/create-order', auth, createSubscriptionOrder); // Alias for frontend consistency
router.post('/subscription/verify-payment', auth, verifySubscriptionPayment);
router.post('/subscription/payment-failure', auth, recordPaymentFailure);
router.get('/subscription/invoices', auth, getUserInvoices);


/* --------------------- Notifications --------------------- */
router.get("/notifications/all", auth, getNotifications);
router.put("/notifications/mark-all-read", auth, markAllRead);
router.put("/notifications/read", auth, markNotificationAsRead);
router.delete("/notifications/delete", auth, deleteNotification);
router.delete("/notifications/clear-all", auth, clearAllNotifications);
router.post("/notifications/save-token", auth, saveToken);

/* --------------------- Miscellaneous --------------------- */
router.get("/global/search", globalSearch);
router.get("/hashtags/trending", getTrendingHashtags);
router.post("/availability/username", checkUsernameAvailability);
router.get("/check/username/availability", checkUsernameAvailability);
router.post("/availability/email", checkEmailAvailability);
router.get("/check/email/availability", checkEmailAvailability);
router.post("/session/heartbeat", auth, heartbeat);
router.post("/session/presence", auth, userPresence);
router.get("/user/get/birthday", getUpcomingBirthdays);
router.get("/get/user/birthday", getUpcomingBirthdays); // Alias
router.get("/get/trending/feed", auth, getTrendingFeeds);
router.get("/user/invite/friends", auth, (req, res) => res.status(200).json({ message: "Invite feature" })); // Placeholder
router.post("/feedback/submit", auth, submitUserFeedback);
router.get("/feedback/my", auth, getMyFeedbackAndReports);
router.post("/support", auth, submitSupportQuery);
router.get("/support/my", auth, getMySupportQueries);
router.get("/help/faq", getHelpFAQ);
router.post('/search/all/category', searchCategories)
router.post("/save/user/location", auth, saveUserLocation);
router.get('/user/referral/recent-activities', auth, getRecentActivities);
/*--------------UserPostController--------------------------*/
router.get("/post/allowed/status", auth, getPostInterestStatus);
router.post("/post/intrested", auth, requestPostInterest);

/* --------------------- Public Stats --------------------- */
const { getMainBoardStats } = require('../controllers/mainHomeController');
router.get("/main/board/status", getMainBoardStats);

/* --------------------- Footer --------------------- */
router.get("/footer", getFooterConfig);



router.get('/static-page/:slug', getPageBySlug);
router.get('/blogs/all', getAllBlogs);
router.get('/blogs/:slug', getBlogBySlug);

module.exports = router;
