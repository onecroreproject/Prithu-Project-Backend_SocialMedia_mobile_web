
const UserDeleteLog = require("../../models/userDeleteLog");
const Users = require("../../models/userModels/userModel.js");
const { userTimeAgo } = require('../../middlewares/userStatusTimeAgo.js');
const UserFeedActions = require('../../models/userFeedInterSectionModel');
const ProfileSettings = require('../../models/profileSettingModel.js');
const mongoose = require("mongoose");
const { prithuDB } = require("../../database");
const UserDevices = require("../../models/userModels/userSession-Device/deviceModel");
const Subscriptions = require('../../models/subscriptionModels/userSubscriptionModel.js');
const UserLanguage = require('../../models/userModels/userLanguageModel.js');
const Follower = require("../../models/userFollowingModel.js");
const UserCategory = require('../../models/userModels/userCategotyModel.js');
const ImageView = require('../../models/userModels/MediaSchema/userImageViewsModel.js');
const VideoView = require('../../models/userModels/MediaSchema/userVideoViewModel.js');
const Feed = require('../../models/feedModel.js');
const Withdrawal = require('../../models/userModels/userRefferalModels/withdrawal.js');
const UserEarning = require('../../models/userModels/userRefferalModels/referralEarnings.js');
const Session = require('../../models/userModels/userSession-Device/sessionModel.js');
const UserSubscription = require("../../models/subscriptionModels/userSubscriptionModel.js");
const Account = require("../../models/accountSchemaModel.js");
const Report = require('../../models/feedReportModel.js');
const ReportType = require('../../models/userModels/Report/reportTypeModel');
const Followers = require("../../models/creatorFollowerModel.js");
const HiddenPost = require("../../models/userModels/hiddenPostSchema.js");
const UserComments = require("../../models/userCommentModel.js");
const UserEarnings = require('../../models/userModels/userRefferalModels/referralEarnings.js');
const UserFeedCategories = require('../../models/userModels/userCategotyModel.js');
const UserFollowings = require("../../models/userFollowingModel.js");
const UserNotification = require("../../models/notificationModel.js");
const UserViews = require("../../models/userModels/MediaSchema/userImageViewsModel.js");
const { extractPublicId } = require("../../middlewares/helper/cloudnaryDetete.js");
const { deleteCloudinaryBatch } = require("../../middlewares/helper/geatherPubliceIds.js");
const { gatherFeedPublicIds } = require("../../middlewares/helper/geatherPubliceIds");
const UserSubscriptions = require("../../models/subscriptionModels/userSubscriptionModel.js");
const CommentLikes = require("../../models/commentsLikeModel.js");
const CreatorFollowers = require('../../models/creatorFollowerModel.js');
const Devices = require("../../models/userModels/userSession-Device/deviceModel.js");
const UserReferral = require("../../models/userModels/userRefferalModels/userReferralModel.js");



// ===================================================
// 1️⃣ DEACTIVATE USER
// ===================================================
exports.deactivateUser = async (req, res) => {
  try {
    const userId = req.Id;
    const { reason } = req.body;

    const user = await Users.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    // Fetch profile for accurate snapshot
    const profile = await ProfileSettings.findOne({ userId });

    // Save log only
    await UserDeleteLog.create({
      userId,
      actionType: "deactivate",
      reason: reason || "Not specified",
      nameSnapshot: profile?.name || user.userName || "Not specified",
      mobileSnapshot: profile?.phoneNumber || "Not specified",
    });

    return res.status(200).json({
      message: "User successfully deactivated.",
      deactivatedOn: new Date(),
    });
  } catch (error) {
    res.status(500).json({ message: "Deactivation failed", error: error.message });
  }
};




// ===================================================
// 2️⃣ DELETE USER NOW (FULL DELETE + LOG + SNAPSHOT)
// ===================================================
exports.deleteUserNow = async (req, res) => {
  try {
    const userId = req.Id; // From auth
    const { reason } = req.body;

    if (!mongoose.Types.ObjectId.isValid(userId))
      return res.status(400).json({ message: "Invalid userId" });

    // -----------------------------------------
    // STEP 0: Fetch user and profile
    // -----------------------------------------
    const user = await Users.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    const profile = await ProfileSettings.findOne({ userId });

    // Snapshot values (safe fallback)
    const snapshotUserName = profile?.userName || user?.userName || "";
    const snapshotPhone = profile?.phoneNumber || user?.mobile || "";

    // -----------------------------------------
    // STEP 1: Save delete log snapshot
    // -----------------------------------------
    await UserDeleteLog.create({
      userId,
      actionType: "delete_now",
      reason: reason || "Not provided",

      // 🔥 Snapshot taken from ProfileSettings
      nameSnapshot: snapshotUserName,
      mobileSnapshot: snapshotPhone,
    });

    // -----------------------------------------
    // STEP 2: Collect Cloudinary Public IDs
    // -----------------------------------------
    const publicIdSet = new Set();

    if (profile?.profileAvatar) {
      const pid = extractPublicId(profile.profileAvatar);
      if (pid) publicIdSet.add(pid);
    }

    // Feed Media IDs (helper)
    const feedPublicIds = await gatherFeedPublicIds(userId);
    feedPublicIds.forEach((id) => publicIdSet.add(id));

    const publicIds = [...publicIdSet];

    // -----------------------------------------
    // STEP 3: Delete Cloudinary images
    // -----------------------------------------
    if (publicIds.length > 0) await deleteCloudinaryBatch(publicIds);

    // -----------------------------------------
    // STEP 4: Delete everything using transaction
    // -----------------------------------------
    const session = await prithuDB.startSession();
    session.startTransaction();

    const accounts = await Account.find({ userId }).lean();
    const accountIds = accounts.map((acc) => acc._id.toString());

    await Account.deleteMany({ userId }, { session });
    await Devices.deleteMany({ userId }, { session });

    await Feed.deleteMany(
      { $or: [{ createdBy: { $in: accountIds } }, { userId }] },
      { session }
    );

    await UserFeedActions.deleteMany(
      { $or: [{ accountId: { $in: accountIds } }, { userId }] },
      { session }
    );

    await Followers.updateMany({}, { $pull: { followerIds: userId } }, { session });
    await CreatorFollowers.updateMany({}, { $pull: { followers: userId } }, { session });

    // Delete profile settings
    await ProfileSettings.deleteMany({ userId }, { session });

    // Delete user LAST
    await Users.deleteOne({ _id: userId }, { session });

    await session.commitTransaction();
    session.endSession();

    // -----------------------------------------
    // STEP 5: Success response
    // -----------------------------------------
    return res.status(200).json({
      message: "User permanently deleted",
      cloudinaryDeleted: publicIds.length,
      snapshot: {
        name: snapshotUserName,
        phone: snapshotPhone,
      },
    });

  } catch (err) {
    console.error("❌ Delete error:", err);
    return res.status(500).json({ message: "Failed to delete", error: err.message });
  }
};



const DEACTIVATE_VALID_DAYS = 20;


exports.checkAndClearDeactivatedUser = async (userId) => {
  try {
    const log = await UserDeleteLog.findOne({
      userId,
      actionType: "deactivate"
    });

    if (!log) return false; // No deactivate → normal login

    // --------------------------------------
    // CHECK VALIDITY OF DEACTIVATE DATE
    // --------------------------------------
    const deactivateDate = log.createdAt; // stored automatically
    const now = new Date();

    const diffMs = now - deactivateDate;
    const diffDays = diffMs / (1000 * 60 * 60 * 24);

    const isStillValid = diffDays <= DEACTIVATE_VALID_DAYS;

    if (!isStillValid) {
      // expired → keep log, do nothing
      return false;
    }

    // --------------------------------------
    // VALID → User is returning → allow login
    // Delete deactivate request
    // --------------------------------------
    await UserDeleteLog.deleteMany({ userId, actionType: "deactivate" });

    return true; // Means deactivate request was cleared

  } catch (error) {
    console.error("Deactivate check error:", error.message);
    return false;
  }
};