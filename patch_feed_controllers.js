const fs = require('fs');
const path = require('path');

const filesToProcess = [
    'controllers/feedControllers/feedsController.js',
    'controllers/feedControllers/publicFeedController.js',
    'controllers/feedControllers/userActionsFeedController.js',
    'controllers/feedControllers/creatorFeedController.js'
];

const basePath = 'c:\\Agathiyan\\Prithu-Full-Project\\Prithu-Project-Backend_SocialMedia_mobile_web-main';

filesToProcess.forEach(file => {
    const fullPath = path.join(basePath, file);
    if (fs.existsSync(fullPath)) {
        let content = fs.readFileSync(fullPath, 'utf8');
        
        let initialLength = content.length;
        
        // 1. Add socialLinks: 1 to the ProfileSettings project stage
        // Matches: { $project: { name: 1, userName: 1, profileAvatar: 1, modifyAvatar: 1, visibility: 1 } }
        // We will make the regex flexible
        content = content.replace(/(\$project:\s*\{\s*name:\s*1,\s*userName:\s*1,\s*profileAvatar:\s*1,\s*modifyAvatar:\s*1,\s*visibility:\s*1)(\s*\})/g, "$1, socialLinks: 1$2");
        
        // Sometimes it might not have visibility: 1
        content = content.replace(/(\$project:\s*\{\s*name:\s*1,\s*userName:\s*1,\s*profileAvatar:\s*1,\s*modifyAvatar:\s*1)(\s*\})/g, "$1, visibility: 1, socialLinks: 1$2");

        // 2. Add socialLinks and visibility to creatorData object
        // Matches: role: "$roleRef"
        // We need to add socialLinks and visibility after role
        // Be careful not to replace it multiple times if run twice.
        content = content.replace(/(role:\s*"\$roleRef")(?!,\s*socialLinks)/g, '$1,\n                socialLinks: "$creatorProfile.socialLinks",\n                visibility: "$fieldVisibility"');
        
        if (content.length !== initialLength) {
            fs.writeFileSync(fullPath, content, 'utf8');
            console.log(`Updated ${file}`);
        } else {
            console.log(`No changes made to ${file}`);
        }
    } else {
        console.log(`File not found: ${file}`);
    }
});
