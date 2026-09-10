/**
 * Privacy Decision Engine (Crafto Style)
 * Decides what user data should be visible based on privacy settings.
 */

const canShow = (rule) => rule === "public";

exports.getVisibleUserData = (userProfile, userAccount, visibility) => {
    if (!userProfile || !visibility) {
        return {
            userName: "User",
            profileAvatar: "https://via.placeholder.com/150",
            phone: null,
            socialLinks: [],
            visibility: {}
        };
    }

    const result = {
        userName: canShow(visibility.userName) ? (userProfile.userName || userProfile.name) : "User",
        profileAvatar: canShow(visibility.profileAvatar) ? (userProfile.modifyAvatar || userProfile.profileAvatar) : "https://via.placeholder.com/150",
        phone: canShow(visibility.phoneNumber) ? userProfile.phoneNumber : null,
        email: canShow(visibility.email) ? userAccount?.email : null,
        socialLinks: [],
        visibility: {
            userName: visibility.userName,
            phoneNumber: visibility.phoneNumber,
            socialLinks: visibility.socialLinks
        }
    };

    // Process Social Links
    if (canShow(visibility.socialLinks) && userProfile.socialLinks) {
        result.socialLinks = Object.entries(userProfile.socialLinks)
            .map(([platform, url]) => ({
                platform,
                url: typeof url === "string" ? url.trim() : "",
                visible: true
            }))
            .filter((icon) => icon.url);
    }

    return result;
};

/**
 * Checks if a specific section (like footer) should be rendered based on visibility rules
 */
exports.shouldRenderFooter = (visibility) => {
    if (!visibility) return false;

    const anyVisible = canShow(visibility.userName) ||
        canShow(visibility.phoneNumber) ||
        canShow(visibility.socialLinks) ||
        canShow(visibility.email);

    return anyVisible;
};
