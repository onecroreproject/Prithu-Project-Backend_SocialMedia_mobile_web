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
const idToString = (id) => (id ? id.toString() : null);
const downloadQueue = require("../../queue/downloadQueue");
const { processFeedMedia } = require("../../utils/feedMediaProcessor");




exports.likeFeed = async (req, res) => {
  const userId = req.Id || req.body.userId;
  const feedId = req.body.feedId;

  if (!userId || !feedId) {
    return res.status(400).json({ message: "userId and feedId required" });
  }

  try {
    const existingAction = await UserFeedActions.findOne({
      userId,
      "likedFeeds.feedId": feedId,
    });

    let updatedDoc, message, isLike;

    // record activity
    await logUserActivity({
      userId,
      actionType: "LIKE_POST",
      targetId: feedId,
      targetModel: "Feed",
      metadata: { platform: "web" },
    });

    if (existingAction) {
      updatedDoc = await UserFeedActions.findOneAndUpdate(
        { userId },
        { $pull: { likedFeeds: { feedId } } },
        { new: true }
      );
      message = "Unliked successfully";
      isLike = false;
    } else {
      updatedDoc = await UserFeedActions.findOneAndUpdate(
        { userId },
        { $push: { likedFeeds: { feedId, likedAt: new Date() } } },
        { upsert: true, new: true }
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
      message = "Unsaved successfully";
    } else {
      // Not saved → push new feed object with timestamp
      updatedDoc = await UserFeedActions.findOneAndUpdate(
        { userId },
        { $push: { savedFeeds: { feedId: feedObjectId, savedAt: new Date() } } },
        { upsert: true, new: true }
      );
      message = "Saved successfully";
    }

    res.status(200).json({
      message,
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
  const userId = req.user?.id || req.query.userId || req.query.uuserId;

  if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
    return res.status(401).json({ message: "Invalid user session" });
  }

  try {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const actions = await UserFeedActions.findOne({ userId }).lean();

    // Count downloads for the current day only
    const dailyDownloads = (actions?.downloadedFeeds || []).filter(item => {
      const dlDate = new Date(item.downloadedAt || item.addedAt);
      return dlDate >= startOfDay;
    });

    const limit = 1;
    const isProduction = process.env.NODE_ENV === 'production';

    return res.json({
      downloadCount,
      limit,
      isLimitReached: isProduction && downloadCount >= limit
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
  console.log(`[DirectDL] Initializing temp directory: ${tempDir}`);

  try {
    console.log(`[DirectDL] Processing feedId: ${feedId} for userId: ${userId}`);
    const feed = await Feed.findById(feedId);
    if (!feed) return res.status(404).json({ message: "Feed not found" });

    // Enforce Download Limit (1 Feed per Day)
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const actions = await UserFeedActions.findOne({ userId }).lean();
    const dailyDownloads = (actions?.downloadedFeeds || []).filter(item => {
      const dlDate = new Date(item.downloadedAt || item.addedAt);
      return dlDate >= startOfDay;
    });

    const isProduction = process.env.NODE_ENV === 'production';
    if (isProduction && dailyDownloads.length >= 1) {
      console.warn(`[DirectDL] Daily download limit reached for user: ${userId}`);
      return res.status(403).json({ message: "Daily download limit reached (Max 1 feed per day)" });
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
      console.log(`[DirectDL] Merging custom metadata:`, JSON.stringify(customMetadata));

      // Override Footer Config
      if (customMetadata.footerConfig) {
        designMetadata.footerConfig = {
          ...designMetadata.footerConfig,
          ...customMetadata.footerConfig,
          enabled: true
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
    }

    const visibility = profile?.visibility || {};
    console.log(`[DirectDL] User privacy/visibility:`, JSON.stringify({
      userId,
      profileId: profile?._id,
      visibility,
      privacy: profile?.privacy
    }, null, 2));

    console.log(`[DirectDL] RAW Profile ProfileAvatar:`, profile?.profileAvatar);
    console.log(`[DirectDL] RAW Profile ModifyAvatar:`, profile?.modifyAvatar);
    console.log(`[DirectDL] Resolved Avatar URL:`, getMediaUrl(profile?.modifyAvatar || profile?.profileAvatar || null));

    const viewer = {
      id: user._id,
      userName: (visibility.userName === 'public' || visibility.displayName === 'public')
        ? (profile?.userName || user.userName || profile?.name || "User")
        : null,
      email: visibility.email === 'public' ? (user.email || profile?.email) : null,
      phoneNumber: visibility.phoneNumber === 'public' ? (profile?.phoneNumber || user.phoneNumber || user.phone) : null,
      profileAvatar: (visibility.profileAvatar === 'public')
        ? getMediaUrl(profile?.modifyAvatar || profile?.profileAvatar || null)
        : null,
    };

    // Auto-enable footer elements if they are public and present
    if (designMetadata.footerConfig?.showElements) {
      if (viewer.email) designMetadata.footerConfig.showElements.email = true;
      if (viewer.phoneNumber) designMetadata.footerConfig.showElements.phone = true;
    }

    // Filter social icons based on availability and privacy
    if (designMetadata.footerConfig && profile?.socialLinks) {
      const socialLinks = profile.socialLinks;
      const isSocialPublic = visibility.socialLinks === 'public';

      // If template has socialIcons defined, filter them
      if (designMetadata.footerConfig.socialIcons && designMetadata.footerConfig.socialIcons.length > 0) {
        designMetadata.footerConfig.socialIcons = (designMetadata.footerConfig.socialIcons || []).filter(icon => {
          if (!isSocialPublic) return false;
          const platform = icon.platform?.toLowerCase();
          return socialLinks[platform] && socialLinks[platform].length > 0;
        });
      }
      // Fallback: If template wants social icons but hasn't specified which ones, show all available from profile
      else if (designMetadata.footerConfig.showElements?.socialIcons && isSocialPublic) {
        console.log(`[DirectDL] Profiling social links for fallback population:`, JSON.stringify(socialLinks, null, 2));
        designMetadata.footerConfig.socialIcons = Object.keys(socialLinks)
          .filter(platform => socialLinks[platform] && String(socialLinks[platform]).trim().length > 0)
          .map(platform => ({
            platform: platform.charAt(0).toUpperCase() + platform.slice(1),
            visible: true,
            url: socialLinks[platform]
          }));
        console.log(`[DirectDL] Populated ${designMetadata.footerConfig.socialIcons.length} icons from profile.`);
      }
    }

    console.log(`[DirectDL] Starting media processing...`);
    const { ffmpegCommand, tempSourcePath } = await processFeedMedia({
      feed,
      viewer,
      designMetadata,
      tempDir,
      isStreaming: false
    });
    console.log(`[DirectDL] Media processing configured. Source: ${tempSourcePath}`);

    const finalOutputPath = path.join(tempDir, `final_output_${feedId}.mp4`);
    const filename = feed.caption ? `${feed.caption.slice(0, 30).replace(/[^a-z0-9]/gi, '_')}.mp4` : `video_${feedId.slice(-4)}.mp4`;

    // Monitor for client disconnects
    req.on('close', () => {
      console.warn(`[DirectDL] Client connection closed prematurely for jobId: ${feedId}`);
    });

    req.on('error', (err) => {
      console.error(`[DirectDL] Request error: ${err.message}`);
    });

    // Run FFmpeg to a temporary file instead of piping directly
    // This allows the 'faststart' flag to properly relocate the moov atom for social media compatibility
    ffmpegCommand
      .on('start', (cmdLine) => console.log(`[DirectDL] Started: ${cmdLine}`))
      .on('stderr', (line) => {
        if (line.includes('Error') || line.includes('error') || line.includes('Invalid') || line.includes('failed')) {
          console.error(`[DirectDL] FFmpeg STDERR: ${line}`);
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
        console.log("[DirectDL] Encoding finished successfully. Sending file...");

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

exports.requestDownloadFeed = async (req, res) => {
  const userId = req.Id || req.body.userId || req.query.userId;
  const feedId = req.params.feedId;

  if (!userId) return res.status(400).json({ message: "userId is required" });
  if (!feedId) return res.status(400).json({ message: "feedId is required" });

  try {
    // 2. CHECK DAILY DOWNLOAD LIMIT
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const actions = await UserFeedActions.findOne({ userId }).lean();
    const dailyDownloads = (actions?.downloadedFeeds || []).filter(item => {
      const dlDate = new Date(item.downloadedAt || item.addedAt);
      return dlDate >= startOfDay;
    });

    const isProduction = process.env.NODE_ENV === 'production';
    if (isProduction && dailyDownloads.length >= 1) {
      return res.status(403).json({ message: "Daily download limit reached (Max 1 feed per day)" });
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

    console.log(`[DownloadRequest] Job ${job.id} created for user ${userId}, feed ${feedId} `);

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
    console.log(`[JobStatus] Job ${jobId} state: ${state}, progress: ${progress}% `);

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
    console.error("Error generating share link:", err);
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



    // ============ CRITICAL FIX: Use backend URL for sharing ============
    // WhatsApp/Facebook crawlers MUST hit the backend URL to get OG tags


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




    res.json({
      // 🔥 ONLY frontend URL
      shareUrl: `${process.env.FRONTEND_URL}/share/post/${feedId}`,
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
    const feed = await Feeds.findById(feedId).lean();

    if (!feed || feed.audience !== "public" || feed.isDeleted) {
      return res.send(getDefaultOGPage());
    }

    // detect crawler
    const ua = req.headers["user-agent"] || "";
    const isCrawler =
      /facebookexternalhit|Twitterbot|WhatsApp|Telegram|bot|crawler|preview/i.test(ua);

    // 👤 normal user → frontend
    if (!isCrawler) {
      return res.redirect(
        302,
        `${process.env.FRONTEND_URL}/home/retrivefeed/${feedId}`
      );
    }

    // 🤖 crawler → OG HTML
    const profile = await ProfileSettings.findOne({
      accountId: feed.createdByAccount,
    }).lean();

    const userName = profile?.userName || "User";
    const caption = feed.dec || `Post by ${userName}`;
    const title = `${userName}'s ${feed.type === "video" ? "Video" : "Post"}`;

    const currentUrl = `${req.protocol}://${req.get("host")}${req.originalUrl}`;
    const frontendUrl = `${process.env.FRONTEND_URL}/share/post/${feedId}`;

    const { ogImageUrl, ogVideoUrl } = await getOptimizedOGMedia(feed);

    res.set("Content-Type", "text/html");
    res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${title}</title>

<meta property="og:url" content="${currentUrl}" />
<meta property="og:title" content="${title}" />
<meta property="og:description" content="${caption}" />
<meta property="og:image" content="${ogImageUrl}" />
${feed.type === "video" ? `<meta property="og:video" content="${ogVideoUrl}" />` : ""}

<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${title}" />
<meta name="twitter:description" content="${caption}" />
<meta name="twitter:image" content="${ogImageUrl}" />


<link rel="canonical" href="${frontendUrl}" />
</head>
<body></body>
</html>
    `);
  } catch (err) {
    console.error("OG Share Error:", err);
    return res.status(500).send(getErrorOGPage());
  }
};






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

    console.log({ commentText, parentCommentId, parentReplyId });

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
      const rule = viewerVisibility?.socialLinks || "private";
      return canShow(rule) && icon.visible !== false && !!icon.url;
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

      let designState = null;
      if (isTemplateMode && feed.designMetadata) {
        designState = {
          elements: feed.designMetadata.overlayElements || [],
          mediaDimensions: feed.designMetadata.canvasSettings || { width: 1080, height: 1920 },
          audioConfig: feed.designMetadata.audioConfig || null,
          themeColors: themeColor
        };
      }

      return {
        ...feed,
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
    const postId = req.body.feedId;

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
      { $unwind: "$likedFeeds" },
      { $sort: { "likedFeeds.likedAt": -1 } },

      // Join feed data
      {
        $lookup: {
          from: "Feeds",
          localField: "likedFeeds.feedId",
          foreignField: "_id",
          as: "feed",
        },
      },
      { $unwind: "$feed" },

      // Count total likes for each feed
      {
        $lookup: {
          from: "UserFeedActions",
          let: { feedId: "$likedFeeds.feedId" },
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

      // Format output to match Saved Feeds schema
      {
        $project: {
          _id: "$feed._id",
          type: "$feed.postType",
          savedAt: "$likedFeeds.likedAt",
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
            shares: { $ifNull: ["$feed.shareCount", 0] }, // If these exist on feed
            downloads: { $ifNull: ["$feed.downloadCount", 0] },
            comments: { $ifNull: ["$feed.commentCount", 0] }
          },
          // Map flat counts for fallback
          likesCount: { $ifNull: [{ $arrayElemAt: ["$likeStats.totalLikes", 0] }, 0] },
          isSaved: { $literal: true }, // It IS saved/liked if it's in this list
          isLiked: { $literal: true } // Assuming saved logic implies usage in this context, but strictly this endpoint is for 'likedFeeds' which are 'saved'. Wait, the endpoint is "getUserLikedFeedsForSaved". 
          // Actually the code says: "Saved feeds (from likes)".
          // If I am fetching "Saved", then isSaved=true.


        },
      },
    ]);

    // Return empty array if no results (frontend expects 200 OK with empty array, not 404)
    if (!savedFeedsData || savedFeedsData.length === 0) {
      return res.status(200).json({
        success: true,
        data: {
          viewer,
          savedFeeds: []
        }
      });
    }

    res.status(200).json({
      success: true,
      message: "Saved feeds (from likes) retrieved successfully",
      count: savedFeedsData.length,
      data: {
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
        })),
      }
    });
  } catch (err) {
    console.error("Error fetching liked feeds for saved:", err);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};
