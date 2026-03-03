/**
 * Centralized Permission List for Admin Panel
 * This is the single source of truth for both Frontend and Backend RBAC.
 */

const ALL_PERMISSIONS = [
    // Dashboard & Sales
    'canManageSalesDashboard',

    // User Management
    'canManageUsers',
    'canManageUsersDetail',

    // Creator Management
    'canManageCreators',
    'canTrendingCreators',

    // Feed Management
    'canManageFeeds',
    'canManageTrendingFeeds',
    'canManageUserFeedRequest',
    'canManageUpload',
    'canManageCategories',
    'canManageParties',

    // Report Management
    'canManageReport',
    'canManageUsersFeedReports',
    'canManageAddReport',

    // Admin Management
    'canManageChildAdmins',
    'canManageChildAdminsCreation',

    // Subscription Management
    'canManageSubscriptions',
    'canManageSettingsSubscriptions',

    // Company & Support Management
    'canManageFAQs',
    'canManageUserFeedbacks',
    'canManageFooter',
    'canViewCompanyInfo',

    // SEO Management
    'canManageSEO',
    'canViewSEODashboard',
    'canManageSEOGlobal',
    'canManageSEOFeeds',
    'canManageSEOMedia',
    'canManageSEORedirects',

    // Blog Management
    'canManageBlogs',
    'canManageBlogList',
    'canManageBlogAdd',

    // System & Server Management
    'canViewSystemLogs'
];

module.exports = {
    ALL_PERMISSIONS
};
