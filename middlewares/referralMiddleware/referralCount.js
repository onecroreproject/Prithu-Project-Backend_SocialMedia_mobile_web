const mongoose = require("mongoose");
const { prithuDB } = require("../../database");

const User = require("../../models/userModels/userModel");
const UserLevel = require("../../models/userModels/userRefferalModels/userReferralLevelModel");
const UserEarning = require("../../models/userModels/userRefferalModels/referralEarnings");
const { updateCycleOnReferral } = require("../../services/referralCycleService");

const LEVEL_AMOUNT = 250;
const MAX_LEVEL = 10;
const MAX_RETRIES = 5;

function computeThreshold(level) {
  return Math.pow(2, level); // Level 1 → 2 users, Level 2 → 4, etc.
}

// Get or create a UserLevel document for a user/tier/level
async function getOrCreateUserLevel(userId, tier, level, session) {
  const threshold = computeThreshold(level);
  await UserLevel.updateOne(
    { userId, tier, level },
    { $setOnInsert: { userId, tier, level, threshold, leftUsers: [], rightUsers: [], holdingUsers: [] } },
    { upsert: true, session }
  );
  return UserLevel.findOne({ userId, tier, level }).session(session);
}

// Main referral processing
async function processReferral(childId) {
  if (!childId) throw new Error("childId required");

  const child = await User.findById(childId);
  if (!child || !child.referredByUserId) return;

  let ancestorId = child.referredByUserId;
  let tier = 0;
  let levelUp = 1;

  while (ancestorId && levelUp <= MAX_LEVEL) {
    let attempt = 0;
    let success = false;

    while (!success && attempt < MAX_RETRIES) {
      attempt++;

      const session = await prithuDB.startSession();
      session.startTransaction();

      try {
        const ancestor = await User.findById(ancestorId).session(session);
        if (!ancestor) break;

        const userLevel = await getOrCreateUserLevel(ancestor._id, tier, levelUp, session);

        // Determine left/right/holding
        const leftCount = userLevel.leftUsers.length;
        const rightCount = userLevel.rightUsers.length;
        const threshold = computeThreshold(levelUp) / 2;

        let field = null;
        if (leftCount < threshold) field = "leftUsers";
        else if (rightCount < threshold) field = "rightUsers";
        else field = "holdingUsers"; // extra users

        // Add child safely
        await UserLevel.updateOne(
          { _id: userLevel._id },
          { $addToSet: { [field]: child._id } },
          { session }
        );

        // Earnings distribution (always propagate, even for holdingUsers)
        const existingEarning = await UserEarning.findOne({
          userId: ancestorId,
          fromUserId: childId,
          level: levelUp,
          tier
        }).session(session);

        const earningAmount = LEVEL_AMOUNT / computeThreshold(levelUp);

        if (!existingEarning) {
          await UserEarning.create([{
            userId: ancestorId,
            fromUserId: childId,
            level: levelUp,
            tier,
            amount: earningAmount,
            isPartial: true
          }], { session });

          const total = (ancestor.totalEarnings || 0) + earningAmount;
          const withdrawn = ancestor.withdrawnEarnings || 0;
          const balance = total - withdrawn;

          await User.updateOne(
            { _id: ancestorId },
            { $set: { totalEarnings: total, balanceEarnings: balance } },
            { session }
          );

          // Update Referral Cycle
          const { addReferralToCycle } = require("../../services/referralCycleService");
          await addReferralToCycle(ancestorId, childId, session);
        }

        // Promotion only when left/right full
        if (leftCount + (field === "leftUsers" ? 1 : 0) === threshold &&
          rightCount + (field === "rightUsers" ? 1 : 0) === threshold) {

          // Move total to withdrawn
          const updatedAncestor = await User.findById(ancestorId).session(session);
          const newWithdrawn = (updatedAncestor.withdrawnEarnings || 0) + (updatedAncestor.totalEarnings || 0);

          await User.updateOne(
            { _id: ancestorId },
            { $set: { withdrawnEarnings: newWithdrawn, balanceEarnings: 0 } },
            { session }
          );

          // Move holdingUsers to next level
          const holdingUsers = userLevel.holdingUsers || [];
          for (const heldId of holdingUsers) {
            const nextLevel = levelUp + 1 > MAX_LEVEL ? 1 : levelUp + 1;
            const nextTier = levelUp + 1 > MAX_LEVEL ? tier + 1 : tier;
            await processReferral(heldId); // recursively process held users
          }

          // Advance level/tier
          levelUp++;
          if (levelUp > MAX_LEVEL) {
            tier++;
            levelUp = 1;
          }
        }

        await session.commitTransaction();
        session.endSession();
        success = true;
      } catch (err) {
        await session.abortTransaction();
        session.endSession();
        if (err.message.includes("Write conflict") && attempt < MAX_RETRIES) continue;
        throw err;
      }
    }

    const ancestor = await User.findById(ancestorId);
    if (!ancestor || !ancestor.referredByUserId) break;
    ancestorId = ancestor.referredByUserId;
  }
}

module.exports = { processReferral, getOrCreateUserLevel };
