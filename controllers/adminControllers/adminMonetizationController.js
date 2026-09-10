const User = require("../../models/userModels/userModel");
const WalletTransaction = require("../../models/WalletTransaction");
const PromptUnlock = require("../../models/PromptUnlock");
const AIGeneration = require("../../models/AIGeneration");
const CreditPackage = require("../../models/CreditPackage");
const Prompt = require("../../models/Prompt");

// 1. Wallet Dashboard Stats
exports.getWalletDashboard = async (req, res) => {
  try {
    const totalUsersWithWallet = await User.countDocuments({ "wallet.balance": { $exists: true } });
    
    const stats = await User.aggregate([
      {
        $group: {
          _id: null,
          totalSold: { $sum: "$wallet.totalPurchasedCredits" },
          totalConsumed: { $sum: "$wallet.totalSpentCredits" },
          totalRemaining: { $sum: "$wallet.balance" }
        }
      }
    ]);

    const revenueSummary = await WalletTransaction.aggregate([
      { $match: { transactionType: "PURCHASE" } },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: "$amount" }
        }
      }
    ]);

    // Trend per day
    const dailyPurchases = await WalletTransaction.aggregate([
      { $match: { transactionType: "PURCHASE" } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          totalCredits: { $sum: "$credits" },
          totalAmount: { $sum: "$amount" }
        }
      },
      { $sort: { _id: 1 } },
      { $limit: 30 }
    ]);

    res.json({
      success: true,
      stats: stats[0] || { totalSold: 0, totalConsumed: 0, totalRemaining: 0 },
      revenue: revenueSummary[0] || { totalRevenue: 0 },
      activeWalletUsers: totalUsersWithWallet,
      dailyPurchases
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// 2. Credit Packages Management
exports.getCreditPackages = async (req, res) => {
  try {
    const packages = await CreditPackage.find().sort({ credits: 1 });
    res.json({ success: true, packages });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.createCreditPackage = async (req, res) => {
  try {
    const { name, credits, price, currency, isActive } = req.body;
    const newPackage = await CreditPackage.create({ name, credits, price, currency, isActive });
    res.json({ success: true, package: newPackage });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.updateCreditPackage = async (req, res) => {
  try {
    const updated = await CreditPackage.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json({ success: true, package: updated });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.deleteCreditPackage = async (req, res) => {
  try {
    await CreditPackage.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: "Package deleted" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// 3. Transactions
exports.getTransactions = async (req, res) => {
  try {
    const { type, limit = 50, page = 1 } = req.query;
    let query = {};
    if (type && type !== "ALL") query.transactionType = type;

    const skip = (page - 1) * limit;
    const transactions = await WalletTransaction.find(query)
      .populate("userId", "userName email")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit));
    
    const total = await WalletTransaction.countDocuments(query);

    res.json({ success: true, transactions, total });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// 4. Prompt Revenue
exports.getPromptRevenue = async (req, res) => {
  try {
    const revenue = await PromptUnlock.aggregate([
      {
        $group: {
          _id: "$promptId",
          unlockCount: { $sum: 1 },
          creditsEarned: { $sum: "$creditsUsed" }
        }
      },
      {
        $lookup: {
          from: "Prompts",
          localField: "_id",
          foreignField: "_id",
          as: "promptDetails"
        }
      },
      { $unwind: "$promptDetails" },
      {
        $project: {
          promptName: "$promptDetails.title",
          category: "$promptDetails.category",
          unlockCount: 1,
          creditsEarned: 1
        }
      },
      { $sort: { creditsEarned: -1 } }
    ]);

    res.json({ success: true, revenue });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// 5. AI Revenue
exports.getAIRevenue = async (req, res) => {
  try {
    const revenue = await AIGeneration.aggregate([
      { $match: { status: "SUCCESS" } },
      {
        $group: {
          _id: "$promptId",
          generationCount: { $sum: 1 },
          totalImages: { $sum: "$imageCount" },
          creditsConsumed: { $sum: "$creditsUsed" }
        }
      },
      {
        $lookup: {
          from: "Prompts",
          localField: "_id",
          foreignField: "_id",
          as: "promptDetails"
        }
      },
      {
        $project: {
          promptName: { $ifNull: [{ $arrayElemAt: ["$promptDetails.title", 0] }, "Custom Generation"] },
          generationCount: 1,
          totalImages: 1,
          creditsConsumed: 1
        }
      },
      { $sort: { creditsConsumed: -1 } }
    ]);

    res.json({ success: true, revenue });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// 6. User Credit Usage
exports.getUserCreditUsage = async (req, res) => {
  try {
    const users = await User.find({ "wallet.balance": { $exists: true } })
      .select("userName email wallet")
      .sort({ "wallet.totalSpentCredits": -1 })
      .limit(100); // Pagination in real world

    const stats = await Promise.all(users.map(async (u) => {
      const unlocks = await PromptUnlock.countDocuments({ userId: u._id });
      const generations = await AIGeneration.countDocuments({ userId: u._id });
      return {
        _id: u._id,
        userName: u.userName,
        email: u.email,
        wallet: u.wallet,
        promptsUnlocked: unlocks,
        aiGenerations: generations
      };
    }));

    res.json({ success: true, users: stats });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.adminModifyUserCredits = async (req, res) => {
  try {
    const { userId } = req.params;
    const { amount, actionType, remarks } = req.body; // actionType: "ADD" or "REMOVE" or "REFUND"
    
    if (!amount || amount <= 0) return res.status(400).json({ error: "Invalid amount" });

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    if (!user.wallet) {
      user.wallet = { balance: 0, totalPurchasedCredits: 0, totalSpentCredits: 0 };
    }

    const balanceBefore = user.wallet.balance;
    let balanceAfter = balanceBefore;
    let transType = "ADMIN_ADJUSTMENT";
    let creditsToLog = amount;

    if (actionType === "ADD" || actionType === "REFUND") {
      balanceAfter += amount;
      if (actionType === "REFUND") transType = "REFUND";
    } else if (actionType === "REMOVE") {
      if (balanceBefore < amount) return res.status(400).json({ error: "Insufficient balance to remove" });
      balanceAfter -= amount;
      creditsToLog = -amount;
    }

    user.wallet.balance = balanceAfter;
    await user.save();

    await WalletTransaction.create({
      userId,
      transactionType: transType,
      credits: creditsToLog,
      balanceBefore,
      balanceAfter,
      remarks: remarks || `Admin ${actionType}`
    });

    res.json({ success: true, message: "Credits updated successfully", wallet: user.wallet });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
