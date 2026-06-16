const path = require('path');

/**
 * Footer Style Configuration
 * 
 * You can manually edit these values to change the look of the footer 
 * in the downloaded videos.
 */
module.exports = {
    // Path to the font file (relative to this file or absolute)
    fontFile: path.join(__dirname, '../assets/OutfitVariableFont.ttf'),

    // Footer Dimensions (if null, defaults to heightPercent calculated from media)
    footerHeight: null, // Set to px value if you want to override heightPercent

    // Padding and Spacing (in px)
    paddingLeft: 20,
    paddingRight: 20,
    paddingTop: 25,   // Spacing from media-footer boundary
    paddingBottom: 0,
    socialIconSpacing: 72,

    // Elemental Gaps (in px)
    usernameSocialGap: 40,   // Minimum horizontal gap between name and icons
    emailPhoneGap: 40,       // Minimum horizontal gap between email and phone
    verticalRowSpacing: 50,  // Vertical gap between Row 1 and Row 2

    // Font sizes for different elements (in px)
    nameSize: 32,
    emailSize: 26,
    phoneSize: 26,
    iconSize: 36,

    // Vertical row positions (as fraction of footer height, 0.0 to 1.0)
    row1Offset: 0.35,
    row2Offset: 0.70,

    // Shadow settings
    shadowColor: 'black@0.6',
    shadowX: 2,
    shadowY: 2
};
