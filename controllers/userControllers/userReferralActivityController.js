const mongoose = require("mongoose");
const UserReferralActivity = require("../../models/userModels/userRefferalModels/userReferralActivity");
const UserReferral = require("../../models/userModels/userRefferalModels/userReferralModel");
const ProfileSettings = require("../../models/profileSettingModel");
const User = require("../../models/userModels/userModel");

// 4️⃣ Create Referral Activity & Share Tracking
exports.logReferralActivity = async (req, res) => {
    try {
        const userId = req.Id;
        const { referralCode, activityType, sharingMedium, referredUserId, earnedAmount } = req.body;

        if (!activityType) {
            return res.status(400).json({ message: "Activity type is required" });
        }

        const activity = new UserReferralActivity({
            userId,
            referralCode,
            activityType,
            sharingMedium,
            referredUserId,
            earnedAmount: earnedAmount || 0,
        });

        if (activityType === "share") {
            activity.shareCount = 1;
        }

        await activity.save();

        return res.status(201).json({
            success: true,
            message: "Activity logged successfully",
            data: activity,
        });
    } catch (error) {
        console.error("Error logging referral activity:", error);
        return res.status(500).json({ message: "Server error", error: error.message });
    }
};

// 2️⃣ Get User Referred People
exports.getReferredPeople = async (req, res) => {
    try {
        const userId = req.Id;
        const { page = 1, limit = 10 } = req.query;

        const skip = (page - 1) * limit;

        // Direct referrals are in UserReferral model
        const referralData = await UserReferral.findOne({ parentId: userId }).lean();

        if (!referralData || !referralData.childIds || referralData.childIds.length === 0) {
            return res.status(200).json({
                success: true,
                data: [],
                pagination: { total: 0, page, limit }
            });
        }

        const childIds = referralData.childIds;
        const total = childIds.length;

        // Fetch details for child users
        const children = await User.find({ _id: { $in: childIds } })
            .select("userName createdAt")
            .skip(skip)
            .limit(parseInt(limit))
            .lean();

        const userIds = children.map(c => c._id);

        // Fetch profiles for avatars
        const profiles = await ProfileSettings.find({ userId: { $in: userIds } })
            .select("userId profileAvatar modifyAvatarPublicId")
            .lean();

        const result = children.map(user => {
            const profile = profiles.find(p => p.userId.toString() === user._id.toString());
            return {
                _id: user._id,
                username: user.userName,
                referralDate: user.createdAt,
                avatar: profile ? (profile.modifyAvatarPublicId || profile.profileAvatar) : null
            };
        });

        return res.status(200).json({
            success: true,
            data: result,
            pagination: { total, page: parseInt(page), limit: parseInt(limit) }
        });
    } catch (error) {
        console.error("Error getting referred people:", error);
        return res.status(500).json({ message: "Server error", error: error.message });
    }
};

// 5️⃣ Get User Recent Referral & Earnings Activity
exports.getRecentActivities = async (req, res) => {
    try {
        const userId = req.Id;
        const { limit = 20 } = req.query;

        const activities = await UserReferralActivity.aggregate([
            { $match: { userId: new mongoose.Types.ObjectId(userId) } },
            { $sort: { activityDate: -1 } },
            { $limit: parseInt(limit) },
            {
                $lookup: {
                    from: "users",
                    localField: "referredUserId",
                    foreignField: "_id",
                    as: "referredUser",
                    pipeline: [{ $project: { userName: 1 } }]
                }
            },
            {
                $lookup: {
                    from: "profilesettings",
                    localField: "referredUserId",
                    foreignField: "userId",
                    as: "profile",
                    pipeline: [{ $project: { profileAvatar: 1, modifyAvatarPublicId: 1 } }]
                }
            },
            {
                $project: {
                    activityType: 1,
                    referralCode: 1,
                    sharingMedium: 1,
                    earnedAmount: 1,
                    activityDate: 1,
                    referredUserName: { $arrayElemAt: ["$referredUser.userName", 0] },
                    referredUserAvatar: {
                        $ifNull: [
                            { $arrayElemAt: ["$profile.modifyAvatarPublicId", 0] },
                            { $arrayElemAt: ["$profile.profileAvatar", 0] }
                        ]
                    }
                }
            }
        ]);

        return res.status(200).json({
            success: true,
            data: activities
        });
    } catch (error) {
        console.error("Error getting recent activities:", error);
        return res.status(500).json({ message: "Server error", error: error.message });
    }
};
