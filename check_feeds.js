const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '.env') });

const User = require('./models/userModels/userModel');
const Feed = require('./models/feedModel');
const HiddenPost = require('./models/userModels/hiddenPostSchema');
const UserCategory = require('./models/userModels/userCategotyModel');
const ProfileSettings = require('./models/profileSettingModel');
const ProfileVisibility = require('./models/profileVisibilitySchema');

async function testFetchFeeds() {
    try {
        const dbUri = process.env.PRITHU_DB_URI;
        if (!dbUri) {
            console.log("PRITHU_DB_URI not found in environment.");
            return;
        }
        console.log("Connecting to:", dbUri.replace(/:([^@]+)@/, ":****@"));
        await mongoose.connect(dbUri);
        console.log("Connected to DB");

        const user = await User.findOne({ email: 'suriya@gmail.com' });
        if (!user) {
            console.log("User not found: suriya@gmail.com");
            return;
        }
        console.log("User found. ID:", user._id);

        const userId = user._id;

        // Reproduced simplified logic from getAllFeedsByUserId
        const hiddenPosts = await HiddenPost.find({ userId }).select("postId -_id").lean();
        const hiddenPostIds = hiddenPosts.map(h => h.postId);

        const userCategories = await UserCategory.findOne({ userId }).select("nonInterestedCategories").lean();
        const notInterestedCategoryIds = userCategories?.nonInterestedCategories || [];

        const excludeIds = [...hiddenPostIds];

        const EXCLUDED_CATEGORY_IDS = [
            new mongoose.Types.ObjectId("699ee0e420120ebc1d3e7725"),
            new mongoose.Types.ObjectId("699ee86c20120ebc1d3e929b"),
            new mongoose.Types.ObjectId("6990071590a65cd9632b2327")
        ];

        console.log("Excluded Post IDs Count:", excludeIds.length);
        console.log("Not Interested Categories Count:", notInterestedCategoryIds.length);

        // Check if there are ANY feeds 
        const totalFeeds = await Feed.countDocuments();
        console.log("Total Feeds in DB:", totalFeeds);

        const feeds = await Feed.aggregate([
            {
                $match: {
                    _id: { $nin: excludeIds },
                    category: { $nin: [...notInterestedCategoryIds, ...EXCLUDED_CATEGORY_IDS] },
                    isDeleted: { $ne: true },
                    isApproved: true
                }
            },
            { $limit: 10 }
        ]);

        console.log("Feeds Found with Filter:", feeds.length);
        if (feeds.length > 0) {
            console.log("Sample Feed Title:", feeds[0].title);
        } else {
            console.log("No feeds found with current filter.");

            // Debug: Check a few feeds without filters
            const sampleFeeds = await Feed.find({}).limit(5).lean();
            console.log("Sample Feeds in DB (Raw):");
            sampleFeeds.forEach(f => {
                console.log(`- ID: ${f._id}, Title: ${f.title}, Category: ${f.category}, Approved: ${f.isApproved}, Deleted: ${f.isDeleted}`);
            });
        }

    } catch (error) {
        console.error("Error:", error);
    } finally {
        await mongoose.connection.close();
    }
}

testFetchFeeds();
