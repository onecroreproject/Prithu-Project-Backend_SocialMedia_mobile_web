const mongoose = require("mongoose");
const { prithuDB } = require("../../database");
const Withdrawal = require("../../models/userModels/userRefferalModels/withdrawal");
const UserBankDetails = require("../../models/userModels/userRefferalModels/userBankDetails");
const ProfileSettings = require("../../models/profileSettingModel");
const User = require("../../models/userModels/userModel");
const WalletTransaction = require("../../models/WalletTransaction");
const ReferralCycle = require("../../models/userModels/userRefferalModels/referralCycle");

// 1. Get User Bank / UPI Details & Milestone Withdrawal Status
exports.getBankDetails = async (req, res) => {
    try {
        const userId = req.Id;
        const bankDetails = await UserBankDetails.findOne({ userId });
        const user = await User.findById(userId).select("wallet totalEarnings withdrawnEarnings");

        // Fetch user's referral cycles to calculate milestone cashback
        const cycles = await ReferralCycle.find({ userId });
        const totalMilestoneClaimed = cycles.reduce((sum, c) => sum + (c.earnedAmount || 0), 0);
        const withdrawnAmount = user?.withdrawnEarnings || 0;
        const withdrawableBalance = Math.max(0, totalMilestoneClaimed - withdrawnAmount);

        // Get latest active/completed cycle
        const activeCycle = cycles.find(c => c.status === "active" || c.status === "completed") || cycles[0] || null;
        const eligibleReferrals = activeCycle?.eligibleReferrals || 0;
        const claimedMilestones = activeCycle?.claimedMilestones || [];

        // Is withdrawal unlocked: User must have claimed at least milestone 1 (5 referrals = ₹100)
        const isWithdrawalUnlocked = totalMilestoneClaimed >= 100 && withdrawableBalance >= 100;

        return res.status(200).json({
            success: true,
            data: bankDetails,
            walletBalance: user?.wallet?.balance || 0,
            totalEarnings: user?.totalEarnings || 0,
            withdrawableBalance,
            totalMilestoneClaimed,
            isWithdrawalUnlocked,
            eligibleReferrals,
            claimedMilestones,
            minRequiredMilestone: 5,
            minRequiredAmount: 100
        });
    } catch (error) {
        console.error("Error getting bank details:", error);
        return res.status(500).json({ message: "Server error", error: error.message });
    }
};

// 2. Save/Update User Bank Details & UPI Info
exports.saveBankDetails = async (req, res) => {
    try {
        const userId = req.Id;
        const {
            accountHolderName,
            mobileNumber,
            phoneNumber,
            ifscCode,
            bankName,
            branch,
            bankAddress,
            accountNumber,
            accountType,
            upiId
        } = req.body;

        const resolvedMobile = mobileNumber || phoneNumber || "";

        // Update or create bank details
        const bankDetails = await UserBankDetails.findOneAndUpdate(
            { userId },
            {
                accountHolderName: accountHolderName || "Account Holder",
                mobileNumber: resolvedMobile,
                ifscCode: ifscCode || "N/A",
                bankName: bankName || "UPI / Bank",
                branch: branch || "N/A",
                bankAddress: bankAddress || "N/A",
                accountNumber: accountNumber || upiId || "N/A",
                accountType: accountType || "Savings",
                upiId: upiId || ""
            },
            { new: true, upsert: true }
        );

        if (accountHolderName) {
            await ProfileSettings.findOneAndUpdate(
                { userId },
                { $set: { name: accountHolderName, phoneNumber: resolvedMobile } }
            );
        }

        return res.status(200).json({
            success: true,
            message: "Payout / Bank details saved successfully",
            data: bankDetails
        });
    } catch (error) {
        console.error("Error saving bank details:", error);
        return res.status(500).json({ message: "Server error", error: error.message });
    }
};

// 3. Request Wallet Withdrawal (ONLY Claimed Milestone Cashback is Withdrawable)
exports.requestWithdrawal = async (req, res) => {
    const session = await prithuDB.startSession();
    session.startTransaction();
    try {
        const userId = req.Id;
        const { amount, upiId, bankDetails: inputBank, notes } = req.body;

        // 1. Check for existing pending requests
        const pendingRequest = await Withdrawal.findOne({ userId, status: "pending" }).session(session);
        if (pendingRequest) {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({
                success: false,
                message: "You already have a pending withdrawal request in review."
            });
        }

        // 2. Fetch User
        const user = await User.findById(userId).session(session);
        if (!user) {
            await session.abortTransaction();
            session.endSession();
            return res.status(404).json({ success: false, message: "User not found" });
        }

        // 3. Verify Milestone Claim & Withdrawable Balance
        // Only claimed milestone rewards (5: ₹100, 10: ₹300, 15: ₹500, 20: ₹700, 24: ₹1000, 25: ₹2500) are withdrawable!
        const cycles = await ReferralCycle.find({ userId }).session(session);
        const totalMilestoneClaimed = cycles.reduce((sum, c) => sum + (c.earnedAmount || 0), 0);
        const withdrawnAmount = user.withdrawnEarnings || 0;
        const withdrawableMilestoneBalance = Math.max(0, totalMilestoneClaimed - withdrawnAmount);

        if (totalMilestoneClaimed < 100 || withdrawableMilestoneBalance < 100) {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({
                success: false,
                message: "Withdrawals are locked! You must reach at least Milestone 1 (5 referrals = ₹100 cashback) to withdraw. Current balance can be used to unlock AI prompts."
            });
        }

        const currentWalletBalance = user.wallet?.balance || 0;
        const maxCanWithdraw = Math.min(currentWalletBalance, withdrawableMilestoneBalance);
        const withdrawAmount = Number(amount) || maxCanWithdraw;

        if (withdrawAmount < 100) {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({
                success: false,
                message: `Minimum milestone withdrawal amount is ₹100.`
            });
        }

        if (withdrawAmount > maxCanWithdraw) {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({
                success: false,
                message: `You can only withdraw up to ₹${maxCanWithdraw} earned from milestone rewards. Remaining balance can be used to unlock AI prompts.`
            });
        }

        // 4. Get Bank Details snapshot
        let savedBank = await UserBankDetails.findOne({ userId }).session(session);
        if (inputBank && typeof inputBank === 'object') {
            // Update UserBankDetails with newly provided bank details
            savedBank = await UserBankDetails.findOneAndUpdate(
                { userId },
                {
                    accountHolderName: inputBank.accountHolderName || savedBank?.accountHolderName || user.userName,
                    mobileNumber: inputBank.mobileNumber || inputBank.phoneNumber || savedBank?.mobileNumber || "",
                    ifscCode: inputBank.ifscCode || savedBank?.ifscCode || "N/A",
                    bankName: inputBank.bankName || savedBank?.bankName || "Bank Transfer",
                    branch: inputBank.branch || savedBank?.branch || "N/A",
                    accountNumber: inputBank.accountNumber || savedBank?.accountNumber || upiId || "N/A",
                    upiId: upiId || inputBank.upiId || savedBank?.upiId || ""
                },
                { new: true, upsert: true, session }
            );
        }

        const payoutDetails = inputBank || savedBank?.toObject() || {
            upiId: upiId || "N/A",
            accountHolderName: user.userName,
            bankName: upiId ? "UPI" : "Direct Payout",
            branch: "N/A",
            mobileNumber: ""
        };

        // 5. Deduct from wallet balance
        const balanceBefore = user.wallet.balance;
        user.wallet.balance -= withdrawAmount;
        user.withdrawnEarnings = (user.withdrawnEarnings || 0) + withdrawAmount;
        await user.save({ session });

        // 6. Create Withdrawal Record
        const newWithdrawal = new Withdrawal({
            userId,
            amount: withdrawAmount,
            withdrawalAmount: withdrawAmount,
            totalAmount: balanceBefore,
            bankDetails: {
                ...payoutDetails,
                upiId: upiId || payoutDetails.upiId || ""
            },
            notes: notes || `Milestone Cashback Withdrawal of ₹${withdrawAmount}`,
            status: "pending",
            requestedAt: new Date()
        });
        await newWithdrawal.save({ session });

        // 7. Record Wallet Transaction
        await WalletTransaction.create([{
            userId,
            transactionType: "WITHDRAWAL_REQUEST",
            credits: -withdrawAmount,
            amount: withdrawAmount,
            balanceBefore,
            balanceAfter: user.wallet.balance,
            referenceId: newWithdrawal._id,
            remarks: `Milestone Cashback Withdrawal of ₹${withdrawAmount} (Pending approval)`
        }], { session });

        await session.commitTransaction();
        session.endSession();

        return res.status(200).json({
            success: true,
            message: `₹${withdrawAmount} milestone cashback withdrawal request submitted successfully!`,
            data: newWithdrawal,
            remainingWalletBalance: user.wallet.balance,
            remainingWithdrawable: Math.max(0, withdrawableMilestoneBalance - withdrawAmount)
        });

    } catch (error) {
        await session.abortTransaction();
        session.endSession();
        console.error("Error requesting withdrawal:", error);
        return res.status(500).json({ message: "Server error", error: error.message });
    }
};

// 4. Get User Withdrawal History
exports.getWithdrawalHistory = async (req, res) => {
    try {
        const userId = req.Id;
        const history = await Withdrawal.find({ userId })
            .sort({ requestedAt: -1 })
            .lean();

        return res.status(200).json({
            success: true,
            data: history
        });
    } catch (error) {
        console.error("Error getting withdrawal history:", error);
        return res.status(500).json({ message: "Server error", error: error.message });
    }
};

// 5. Admin: Get All Withdrawals (Paginated with search, milestone info, and status filter)
exports.getAllWithdrawalsAdmin = async (req, res) => {
    try {
        const { page = 1, limit = 15, status = "all", search = "" } = req.query;
        const pageNum = Math.max(1, parseInt(page));
        const limitNum = Math.max(1, parseInt(limit));

        let query = {};
        if (status && status !== "all") {
            query.status = status;
        }

        if (search.trim()) {
            const users = await User.find({
                $or: [
                    { userName: new RegExp(search.trim(), "i") },
                    { email: new RegExp(search.trim(), "i") }
                ]
            }).select("_id");
            query.userId = { $in: users.map(u => u._id) };
        }

        const withdrawals = await Withdrawal.find(query)
            .populate("userId", "userName email profileAvatar wallet totalEarnings withdrawnEarnings")
            .sort({ requestedAt: -1 })
            .skip((pageNum - 1) * limitNum)
            .limit(limitNum)
            .lean();

        const total = await Withdrawal.countDocuments(query);

        // Fetch milestone cycles for each user to display milestone qualifications
        const userIds = withdrawals.map(w => w.userId?._id).filter(Boolean);
        const userCycles = await ReferralCycle.find({ userId: { $in: userIds } }).lean();

        const enhancedWithdrawals = withdrawals.map(w => {
            const uCycles = userCycles.filter(c => c.userId?.toString() === w.userId?._id?.toString());
            const totalMilestoneEarned = uCycles.reduce((sum, c) => sum + (c.earnedAmount || 0), 0);
            const activeCycle = uCycles.find(c => c.status === "active" || c.status === "completed") || uCycles[0];

            return {
                ...w,
                milestoneStats: {
                    totalMilestoneEarned,
                    claimedMilestones: activeCycle?.claimedMilestones || [],
                    eligibleReferrals: activeCycle?.eligibleReferrals || 0,
                    isMilestoneQualified: totalMilestoneEarned >= 100
                }
            };
        });

        // Stats summary
        const pendingCount = await Withdrawal.countDocuments({ status: "pending" });
        const paidAgg = await Withdrawal.aggregate([
            { $match: { status: { $in: ["paid", "approved"] } } },
            { $group: { _id: null, total: { $sum: "$amount" } } }
        ]);

        return res.status(200).json({
            success: true,
            data: enhancedWithdrawals,
            pagination: {
                total,
                page: pageNum,
                limit: limitNum,
                totalPages: Math.ceil(total / limitNum)
            },
            stats: {
                pendingRequests: pendingCount,
                totalPaidOut: paidAgg[0]?.total || 0
            }
        });
    } catch (error) {
        console.error("Error getting admin withdrawals:", error);
        return res.status(500).json({ message: "Server error", error: error.message });
    }
};

// 6. Admin: Update Withdrawal Status (Approve, Mark Paid, Reject with Refund)
exports.updateWithdrawalStatusAdmin = async (req, res) => {
    const session = await prithuDB.startSession();
    session.startTransaction();
    try {
        const { id } = req.params;
        const { status, transactionReference, rejectionReason } = req.body;

        const withdrawal = await Withdrawal.findById(id).session(session);
        if (!withdrawal) {
            await session.abortTransaction();
            session.endSession();
            return res.status(404).json({ success: false, message: "Withdrawal request not found" });
        }

        const prevStatus = withdrawal.status;

        // If Rejecting a pending/approved request -> Refund back to user's wallet
        if (status === "rejected" && prevStatus !== "rejected") {
            const user = await User.findById(withdrawal.userId).session(session);
            if (user) {
                user.wallet = user.wallet || { balance: 0 };
                user.wallet.balance += withdrawal.amount;
                user.withdrawnEarnings = Math.max(0, (user.withdrawnEarnings || 0) - withdrawal.amount);
                await user.save({ session });

                // Record refund transaction
                await WalletTransaction.create([{
                    userId: user._id,
                    transactionType: "WITHDRAWAL_REFUND",
                    credits: withdrawal.amount,
                    amount: withdrawal.amount,
                    balanceBefore: user.wallet.balance - withdrawal.amount,
                    balanceAfter: user.wallet.balance,
                    referenceId: withdrawal._id,
                    remarks: `Withdrawal rejected & refunded: ${rejectionReason || "Admin rejected"}`
                }], { session });
            }
        }

        withdrawal.status = status;
        withdrawal.processedAt = new Date();
        if (transactionReference) {
            withdrawal.notes = `Txn Ref: ${transactionReference}. ${withdrawal.notes || ""}`;
        }
        if (rejectionReason && status === "rejected") {
            withdrawal.notes = `Rejected: ${rejectionReason}`;
        }

        await withdrawal.save({ session });
        await session.commitTransaction();
        session.endSession();

        return res.status(200).json({
            success: true,
            message: `Withdrawal marked as ${status}`,
            data: withdrawal
        });
    } catch (error) {
        await session.abortTransaction();
        session.endSession();
        console.error("Error updating withdrawal status:", error);
        return res.status(500).json({ message: "Server error", error: error.message });
    }
};

// 7. User: Update Pending Withdrawal Request
exports.updateWithdrawalRequest = async (req, res) => {
    try {
        const userId = req.Id;
        const { requestId } = req.params;
        const { notes, bankDetails, upiId } = req.body;

        const withdrawal = await Withdrawal.findOne({ _id: requestId, userId });
        if (!withdrawal) {
            return res.status(404).json({ success: false, message: "Withdrawal request not found" });
        }

        if (withdrawal.status !== "pending") {
            return res.status(400).json({
                success: false,
                message: "Only pending requests can be modified."
            });
        }

        if (notes !== undefined) withdrawal.notes = notes;
        if (bankDetails) {
            withdrawal.bankDetails = {
                ...withdrawal.bankDetails,
                ...bankDetails,
                upiId: upiId || bankDetails.upiId || withdrawal.bankDetails?.upiId
            };
        }

        await withdrawal.save();

        return res.status(200).json({
            success: true,
            message: "Withdrawal request updated successfully",
            data: withdrawal
        });
    } catch (error) {
        console.error("Error updating withdrawal request:", error);
        return res.status(500).json({ message: "Server error", error: error.message });
    }
};
