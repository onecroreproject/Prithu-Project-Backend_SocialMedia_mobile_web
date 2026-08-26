const ReferralCycle = require("../../models/userModels/userRefferalModels/referralCycle.js");
const User = require("../../models/userModels/userModel.js");

/**
 * Get all referral cycles for admin view
 * Includes mapping to referrers, referees, and subscription statuses.
 */
exports.getAllReferralCycles = async (req, res) => {
    try {
        const { page = 1, limit = 20, status } = req.query;
        
        let query = {};
        if (status) {
            query.status = status;
        }

        const cycles = await ReferralCycle.find(query)
            .populate('userId', 'userName email phone _id')
            .populate('referralDetails.referredUserId', 'userName email phone _id subscription')
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(parseInt(limit));
            
        const total = await ReferralCycle.countDocuments(query);
        
        res.status(200).json({
            success: true,
            total,
            page: parseInt(page),
            pages: Math.ceil(total / limit),
            data: cycles
        });
        
    } catch (error) {
        console.error("Error in getAllReferralCycles:", error);
        res.status(500).json({ success: false, message: "Internal server error" });
    }
};

/**
 * Get detailed view of a specific referral cycle
 */
exports.getReferralCycleByIdAdmin = async (req, res) => {
    try {
        const { id } = req.params;
        const cycle = await ReferralCycle.findById(id)
            .populate('userId', 'userName email phone _id')
            .populate('referralDetails.referredUserId', 'userName email phone _id subscription');
            
        if (!cycle) {
            return res.status(404).json({ success: false, message: "Cycle not found" });
        }
        
        res.status(200).json({
            success: true,
            data: cycle
        });
    } catch (error) {
        console.error("Error in getReferralCycleByIdAdmin:", error);
        res.status(500).json({ success: false, message: "Internal server error" });
    }
};
