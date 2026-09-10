const ReferralCycle = require("../../models/userModels/userRefferalModels/referralCycle");
const ReferralMilestoneConfig = require("../../models/userModels/userRefferalModels/referralMilestoneConfig");
const User = require("../../models/userModels/userModel");
const ProfileSettings = require("../../models/profileSettingModel");
const UserReferralActivity = require("../../models/userModels/userRefferalModels/userReferralActivity");
const { getOrCreateActiveCycle } = require("../../services/referralCycleService");

const DEFAULT_MILESTONES = [
    { count: 5, reward: 100, title: "Bronze Starter", subtitle: "5 Qualified Referrals", icon: "seedling", badge: "Tier 1", isGrand: false },
    { count: 10, reward: 300, title: "Starter Goal", subtitle: "10 Qualified Referrals", icon: "bolt", badge: "Tier 2", isGrand: false },
    { count: 15, reward: 500, title: "Rising Star", subtitle: "15 Qualified Referrals", icon: "star", badge: "Tier 3", isGrand: false },
    { count: 20, reward: 700, title: "Silver Goal", subtitle: "20 Qualified Referrals", icon: "medal", badge: "Tier 4", isGrand: false },
    { count: 24, reward: 1000, title: "Gold Goal", subtitle: "24 Qualified Referrals", icon: "trophy", badge: "Tier 5", isGrand: false },
    { count: 25, reward: 2500, title: "Mega Reward", subtitle: "25 Qualified Referrals", icon: "crown", badge: "Mega Prize 🏆", isGrand: true }
];

/**
 * 1. Summary Statistics for Referral Dashboard
 */
exports.getReferralStats = async (req, res) => {
    try {
        const totalReferrers = await User.countDocuments({
            $or: [
                { referralCode: { $exists: true, $ne: "" } },
                { referralCodeIsValid: true }
            ]
        });

        const activeValidReferrers = await User.countDocuments({ referralCodeIsValid: true });

        // Total referred users
        const totalReferredUsers = await User.countDocuments({ referredByUserId: { $exists: true, $ne: null } });

        // Aggregation from ReferralCycle for cycles and rewards
        const cycleAgg = await ReferralCycle.aggregate([
            {
                $group: {
                    _id: null,
                    totalEligible: { $sum: "$eligibleReferrals" },
                    totalEarned: { $sum: "$earnedAmount" },
                    totalCycles: { $sum: 1 }
                }
            }
        ]);

        const activeCyclesCount = await ReferralCycle.countDocuments({
            status: "active",
            endDate: { $gt: new Date() }
        });

        const qualifiedReferrals = cycleAgg[0]?.totalEligible || 0;
        const totalCashbackPaid = cycleAgg[0]?.totalEarned || 0;

        // Top 5 Referrers by direct referrals
        const topUsers = await User.find({ referralCode: { $exists: true, $ne: "" } })
            .select("userName email referralCode referralCodeIsValid wallet totalEarnings")
            .sort({ totalEarnings: -1, referralCodeUsageCount: -1 })
            .limit(5)
            .lean();

        return res.status(200).json({
            success: true,
            data: {
                totalReferrers,
                activeValidReferrers,
                totalReferredUsers,
                qualifiedReferrals,
                totalCashbackPaid,
                activeCyclesCount,
                topUsers
            }
        });
    } catch (error) {
        console.error("Error in getReferralStats:", error);
        return res.status(500).json({ success: false, message: "Failed to fetch stats", error: error.message });
    }
};

/**
 * 2. Get All Referral Users (Paginated with Search & Filters)
 */
exports.getAllReferralUsers = async (req, res) => {
    try {
        const {
            page = 1,
            limit = 10,
            search = "",
            status = "all", // "valid", "invalid", "all"
            planType = "all", // "paid", "trial", "none", "all"
            sortBy = "createdAt",
            sortOrder = "desc"
        } = req.query;

        const pageNum = Math.max(1, parseInt(page));
        const limitNum = Math.max(1, parseInt(limit));

        let query = {};

        // Search query
        if (search.trim()) {
            const regex = new RegExp(search.trim(), "i");
            query.$or = [
                { userName: regex },
                { email: regex },
                { referralCode: regex }
            ];
        }

        // Filter by referral code validity
        if (status === "valid") {
            query.referralCodeIsValid = true;
        } else if (status === "invalid") {
            query.referralCodeIsValid = { $ne: true };
        }

        // Filter by plan type
        if (planType === "paid") {
            query["subscription.isActive"] = true;
            query["subscription.planType"] = { $ne: "trial" };
        } else if (planType === "trial") {
            query["subscription.isActive"] = true;
            query["subscription.planType"] = "trial";
        } else if (planType === "none") {
            query["subscription.isActive"] = { $ne: true };
        }

        const sortObj = {};
        sortObj[sortBy] = sortOrder === "asc" ? 1 : -1;

        const users = await User.find(query)
            .select("userName email referralCode referralCodeIsValid referredByUserId wallet totalEarnings subscription createdAt")
            .populate("referredByUserId", "userName email referralCode")
            .sort(sortObj)
            .skip((pageNum - 1) * limitNum)
            .limit(limitNum)
            .lean();

        const totalUsers = await User.countDocuments(query);

        // Enhance with active cycle data & referred count for each user
        const userIds = users.map(u => u._id);
        const activeCycles = await ReferralCycle.find({
            userId: { $in: userIds },
            status: { $in: ["active", "completed"] }
        }).sort({ endDate: -1 }).lean();

        // Count how many users each person referred
        const directReferredCounts = await User.aggregate([
            { $match: { referredByUserId: { $in: userIds } } },
            { $group: { _id: "$referredByUserId", count: { $sum: 1 } } }
        ]);

        const directMap = {};
        directReferredCounts.forEach(item => {
            directMap[item._id.toString()] = item.count;
        });

        const cycleMap = {};
        activeCycles.forEach(c => {
            if (!cycleMap[c.userId.toString()]) {
                cycleMap[c.userId.toString()] = c;
            }
        });

        const enhancedUsers = users.map(u => {
            const uid = u._id.toString();
            const cycle = cycleMap[uid] || null;
            return {
                _id: u._id,
                userName: u.userName,
                email: u.email,
                referralCode: u.referralCode || "N/A",
                referralCodeIsValid: !!u.referralCodeIsValid,
                walletBalance: u.wallet?.balance || 0,
                totalEarnings: u.totalEarnings || 0,
                subscription: u.subscription || {},
                referredBy: u.referredByUserId ? {
                    _id: u.referredByUserId._id,
                    userName: u.referredByUserId.userName,
                    email: u.referredByUserId.email,
                    referralCode: u.referredByUserId.referralCode
                } : null,
                directReferralsCount: directMap[uid] || 0,
                activeCycle: cycle ? {
                    _id: cycle._id,
                    eligibleReferrals: cycle.eligibleReferrals || 0,
                    referralCount: cycle.referralCount || 0,
                    earnedAmount: cycle.earnedAmount || 0,
                    claimedMilestones: cycle.claimedMilestones || [],
                    startDate: cycle.startDate,
                    endDate: cycle.endDate,
                    status: cycle.status
                } : null,
                createdAt: u.createdAt
            };
        });

        return res.status(200).json({
            success: true,
            data: enhancedUsers,
            pagination: {
                total: totalUsers,
                page: pageNum,
                limit: limitNum,
                totalPages: Math.ceil(totalUsers / limitNum)
            }
        });
    } catch (error) {
        console.error("Error in getAllReferralUsers:", error);
        return res.status(500).json({ success: false, message: "Failed to fetch users", error: error.message });
    }
};

/**
 * 3. Get Single User Deep Referral Details
 */
exports.getReferralUserDetail = async (req, res) => {
    try {
        const { id } = req.params;

        const user = await User.findById(id)
            .select("userName email referralCode referralCodeIsValid referredByUserId wallet totalEarnings subscription createdAt")
            .populate("referredByUserId", "userName email referralCode")
            .lean();

        if (!user) {
            return res.status(404).json({ success: false, message: "User not found" });
        }

        const profile = await ProfileSettings.findOne({ userId: id }).select("name phoneNumber").lean();

        // Direct referees (users who entered this user's code)
        const referees = await User.find({ referredByUserId: id })
            .select("userName email subscription createdAt")
            .lean();

        // Cycles history
        const cycles = await ReferralCycle.find({ userId: id })
            .sort({ createdAt: -1 })
            .lean();

        // Referral activity logs
        const activities = await UserReferralActivity.find({ userId: id })
            .sort({ createdAt: -1 })
            .limit(20)
            .lean();

        return res.status(200).json({
            success: true,
            data: {
                user: {
                    ...user,
                    name: profile?.name || user.userName,
                    phoneNumber: profile?.phoneNumber || "N/A"
                },
                referees,
                cycles,
                activities
            }
        });
    } catch (error) {
        console.error("Error in getReferralUserDetail:", error);
        return res.status(500).json({ success: false, message: "Failed to fetch user details", error: error.message });
    }
};

/**
 * 4. Create / Manually Link a Referral (Parent <-> Child)
 */
exports.createReferralLink = async (req, res) => {
    try {
        const { parentIdentifier, childIdentifier } = req.body;

        if (!parentIdentifier || !childIdentifier) {
            return res.status(400).json({ success: false, message: "Parent and Child identifiers (ID, username, email, or code) are required" });
        }

        // Find parent
        const parentUser = await User.findOne({
            $or: [
                { _id: parentIdentifier.match(/^[0-9a-fA-F]{24}$/) ? parentIdentifier : null },
                { userName: parentIdentifier },
                { email: parentIdentifier.toLowerCase() },
                { referralCode: parentIdentifier.toUpperCase() }
            ].filter(Boolean)
        });

        if (!parentUser) {
            return res.status(404).json({ success: false, message: "Parent (Referrer) user not found" });
        }

        // Find child
        const childUser = await User.findOne({
            $or: [
                { _id: childIdentifier.match(/^[0-9a-fA-F]{24}$/) ? childIdentifier : null },
                { userName: childIdentifier },
                { email: childIdentifier.toLowerCase() }
            ].filter(Boolean)
        });

        if (!childUser) {
            return res.status(404).json({ success: false, message: "Child (Referee) user not found" });
        }

        if (parentUser._id.toString() === childUser._id.toString()) {
            return res.status(400).json({ success: false, message: "Cannot refer oneself" });
        }

        if (childUser.referredByUserId) {
            return res.status(400).json({ success: false, message: `Child user already referred by another user (ID: ${childUser.referredByUserId})` });
        }

        // Update child user
        childUser.referredByUserId = parentUser._id;
        await childUser.save();

        // Add to parent's active cycle
        const cycle = await getOrCreateActiveCycle(parentUser._id);
        if (!cycle.referralIds.map(r => r.toString()).includes(childUser._id.toString())) {
            cycle.referralIds.push(childUser._id);
            cycle.referralCount = cycle.referralIds.length;
            cycle.referralDetails.push({
                referredUserId: childUser._id,
                subscriptionStatus: (childUser.subscription?.isActive && childUser.subscription?.planType !== 'trial') ? "Qualified" : "Pending",
                date: new Date()
            });

            if (childUser.subscription?.isActive && childUser.subscription?.planType !== 'trial') {
                cycle.eligibleReferrals = (cycle.eligibleReferrals || 0) + 1;
            }

            await cycle.save();
        }

        return res.status(200).json({
            success: true,
            message: `Successfully linked @${childUser.userName} to referrer @${parentUser.userName}`,
            data: { parentId: parentUser._id, childId: childUser._id }
        });
    } catch (error) {
        console.error("Error in createReferralLink:", error);
        return res.status(500).json({ success: false, message: "Failed to create referral link", error: error.message });
    }
};

/**
 * 5. Update User Referral Details (Edit Code, Toggle Validity, Manual Qualification)
 */
exports.updateReferralUser = async (req, res) => {
    try {
        const { id } = req.params;
        const {
            referralCode,
            referralCodeIsValid,
            walletAdjustment, // number to add/subtract
            qualifyRefereeId, // userId to toggle qualified status in active cycle
            qualifyStatus, // "Qualified" or "Pending"
            resetCycle
        } = req.body;

        const user = await User.findById(id);
        if (!user) {
            return res.status(404).json({ success: false, message: "User not found" });
        }

        // 1. Update referral code if provided
        if (referralCode !== undefined && referralCode.trim() !== "") {
            const cleanCode = referralCode.trim().toUpperCase();
            if (cleanCode !== user.referralCode) {
                const existing = await User.findOne({ referralCode: cleanCode, _id: { $ne: id } });
                if (existing) {
                    return res.status(400).json({ success: false, message: "Referral code already in use by another user" });
                }
                user.referralCode = cleanCode;
            }
        }

        // 2. Toggle referralCodeIsValid
        if (referralCodeIsValid !== undefined) {
            user.referralCodeIsValid = !!referralCodeIsValid;
        }

        // 3. Wallet adjustment
        if (typeof walletAdjustment === 'number' && walletAdjustment !== 0) {
            user.wallet = user.wallet || { balance: 0 };
            user.wallet.balance = Math.max(0, (user.wallet.balance || 0) + walletAdjustment);
            if (walletAdjustment > 0) {
                user.totalEarnings = (user.totalEarnings || 0) + walletAdjustment;
            }
        }

        await user.save();

        // 4. Update cycle details if qualifyRefereeId is sent
        if (qualifyRefereeId) {
            const cycle = await getOrCreateActiveCycle(id);
            const refDetail = cycle.referralDetails.find(r => r.referredUserId?.toString() === qualifyRefereeId.toString());
            if (refDetail) {
                const prevStatus = refDetail.subscriptionStatus;
                refDetail.subscriptionStatus = qualifyStatus || (prevStatus === "Qualified" ? "Pending" : "Qualified");
                
                // Recount eligible referrals
                cycle.eligibleReferrals = cycle.referralDetails.filter(r => r.subscriptionStatus === "Qualified").length;
                await cycle.save();
            }
        }

        // 5. Reset cycle if requested
        if (resetCycle === true) {
            await ReferralCycle.updateMany({ userId: id, status: "active" }, { $set: { status: "expired" } });
            await getOrCreateActiveCycle(id);
        }

        return res.status(200).json({
            success: true,
            message: "User referral settings updated successfully",
            data: user
        });
    } catch (error) {
        console.error("Error in updateReferralUser:", error);
        return res.status(500).json({ success: false, message: "Failed to update user", error: error.message });
    }
};

/**
 * 6. Delete / Unlink a Referral Link
 */
exports.deleteReferralLink = async (req, res) => {
    try {
        const { id, referredId } = req.params;

        // Unset referredByUserId on child
        await User.findByIdAndUpdate(referredId, { $unset: { referredByUserId: 1 } });

        // Remove from parent's cycles
        const cycles = await ReferralCycle.find({ userId: id });
        for (const cycle of cycles) {
            const wasPresent = cycle.referralIds.some(r => r.toString() === referredId.toString());
            if (wasPresent) {
                cycle.referralIds = cycle.referralIds.filter(r => r.toString() !== referredId.toString());
                cycle.referralDetails = cycle.referralDetails.filter(r => r.referredUserId?.toString() !== referredId.toString());
                cycle.referralCount = cycle.referralIds.length;
                cycle.eligibleReferrals = cycle.referralDetails.filter(r => r.subscriptionStatus === "Qualified").length;
                await cycle.save();
            }
        }

        return res.status(200).json({
            success: true,
            message: "Referral link removed successfully"
        });
    } catch (error) {
        console.error("Error in deleteReferralLink:", error);
        return res.status(500).json({ success: false, message: "Failed to unlink referral", error: error.message });
    }
};

/**
 * 7. Delete a Referral Cycle
 */
exports.deleteReferralCycle = async (req, res) => {
    try {
        const { cycleId } = req.params;
        await ReferralCycle.findByIdAndDelete(cycleId);
        return res.status(200).json({ success: true, message: "Cycle deleted successfully" });
    } catch (error) {
        console.error("Error in deleteReferralCycle:", error);
        return res.status(500).json({ success: false, message: "Failed to delete cycle", error: error.message });
    }
};

/**
 * 8. Get Milestone & Reward Configuration
 */
exports.getMilestoneConfig = async (req, res) => {
    try {
        let config = await ReferralMilestoneConfig.findOne({ key: "default" }).lean();
        if (!config) {
            config = {
                key: "default",
                rewardPerPerson: 100,
                maxReferralsLimit: 25,
                cycleDays: 30,
                qualifyingPlanPrice: 599,
                milestones: DEFAULT_MILESTONES
            };
        } else {
            if (config.rewardPerPerson === undefined) config.rewardPerPerson = 100;
            if (config.maxReferralsLimit === undefined) config.maxReferralsLimit = 25;
        }
        return res.status(200).json({ success: true, data: config });
    } catch (error) {
        console.error("Error in getMilestoneConfig:", error);
        return res.status(500).json({ success: false, message: "Failed to fetch milestone config", error: error.message });
    }
};

/**
 * 9. Update Milestone & Reward Configuration
 */
exports.updateMilestoneConfig = async (req, res) => {
    try {
        const { milestones, cycleDays, qualifyingPlanPrice, rewardPerPerson, maxReferralsLimit } = req.body;

        const updateData = {
            cycleDays: cycleDays ? Number(cycleDays) : 30,
            qualifyingPlanPrice: qualifyingPlanPrice ? Number(qualifyingPlanPrice) : 599,
            rewardPerPerson: rewardPerPerson !== undefined ? Number(rewardPerPerson) : 100,
            maxReferralsLimit: maxReferralsLimit !== undefined ? Number(maxReferralsLimit) : 25,
            updatedBy: req.adminUser?.userName || "Admin"
        };

        if (Array.isArray(milestones) && milestones.length > 0) {
            updateData.milestones = milestones;
        }

        const config = await ReferralMilestoneConfig.findOneAndUpdate(
            { key: "default" },
            updateData,
            { upsert: true, new: true }
        );

        return res.status(200).json({
            success: true,
            message: "Milestone configuration updated successfully",
            data: config
        });
    } catch (error) {
        console.error("Error in updateMilestoneConfig:", error);
        return res.status(500).json({ success: false, message: "Failed to update milestone config", error: error.message });
    }
};

// Aliases for legacy/alternative route compatibility
exports.getAllReferralCycles = exports.getAllReferralUsers;
exports.getReferralCycleByIdAdmin = exports.getReferralUserDetail;

