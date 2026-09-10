const mongoose = require('mongoose');
require('dotenv').config({ path: '../.env' }); // Adjust path if needed

// Import models (use absolute paths or assume script is run in be folder)
const { prithuDB } = require('../database');
const Feed = require('../models/feedModel');
const UserFeedActions = require('../models/userFeedInterSectionModel');
const UserComment = require('../models/userCommentModel');
const UserView = require('../models/userModels/userViewFeedsModel');

async function migrate() {
    console.log('🚀 Starting Counter Migration...');

    try {
        const feeds = await Feed.find({ isDeleted: false });
        console.log(`🔍 Found ${feeds.length} feeds to process.`);

        for (const feed of feeds) {
            const feedId = feed._id;

            // 1. Count Likes
            const likesCount = await UserFeedActions.countDocuments({
                "likedFeeds.feedId": feedId
            });

            // 2. Count Shares
            const shareCount = await UserFeedActions.countDocuments({
                "sharedFeeds.feedId": feedId
            });

            // 3. Count Downloads
            const downloadCount = await UserFeedActions.countDocuments({
                "downloadedFeeds.feedId": feedId
            });

            // 4. Count Comments
            const commentCount = await UserComment.countDocuments({
                feedId
            });

            // 5. Count Views
            const viewsCount = await UserView.countDocuments({
                feedId
            });

            // Update Feed Document
            await Feed.updateOne(
                { _id: feedId },
                {
                    $set: {
                        likesCount,
                        shareCount,
                        downloadCount,
                        commentCount,
                        viewsCount
                    }
                }
            );

            console.log(`✅ Processed Feed ${feedId}: L:${likesCount} S:${shareCount} D:${downloadCount} C:${commentCount} V:${viewsCount}`);
        }

        console.log('🎉 Migration completed successfully!');
    } catch (err) {
        console.error('❌ Migration failed:', err);
    } finally {
        mongoose.disconnect();
    }
}

migrate();
