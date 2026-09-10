require("dotenv").config();
const { prithuDB } = require("./database");
const User = require("./models/userModels/userModel");
const WalletTransaction = require("./models/WalletTransaction");
const Withdrawal = require("./models/userModels/userRefferalModels/withdrawal");
const UserReferralActivity = require("./models/userModels/userRefferalModels/userReferralActivity");
const ReferralCycle = require("./models/userModels/userRefferalModels/referralCycle");

async function resetAllWallets() {
  console.log("=================================================");
  console.log("🚀 Starting Database Wallet Balance & Referral Reset...");
  console.log("=================================================");

  // Wait for DB connection
  if (prithuDB.readyState !== 1) {
    await new Promise((resolve) => prithuDB.once("connected", resolve));
  }

  try {
    // 1. Reset all Users' wallet balances & earnings to 0
    const userUpdateResult = await User.updateMany(
      {},
      {
        $set: {
          "wallet.balance": 0,
          totalEarnings: 0,
          withdrawnEarnings: 0,
          balanceEarnings: 0,
        },
      }
    );
    console.log(`✅ [1/5] User Wallets Reset: ${userUpdateResult.modifiedCount || userUpdateResult.matchedCount} users set to ₹0 balance.`);

    // 2. Clear all Wallet Transactions
    const txDeleteResult = await WalletTransaction.deleteMany({});
    console.log(`✅ [2/5] Wallet Transactions Cleared: ${txDeleteResult.deletedCount} records deleted.`);

    // 3. Clear all Withdrawal Requests
    const withdrawDeleteResult = await Withdrawal.deleteMany({});
    console.log(`✅ [3/5] Withdrawal Requests Cleared: ${withdrawDeleteResult.deletedCount} requests deleted.`);

    // 4. Clear all User Referral Activities
    const activityDeleteResult = await UserReferralActivity.deleteMany({});
    console.log(`✅ [4/5] Referral Activities Cleared: ${activityDeleteResult.deletedCount} records deleted.`);

    // 5. Reset all Referral Cycles
    const cycleUpdateResult = await ReferralCycle.updateMany(
      {},
      {
        $set: {
          earnedAmount: 0,
          claimedMilestones: [],
          eligibleReferrals: 0,
          referralCount: 0,
          referralIds: [],
          referralDetails: [],
        },
      }
    );
    console.log(`✅ [5/5] Referral Cycles Reset: ${cycleUpdateResult.modifiedCount || cycleUpdateResult.matchedCount} cycles reset to initial state.`);

    // Check if a seed bonus balance is specified via command line arguments
    // e.g. node resetAllWalletsSeed.js --seed=50
    const seedArg = process.argv.find((a) => a.startsWith("--seed="));
    if (seedArg) {
      const seedAmount = Number(seedArg.split("=")[1]) || 0;
      if (seedAmount > 0) {
        console.log(`\n🎁 Seeding ₹${seedAmount} initial bonus to all users...`);
        const seedResult = await User.updateMany(
          {},
          { $set: { "wallet.balance": seedAmount } }
        );
        console.log(`✅ Seeded ₹${seedAmount} to ${seedResult.modifiedCount} users.`);
      }
    }

    console.log("\n=================================================");
    console.log("🎉 DATABASE WALLET RESET & SEED COMPLETED SUCCESSFULLY!");
    console.log("=================================================\n");
  } catch (error) {
    console.error("❌ Error during database wallet reset:", error);
  } finally {
    process.exit(0);
  }
}

resetAllWallets();
