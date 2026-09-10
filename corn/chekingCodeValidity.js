const mongoose = require("mongoose");

const User = require("../models/userModels/userModel");

const checkReferralValidity = async () => {
  try {
    // 1. Find all invalid users who were referred by someone
    const invalidUsers = await User.find(
      { referralCodeIsValid: false, referredByUserId: { $ne: null } },
      "_id referredByUserId"
    ).lean();

    if (!invalidUsers.length) return;

    // 2. Group users by sponsor to minimize queries
    const sponsorMap = {};
    for (const u of invalidUsers) {
      if (!sponsorMap[u.referredByUserId]) sponsorMap[u.referredByUserId] = [];
      sponsorMap[u.referredByUserId].push(u._id);
    }

    // 3. Process each sponsor in parallel
    await Promise.all(
      Object.entries(sponsorMap).map(async ([sponsorId, userIds]) => {
        const sponsor = await User.findById(sponsorId);
        if (!sponsor) return;

        let modified = false;

        for (const userId of userIds) {
          if (sponsor.directReferralIncompleteLeft.includes(userId)) {
            sponsor.directReferralIncompleteLeft.pull(userId);
            sponsor.directReferralFinishersLeft.push(userId);
            modified = true;
          }
          if (sponsor.directReferralIncompleteRight.includes(userId)) {
            sponsor.directReferralIncompleteRight.pull(userId);
            sponsor.directReferralFinishersRight.push(userId);
            modified = true;
          }
        }

        if (modified) await sponsor.save();
      })
    );
  } catch (err) {
    console.error("Referral watcher error:", err);
  }
};

// Run every 30s
setInterval(checkReferralValidity, 30 * 1000);
