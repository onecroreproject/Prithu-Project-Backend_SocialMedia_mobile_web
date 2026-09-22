const UserActivity = require("../../models/userModels/userActivitySchema");
const Feed = require("../../models/feedModel");

exports.logUserActivity = async ({
  userId,
  actionType,
  targetId = null,
  targetModel = null,
  metadata = {},
}) => {
  try {
    if (targetModel === "Feed" && targetId) {
      const feed = await Feed.findById(targetId).populate("category").select("postType category");
      if (feed) {
        metadata.postType = feed.postType || "video";
        if (feed.category && feed.category.length > 0) {
          metadata.category = feed.category[0]?.name || feed.category[0];
        }
      }
    }

    // 🔍 Check if same action on same target already exists
    const existing = await UserActivity.findOne({
      userId,
      actionType,
      targetId,
      targetModel,
    });

    if (existing) {
      // 🔁 Just update the timestamp & metadata
      existing.updatedAt = new Date();
      existing.metadata = { ...existing.metadata, ...metadata };
      await existing.save();
      // console.log(`♻️ Updated existing activity: ${actionType}`);
    } else {
      // 🆕 Create a new record
      await UserActivity.create({
        userId,
        actionType,
        targetId,
        targetModel,
        metadata,
      });
      // console.log(`✅ New activity recorded: ${actionType}`);
    }
  } catch (err) {
    console.error("❌ Failed to log user activity:", err.message);
  }
};
