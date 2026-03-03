const mongoose = require('mongoose');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '.env') });

async function run() {
    try {
        const dbUri = process.env.PRITHU_DB_URI;
        if (!dbUri) {
            console.error("PRITHU_DB_URI not found");
            return;
        }
        await mongoose.connect(dbUri);
        console.log("Connected to DB");

        const Feed = require('./models/feedModel');
        const User = require('./models/userModels/userModel');

        const total = await Feed.countDocuments({});
        const approved = await Feed.countDocuments({ isApproved: true });
        const deleted = await Feed.countDocuments({ isDeleted: true });
        const published = await Feed.countDocuments({ status: { $in: ['published', 'Published'] } });
        const publicAudience = await Feed.countDocuments({ audience: 'public' });

        console.log(`Total Feeds: ${total}`);
        console.log(`Approved: ${approved}`);
        console.log(`Deleted: ${deleted}`);
        console.log(`Published: ${published}`);
        console.log(`Public Audience: ${publicAudience}`);

        const user = await User.findOne({ email: 'suriya@gmail.com' });
        if (user) {
            console.log(`User Suriya found: ${user._id}`);
            const suriyaFeeds = await Feed.countDocuments({
                $or: [
                    { createdByAccount: user._id },
                    { "postedBy.userId": user._id }
                ]
            });
            console.log(`Feeds by Suriya: ${suriyaFeeds}`);
        }

        // Sample of approved feeds
        const sampleApproved = await Feed.find({ isApproved: true }).limit(5).lean();
        console.log("\nSample Approved Feeds:");
        sampleApproved.forEach(f => {
            console.log(`- ID: ${f._id}, Status: ${f.status}, Category: ${f.category}, PostedBy: ${f.postedBy?.userId || f.createdByAccount}`);
        });

    } catch (err) {
        console.error(err);
    } finally {
        await mongoose.connection.close();
    }
}

run();
