const mongoose = require("mongoose");

const User = require("../../models/userModels/userModel");
const { processReferral } = require("../../middlewares/referralMiddleware/referralCount");

exports.startWatcher = () => {
  const changeStream = User.watch([
    {
      $match: {
        operationType: "update",
        "updateDescription.updatedFields.subscription.isActive": { $exists: true }
      }
    }
  ], { fullDocument: "updateLookup" });

  changeStream.on("change", async (change) => {
    try {
      const userId = change.documentKey._id;
      const newSubStatus = change.updateDescription.updatedFields.subscription.isActive;
      console.log(`[Watcher] User ${userId} subscription status changed → ${newSubStatus}`);

      if (newSubStatus) {
        // Activate subscription and referral logic
        await processReferral(userId);
      }

    } catch (err) {
      console.error("[Watcher Error]", err);
    }
  });

  changeStream.on("error", (err) => {
    console.error("[Watcher Stream Error]", err);
    // Auto-restart after 5s
    setTimeout(exports.startWatcher, 5000);
  });

  console.log("[Watcher] Referral watcher started");
};
