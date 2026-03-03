const mongoose = require('mongoose');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '.env') });

async function run() {
    try {
        const dbUri = process.env.PRITHU_DB_URI;
        await mongoose.connect(dbUri);
        console.log("Connected to DB");

        const Feed = require('./models/feedModel');
        const User = require('./models/userModels/userModel');
        const HiddenPost = require('./models/userModels/hiddenPostSchema');
        const UserCategory = require('./models/userModels/userCategotyModel');

        const user = await User.findOne({ email: 'suriya@gmail.com' });
        const userId = user._id;

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

        // This matches the UPDATED logic in feedsController.js
        const feeds = await Feed.aggregate([
            {
                $match: {
                    _id: { $nin: excludeIds },
                    category: { $nin: [...notInterestedCategoryIds, ...EXCLUDED_CATEGORY_IDS] },
                    $and: [
                        {
                            $or: [
                                { status: "published", isScheduled: { $ne: true } },
                                {
                                    status: "published",
                                    isScheduled: true,
                                    scheduleDate: { $lte: new Date() }
                                }
                            ]
                        }
                    ],
                    isApproved: true,
                    isDeleted: false
                }
            },
            { $limit: 10 }
        ]);

        console.log(`Verification: Found ${feeds.length} feeds.`);
        if (feeds.length > 0) {
            console.log("SUCCESS: Feeds are now being retrieved for Suriya!");
        } else {
            console.log("FAILURE: Still no feeds found.");
        }

    } catch (err) {
        console.error(err);
    } finally {
        await mongoose.connection.close();
    }
}

run();
