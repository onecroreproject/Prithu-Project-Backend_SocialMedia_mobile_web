const UserFeedActions = require("../../models/userFeedInterSectionModel.js");
const Feeds = require("../../models/feedModel.js");
const { getActiveUserAccount } = require('../../middlewares/creatorAccountactiveStatus.js');
const UserComment = require("../../models/userCommentModel.js");
const UserReplyComment = require('../../models/userRepliesModel')
const CommentLike = require("../../models/commentsLikeModel.js");
const path = require('path')
const fs = require('fs')
const User = require('../../models/userModels/userModel');
const mongoose = require("mongoose");
const ffmpeg = require('fluent-ffmpeg');
const ProfileSettings = require('../../models/profileSettingModel');
const { feedTimeCalculator } = require("../../middlewares/feedTimeCalculator");
const jwt = require("jsonwebtoken");
const UserCategory = require('../../models/userModels/userCategotyModel.js');
const Category = require('../../models/categorySchema.js');
const HiddenPost = require("../../models/userModels/hiddenPostSchema.js");
const Feed = require("../../models/feedModel.js");
const Notification = require("../../models/notificationModel.js");
const { createAndSendNotification } = require("../../middlewares/helper/socketNotification.js");
const { logUserActivity } = require("../../middlewares/helper/logUserActivity.js");
const { getMediaUrl } = require("../../utils/storageEngine");
const UserFeedAnalytics = require("../../models/analytics/userFeedAnalyticsModel");
const idToString = (id) => (id ? id.toString() : null);
const downloadQueue = require("../../queue/downloadQueue");
const { processFeedMedia } = require("../../utils/feedMediaProcessor");
const { processPosterMedia } = require("../../utils/posterMediaProcessor");

const ProfileVisibility = require("../../models/profileVisibilitySchema");

// Helper to reliably resolve full ProfileVisibility document
const resolveVisibility = async (profile) => {
  if (!profile) return {};
  if (profile.visibility && typeof profile.visibility === 'object' && profile.visibility.name) {
    return profile.visibility;
  }
  if (profile.visibility) {
    try {
      const doc = await ProfileVisibility.findById(profile.visibility).lean();
      if (doc) return doc;
    } catch (_) {}
  }
  try {
    const doc = await ProfileVisibility.findOne({ profileSettingsId: profile._id }).lean();
    if (doc) return doc;
  } catch (_) {}
  return {};
};

// Helper to construct a viewer object that respects the ProfileVisibility privacy settings
const getSafeViewer = (user, profile, explicitVisibility = null) => {
  const visibility = explicitVisibility || (profile?.visibility && typeof profile.visibility === 'object' && profile.visibility.name ? profile.visibility : {});
  const effectiveName = (visibility.name === 'public' || visibility.displayName === 'public') ? (profile?.name || user?.name || profile?.userName || user?.userName || null) : null;
  const effectiveUserName = (visibility.userName === 'public') ? (profile?.userName || user?.userName || null) : null;
  return {
    id: user?._id || user?.id,
    name: effectiveName,
    userName: effectiveUserName,
    email: visibility.email === 'public' ? (user?.email || profile?.email || null) : null,
    phoneNumber: (visibility.phoneNumber === 'public' || visibility.phone === 'public') ? (profile?.phoneNumber || user?.phoneNumber || user?.phone || null) : null,
    phone: (visibility.phoneNumber === 'public' || visibility.phone === 'public') ? (profile?.phoneNumber || user?.phoneNumber || user?.phone || null) : null,
    profileAvatar: visibility.profileAvatar === 'public' ? getMediaUrl(profile?.modifyAvatar || profile?.profileAvatar || null) : null,
    website: visibility.website === 'public' ? (profile?.website || null) : null,
  };
};

// Helper to check active subscription and enforce download limit (1 video download per day for free users, unlimited for subscribers)
const checkUserDownloadStatus = async (userId, feedId = null) => {
  try {
    const checkActiveSubscription = require('../../middlewares/subscriptionMiddlewares/checkActiveSubscription.js');
    const subStatus = await checkActiveSubscription(userId);

    if (subStatus && subStatus.hasActive) {
      // Subscribed users get unlimited downloads
      return { allowed: true, hasSubscription: true, limit: Infinity, downloadCount: 0 };
    }

    // Non-subscribed users get 1 download per day
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const actions = await UserFeedActions.findOne({ userId }).lean();
    const dailyDownloads = (actions?.downloadedFeeds || []).filter(item => {
      const dlDate = new Date(item.downloadedAt || item.addedAt);
      return dlDate >= startOfDay;
    });

    const downloadCount = dailyDownloads.length;
    const limit = 1; // 1 download per day limit for non-subscribed users
    const allowed = downloadCount < limit;

    return {
      allowed,
      hasSubscription: false,
      limit,
      downloadCount
    };
  } catch (err) {
    console.error("[checkUserDownloadStatus] Error:", err);
    return { allowed: false, hasSubscription: false, limit: 1, downloadCount: 1 };
  }
};




exports.likeFeed = async (req, res) => {
  const userId = req.Id || req.body.userId;
  const feedId = req.body.feedId;

  if (!userId || !feedId) {
    return res.status(400).json({ message: "userId and feedId required" });
  }

  try {
    let userAction = await UserFeedActions.findOne({ userId });
    if (!userAction) {
      userAction = await UserFeedActions.create({ userId, likedFeeds: [], savedFeeds: [] });
    }

    const isLiked = Array.isArray(userAction.likedFeeds) && userAction.likedFeeds.some(item => item.feedId && item.feedId.toString() === feedId.toString());
    const isSaved = Array.isArray(userAction.savedFeeds) && userAction.savedFeeds.some(item => item.feedId && item.feedId.toString() === feedId.toString());

    let updatedDoc, message, isLike;

    // record activity
    await logUserActivity({
      userId,
      actionType: "LIKE_POST",
      targetId: feedId,
      targetModel: "Feed",
      metadata: { platform: "web" },
    });

    if (isLiked) {
      const pullUpdate = {
        $pull: {
          likedFeeds: { feedId }
        }
      };
      
      const feedStatsUpdate = {
        $inc: { "engagementStats.likes": -1 }
      };

      if (isSaved) {
        pullUpdate.$pull.savedFeeds = { feedId };
        feedStatsUpdate.$inc["engagementStats.saves"] = -1;
      }

      updatedDoc = await UserFeedActions.findOneAndUpdate(
        { userId },
        pullUpdate,
        { new: true }
      );

      await Feeds.findByIdAndUpdate(feedId, feedStatsUpdate);
      await UserFeedAnalytics.findOneAndUpdate(
        { userId, feedId },
        { liked: false, saved: false },
        { upsert: true }
      );

      message = "Unliked successfully";
      isLike = false;
    } else {
      const pushUpdate = {
        $push: {
          likedFeeds: { feedId, likedAt: new Date() }
        }
      };

      const feedStatsUpdate = {
        $inc: { "engagementStats.likes": 1 }
      };

      if (!isSaved) {
        pushUpdate.$push.savedFeeds = { feedId, savedAt: new Date() };
        feedStatsUpdate.$inc["engagementStats.saves"] = 1;
      }

      updatedDoc = await UserFeedActions.findOneAndUpdate(
        { userId },
        pushUpdate,
        { upsert: true, new: true }
      );

      await Feeds.findByIdAndUpdate(feedId, feedStatsUpdate);
      await UserFeedAnalytics.findOneAndUpdate(
        { userId, feedId },
        { liked: true, saved: true },
        { upsert: true }
      );

      message = "Liked successfully";
      isLike = true;
    }

    // 🔹 Create notification only if liked
    if (isLike) {
      const feed = await Feeds.findById(feedId)
        .select("postedBy.userId mediaUrl files roleRef")
        .lean();

      const ownerId = feed?.postedBy?.userId;

      if (feed && ownerId && ownerId.toString() !== userId.toString()) {
        // ✅ pick thumbnail/image for notification
        const previewImage = getMediaUrl(
          feed.files?.[0]?.thumbnail ||
          feed.files?.[0]?.url ||
          feed.mediaUrl ||
          ""
        );

        await createAndSendNotification({
          senderId: userId,
          receiverId: ownerId,
          type: "LIKE_POST",
          title: "New Like ❤️",
          message: "Someone liked your feed 🔥",
          entityId: feed._id,
          entityType: "Feed",
          image: previewImage,
          roleRef: feed.roleRef || "User",
        });
      }
    }


    res.status(200).json({
      message,
      likedFeeds: updatedDoc.likedFeeds,
      savedFeeds: updatedDoc.savedFeeds,
    });
  } catch (err) {
    console.error("Error in likeFeed:", err);
    res.status(500).json({ message: "Internal server error" });
  }
};




exports.toggleDislikeFeed = async (req, res) => {
  try {
    const { feedId } = req.body;
    const userId = req.Id || req.body.userId;


    if (!feedId) {
      return res.status(400).json({ success: false, message: "Feed ID is required" });
    }

    if (!userId && !accountId) {
      return res.status(400).json({ success: false, message: "User or Account ID is required" });
    }

    //  Identify the query based on user type
    const query = userId ? { userId } : { accountId };

    //  Find or create user action document
    let userActions = await UserFeedActions.findOne(query);

    if (!userActions) {
      userActions = new UserFeedActions({
        ...query,
        disLikeFeeds: [],
      });
    }

    //  Check if feed is already disliked
    const isDisliked = userActions.disLikeFeeds.some(
      (item) => item.feedId.toString() === feedId
    );

    if (isDisliked) {
      //  Pull feedId (remove dislike)
      await UserFeedActions.updateOne(query, {
        $pull: { disLikeFeeds: { feedId: new mongoose.Types.ObjectId(feedId) } },
      });

      // Update Feed stats
      await Feeds.findByIdAndUpdate(feedId, { $inc: { "engagementStats.dislikes": -1 } });
      // Update Analytics
      await UserFeedAnalytics.findOneAndUpdate({ userId, feedId }, { notInterested: false });

      return res.status(200).json({
        success: true,
        message: "Dislike removed successfully",
        action: "removed",
      });
    } else {
      //  Push feedId (add dislike)
      await UserFeedActions.updateOne(
        query,
        {
          $push: {
            disLikeFeeds: {
              feedId: new mongoose.Types.ObjectId(feedId),
              downloadedAt: new Date(),
            },
          },
        },
        { upsert: true }
      );

      // Update Feed stats
      await Feeds.findByIdAndUpdate(feedId, { $inc: { "engagementStats.dislikes": 1 } });
      // Update Analytics
      await UserFeedAnalytics.findOneAndUpdate(
        { userId, feedId }, 
        { notInterested: true },
        { upsert: true }
      );

      return res.status(200).json({
        success: true,
        message: "Feed disliked successfully",
        action: "added",
      });
    }
  } catch (error) {
    console.error("❌ Error toggling dislike:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};









exports.toggleSaveFeed = async (req, res) => {
  const userId = req.Id || req.body.userId;
  const { feedId } = req.body;

  if (!userId || !feedId) {
    return res.status(400).json({ message: "userId and feedId required" });
  }

  try {
    const feedObjectId = new mongoose.Types.ObjectId(feedId);

    // Check if the feed is already saved
    const existingAction = await UserFeedActions.findOne({
      userId,
      "savedFeeds.feedId": feedObjectId,
    });

    let updatedDoc, message;

    if (existingAction) {
      // Already saved → remove the feed object
      updatedDoc = await UserFeedActions.findOneAndUpdate(
        { userId },
        { $pull: { savedFeeds: { feedId: feedObjectId } } },
        { new: true }
      );

      // Update Feed stats
      await Feeds.findByIdAndUpdate(feedId, { $inc: { "engagementStats.saves": -1 } });
      // Update Analytics
      await UserFeedAnalytics.findOneAndUpdate({ userId, feedId }, { saved: false });

      message = "Unsaved successfully";
    } else {
      // Not saved → push new feed object with timestamp
      updatedDoc = await UserFeedActions.findOneAndUpdate(
        { userId },
        { $push: { savedFeeds: { feedId: feedObjectId, savedAt: new Date() } } },
        { upsert: true, new: true }
      );

      // Update Feed stats
      await Feeds.findByIdAndUpdate(feedId, { $inc: { "engagementStats.saves": 1 } });
      // Update Analytics
      await UserFeedAnalytics.findOneAndUpdate(
        { userId, feedId }, 
        { saved: true },
        { upsert: true }
      );

      message = "Saved successfully";
    }

    res.status(200).json({
      message,
      isSaved: !existingAction,
      savedFeeds: updatedDoc.savedFeeds,
    });
  } catch (err) {
    console.error("Error in toggleSaveFeed:", err);
    res.status(500).json({ message: "Internal server error" });
  }
};









// Request a Video Download Job
// Check Download Limit

exports.checkDownloadLimit = async (req, res) => {
  const userId = req.Id || req.user?.id || req.query.userId || req.query.uuserId;
  const feedId = req.query.feedId || req.body.feedId;

  if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
    return res.status(401).json({ message: "Invalid user session" });
  }

  try {
    const status = await checkUserDownloadStatus(userId, feedId);
    return res.json({
      downloadCount: status.downloadCount,
      limit: status.limit,
      isLimitReached: !status.allowed,
      hasSubscription: status.hasSubscription
    });
  } catch (err) {
    console.error("[CheckLimit] Error:", err);
    return res.status(500).json({ message: "Error checking limit" });
  }
};

/**
 * Direct Download: Processes and streams video directly to browser
 */
exports.directDownloadFeed = async (req, res) => {
  const { feedId } = req.params;
  let userId = req.user?.id || req.body?.userId || req.query?.userId || req.query?.uuserId;
  const queryToken = req.query?.token || req.body?.token;
  let customMetadata = req.body?.customMetadata || {};

  // Handle stringified metadata from form submissions
  if (typeof customMetadata === 'string') {
    try {
      customMetadata = JSON.parse(customMetadata);
    } catch (e) {
      console.error("[DirectDL] Failed to parse customMetadata:", e.message);
      customMetadata = {};
    }
  }

  // Manual JWT verification for query-based tokens (since browser navigations can't send headers easily)
  if (!req.user && queryToken) {
    try {
      const decoded = jwt.verify(queryToken, process.env.JWT_SECRET || "your_secret_key");
      userId = decoded.userId;
    } catch (err) {
      return res.status(401).json({ message: "Invalid or expired download session token" });
    }
  }

  if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
    return res.status(401).json({ message: "Invalid user session" });
  }

  const tempDir = path.join(__dirname, "../../uploads/temp_direct", `dl_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`);


  try {

    const feed = await Feed.findById(feedId);
    if (!feed) return res.status(404).json({ message: "Feed not found" });

    // Enforce Download Limit
    const status = await checkUserDownloadStatus(userId, feedId);
    if (!status.allowed) {
      console.warn(`[DirectDL] Daily download limit reached for user: ${userId}`);
      return res.status(403).json({ message: `Daily download limit reached (Max ${status.limit} feeds per day)` });
    }

    const [user, profile] = await Promise.all([
      User.findById(userId).lean(),
      ProfileSettings.findOne({ userId }).populate('visibility').lean()
    ]);

    if (!user) return res.status(401).json({ message: "User not found" });

    // Resolve design metadata: Priority to feed's own metadata
    let designMetadata = feed.designMetadata || {};

    // deep copy metadata to avoid modifying original or shared object
    designMetadata = JSON.parse(JSON.stringify(designMetadata));

    // MERGE CUSTOM METADATA FROM CLIENT (Avatar positions, etc.)
    if (customMetadata && Object.keys(customMetadata).length > 0) {
      if (customMetadata.postType) {
        feed.postType = customMetadata.postType;
      }


      // Override Footer Config
      if (customMetadata.footerConfig) {
        designMetadata.footerConfig = {
          ...designMetadata.footerConfig,
          ...customMetadata.footerConfig,
          enabled: customMetadata.footerConfig.enabled === true
        };
      }

      // Add/Override Overlay Elements (Avatars)
      if (customMetadata.avatarConfigs && Array.isArray(customMetadata.avatarConfigs)) {
        if (!designMetadata.overlayElements) designMetadata.overlayElements = [];
        // Filter out existing avatars if we are providing a full set from the editor
        designMetadata.overlayElements = designMetadata.overlayElements.filter(el => el.type !== 'avatar');

        customMetadata.avatarConfigs.forEach((av, idx) => {
          designMetadata.overlayElements.push({
            id: `manual-avatar-${idx}`,
            type: 'avatar',
            xPercent: av.x,
            yPercent: av.y,
            wPercent: av.w,
            hPercent: av.h,
            visible: true,
            zIndex: 110,
            mediaConfig: { url: av.img },
            avatarConfig: { shape: av.shape || 'circle' },
            animation: { enabled: true, direction: 'left', speed: 1, delay: 0 }
          });
        });
      }

      // Add/Override Overlay Elements (Text)
      if (customMetadata.textOverlays && Array.isArray(customMetadata.textOverlays)) {
        if (!designMetadata.overlayElements) designMetadata.overlayElements = [];
        // Filter out existing texts if we are providing a full set from the editor
        designMetadata.overlayElements = designMetadata.overlayElements.filter(el => el.type !== 'text' && el.type !== 'username');

        customMetadata.textOverlays.forEach((ov, idx) => {
          designMetadata.overlayElements.push({
            id: ov.id || `manual-text-${idx}`,
            type: ov.type || 'text',
            xPercent: ov.x,
            yPercent: ov.y,
            wPercent: ov.w,
            hPercent: ov.h,
            visible: ov.visible !== false && ov.visible !== "false" && ov.visible !== "0",
            zIndex: 120 + idx,
            textConfig: {
              content: ov.content || '',
              fontSize: ov.style?.fontSize || 24,
              color: ov.style?.color || '#ffffff',
              fontFamily: ov.style?.fontFamily || 'Inter',
              fontWeight: ov.style?.fontWeight || 'bold',
              align: ov.style?.align || 'center',
            }
          });
        });
      }

      // Add/Override Overlay Elements (Calendars & general overlays)
      if (customMetadata.overlayElements && Array.isArray(customMetadata.overlayElements)) {
        if (!designMetadata.overlayElements) designMetadata.overlayElements = [];
        designMetadata.overlayElements = designMetadata.overlayElements.filter(el => el.type !== 'calendar');

        customMetadata.overlayElements.forEach((ov, idx) => {
          if (ov.type === 'calendar') {
            designMetadata.overlayElements.push({
              id: ov.id || `manual-calendar-${idx}`,
              type: 'calendar',
              xPercent: ov.xPercent ?? ov.x ?? 80,
              yPercent: ov.yPercent ?? ov.y ?? 10,
              wPercent: ov.wPercent ?? ov.w ?? 12,
              hPercent: ov.hPercent ?? ov.h,
              visible: ov.visible !== false && ov.visible !== "false" && ov.visible !== "0",
              zIndex: 130 + idx,
              mediaConfig: ov.mediaConfig || null,
              animation: ov.animation || { enabled: true, direction: 'left', speed: 1, delay: 0 }
            });
          }
        });
      }
    }

    const visibility = await resolveVisibility(profile);
    const viewer = getSafeViewer(user, profile, visibility);

    const displayName = (visibility.name === 'public' || visibility.displayName === 'public') ? (viewer.name || viewer.userName) : null;
    const email = (visibility.email === 'public') ? viewer.email : null;
    const phone = (visibility.phoneNumber === 'public' || visibility.phone === 'public') ? (viewer.phoneNumber || viewer.phone) : null;

    // Filter social icons based on availability and privacy settings (strictly 'public')
    let visibleSocialIcons = [];
    const allowedPlatforms = ['facebook', 'instagram', 'twitter', 'youtube'];
    const userSocialLinks = profile?.socialLinks || user?.socialLinks || {};

    visibleSocialIcons = allowedPlatforms
      .filter(platform => {
        const isPublic = visibility[platform] === 'public' || 
                         visibility.socialLinks?.[platform] === 'public' || 
                         visibility.socialIcons === 'public' ||
                         (platform === 'twitter' && (visibility['x'] === 'public' || visibility.socialLinks?.['x'] === 'public'));
        return isPublic;
      })
      .map(platform => {
        const pKey = platform.toLowerCase();
        const pUrl = typeof userSocialLinks === 'object' ? (userSocialLinks[pKey] || userSocialLinks[platform] || '') : '';
        return {
          platform: pKey,
          visible: true,
          url: pUrl
        };
      });

    const clientWantsFooter = customMetadata?.footerConfig?.enabled === true && customMetadata?.footerConfig?.showFooter !== false;
    const hasAnyFooterContent = !!displayName || !!email || !!phone || (visibleSocialIcons.length > 0);
    const shouldEnableFooter = (clientWantsFooter || customMetadata?.footerConfig?.showFooter !== false) && hasAnyFooterContent;

    if (!designMetadata.footerConfig) {
      designMetadata.footerConfig = {};
    }
    designMetadata.footerConfig.enabled = shouldEnableFooter;
    designMetadata.footerConfig.showFooter = shouldEnableFooter;
    designMetadata.hasFooter = shouldEnableFooter;

    designMetadata.footerConfig.showElements = {
      name: !!displayName,
      email: !!email,
      phone: !!phone,
      socialIcons: visibleSocialIcons.length > 0,
    };
    designMetadata.footerConfig.socialIcons = visibleSocialIcons;


    console.log(`[DirectDL] 🟢 Step 1: Starting processFeedMedia for feed: ${feedId}`);
    
    // Attach customMetadata to feed so processFeedMedia can access it
    feed.customMetadata = customMetadata;
    
    const { ffmpegCommand, tempSourcePath, ext = "mp4" } = await processFeedMedia({
      feed,
      viewer,
      designMetadata,
      tempDir,
      isStreaming: false
    });
    console.log(`[DirectDL] 🟢 Step 2: processFeedMedia completed successfully.`);

    const finalOutputPath = path.join(tempDir, `final_output_${feedId}.${ext}`);
    const randomSuffix = Math.floor(100 + Math.random() * 900);
    const filename = `prithu${randomSuffix}.${ext}`;

    // Monitor for client disconnects
    req.on('close', () => {
      console.warn(`[DirectDL] Client connection closed prematurely for jobId: ${feedId}`);
    });

    req.on('error', (err) => {
      console.error(`[DirectDL] Request error: ${err.message}`);
    });

    console.log(`[DirectDL] 🟢 Step 3: Executing FFmpeg command...`);

    // Run FFmpeg to a temporary file instead of piping directly
    // This allows the 'faststart' flag to properly relocate the moov atom for social media compatibility
    ffmpegCommand
      .on('start', (commandLine) => {
        console.log(`[DirectDL] 🟢 Step 4: FFmpeg process spawned!`);
        console.log(`[DirectDL] 🔧 Exact Command: ${commandLine}`);
      })
      .on('stderr', (line) => {
        const lowerLine = line.toLowerCase();
        if (lowerLine.includes('frame=') || lowerLine.includes('bitrate=') || lowerLine.includes('size=')) {
          // Normal FFmpeg progress output
        } else if (lowerLine.includes('warning') || lowerLine.includes('invalid') || lowerLine.includes('exif')) {
          console.warn(`[DirectDL] ⚠️ FFmpeg Warning: ${line}`);
        } else if (lowerLine.includes('error') || lowerLine.includes('failed')) {
          console.error(`[DirectDL] 🔴 FFmpeg Error: ${line}`);
        } else {
          console.log(`[DirectDL] ℹ️ FFmpeg: ${line}`);
        }
      })
      .on('error', (err) => {
        console.error("[DirectDL] FFmpeg Error:", err.message, err.stack);
        if (!res.headersSent) {
          res.status(500).send("Processing failed");
        }
        cleanup();
      })
      .on('end', async () => {


        if (fs.existsSync(finalOutputPath)) {
          res.download(finalOutputPath, filename, async (err) => {
            if (err) {
              console.error("[DirectDL] Download error:", err.message);
            } else {
              // RECORD DOWNLOAD ACTION ONLY AFTER SUCCESSFUL TRANSFER
              try {
                await UserFeedActions.findOneAndUpdate(
                  { userId },
                  {
                    $push: {
                      downloadedFeeds: {
                        feedId,
                        downloadedAt: new Date()
                      }
                    }
                  },
                  { upsert: true }
                );

                await logUserActivity({
                  userId,
                  actionType: "DOWNLOAD_POST",
                  targetId: feedId,
                  targetModel: "Feed",
                  metadata: { platform: "web" },
                });
              } catch (dlErr) {
                console.error("[DirectDL] Action recording error:", dlErr);
              }
            }
            cleanup();
          });
        } else {
          console.error("[DirectDL] Output file missing after FFmpeg end");
          if (!res.headersSent) res.status(500).send("Output generation failed");
          cleanup();
        }
      })
      .save(finalOutputPath);

    function cleanup() {
      try {
        if (fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true, force: true });
      } catch (e) { }
    }

  } catch (err) {
    console.error("[DirectDL] System Error:", err);
    if (!res.headersSent) res.status(500).json({ error: err.message });
    try { if (fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true, force: true }); } catch (e) { }
  }
};

/* ------------------------------------------------------------------
   🎂 BIRTHDAY POSTER DOWNLOAD
   POST /api/user/feed/:feedId/birthday-download
   Body: { token, userId, customMetadata: { avatarConfigs, textOverlays, footerConfig } }
   Response: raw .mp4 blob streamed directly to client
------------------------------------------------------------------- */
exports.birthdayDownloadFeed = async (req, res) => {
  const { feedId } = req.params;
  let userId = req.Id || req.user?.id || req.body?.userId;
  const queryToken = req.body?.token || req.query?.token;
  let customMetadata = req.body?.customMetadata || {};

  if (typeof customMetadata === 'string') {
    try { customMetadata = JSON.parse(customMetadata); }
    catch (e) { customMetadata = {}; }
  }

  // Manual JWT fallback (browser fetch sends token in body)
  if (!req.Id && !req.user && queryToken) {
    try {
      const decoded = jwt.verify(queryToken, process.env.JWT_SECRET || "your_secret_key");
      userId = decoded.userId || decoded.id;
    } catch {
      return res.status(401).json({ message: "Invalid or expired token" });
    }
  }

  if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
    return res.status(401).json({ message: "Invalid user session" });
  }

  if (!feedId || !mongoose.Types.ObjectId.isValid(feedId)) {
    return res.status(400).json({ message: "Invalid feed ID" });
  }

  const tempDir = require('path').join(
    __dirname, "../../uploads/temp_birthday",
    `bdl_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
  );

  const cleanup = () => {
    try { if (fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true, force: true }); } catch (e) { }
  };

  try {


    const feed = await Feed.findById(feedId).lean();
    if (!feed) return res.status(404).json({ message: "Feed not found" });

    // Enforce Download Limit
    const status = await checkUserDownloadStatus(userId, feedId);
    if (!status.allowed) {
      console.warn(`[BirthdayDL] Daily download limit reached for user: ${userId}`);
      return res.status(403).json({ message: `Daily download limit reached (Max ${status.limit} feeds per day)` });
    }

    const [user, profile] = await Promise.all([
      User.findById(userId).lean(),
      ProfileSettings.findOne({ userId }).populate('visibility').lean(),
    ]);

    if (!user) return res.status(401).json({ message: "User not found" });

    const visibility = await resolveVisibility(profile);
    const viewer = getSafeViewer(user, profile, visibility);

    // ── Build designMetadata from feed + merge client customMetadata ──
    let designMetadata = JSON.parse(JSON.stringify(feed.designMetadata || {}));
    if (!designMetadata.overlayElements) designMetadata.overlayElements = [];

    // 1️⃣  Avatar overlays — replace existing avatar slots with editor values
    if (Array.isArray(customMetadata.avatarConfigs) && customMetadata.avatarConfigs.length > 0) {
      designMetadata.overlayElements = designMetadata.overlayElements.filter(el => el.type !== 'avatar');
      customMetadata.avatarConfigs.forEach((av, idx) => {
        designMetadata.overlayElements.push({
          id: `birthday-avatar-${idx}`,
          type: 'avatar',
          xPercent: av.x,
          yPercent: av.y,
          wPercent: av.w,
          hPercent: av.h,
          visible: true,
          zIndex: 110 + idx,
          mediaConfig: { url: av.img },
          avatarConfig: { shape: av.shape || 'circle' },
        });
      });
    }

    // 2️⃣  Text overlays — replace existing text/username slots with editor values
    if (Array.isArray(customMetadata.textOverlays) && customMetadata.textOverlays.length > 0) {
      designMetadata.overlayElements = designMetadata.overlayElements.filter(
        el => el.type !== 'text' && el.type !== 'username'
      );
      customMetadata.textOverlays.forEach((ov, idx) => {
        designMetadata.overlayElements.push({
          id: ov.id || `birthday-text-${idx}`,
          type: ov.type || 'text',
          xPercent: ov.x,
          yPercent: ov.y,
          wPercent: ov.w,
          hPercent: ov.h,
          visible: ov.visible !== false,
          zIndex: 120 + idx,
          textConfig: {
            content: ov.content || '',
            fontSize: ov.style?.fontSize || 24,
            color: ov.style?.color || '#ffffff',
            fontFamily: ov.style?.fontFamily || 'Inter',
            fontWeight: ov.style?.fontWeight || 'bold',
            align: ov.style?.align || 'center',
          },
        });
      });
    }

    // 3️⃣  Calendar overlays - merge from client
    if (Array.isArray(customMetadata.overlayElements)) {
      designMetadata.overlayElements = designMetadata.overlayElements.filter(el => el.type !== 'calendar');
      customMetadata.overlayElements.forEach((ov, idx) => {
        if (ov.type === 'calendar') {
          designMetadata.overlayElements.push({
            id: ov.id || `birthday-calendar-${idx}`,
            type: 'calendar',
            xPercent: ov.xPercent ?? ov.x ?? 80,
            yPercent: ov.yPercent ?? ov.y ?? 10,
            wPercent: ov.wPercent ?? ov.w ?? 12,
            hPercent: ov.hPercent ?? ov.h,
            visible: ov.visible !== false,
            zIndex: 130 + idx,
            mediaConfig: ov.mediaConfig || null,
          });
        }
      });
    }

    // 3️⃣  Footer config - Explicitly disable for birthday posters
    designMetadata.hasFooter = false;
    delete designMetadata.footerConfig;

    feed.customMetadata = customMetadata;

    // ── FFmpeg Processing via processPosterMedia ──
    const { ffmpegCommand, tempSourcePath } = await processPosterMedia({
      feed: { ...feed, mediaUrl: getMediaUrl(feed.mediaUrl) },
      viewer,
      designMetadata,
      tempDir,
    });

    const finalOutputPath = path.join(tempDir, `birthday_${feedId}.mp4`);
    const randomSuffix = Math.floor(100 + Math.random() * 900);
    const filename = `prithu${randomSuffix}.mp4`;

    req.on('close', () => console.warn(`[BirthdayDL] Client disconnected early`));

    ffmpegCommand

      .on('stderr', (line) => {
        const lowerLine = line.toLowerCase();
        if (lowerLine.includes('frame=') || lowerLine.includes('bitrate=') || lowerLine.includes('size=')) {
          // Normal FFmpeg progress output
        } else if (lowerLine.includes('warning') || lowerLine.includes('invalid') || lowerLine.includes('exif')) {
          console.warn(`[BirthdayDL] ⚠️ FFmpeg Warning: ${line}`);
        } else if (lowerLine.includes('error') || lowerLine.includes('failed')) {
          console.error(`[BirthdayDL] 🔴 FFmpeg Error: ${line}`);
        } else {
          console.log(`[BirthdayDL] ℹ️ FFmpeg: ${line}`);
        }
      })
      .on('error', (err) => {
        console.error('[BirthdayDL] FFmpeg error:', err.message);
        if (!res.headersSent) res.status(500).json({ error: 'Video processing failed' });
        cleanup();
      })
      .on('end', async () => {

        if (!fs.existsSync(finalOutputPath)) {
          if (!res.headersSent) res.status(500).json({ error: 'Output file missing' });
          return cleanup();
        }

        res.download(finalOutputPath, filename, async (err) => {
          if (err) {
            console.error('[BirthdayDL] Stream error:', err.message);
          } else {
            // Record download action
            try {
              await UserFeedActions.findOneAndUpdate(
                { userId },
                { $push: { downloadedFeeds: { feedId, downloadedAt: new Date() } } },
                { upsert: true }
              );
              await logUserActivity({
                userId,
                actionType: 'DOWNLOAD_POST',
                targetId: feedId,
                targetModel: 'Feed',
                metadata: { platform: 'web', type: 'birthday' },
              });
            } catch (e) {
              console.error('[BirthdayDL] Activity record error:', e.message);
            }
          }
          cleanup();
        });
      })
      .save(finalOutputPath);

  } catch (err) {
    console.error('[BirthdayDL] System error:', err.message);
    if (!res.headersSent) res.status(500).json({ error: err.message });
    cleanup();
  }
};

/* ------------------------------------------------------------------
   💍 ANNIVERSARY POSTER DOWNLOAD
   POST /api/user/feed/:feedId/anniversary-download
   Body: { token, userId, customMetadata: { avatarConfigs, textOverlays, footerConfig } }
   Response: raw .mp4 blob streamed directly to client
------------------------------------------------------------------- */
exports.anniversaryDownloadFeed = async (req, res) => {
  const { feedId } = req.params;
  let userId = req.Id || req.user?.id || req.body?.userId;
  const queryToken = req.body?.token || req.query?.token;
  let customMetadata = req.body?.customMetadata || {};

  if (typeof customMetadata === 'string') {
    try { customMetadata = JSON.parse(customMetadata); }
    catch (e) { customMetadata = {}; }
  }

  // Manual JWT fallback (browser fetch sends token in body)
  if (!req.Id && !req.user && queryToken) {
    try {
      const decoded = jwt.verify(queryToken, process.env.JWT_SECRET || "your_secret_key");
      userId = decoded.userId || decoded.id;
    } catch {
      return res.status(401).json({ message: "Invalid or expired token" });
    }
  }

  if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
    return res.status(401).json({ message: "Invalid user session" });
  }

  if (!feedId || !mongoose.Types.ObjectId.isValid(feedId)) {
    return res.status(400).json({ message: "Invalid feed ID" });
  }

  const tempDir = require('path').join(
    __dirname, "../../uploads/temp_anniversary",
    `adl_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
  );

  const cleanup = () => {
    try { if (fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true, force: true }); } catch (e) { }
  };

  try {


    const feed = await Feed.findById(feedId).lean();
    if (!feed) return res.status(404).json({ message: "Feed not found" });

    // Enforce Download Limit
    const status = await checkUserDownloadStatus(userId, feedId);
    if (!status.allowed) {
      console.warn(`[AnniversaryDL] Daily download limit reached for user: ${userId}`);
      return res.status(403).json({ message: `Daily download limit reached (Max ${status.limit} feeds per day)` });
    }

    const [user, profile] = await Promise.all([
      User.findById(userId).lean(),
      ProfileSettings.findOne({ userId }).populate('visibility').lean(),
    ]);

    if (!user) return res.status(401).json({ message: "User not found" });

    const visibility = await resolveVisibility(profile);
    const viewer = getSafeViewer(user, profile, visibility);

    // ── Build designMetadata from feed + merge client customMetadata ──
    let designMetadata = JSON.parse(JSON.stringify(feed.designMetadata || {}));
    if (!designMetadata.overlayElements) designMetadata.overlayElements = [];

    // 1️⃣  Avatar overlays — replace existing avatar slots with editor values
    if (Array.isArray(customMetadata.avatarConfigs) && customMetadata.avatarConfigs.length > 0) {
      designMetadata.overlayElements = designMetadata.overlayElements.filter(el => el.type !== 'avatar');
      customMetadata.avatarConfigs.forEach((av, idx) => {
        designMetadata.overlayElements.push({
          id: `anniversary-avatar-${idx}`,
          type: 'avatar',
          xPercent: av.x,
          yPercent: av.y,
          wPercent: av.w,
          hPercent: av.h,
          visible: true,
          zIndex: 110 + idx,
          mediaConfig: { url: av.img },
          avatarConfig: { shape: av.shape || 'circle' },
        });
      });
    }

    // 2️⃣  Text overlays — replace existing text/username slots with editor values
    if (Array.isArray(customMetadata.textOverlays) && customMetadata.textOverlays.length > 0) {
      designMetadata.overlayElements = designMetadata.overlayElements.filter(
        el => el.type !== 'text' && el.type !== 'username'
      );
      customMetadata.textOverlays.forEach((ov, idx) => {
        designMetadata.overlayElements.push({
          id: ov.id || `anniversary-text-${idx}`,
          type: ov.type || 'text',
          xPercent: ov.x,
          yPercent: ov.y,
          wPercent: ov.w,
          hPercent: ov.h,
          visible: ov.visible !== false,
          zIndex: 120 + idx,
          textConfig: {
            content: ov.content || '',
            fontSize: ov.style?.fontSize || 24,
            color: ov.style?.color || '#ffffff',
            fontFamily: ov.style?.fontFamily || 'Inter',
            fontWeight: ov.style?.fontWeight || 'bold',
            align: ov.style?.align || 'center',
          },
        });
      });
    }

    // 3️⃣  Footer config - Explicitly disable for anniversary posters
    designMetadata.hasFooter = false;
    delete designMetadata.footerConfig;

    feed.customMetadata = customMetadata;

    // ── FFmpeg Processing via processPosterMedia ──
    const { ffmpegCommand, tempSourcePath } = await processPosterMedia({
      feed: { ...feed, mediaUrl: getMediaUrl(feed.mediaUrl) },
      viewer,
      designMetadata,
      tempDir,
    });

    const finalOutputPath = path.join(tempDir, `anniversary_${feedId}.mp4`);
    const randomSuffix = Math.floor(100 + Math.random() * 900);
    const filename = `prithu${randomSuffix}.mp4`;

    req.on('close', () => console.warn(`[AnniversaryDL] Client disconnected early`));

    ffmpegCommand

      .on('stderr', (line) => {
        if (/error|invalid|failed/i.test(line)) console.error(`[AnniversaryDL] STDERR: ${line}`);
      })
      .on('error', (err) => {
        console.error('[AnniversaryDL] FFmpeg error:', err.message);
        if (!res.headersSent) res.status(500).json({ error: 'Video processing failed' });
        cleanup();
      })
      .on('end', async () => {

        if (!fs.existsSync(finalOutputPath)) {
          if (!res.headersSent) res.status(500).json({ error: 'Output file missing' });
          return cleanup();
        }

        res.download(finalOutputPath, filename, async (err) => {
          if (err) {
            console.error('[AnniversaryDL] Stream error:', err.message);
          } else {
            // Record download action
            try {
              await UserFeedActions.findOneAndUpdate(
                { userId },
                { $push: { downloadedFeeds: { feedId, downloadedAt: new Date() } } },
                { upsert: true }
              );
              await logUserActivity({
                userId,
                actionType: 'DOWNLOAD_POST',
                targetId: feedId,
                targetModel: 'Feed',
                metadata: { platform: 'web', type: 'anniversary' },
              });
            } catch (e) {
              console.error('[AnniversaryDL] Activity record error:', e.message);
            }
          }
          cleanup();
        });
      })
      .save(finalOutputPath);

  } catch (err) {
    console.error('[AnniversaryDL] System error:', err.message);
    if (!res.headersSent) res.status(500).json({ error: err.message });
    cleanup();
  }
};

/* ------------------------------------------------------------------
   🗳️  POLITICS POSTER DOWNLOAD
   POST /web/api/user/feed/:feedId/politics-download
   Body: { token, userId, customMetadata: { avatarConfigs, leaderOverlays, footerConfig } }
   Response: raw .mp4 blob streamed directly to client
------------------------------------------------------------------- */
exports.politicsDownloadFeed = async (req, res) => {
  const { feedId } = req.params;
  let userId = req.Id || req.user?.id || req.body?.userId;
  const queryToken = req.body?.token || req.query?.token;
  let customMetadata = req.body?.customMetadata || {};

  if (typeof customMetadata === 'string') {
    try { customMetadata = JSON.parse(customMetadata); }
    catch (e) { customMetadata = {}; }
  }

  // Manual JWT fallback
  if (!req.Id && !req.user && queryToken) {
    try {
      const decoded = jwt.verify(queryToken, process.env.JWT_SECRET || "your_secret_key");
      userId = decoded.userId || decoded.id;
    } catch {
      return res.status(401).json({ message: "Invalid or expired token" });
    }
  }

  if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
    return res.status(401).json({ message: "Invalid user session" });
  }

  if (!feedId || !mongoose.Types.ObjectId.isValid(feedId)) {
    return res.status(400).json({ message: "Invalid feed ID" });
  }

  const tempDir = require('path').join(
    __dirname, "../../uploads/temp_direct",
    `pdl_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
  );

  const cleanup = () => {
    try { if (fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true, force: true }); } catch (e) { }
  };

  try {


    const feed = await Feed.findById(feedId).lean();
    if (!feed) return res.status(404).json({ message: "Feed not found" });

    // Enforce Download Limit
    const status = await checkUserDownloadStatus(userId, feedId);
    if (!status.allowed) {
      console.warn(`[PoliticsDL] Daily download limit reached for user: ${userId}`);
      return res.status(403).json({ message: `Daily download limit reached (Max ${status.limit} feeds per day)` });
    }

    const [user, profile] = await Promise.all([
      User.findById(userId).lean(),
      ProfileSettings.findOne({ userId }).populate('visibility').lean(),
    ]);

    if (!user) return res.status(401).json({ message: "User not found" });

    const visibility = await resolveVisibility(profile);
    const viewer = getSafeViewer(user, profile, visibility);

    // ── Build designMetadata from feed + merge client customMetadata ──
    let designMetadata = JSON.parse(JSON.stringify(feed.designMetadata || {}));
    if (!designMetadata.overlayElements) designMetadata.overlayElements = [];

    // 1️⃣  Avatar overlays (profile photo)
    if (Array.isArray(customMetadata.avatarConfigs) && customMetadata.avatarConfigs.length > 0) {
      designMetadata.overlayElements = designMetadata.overlayElements.filter(el => el.type !== 'avatar');
      customMetadata.avatarConfigs.forEach((av, idx) => {
        designMetadata.overlayElements.push({
          id: `politics-avatar-${idx}`,
          type: 'avatar',
          xPercent: av.x,
          yPercent: av.y,
          wPercent: av.w,
          hPercent: av.h,
          visible: true,
          zIndex: 110 + idx,
          mediaConfig: { url: av.img },
          avatarConfig: { shape: av.shape || 'circle' },
        });
      });
    }

    // 2️⃣  Leader / party-logo overlays — treated as circle-avatar overlays, no fade
    if (Array.isArray(customMetadata.leaderOverlays) && customMetadata.leaderOverlays.length > 0) {
      customMetadata.leaderOverlays.forEach((ov, idx) => {
        designMetadata.overlayElements.push({
          id: ov.id || `politics-leader-${idx}`,
          type: 'avatar',
          xPercent: ov.x,
          yPercent: ov.y,
          wPercent: ov.w,
          hPercent: ov.h,
          visible: true,
          zIndex: ov.zIndex || (140 + idx),
          mediaConfig: { url: ov.img },
          avatarConfig: { shape: ov.type === 'party-logo' ? 'square' : 'circle' },
          noFade: true, // skip bottom gradient — use clean circle/rect mask
        });
      });
    }

    // 3️⃣  Footer config — apply only if public content exists and user enabled it
    const displayName = (visibility.name === 'public' || visibility.displayName === 'public') ? (viewer.name || viewer.userName) : null;
    const email = (visibility.email === 'public') ? viewer.email : null;
    const phone = (visibility.phoneNumber === 'public' || visibility.phone === 'public') ? (viewer.phoneNumber || viewer.phone) : null;

    const hasAnyFooter = !!displayName || !!email || !!phone;
    const shouldEnablePoliticsFooter = (customMetadata.footerConfig?.showFooter !== false && customMetadata.footerConfig?.enabled !== false) && hasAnyFooter;

    if (shouldEnablePoliticsFooter) {
      designMetadata.hasFooter = true;
      designMetadata.footerConfig = {
        ...(designMetadata.footerConfig || {}),
        ...(customMetadata.footerConfig || {}),
        enabled: true,
        showFooter: true,
        showElements: {
          name: !!displayName,
          email: !!email,
          phone: !!phone,
          socialIcons: false,
        }
      };
    } else {
      designMetadata.hasFooter = false;
      delete designMetadata.footerConfig;
    }

    feed.customMetadata = customMetadata;

    // ── FFmpeg Processing ──
    const { ffmpegCommand, tempSourcePath } = await processPosterMedia({
      feed: { ...feed, mediaUrl: getMediaUrl(feed.mediaUrl) },
      viewer,
      designMetadata,
      tempDir,
    });

    const finalOutputPath = path.join(tempDir, `politics_${feedId}.mp4`);
    const randomSuffix = Math.floor(100 + Math.random() * 900);
    const filename = `prithu${randomSuffix}.mp4`;

    req.on('close', () => console.warn(`[PoliticsDL] Client disconnected early`));

    ffmpegCommand

      .on('stderr', (line) => {
        if (/error|invalid|failed/i.test(line)) console.error(`[PoliticsDL] STDERR: ${line}`);
      })
      .on('error', (err) => {
        console.error('[PoliticsDL] FFmpeg error:', err.message);
        if (!res.headersSent) res.status(500).json({ error: 'Video processing failed' });
        cleanup();
      })
      .on('end', async () => {

        if (!fs.existsSync(finalOutputPath)) {
          if (!res.headersSent) res.status(500).json({ error: 'Output file missing' });
          return cleanup();
        }

        res.download(finalOutputPath, filename, async (err) => {
          if (err) {
            console.error('[PoliticsDL] Stream error:', err.message);
          } else {
            try {
              await UserFeedActions.findOneAndUpdate(
                { userId },
                { $push: { downloadedFeeds: { feedId, downloadedAt: new Date() } } },
                { upsert: true }
              );
              await logUserActivity({
                userId,
                actionType: 'DOWNLOAD_POST',
                targetId: feedId,
                targetModel: 'Feed',
                metadata: { platform: 'web', type: 'politics' },
              });
            } catch (e) {
              console.error('[PoliticsDL] Activity record error:', e.message);
            }
          }
          cleanup();
        });
      })
      .save(finalOutputPath);

  } catch (err) {
    console.error('[PoliticsDL] System error:', err.message);
    if (!res.headersSent) res.status(500).json({ error: err.message });
    cleanup();
  }
};

exports.requestDownloadFeed = async (req, res) => {
  const userId = req.Id || req.body.userId || req.query.userId;
  const feedId = req.params.feedId;

  if (!userId) return res.status(400).json({ message: "userId is required" });
  if (!feedId) return res.status(400).json({ message: "feedId is required" });

  try {
    // 2. CHECK DAILY DOWNLOAD LIMIT
    const status = await checkUserDownloadStatus(userId, feedId);
    if (!status.allowed) {
      return res.status(403).json({ message: `Daily download limit reached (Max ${status.limit} feeds per day)` });
    }

    // 3. FETCH FEED
    const feed = await Feeds.findById(feedId).lean();
    if (!feed) {
      return res.status(404).json({ message: "Feed not found" });
    }

    // 4. FETCH VIEWER PROFILE
    const [viewerProfile, userRecord] = await Promise.all([
      ProfileSettings.findOne({ userId: userId }).lean(),
      User.findById(userId).select('email userName').lean()
    ]);

    if (!viewerProfile) {
      console.warn(`[DownloadRequest] Profile not found for userId: ${userId} `);
    }

    // Combine metadata: Use provided override or feed's own metadata
    const metadataToUse = feed.designMetadata || {};

    // Add Job to Queue
    const job = await downloadQueue.add({
      feed,
      userId,
      viewer: {
        userName: viewerProfile?.userName || userRecord?.userName || viewerProfile?.name || "User",
        profileAvatar: getMediaUrl(viewerProfile?.modifyAvatar || viewerProfile?.profileAvatar || null),
        name: viewerProfile?.name || "",
        email: userRecord?.email || "",
        phone: viewerProfile?.phoneNumber || ""
      },
      designMetadata: metadataToUse,
    }, {
      attempts: 2,
      backoff: 5000,
      removeOnComplete: { age: 3600 }, // Keep in redis for 1 hour so status can be checked
      removeOnFail: false
    });



    // Record Activity
    await logUserActivity({
      userId,
      actionType: "DOWNLOAD_POST_REQUEST",
      targetId: feedId,
      targetModel: "Feed",
      metadata: { platform: "web", jobId: job.id }
    });

    res.status(200).json({
      success: true,
      message: "Download processing started",
      jobId: job.id,
      status: "queued"
    });

  } catch (err) {
    console.error("Error in requestDownloadFeed:", err);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Check Job Status
exports.getDownloadJobStatus = async (req, res) => {
  const { jobId } = req.params;
  if (!jobId) return res.status(400).json({ message: "jobId required" });

  try {
    const job = await downloadQueue.getJob(jobId);
    if (!job) {
      console.warn(`[JobStatus] Job ${jobId} not found in queue.`);
      return res.status(404).json({ message: "Job not found" });
    }

    const state = await job.getState();
    const progress = job.progress();


    let result = null;
    if (state === 'completed') {
      result = job.returnvalue; // { downloadUrl: ... }
      if (result && result.downloadUrl) {
        result.downloadUrl = getMediaUrl(result.downloadUrl);
      }
    }

    res.json({
      jobId,
      status: state, // queued, active, completed, failed
      progress,
      result
    });
  } catch (err) {
    console.error("Error checking job status:", err);
    res.status(500).json({ message: "Internal server error" });
  }
};







exports.shareFeed = async (req, res) => {
  const userId = req.Id || req.body.userId;
  const { feedId, shareChannel, shareTarget } = req.body;

  if (!userId || !feedId) {
    return res.status(400).json({ message: "userId and feedId are required" });
  }

  try {
    const user = await User.findById(userId).lean();
    if (!user) return res.status(404).json({ message: "User not found" });

    const feed = await Feeds.findById(feedId).lean();
    if (!feed) return res.status(404).json({ message: "Feed not found" });

    // SAVE SHARE ACTION
    await UserFeedActions.findOneAndUpdate(
      { userId },
      {
        $push: {
          sharedFeeds: {
            feedId,
            shareChannel: shareChannel || "copy_link",
            shareTarget: shareTarget || null,
            sharedAt: new Date()
          }
        }
      },
      { upsert: true }
    );

    // Update Feed stats
    await Feeds.findByIdAndUpdate(feedId, { $inc: { "engagementStats.shares": 1 } });
    // Update Analytics
    await UserFeedAnalytics.findOneAndUpdate(
      { userId, feedId }, 
      { shared: true },
      { upsert: true }
    );

    await logUserActivity({
      userId,
      actionType: "SHARE_POST",
      targetId: feedId,
      targetModel: "Feed",
      metadata: { platform: "web" },
    });

    res.status(200).json({
      message: "Share recorded successfully",
    });

  } catch (err) {
    console.error("Error sharing feed:", err);
    res.status(500).json({ message: "Internal server error" });
  }
};





exports.generateShareLink = async (req, res) => {
  const { feedId } = req.params;

  try {
    // Find the feed
    const feed = await Feeds.findById(feedId).lean();
    if (!feed) {
      return res.status(404).json({ message: "Feed not found" });
    }

    // Get user info from ProfileSettings using createdByAccount
    const profileSettings = await ProfileSettings.findOne({
      accountId: feed.createdByAccount
    }).select('userName name profileAvatar').lean();

    // Get username - prioritize userName, then name
    let userName = 'User';
    let profileAvatar = null;

    if (profileSettings) {
      userName = profileSettings.userName || profileSettings.name || 'User';
      profileAvatar = profileSettings.profileAvatar;
    }

    // Generate OG image URL based on media type
    let ogImageUrl = '';
    let directMediaUrl = feed.contentUrl;
    let mediaType = feed.type || 'image';

    // IMPORTANT: Make sure image URLs are publicly accessible and optimized for OG tags

    // Handle Cloudinary images
    if (feed.contentUrl && feed.contentUrl.includes('cloudinary.com')) {
      // Cloudinary - optimize for OG tags (1200x630 is ideal for Facebook/WhatsApp)
      ogImageUrl = feed.contentUrl.replace('/upload/', '/upload/c_fill,w_1200,h_630,f_auto,q_auto:best/');
      directMediaUrl = feed.contentUrl;
      mediaType = 'image';
    }
    // Handle local server images/videos
    else if (feed.contentUrl) {
      // For local server, make sure the URL is publicly accessible
      ogImageUrl = feed.contentUrl;
      directMediaUrl = feed.contentUrl;
      mediaType = feed.type || 'image';

      // If it's a video and we have thumbnail
      if (feed.type === 'video') {
        // Try to get thumbnail from files array
        if (feed.files && feed.files.length > 0 && feed.files[0].thumbnail) {
          ogImageUrl = `${process.env.BACKEND_URL}/media/${feed.files[0].thumbnail}`;
        }
        // Try to find _thumb.jpg file
        else if (feed.files && feed.files.length > 0 && feed.files[0].localPath) {
          const videoPath = feed.files[0].localPath;
          const baseName = path.basename(videoPath, path.extname(videoPath));
          const thumbPath = path.join(path.dirname(videoPath), `${baseName} _thumb.jpg`);

          if (fs.existsSync(thumbPath)) {
            const relativePath = thumbPath.split('/uploads/').pop();
            if (relativePath) {
              ogImageUrl = `${process.env.BACKEND_URL}/uploads/${relativePath}`;
            }
          } else {
            // Use video thumbnail endpoint as fallback
            ogImageUrl = `${process.env.BACKEND_URL}/api/feed/video-thumbnail/${feedId}`;
          }
        }
      }
    }

    // Fallback: Check files array
    if (!ogImageUrl && feed.files && feed.files.length > 0) {
      const firstFile = feed.files[0];
      if (firstFile.url) {
        ogImageUrl = firstFile.url;
        directMediaUrl = firstFile.url;
      }
      // For video thumbnails
      if (feed.type === 'video' && firstFile.thumbnail) {
        ogImageUrl = `${process.env.BACKEND_URL}/media/${firstFile.thumbnail}`;
      }
    }

    // Fallback: Check localPath
    if (!ogImageUrl && feed.localPath) {
      const pathPart = feed.localPath.split('/media/').pop();
      if (pathPart) {
        ogImageUrl = `${process.env.BACKEND_URL}/media/${pathPart}`;
        directMediaUrl = ogImageUrl;
      }
    }

    // ULTIMATE FALLBACK: Use default OG image
    if (!ogImageUrl || !ogImageUrl.startsWith('http')) {
      ogImageUrl = `${process.env.BACKEND_URL}/default-og-image.jpg`;
    }

    // IMPORTANT: Validate the OG image URL is accessible
    // You might want to check if the image exists and is publicly accessible

    // Get description - use actual caption if available
    const actualCaption = feed.dec || feed.caption || '';




    const appLink = `prithu://share/post/${feedId}`;
    const playStoreUrl = "https://play.google.com/store/apps/details?id=com.dlktechnologies.Prithu";

    res.json({
      appLink,
      playStoreUrl,
      shareUrl: appLink,
      caption: actualCaption,
      userName,
      mediaType,
      directMediaUrl: getMediaUrl(directMediaUrl),
      profileAvatar: getMediaUrl(profileAvatar)
    });



  } catch (err) {
    console.error("Error generating share link:", err);
    res.status(500).json({
      message: "Internal server error",
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
};



exports.getVideoThumbnail = async (req, res) => {
  const { feedId } = req.params;

  try {
    const feed = await Feeds.findById(feedId).lean();

    if (!feed || feed.type !== 'video') {
      return serveDefaultThumbnail(res);
    }

    // Priority 1: Check for existing thumbnail in files
    if (feed.files?.[0]?.thumbnail) {
      const thumbnailPath = path.join(__dirname, '../../uploads', feed.files[0].thumbnail);
      if (fs.existsSync(thumbnailPath)) {
        res.setHeader('Cache-Control', 'public, max-age=31536000'); // 1 year cache
        res.setHeader('Content-Type', 'image/jpeg');
        return res.sendFile(thumbnailPath);
      }
    }

    // Priority 2: Check for _thumb.jpg file
    if (feed.files?.[0]?.localPath) {
      const videoPath = feed.files[0].localPath;
      const baseName = path.basename(videoPath, path.extname(videoPath));
      const thumbName = `${baseName}_thumb.jpg`;
      const thumbPath = path.join(path.dirname(videoPath), thumbName);

      if (fs.existsSync(thumbPath)) {
        res.setHeader('Cache-Control', 'public, max-age=31536000');
        res.setHeader('Content-Type', 'image/jpeg');
        return res.sendFile(thumbPath);
      }
    }

    // Priority 3: Check contentUrl for Cloudinary
    if (feed.contentUrl && feed.contentUrl.includes('cloudinary.com')) {
      const cloudinaryThumb = feed.contentUrl.replace('/upload/', '/upload/w_1200,h_630,c_fill,q_auto:best/') + '.jpg';
      return res.redirect(cloudinaryThumb);
    }

    // Priority 4: Generate thumbnail on the fly (if you have ffmpeg)
    if (feed.files?.[0]?.localPath && fs.existsSync(feed.files[0].localPath)) {
      try {
        const thumbnailPath = await generateVideoThumbnail(feed.files[0].localPath);
        if (thumbnailPath && fs.existsSync(thumbnailPath)) {
          res.setHeader('Cache-Control', 'public, max-age=31536000');
          res.setHeader('Content-Type', 'image/jpeg');
          return res.sendFile(thumbnailPath);
        }
      } catch (err) {
        console.warn('Failed to generate thumbnail:', err.message);
      }
    }

    // Final fallback
    return serveDefaultThumbnail(res);

  } catch (err) {
    console.error("Error getting video thumbnail:", err);
    return serveDefaultThumbnail(res);
  }
};

async function generateVideoThumbnail(videoPath) {
  // This requires ffmpeg to be installed

  const thumbPath = videoPath.replace(path.extname(videoPath), '_thumb.jpg');

  return new Promise((resolve, reject) => {
    ffmpeg(videoPath)
      .screenshots({
        timemarks: ['00:00:01'], // Capture at 1 second
        filename: path.basename(thumbPath),
        folder: path.dirname(thumbPath),
        size: '1200x630'
      })
      .on('end', () => resolve(thumbPath))
      .on('error', reject);
  });
}

function serveDefaultThumbnail(res) {
  const defaultPath = path.join(__dirname, '../../public/default-video-thumbnail.jpg');
  if (fs.existsSync(defaultPath)) {
    res.setHeader('Cache-Control', 'public, max-age=86400'); // 1 day cache
    return res.sendFile(defaultPath);
  }

  // SVG placeholder as last resort
  const svgPlaceholder = `
    <svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
      <rect width="1200" height="630" fill="#3B82F6"/>
      <text x="600" y="300" font-family="Arial" font-size="40" fill="white" text-anchor="middle">
        ${process.env.APP_NAME || 'Video'}
      </text>
      <circle cx="600" cy="200" r="50" fill="white" opacity="0.8"/>
      <polygon points="580,180 580,220 620,200" fill="#3B82F6"/>
    </svg>
  `;

  res.setHeader('Content-Type', 'image/svg+xml');
  res.send(svgPlaceholder);
}

async function getOptimizedOGMedia(feed) {
  let ogImageUrl = '';
  let ogVideoUrl = '';
  let directMediaUrl = feed.contentUrl;

  // Handle Cloudinary images
  if (feed.contentUrl && feed.contentUrl.includes('cloudinary.com')) {
    ogImageUrl = feed.contentUrl.replace('/upload/', '/upload/c_fill,w_1200,h_630,f_auto,q_auto:best/');
    directMediaUrl = feed.contentUrl;
  }
  // Handle local server images/videos
  else if (feed.contentUrl) {
    ogImageUrl = feed.contentUrl;
    directMediaUrl = feed.contentUrl;

    // If it's a video and we have thumbnail
    if (feed.type === 'video') {
      if (feed.files && feed.files.length > 0 && feed.files[0].thumbnail) {
        ogImageUrl = `${process.env.BACKEND_URL}/media/${feed.files[0].thumbnail}`;
      }
      else if (feed.files && feed.files.length > 0 && feed.files[0].localPath) {
        const videoPath = feed.files[0].localPath;
        const baseName = path.basename(videoPath, path.extname(videoPath));
        const thumbPath = path.join(path.dirname(videoPath), `${baseName}_thumb.jpg`);

        if (fs.existsSync(thumbPath)) {
          const relativePath = thumbPath.split('/uploads/').pop();
          if (relativePath) {
            ogImageUrl = `${process.env.BACKEND_URL}/uploads/${relativePath}`;
          }
        } else {
          ogImageUrl = `${process.env.BACKEND_URL}/api/feed/video-thumbnail/${feed._id}`;
        }
      }
    }
  }

  // Fallback: Check files array
  if (!ogImageUrl && feed.files && feed.files.length > 0) {
    const firstFile = feed.files[0];
    if (firstFile.url) {
      ogImageUrl = firstFile.url;
      directMediaUrl = firstFile.url;
    }
    if (feed.type === 'video' && firstFile.thumbnail) {
      ogImageUrl = `${process.env.BACKEND_URL}/media/${firstFile.thumbnail}`;
    }
  }

  // Fallback: Check localPath
  if (!ogImageUrl && feed.localPath) {
    const pathPart = feed.localPath.split('/media/').pop();
    if (pathPart) {
      ogImageUrl = `${process.env.BACKEND_URL}/media/${pathPart}`;
      directMediaUrl = ogImageUrl;
    }
  }

  // ULTIMATE FALLBACK: Use default OG image
  if (!ogImageUrl || !ogImageUrl.startsWith('http')) {
    ogImageUrl = `${process.env.BACKEND_URL}/default-og-image.jpg`;
  }

  // Set ogVideoUrl for videos
  if (feed.type === 'video') {
    ogVideoUrl = directMediaUrl;
  }

  return { ogImageUrl, ogVideoUrl };
}




exports.sharePostOG = async (req, res) => {
  const { feedId } = req.params;

  try {
    if (!feedId || !mongoose.Types.ObjectId.isValid(feedId)) {
      return res.status(404).send(getDefaultOGPage());
    }

    const feed = await Feeds.findById(feedId).lean();
    if (!feed || feed.isDeleted) {
      return res.status(404).send(getDefaultOGPage());
    }

    // Determine absolute media URLs
    const mediaUrl = getMediaUrl(feed.mediaUrl || feed.contentUrl || "");
    const thumbnailUrl = getMediaUrl(
      feed.files?.[0]?.thumbnail ||
      feed.storage?.urls?.thumbnail ||
      feed.thumbnailUrl ||
      feed.mediaUrl ||
      ""
    );

    const isVideo = feed.type === 'video' || (feed.mediaUrl && feed.mediaUrl.match(/\.(mp4|mov|webm)$/i));
    const title = feed.title || feed.caption || "Check out this post on Prithu";
    const description = feed.caption || "Create and download branded social media posts, festival posters & business visiting cards on Prithu.";
    const shareUrl = `https://www.prithu.app/share/post/${feedId}`;
    const deepLinkUrl = `prithu://share/post/${feedId}`;
    const playStoreUrl = "https://play.google.com/store/apps/details?id=com.dlktechnologies.Prithu";
    const androidIntentUrl = `intent://share/post/${feedId}#Intent;scheme=prithu;package=com.dlktechnologies.Prithu;S.browser_fallback_url=${encodeURIComponent(playStoreUrl)};end`;

    // Detect crawler/bot
    const ua = req.headers["user-agent"] || "";
    const isCrawler = /facebookexternalhit|Twitterbot|WhatsApp|Telegram|bot|crawler|preview|linkedinbot|Slackbot|SkypeUriPreview|discordapp/i.test(ua);

    if (isCrawler) {
      // 🤖 Crawler -> Return Complete Open Graph & App Link Meta Tags
      return res.status(200).send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${title} | Prithu</title>
  <meta name="description" content="${description}" />
  
  <!-- Open Graph -->
  <meta property="og:site_name" content="Prithu" />
  <meta property="og:title" content="${title}" />
  <meta property="og:description" content="${description}" />
  <meta property="og:image" content="${thumbnailUrl}" />
  <meta property="og:image:secure_url" content="${thumbnailUrl}" />
  <meta property="og:url" content="${shareUrl}" />
  ${isVideo ? `
  <meta property="og:type" content="video.other" />
  <meta property="og:video" content="${mediaUrl}" />
  <meta property="og:video:secure_url" content="${mediaUrl}" />
  <meta property="og:video:type" content="video/mp4" />
  ` : `
  <meta property="og:type" content="article" />
  `}

  <!-- Twitter -->
  <meta name="twitter:card" content="${isVideo ? 'player' : 'summary_large_image'}" />
  <meta name="twitter:title" content="${title}" />
  <meta name="twitter:description" content="${description}" />
  <meta name="twitter:image" content="${thumbnailUrl}" />
  ${isVideo ? `<meta name="twitter:player" content="${mediaUrl}" />` : ''}

  <!-- App Links / Deep Links -->
  <meta property="al:android:url" content="${deepLinkUrl}" />
  <meta property="al:android:package" content="com.dlktechnologies.Prithu" />
  <meta property="al:android:app_name" content="Prithu" />
  <meta property="al:web:url" content="${shareUrl}" />
</head>
<body></body>
</html>`);
    }

    // 👤 Real Mobile / Desktop User -> Instant App Launch & Play Store Redirect
    return res.status(200).send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>${title} | Prithu</title>
  
  <!-- Open Graph -->
  <meta property="og:site_name" content="Prithu" />
  <meta property="og:title" content="${title}" />
  <meta property="og:description" content="${description}" />
  <meta property="og:image" content="${thumbnailUrl}" />
  <meta property="og:url" content="${shareUrl}" />
  <meta property="al:android:url" content="${deepLinkUrl}" />
  <meta property="al:android:package" content="com.dlktechnologies.Prithu" />
  <meta property="al:android:app_name" content="Prithu" />

  <script>
    (function() {
      var feedId = "${feedId}";
      var appScheme = "${deepLinkUrl}";
      var playStore = "${playStoreUrl}";
      var intentUrl = "${androidIntentUrl}";
      var isAndroid = /android/i.test(navigator.userAgent);
      var isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);

      if (isAndroid) {
        window.location.href = intentUrl;
      } else if (isIOS) {
        window.location.href = appScheme;
        setTimeout(function() {
          window.location.href = playStore;
        }, 1500);
      } else {
        window.location.href = playStore;
      }
    })();
  </script>

  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: #090d16;
      color: #ffffff;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      text-align: center;
      padding: 20px;
    }
    .card {
      background: #111827;
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 24px;
      padding: 32px 24px;
      max-width: 380px;
      width: 100%;
      box-shadow: 0 20px 50px rgba(0, 0, 0, 0.7);
      display: flex;
      flex-direction: column;
      align-items: center;
    }
    .logo {
      width: 68px;
      height: 68px;
      border-radius: 18px;
      margin-bottom: 16px;
      background: #1e293b;
    }
    h2 {
      font-size: 20px;
      font-weight: 800;
      color: #22c55e;
      margin-bottom: 8px;
    }
    p {
      color: #94a3b8;
      font-size: 13.5px;
      margin-bottom: 24px;
      line-height: 1.5;
    }
    .btn-open {
      background: linear-gradient(90deg, #22c55e, #16a34a);
      color: #ffffff;
      text-decoration: none;
      font-weight: 800;
      font-size: 15px;
      padding: 14px 20px;
      border-radius: 28px;
      width: 100%;
      display: block;
      box-shadow: 0 6px 20px rgba(34, 197, 94, 0.4);
      margin-bottom: 12px;
    }
    .btn-store {
      background: rgba(255, 255, 255, 0.06);
      border: 1px solid rgba(255, 255, 255, 0.15);
      color: #38bdf8;
      text-decoration: none;
      font-weight: 700;
      font-size: 13.5px;
      padding: 12px 20px;
      border-radius: 24px;
      width: 100%;
      display: block;
    }
  </style>
</head>
<body>
  <div class="card">
    <img class="logo" src="https://prithu.app/logo/logo.png" onerror="this.src='/logo/logo.png'" alt="Prithu" />
    <h2>Opening Prithu App...</h2>
    <p>Taking you directly to the post in the Prithu App.</p>
    <a href="${androidIntentUrl}" class="btn-open">📲 Open in Prithu App</a>
    <a href="${playStoreUrl}" class="btn-store">⚡ Download on Google Play</a>
  </div>
</body>
</html>`);
  } catch (err) {
    console.error("OG Share Error:", err);
    return res.status(500).send(getDefaultOGPage());
  }
};

function getDefaultOGPage() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Prithu - Branded Social Media & Business Poster App</title>
  <style>
    body { background: #090d16; color: #fff; font-family: sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; margin: 0; text-align: center; padding: 20px; }
    h1 { color: #22c55e; margin-bottom: 10px; font-size: 28px; }
    p { color: #94a3b8; font-size: 15px; margin-bottom: 24px; max-width: 400px; }
    a { background: #22c55e; color: #fff; text-decoration: none; padding: 12px 24px; border-radius: 25px; font-weight: bold; font-size: 15px; }
  </style>
</head>
<body>
  <h1>Prithu App</h1>
  <p>Create & share customized festival, business and daily social media posters with your visiting card.</p>
  <a href="https://play.google.com/store/apps/details?id=com.dlktechnologies.Prithu">Download on Google Play</a>
</body>
</html>`;
}






function getDefaultOGPage() {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Post not available</title>
  <meta property="og:title" content="Post not available" />
  <meta property="og:description" content="This post is private or no longer exists." />
  <meta property="og:image" content="${process.env.BACKEND_URL}/default-og-image.jpg" />
  <meta property="og:type" content="website" />
</head>
<body>
  <h3>Post not available</h3>
</body>
</html>
  `;
}

function getErrorOGPage() {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Something went wrong</title>
  <meta property="og:title" content="Something went wrong" />
  <meta property="og:description" content="Unable to load this post." />
  <meta property="og:image" content="${process.env.BACKEND_URL}/default-og-image.jpg" />
  <meta property="og:type" content="website" />
</head>
<body>
  <h3>Something went wrong</h3>
</body>
</html>
  `;
}










exports.postComment = async (req, res) => {
  try {
    const userId = req.Id || req.body.userId;
    const { feedId, commentText, parentCommentId } = req.body;

    if (!userId || !feedId || !commentText?.trim()) {
      return res.status(400).json({ message: "Invalid input" });
    }

    if (parentCommentId && !(await UserComment.exists({ _id: parentCommentId }))) {
      return res.status(400).json({ message: "Parent comment not found" });
    }

    const newComment = await UserComment.create({
      userId,
      feedId,
      commentText: commentText.trim(),
      parentCommentId: parentCommentId || null,
      createdAt: new Date(),
    });

    const userProfile = await ProfileSettings.findOne({ userId })
      .select("userName profileAvatar")
      .lean();
    // 🔹 Notify feed owner
    const feed = await Feeds.findById(feedId)
      .select("createdByAccount contentUrl roleRef")
      .lean();


    await logUserActivity({
      userId,
      actionType: "COMMENT",
      targetId: feedId,
      targetModel: "Feed",
      metadata: { platform: "web" },
    });

    // Update Feed stats
    await Feeds.findByIdAndUpdate(feedId, { $inc: { "engagementStats.comments": 1 } });
    // Update Analytics
    await UserFeedAnalytics.findOneAndUpdate(
      { userId, feedId }, 
      { commented: true },
      { upsert: true }
    );


    if (feed && feed.createdByAccount.toString() !== userId.toString()) {
      await createAndSendNotification({
        senderId: userId,
        receiverId: feed.createdByAccount,
        type: "COMMENT",
        title: "Commented on your Photo 💬",
        message: `"${commentText.slice(0, 50)}..."`,
        entityId: feed._id,
        entityType: "Feed",
        image: feed.contentUrl || "",
        roleRef: feed.roleRef || "User", // optional
      });
    }


    res.status(201).json({
      message: "Comment posted successfully",
      comment: {
        ...newComment.toObject(),
        timeAgo: feedTimeCalculator(newComment.createdAt),
        username: userProfile?.userName || "Unknown User",
        avatar: userProfile?.profileAvatar || null,
      },
    });
  } catch (err) {
    console.error("Error posting comment:", err);
    res.status(500).json({ message: "Internal server error" });
  }
};


exports.likeReplyComment = async (req, res) => {
  try {
    const { replyCommentId } = req.body;
    const userIdRaw = req.Id;

    if (!userIdRaw) return res.status(401).json({ message: "Unauthorized" });
    if (!replyCommentId) return res.status(400).json({ message: "replyCommentId is required" });

    const userId = new mongoose.Types.ObjectId(userIdRaw);
    const replyId = new mongoose.Types.ObjectId(replyCommentId);

    // check if already liked
    const existing = await UserReplyComment.findOne({ _id: replyId, likes: userId }).lean();

    if (existing) {
      // unlike
      const updated = await UserReplyComment.findByIdAndUpdate(replyId, {
        $pull: { likes: userId },
        $inc: { likeCount: -1 }
      }, { new: true }).lean();

      return res.json({ liked: false, likeCount: updated ? (updated.likeCount || (Array.isArray(updated.likes) ? updated.likes.length : 0)) : 0 });
    }

    // like
    const updated = await UserReplyComment.findByIdAndUpdate(replyId, {
      $addToSet: { likes: userId },
      $inc: { likeCount: 1 }
    }, { new: true }).lean();

    return res.json({ liked: true, likeCount: updated ? (updated.likeCount || (Array.isArray(updated.likes) ? updated.likes.length : 0)) : 1 });
  } catch (err) {
    console.error("likeReplyComment error:", err);
    return res.status(500).json({ message: "Server error" });
  }
};



exports.likeMainComment = async (req, res) => {
  const { commentId } = req.body;
  const userIdRaw = req.Id;

  if (!userIdRaw)
    return res.status(401).json({ message: "Unauthorized" });

  if (!commentId)
    return res.status(400).json({ message: "commentId is required" });

  try {
    const userId = new mongoose.Types.ObjectId(userIdRaw);

    const filter = {
      userId,
      commentId: new mongoose.Types.ObjectId(commentId),
    };

    // Check if already liked
    const existing = await CommentLike.findOne(filter);

    if (existing) {
      // Unlike
      await CommentLike.deleteOne(filter);
      return res.json({ liked: false, message: "Comment unliked" });
    }

    // Like
    await CommentLike.create(filter);

    return res.json({ liked: true, message: "Comment liked" });

  } catch (err) {
    console.error("Main Comment Like Error:", err);
    return res.status(500).json({ message: "Server error" });
  }
};


exports.postReplyComment = async (req, res) => {
  try {
    const userId = req.Id || req.body.userId;
    const { commentText, parentCommentId, parentReplyId } = req.body;



    if (!userId || !commentText?.trim()) {
      return res.status(400).json({ message: "Invalid input" });
    }

    let finalParentCommentId = parentCommentId;
    let notificationReceiverId = null;
    let feedId = null;

    // If this is a nested reply (reply to another reply)
    if (parentReplyId) {
      const parentReply = await UserReplyComment.findById(parentReplyId)
        .select("userId parentCommentId")
        .lean();

      if (!parentReply) {
        return res.status(400).json({ message: "Parent reply not found" });
      }

      finalParentCommentId = parentReply.parentCommentId;
      notificationReceiverId = parentReply.userId;
    } else {
      // Regular reply to main comment
      if (!parentCommentId) {
        return res.status(400).json({ message: "Parent comment ID is required" });
      }

      const parentComment = await UserComment.findById(parentCommentId)
        .select("userId feedId")
        .lean();

      if (!parentComment) {
        return res.status(400).json({ message: "Parent comment not found" });
      }

      notificationReceiverId = parentComment.userId;
      feedId = parentComment.feedId;
    }

    // Create the reply
    const newReply = await UserReplyComment.create({
      userId,
      replyText: commentText.trim(),
      parentCommentId: finalParentCommentId,
      parentReplyId: parentReplyId || undefined, // Only set if it's a nested reply
      createdAt: new Date(),
    });

    // Get user profile for response
    const userProfile = await ProfileSettings.findOne({ userId })
      .select("userName profileAvatar")
      .lean();

    // 🔹 Send notification if receiver is different from sender
    if (notificationReceiverId && notificationReceiverId.toString() !== userId.toString()) {
      // Get feed ID if not already available
      if (!feedId) {
        const parentComment = await UserComment.findById(finalParentCommentId)
          .select("feedId")
          .lean();
        feedId = parentComment?.feedId;
      }

      if (feedId) {
        const feed = await Feeds.findById(feedId).select("contentUrl").lean();

        await createAndSendNotification({
          senderId: userId,
          receiverId: notificationReceiverId,
          type: "COMMENT",
          title: parentReplyId ? "New Reply to Your Comment 💬" : "New Reply 💬",
          message: commentText.slice(0, 50) + "...",
          entityId: feedId,
          entityType: "Comment",
          image: feed?.contentUrl || "",
        });
      }
    }

    res.status(201).json({
      message: "Reply posted successfully",
      reply: {
        ...newReply.toObject(),
        timeAgo: feedTimeCalculator(newReply.createdAt),
        username: userProfile?.userName || "Unknown User",
        avatar: userProfile?.profileAvatar || null,
        replyId: newReply._id,
        isNested: !!parentReplyId,
      },
    });
  } catch (err) {
    console.error("Error posting reply:", err);
    res.status(500).json({ message: "Internal server error" });
  }
};








exports.postView = async (req, res) => {
  const userId = req.Id || req.body.userId; // optional, for anonymous views
  const { feedId, watchDuration } = req.body;

  if (!feedId) return res.status(400).json({ message: "feedId is required" });

  try {
    // Create a new view entry
    const view = await UserView.create({
      userId: userId || null, // allow anonymous views
      feedId,
      watchDuration: watchDuration || 0
    });

    res.status(201).json({
      message: "View recorded successfully",
      view
    });
  } catch (err) {
    console.error("Error recording view:", err);
    res.status(500).json({ message: "Internal server error" });
  }
};



exports.getUserSavedFeeds = async (req, res) => {
  try {
    const userId = req.Id || req.body.userId;


    // 1️⃣ Validate
    if (!userId) {
      return res.status(400).json({ message: "userId or accountId is required" });
    }

    // 2️⃣ Get actions doc for this user/account
    const userActions = await UserFeedActions.findOne({ userId }).lean();

    if (!userActions || userActions.savedFeeds.length === 0) {
      return res.status(200).json({ savedFeeds: [] });
    }

    const savedFeedIds = userActions.savedFeeds.map((f) => f.feedId);

    // 3️⃣ Fetch feed details (FAST — uses _id index)
    const feeds = await Feeds.find({ _id: { $in: savedFeedIds } })
      .select("_id type contentUrl")
      .lean();

    // 4️⃣ FAST like count using aggregate with indexed field
    const likesAggregation = await UserFeedActions.aggregate([
      { $unwind: "$likedFeeds" },
      {
        $match: {
          "likedFeeds.feedId": { $in: savedFeedIds },
        },
      },
      {
        $group: {
          _id: "$likedFeeds.feedId",
          likeCount: { $sum: 1 },
        },
      },
    ]);

    // Build a map for O(1) lookup
    const likeMap = {};
    likesAggregation.forEach((l) => {
      likeMap[l._id.toString()] = l.likeCount;
    });

    // 5️⃣ Final response combining savedAt + feed data + likeCount
    const result = feeds.map((feed) => {
      const savedData = userActions.savedFeeds.find(
        (f) => f.feedId.toString() === feed._id.toString()
      );

      return {
        _id: feed._id,
        type: feed.type,
        contentUrl: feed.contentUrl || null,
        savedAt: savedData?.savedAt,
        likeCount: likeMap[feed._id.toString()] || 0,
      };
    });

    return res.status(200).json({ savedFeeds: result });

  } catch (error) {
    console.error("❌ Error getUserSavedFeeds:", error);
    return res.status(500).json({ message: "Server error" });
  }
};




exports.getUserDownloadedFeeds = async (req, res) => {
  const userId = req.Id || req.body.userId;

  if (!userId) return res.status(400).json({ message: "userId is required" });

  try {
    const userActions = await UserFeedActions.findOne({ userId })
      .populate("downloadedFeeds.feedId", "contentUrl fileUrl downloadUrl type")
      .lean();

    if (!userActions || !userActions.downloadedFeeds.length) {
      return res.status(404).json({ message: "No downloaded feeds found" });
    }

    // Map with timestamp
    const downloadedFeeds = userActions.downloadedFeeds.map(item => {
      const feed = item.feedId;
      if (!feed) return null;

      const folder = feed.type === "video" ? "videos" : "images";
      const url =
        feed.downloadUrl ||
        feed.fileUrl ||
        (feed.contentUrl
          ? `${process.env.BACKEND_URL}/uploads/${folder}/${path.basename(feed.contentUrl)}`
          : null);

      return {
        feedId: feed._id,
        url,
        type: feed.type,
        downloadedAt: item.downloadedAt, // ✅ include timestamp
      };
    }).filter(Boolean);

    res.status(200).json({
      message: "Downloaded feeds retrieved successfully",
      count: downloadedFeeds.length,
      downloadedFeeds,
    });
  } catch (err) {
    console.error("Error fetching downloaded feeds:", err);
    res.status(500).json({ message: "Internal server error" });
  }
};


exports.getUserLikedFeeds = async (req, res) => {
  const userId = req.Id || req.body.userId;
  if (!userId) {
    return res.status(400).json({ success: false, message: "userId is required" });
  }

  try {
    const userIdObj = new mongoose.Types.ObjectId(userId);

    // 1️⃣ FETCH VIEWER PROFILE & PRIVACY FOR FOOTER
    const ProfileVisibility = require("../../models/profileVisibilitySchema.js");
    const viewerProfile = await ProfileSettings.findOne({ userId: userIdObj })
      .select("name userName profileAvatar phoneNumber socialLinks privacy visibility modifyAvatar")
      .lean();

    let viewerVisibility = null;
    if (viewerProfile?.visibility) {
      viewerVisibility = await ProfileVisibility.findById(viewerProfile.visibility).lean();
    }

    const canShow = (rule) => rule === "public";
    let viewerSocialIcons = [];
    if (viewerProfile?.socialLinks && typeof viewerProfile.socialLinks === "object") {
      viewerSocialIcons = Object.entries(viewerProfile.socialLinks)
        .map(([platform, url]) => ({
          platform,
          url: typeof url === "string" ? url.trim() : "",
          visible: true,
        }))
        .filter((i) => i.url);
    }

    const safeSocialLinks = viewerSocialIcons.filter((icon) => {
      const masterRule = viewerVisibility?.socialIcons || "public";
      if (!canShow(masterRule)) return false;
      const platformRule = viewerVisibility?.[icon.platform] || "public";
      return canShow(platformRule) && icon.visible !== false && !!icon.url;
    });

    const footerVisibilityConfig = {
      showElements: {
        name: canShow(viewerVisibility?.name || "public"),
        email: canShow(viewerVisibility?.email || "private"),
        phone: canShow(viewerVisibility?.phoneNumber || "private"),
        socialIcons: safeSocialLinks.length > 0
      },
      socialIcons: safeSocialLinks.map((icon) => ({
        platform: icon.platform,
        visible: true,
        urlTemplate: icon.url
      }))
    };

    const viewer = {
      id: userIdObj,
      name: viewerProfile?.name || "User",
      userName: viewerProfile?.userName || "user",
      profileAvatar: viewerProfile?.modifyAvatar || viewerProfile?.profileAvatar || "https://via.placeholder.com/150",
      socialLinks: safeSocialLinks
    };

    // 2️⃣ AGGREGATION PIPELINE
    const likedFeedsRaw = await UserFeedActions.aggregate([
      { $match: { userId: userIdObj } },
      { $unwind: "$likedFeeds" },
      { $sort: { "likedFeeds.likedAt": -1 } },

      {
        $lookup: {
          from: "Feeds",
          localField: "likedFeeds.feedId",
          foreignField: "_id",
          as: "feed",
        },
      },
      { $unwind: "$feed" },
      {
        $match: {
          "feed.isDeleted": false,
          "feed.status": { $in: ["Published", "published"] }
        }
      },

      {
        $lookup: {
          from: "ProfileSettings",
          let: { creatorId: "$feed.postedBy.userId", role: "$feed.roleRef" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $or: [
                    { $and: [{ $eq: ["$$role", "Admin"] }, { $eq: ["$adminId", "$$creatorId"] }] },
                    { $and: [{ $eq: ["$$role", "Child_Admin"] }, { $eq: ["$childAdminId", "$$creatorId"] }] },
                    { $and: [{ $eq: ["$$role", "User"] }, { $eq: ["$userId", "$$creatorId"] }] }
                  ]
                }
              }
            },
            { $project: { name: 1, userName: 1, profileAvatar: 1, modifyAvatar: 1 } }
          ],
          as: "creatorProfile"
        }
      },
      { $unwind: { path: "$creatorProfile", preserveNullAndEmptyArrays: true } },

      {
        $lookup: {
          from: "UserFeedActions",
          let: { fid: "$feed._id" },
          pipeline: [
            { $unwind: "$likedFeeds" },
            { $match: { $expr: { $eq: ["$likedFeeds.feedId", "$$fid"] } } },
            { $count: "count" }
          ],
          as: "likesCountArr"
        }
      },
      {
        $lookup: {
          from: "UserFeedActions",
          let: { fid: "$feed._id" },
          pipeline: [
            { $unwind: "$sharedFeeds" },
            { $match: { $expr: { $eq: ["$sharedFeeds.feedId", "$$fid"] } } },
            { $count: "count" }
          ],
          as: "sharesCountArr"
        }
      },
      {
        $lookup: {
          from: "UserFeedActions",
          let: { fid: "$feed._id" },
          pipeline: [
            { $unwind: "$downloadedFeeds" },
            { $match: { $expr: { $eq: ["$downloadedFeeds.feedId", "$$fid"] } } },
            { $count: "count" }
          ],
          as: "downloadsCountArr"
        }
      },
      {
        $lookup: {
          from: "UserComments",
          let: { fid: "$feed._id" },
          pipeline: [
            { $match: { $expr: { $eq: ["$feedId", "$$fid"] } } },
            { $count: "count" }
          ],
          as: "commentsCountArr"
        }
      },

      {
        $lookup: {
          from: "UserFeedActions",
          let: { fid: "$feed._id" },
          pipeline: [
            { $match: { userId: userIdObj } },
            { $unwind: "$savedFeeds" },
            { $match: { $expr: { $eq: ["$savedFeeds.feedId", "$$fid"] } } }
          ],
          as: "savedCheck"
        }
      },

      {
        $project: {
          _id: 1,
          feed: 1,
          likedAt: "$likedFeeds.likedAt",
          creatorProfile: 1,
          likesCount: { $ifNull: [{ $arrayElemAt: ["$likesCountArr.count", 0] }, 0] },
          sharesCount: { $ifNull: [{ $arrayElemAt: ["$sharesCountArr.count", 0] }, 0] },
          downloadsCount: { $ifNull: [{ $arrayElemAt: ["$downloadsCountArr.count", 0] }, 0] },
          commentsCount: { $ifNull: [{ $arrayElemAt: ["$commentsCountArr.count", 0] }, 0] },
          isSaved: { $gt: [{ $size: "$savedCheck" }, 0] },
        }
      }
    ]);

    // 3️⃣ POST-PROCESSING (Normalize like feedsController.js)
    const enrichedFeeds = likedFeedsRaw.map(item => {
      const feed = item.feed;
      const isTemplateMode = feed.uploadType === 'template' || feed.uploadMode === 'template';
      const themeColor = feed.themeColor || { primary: "#2563eb", secondary: "#1e40af", accent: "#ffffff", text: "#000000" };

      let elements = feed.designMetadata?.overlayElements || [];
      if (!elements.some(el => el.type === 'calendar')) {
        elements = [...elements, {
          id: 'calendar', type: 'calendar', visible: true,
          xPercent: 70, yPercent: 20, wPercent: 20, hPercent: 15, zIndex: 10,
          calendarConfig: { headerColor: "#E54B35", bodyColor: "#F9F9F9" }
        }];
      }

      const designState = {
        elements,
        mediaDimensions: feed.designMetadata?.canvasSettings || { width: 1080, height: 1920 },
        audioConfig: feed.designMetadata?.audioConfig || null,
        themeColors: themeColor
      };

      return {
        ...feed,
        isLiked: true,
        isSaved: item.isSaved,
        feedId: feed._id,
        mediaUrl: getMediaUrl(feed.mediaUrl),
        files: (feed.files || []).map(f => ({
          ...f,
          url: getMediaUrl(f.url),
          thumbnail: getMediaUrl(f.thumbnail)
        })),
        likedAt: item.likedAt,
        creatorData: {
          id: feed.postedBy?.userId,
          userName: item.creatorProfile?.userName || "unknown",
          name: item.creatorProfile?.name || "User",
          avatar: item.creatorProfile?.modifyAvatar || item.creatorProfile?.profileAvatar || "https://via.placeholder.com/150",
          role: feed.roleRef || "User"
        },
        footerDisplay: isTemplateMode
          ? {
            ...(feed.designMetadata?.footerConfig || {}),
            ...footerVisibilityConfig,
            colors: themeColor
          }
          : { enabled: false },
        designState,
        stats: {
          likes: item.likesCount,
          shares: item.sharesCount,
          downloads: item.downloadsCount,
          comments: item.commentsCount
        },
        userInteractions: {
          isLiked: true,
          isSaved: item.isSaved,
          isFollowing: false // Simplified or lookup needed
        },
        viewer // Inject current viewer for personalization engine if needed
      };
    });

    res.status(200).json({
      success: true,
      message: "Liked feeds retrieved successfully",
      count: enrichedFeeds.length,
      feeds: enrichedFeeds,
      viewer
    });
  } catch (err) {
    console.error("Error fetching liked feeds:", err);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};








exports.userHideFeed = async (req, res) => {
  try {
    const userId = req.Id || req.body.userId;
    const postId = req.body.feedId || req.body.postId;

    if (!userId || !postId) {
      return res.status(400).json({ message: "User ID and Post ID are required" });
    }

    // 1️⃣ Check if hidden already (very fast when index exists)
    const already = await HiddenPost.findOne({ userId, postId }).lean();
    if (already) {
      return res.status(200).json({ message: "Post already hidden" });
    }

    // 2️⃣ Confirm user exists (light query)
    const userExists = await User.exists({ _id: userId });
    if (!userExists) {
      return res.status(404).json({ message: "User not found" });
    }

    // 3️⃣ Confirm feed exists (light query)
    const feedExists = await Feed.exists({ _id: postId });
    if (!feedExists) {
      return res.status(404).json({ message: "Feed not found" });
    }

    // 4️⃣ Hide post
    await HiddenPost.create({ userId, postId });

    return res.status(200).json({ message: "Post hidden successfully" });

  } catch (err) {
    console.error("Error hiding post:", err);

    // Handle duplicate index error safely
    if (err.code === 11000) {
      return res.status(200).json({ message: "Post already hidden" });
    }

    return res.status(500).json({
      message: "Server error",
      error: err.message,
    });
  }
};



exports.getUserCategory = async (req, res) => {
  try {
    const userId = req.Id || req.body.userId;


    if (!userId) {
      return res.status(400).json({ message: "User ID not found in token" });
    }

    // Get user category document
    const userCategory = await UserCategory.findOne({ userId });
    if (!userCategory) {
      return res.status(404).json({ message: "User categories not found" });
    }

    // Extract interested and non-interested IDs
    const interestedIds = userCategory.interestedCategories.map(c => c.categoryId);
    const nonInterestedIds = userCategory.nonInterestedCategories.map(c => c.categoryId);

    // Fetch category names
    const interestedCategories = await Category.find(
      { _id: { $in: interestedIds } },
      { _id: 1, name: 1 }
    );

    const nonInterestedCategories = await Category.find(
      { _id: { $in: nonInterestedIds } },
      { _id: 1, name: 1 }
    );

    return res.status(200).json({
      success: true,
      data: {
        interestedCategories,
        nonInterestedCategories,
      },
    });
  } catch (error) {
    console.error("Error in getUserCategory:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};





exports.removeNonInterestedCategory = async (req, res) => {
  try {
    const userId = req.user._id;
    const { categoryId } = req.body;

    if (!categoryId) {
      return res.status(400).json({ message: "categoryId is required" });
    }

    await UserCategory.updateOne(
      { userId },
      {
        $pull: { nonInterestedCategories: categoryId },
        $set: { [`updatedAtMap.${categoryId}`]: new Date() },
      }
    );

    return res.status(200).json({
      message: "Category removed from Not Interested",
      categoryId,
    });

  } catch (err) {
    console.error("❌ Error removing nonInterested category:", err);
    return res.status(500).json({ message: err.message });
  }
};





exports.getUserLikedFeedsForSaved = async (req, res) => {
  const userId = req.Id || req.body.userId;

  if (!userId) return res.status(400).json({ message: "userId is required" });

  try {
    const userIdObj = new mongoose.Types.ObjectId(userId);

    // 1️⃣ FETCH VIEWER PROFILE (LOGGED-IN USER)
    const viewerProfile = await ProfileSettings.findOne({ userId: userIdObj })
      .select("name userName profileAvatar phoneNumber socialLinks privacy modifyAvatar visibility")
      .lean();

    const viewer = {
      id: userIdObj,
      name: viewerProfile?.name || "User",
      userName: viewerProfile?.userName || "user",
      profileAvatar: getMediaUrl(viewerProfile?.modifyAvatar) || "https://via.placeholder.com/150",
    };

    const savedFeedsData = await UserFeedActions.aggregate([
      { $match: { userId: userIdObj } },
      { $unwind: "$savedFeeds" },
      { $sort: { "savedFeeds.savedAt": -1 } },

      // Join feed data
      {
        $lookup: {
          from: "Feeds",
          localField: "savedFeeds.feedId",
          foreignField: "_id",
          as: "feed",
        },
      },
      { $unwind: "$feed" },

      // Count total likes for each feed
      {
        $lookup: {
          from: "UserFeedActions",
          let: { feedId: "$savedFeeds.feedId" },
          pipeline: [
            { $unwind: "$likedFeeds" },
            { $match: { $expr: { $eq: ["$likedFeeds.feedId", "$$feedId"] } } },
            { $count: "totalLikes" },
          ],
          as: "likeStats",
        },
      },

      // Join ProfileSettings for latest avatar/name
      {
        $lookup: {
          from: "ProfileSettings",
          let: {
            adminId: { $cond: [{ $eq: ["$feed.roleRef", "Admin"] }, "$feed.postedBy.userId", null] },
            userId: { $cond: [{ $eq: ["$feed.roleRef", "User"] }, "$feed.postedBy.userId", null] },
            childAdminId: { $cond: [{ $eq: ["$feed.roleRef", "Child_Admin"] }, "$feed.postedBy.userId", null] }
          },
          pipeline: [
            {
              $match: {
                $expr: {
                  $or: [
                    { $eq: ["$adminId", { $cond: [{ $eq: [{ $type: "$$adminId" }, "string"] }, { $toObjectId: "$$adminId" }, "$$adminId"] }] },
                    { $eq: ["$childAdminId", { $cond: [{ $eq: [{ $type: "$$childAdminId" }, "string"] }, { $toObjectId: "$$childAdminId" }, "$$childAdminId"] }] },
                    { $eq: ["$userId", { $cond: [{ $eq: [{ $type: "$$userId" }, "string"] }, { $toObjectId: "$$userId" }, "$$userId"] }] }
                  ]
                }
              }
            },
            { $limit: 1 },
            { $project: { name: 1, userName: 1, profileAvatar: 1, modifyAvatar: 1 } }
          ],
          as: "creatorProfile"
        }
      },
      { $unwind: { path: "$creatorProfile", preserveNullAndEmptyArrays: true } },

      // Check if user liked it
      {
        $lookup: {
          from: "UserFeedActions",
          let: { fid: "$feed._id" },
          pipeline: [
            { $match: { userId: userIdObj } },
            { $unwind: "$likedFeeds" },
            { $match: { $expr: { $eq: ["$likedFeeds.feedId", "$$fid"] } } }
          ],
          as: "likedCheck"
        }
      },

      // Format output to match Saved Feeds schema
      {
        $project: {
          _id: "$feed._id",
          type: "$feed.postType",
          savedAt: "$savedFeeds.savedAt",
          caption: "$feed.caption",
          uploadMode: "$feed.uploadMode",
          mediaUrl: "$feed.mediaUrl", // Postcard uses this
          contentUrl: "$feed.mediaUrl", // Legacy support
          designMetadata: "$feed.designMetadata",
          postedBy: {
            id: "$feed.postedBy.userId",
            name: { $ifNull: ["$creatorProfile.name", { $ifNull: ["$creatorProfile.userName", "$feed.postedBy.name"] }] },
            userName: { $ifNull: ["$creatorProfile.userName", "$feed.postedBy.name"] }, // Fallback to name if userName missing
            avatar: {
              $ifNull: [
                "$creatorProfile.modifyAvatar",
                { $ifNull: ["$creatorProfile.profileAvatar", "$feed.postedBy.profilePicture"] }
              ]
            },
            role: "$feed.postedBy.role"
          },
          stats: {
            likes: { $ifNull: [{ $arrayElemAt: ["$likeStats.totalLikes", 0] }, 0] },
            shares: { $ifNull: ["$feed.shareCount", 0] },
            downloads: { $ifNull: ["$feed.downloadCount", 0] },
            comments: { $ifNull: ["$feed.commentCount", 0] }
          },
          // Map flat counts for fallback
          likesCount: { $ifNull: [{ $arrayElemAt: ["$likeStats.totalLikes", 0] }, 0] },
          isSaved: { $literal: true },
          isLiked: { $gt: [{ $size: "$likedCheck" }, 0] }
        },
      },
    ]);

    // Return empty array if no results (frontend expects 200 OK with empty array, not 404)
    if (!savedFeedsData || savedFeedsData.length === 0) {
      return res.status(200).json({
        success: true,
        viewer,
        savedFeeds: []
      });
    }

    res.status(200).json({
      success: true,
      message: "Saved feeds retrieved successfully",
      count: savedFeedsData.length,
      viewer,
      savedFeeds: savedFeedsData.map(f => ({
        ...f,
        thumbnailUrl: getMediaUrl(f.contentUrl),
        contentUrl: getMediaUrl(f.contentUrl),
        timeAgo: feedTimeCalculator(f.savedAt || f.createdAt),
        postedBy: {
          ...f.postedBy,
          avatar: getMediaUrl(f.postedBy?.avatar) || "https://cdn-icons-png.flaticon.com/512/149/149071.png"
        }
      }))
    });
  } catch (err) {
    console.error("Error fetching liked feeds for saved:", err);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

/**
 * 🛠️ Internal Helper: Resolve Design Metadata for Share Previews
 */
const getShareDesignMetadata = (feed, type, customMetadata = {}, viewer = {}) => {
  let designMetadata = JSON.parse(JSON.stringify(feed.designMetadata || {}));
  if (!designMetadata.overlayElements) designMetadata.overlayElements = [];

  switch (type) {
    case 'birthday':
      if (Array.isArray(customMetadata.avatarConfigs)) {
        designMetadata.overlayElements = designMetadata.overlayElements.filter(el => el.type !== 'avatar');
        customMetadata.avatarConfigs.forEach((av, idx) => {
          designMetadata.overlayElements.push({
            id: `birthday-avatar-${idx}`,
            type: 'avatar',
            xPercent: av.x, yPercent: av.y, wPercent: av.w, hPercent: av.h,
            visible: true, zIndex: 110 + idx,
            mediaConfig: { url: av.img },
            avatarConfig: { shape: av.shape || 'circle' },
          });
        });
      }
      designMetadata.hasFooter = false;
      break;

    case 'anniversary':
      if (Array.isArray(customMetadata.avatarConfigs)) {
        designMetadata.overlayElements = designMetadata.overlayElements.filter(el => el.type !== 'avatar');
        customMetadata.avatarConfigs.forEach((av, idx) => {
          designMetadata.overlayElements.push({
            id: `anniversary-avatar-${idx}`,
            type: 'avatar',
            xPercent: av.x, yPercent: av.y, wPercent: av.w, hPercent: av.h,
            visible: true, zIndex: 110 + idx,
            mediaConfig: { url: av.img },
            avatarConfig: { shape: av.shape || 'circle' },
          });
        });
      }
      designMetadata.hasFooter = false;
      break;

    case 'politics':
      if (Array.isArray(customMetadata.avatarConfigs)) {
        designMetadata.overlayElements = designMetadata.overlayElements.filter(el => el.type !== 'avatar');
        customMetadata.avatarConfigs.forEach((av, idx) => {
          designMetadata.overlayElements.push({
            id: `politics-avatar-${idx}`,
            type: 'avatar',
            xPercent: av.x, yPercent: av.y, wPercent: av.w, hPercent: av.h,
            visible: true, zIndex: 110 + idx,
            mediaConfig: { url: av.img },
            avatarConfig: { shape: av.shape || 'circle' },
          });
        });
      }
      if (Array.isArray(customMetadata.leaderOverlays)) {
        customMetadata.leaderOverlays.forEach((ov, idx) => {
          designMetadata.overlayElements.push({
            id: ov.id || `politics-leader-${idx}`,
            type: 'avatar',
            xPercent: ov.x, yPercent: ov.y, wPercent: ov.w, hPercent: ov.h,
            visible: true, zIndex: 140 + idx,
            mediaConfig: { url: ov.img },
            avatarConfig: { shape: ov.type === 'party-logo' ? 'square' : 'circle' },
            noFade: true,
          });
        });
      }
      if (customMetadata.footerConfig?.showFooter) {
        designMetadata.hasFooter = true;
        designMetadata.footerConfig = { ...designMetadata.footerConfig, ...customMetadata.footerConfig, enabled: true };
      }
      break;

    default:
      const hasAnyFooter = !!(viewer?.name || viewer?.userName) || !!viewer?.email || !!(viewer?.phoneNumber || viewer?.phone);
      const clientFooterEnabled = customMetadata?.footerConfig?.enabled === true && customMetadata?.footerConfig?.showFooter !== false;
      const enableFooter = clientFooterEnabled && hasAnyFooter;
      designMetadata.hasFooter = enableFooter;
      if (!designMetadata.footerConfig) {
        designMetadata.footerConfig = {};
      }
      designMetadata.footerConfig.enabled = enableFooter;
      designMetadata.footerConfig.showFooter = enableFooter;
      break;
  }
  return designMetadata;
};

/**
 * 🚀 Controller: Process Share Preview
 */
/**
 * 🚀 Controller: Process Share Preview
 */
exports.processSharePreview = async (req, res) => {
  const { feedId } = req.params;
  const userId = req.Id;
  let { type, customMetadata = {} } = req.body;



  if (!userId || !feedId) {
    console.warn("⚠️ [Backend] Missing userId or feedId");
    return res.status(400).json({ message: "userId and feedId required" });
  }

  // Handle stringified metadata from form submissions
  if (typeof customMetadata === 'string') {
    try {
      customMetadata = JSON.parse(customMetadata);
    } catch (e) {
      console.error("[SharePreview] Failed to parse customMetadata:", e.message);
      customMetadata = {};
    }
  }

  try {
    const feed = await Feeds.findById(feedId).lean();
    if (!feed) {
      console.warn("⚠️ [Backend] Feed not found:", feedId);
      return res.status(404).json({ message: "Feed not found" });
    }

    const [user, profile] = await Promise.all([
      User.findById(userId).lean(),
      ProfileSettings.findOne({ userId }).populate('visibility').lean()
    ]);

    if (!user) return res.status(401).json({ message: "User not found" });

    // 🚀 STEP 1: RESOLVE VIEWER (Mirroring DirectDownload Privacy)
    const visibility = await resolveVisibility(profile);
    const viewer = getSafeViewer(user, profile, visibility);

    // 🚀 STEP 2: RESOLVE DESIGN METADATA
    const designMetadata = getShareDesignMetadata(feed, type, customMetadata, viewer);

    // 🚀 STEP 3: ADD JOB TO QUEUE

    const job = await downloadQueue.add({
      jobType: 'share-preview',
      feed: { ...feed, mediaUrl: getMediaUrl(feed.mediaUrl) },
      userId,
      viewer,
      designMetadata,
    }, {
      attempts: 2,
      removeOnComplete: true,
      removeOnFail: false
    });

    res.status(202).json({
      success: true,
      message: "Share preview processing started",
      jobId: job.id,
      status: "queued"
    });

  } catch (err) {
    console.error("❌ [Backend] Critical error in processSharePreview:", err);
    if (!res.headersSent) res.status(500).json({ message: "Internal server error" });
  }
};

/* -------------------------------------------------------------------------- */
// 🆕 SUBMIT USER FEEDBACK POPUP OPTION & PREFERENCES LEARNING
// -------------------------------------------------------------------------- */
exports.submitFeedbackPopup = async (req, res) => {
  try {
    const userId = req.Id;
    const { feedId, option } = req.body;

    if (!feedId || !option) {
      return res.status(400).json({ success: false, message: "feedId and option are required" });
    }

    const UserFeedback = require("../../models/UserFeedbackAndReport");
    const UserCategory = require("../../models/userModels/userCategotyModel.js");
    const Feed = require("../../models/feedModel.js");
    const redisClient = require("../../Config/redisConfig");

    // 1. Save feedback to database
    const feedback = await UserFeedback.create({
      userId,
      section: "post",
      type: "feedback",
      entityId: feedId,
      entityType: "Feed",
      category: "other",
      title: "Why are you not interested in this content?",
      message: option,
      platform: "web",
      device: "desktop",
      status: "pending"
    });

    // Emit live update for Admin Dashboard if WebSocket exists
    try {
      const { getIO } = require("../../middlewares/webSocket");
      const io = getIO();
      if (io) {
        io.emit("newSupportQuery", feedback);
      }
    } catch (wsErr) {
      console.warn("WebSocket update failed: ", wsErr.message);
    }

    // 2. Apply learning logic based on selected option
    const feed = await Feed.findById(feedId);
    if (feed) {
      const categoryId = feed.category[0]; // first category

      if (option === "Not my interest" || option === "Don't show similar videos") {
        if (userId && categoryId) {
          await UserCategory.findOneAndUpdate(
            { userId },
            { $addToSet: { nonInterestedCategories: categoryId } },
            { upsert: true }
          );
        }
      } else if (option === "Too repetitive") {
        if (userId && redisClient && redisClient.status === "ready") {
          const key = `user_diversity_boost:${userId}`;
          await redisClient.set(key, "true", "EX", 86400); // 24 hours
        }
      } else if (option === "Too long") {
        if (userId && redisClient && redisClient.status === "ready") {
          const key = `user_prefer_short:${userId}`;
          await redisClient.set(key, "true", "EX", 86400); // 24 hours
        }
      }
    }

    // Reset skip ignores counter and set a cooldown for 1 hour to prevent spamming
    if (redisClient && redisClient.status === "ready") {
      const trackerKey = userId ? userId.toString() : req.body.sessionId || "guest";
      await redisClient.set(`consecutive_ignores:${trackerKey}`, "0");
      await redisClient.set(`feedback_popup_cooldown:${trackerKey}`, "true", "EX", 3600);
    }

    res.status(200).json({
      success: true,
      message: "Feedback submitted and preference learning updated successfully."
    });
  } catch (err) {
    console.error("❌ Error in submitFeedbackPopup:", err);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};
