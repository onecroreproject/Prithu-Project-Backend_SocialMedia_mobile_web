const { body, validationResult } = require("express-validator");
const mongoose = require("mongoose");
const path = require("path");
const Profile = require("../../models/profileSettingModel");
const User = require("../../models/userModels/userModel");
const Admin = require("../../models/adminModels/adminModel");
const ChildAdmin = require("../../models/childAdminModel");
const UserLanguage = require('../../models/userModels/userLanguageModel');
const { calculateAge } = require("../../middlewares/helper/calculateAge");
const { removeImageBackground } = require("../../middlewares/helper/removeImageBackground");
const { getMediaUrl } = require("../../utils/storageEngine");
const DEFAULT_COVER_PHOTO = "https://res.cloudinary.com/demo/image/upload/v1730123456/default-cover.jpg";
const Following = require("../../models/userFollowingModel");
const CreatorFollower = require("../../models/creatorFollowerModel");
const ProfileVisibility = require("../../models/profileVisibilitySchema");
const Feed = require("../../models/feedModel");
const { calculateProfileCompletion } = require("../../middlewares/helper/profileCompletionCalulator");
const ProfileSettings = require("../../models/profileSettingModel");
const { logUserActivity } = require("../../middlewares/helper/logUserActivity.js");
const Follower = require("../../models/creatorFollowerModel.js");
const { deleteLocalFile } = require("../../middlewares/services/userprofileUploadSpydy.js");
const UserFeedActions = require("../../models/userFeedInterSectionModel");



// ------------------- Validation Middleware -------------------
exports.validateUserProfileUpdate = [
  body("phoneNumber").optional().isMobilePhone().withMessage("Invalid phone number"),
  body("whatsAppNumber").optional().isMobilePhone().withMessage("Invalid whatsAppNumber"),
  body("bio").optional().isString(),
  body("profileSummary").optional().isString(),
  body("maritalStatus").optional().isString(),
  body("maritalDate").optional().isString(),
  body("dateOfBirth").optional().isISO8601().toDate(),
  body("profileAvatar").optional().isString(),
  body("userName").optional().isString(),
  body("name").optional().isString(),
  body("lastName").optional().isString(),
  body("theme").optional().isIn(["light", "dark"]),
  body("language").optional().isString(),
  body("timezone").optional().isString(),
  body("details").optional(),
  body("gender").optional(),
  body("notifications").optional().isObject(),
  body("privacy").optional().isObject(),
  body("country").optional().isString(), // ✅ Added validation
  body("city").optional().isString(), // ✅ Added validation
];

// ------------------- User Profile Update -------------------
exports.userProfileDetailUpdate = async (req, res) => {
  try {
    const userId = req.Id || req.body.userId;
    if (!userId) return res.status(400).json({ message: "User ID is required" });

    // Validation
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        message: "Validation failed",
        errors: errors.array(),
      });
    }

    // Allowed fields
    const allowedFields = [
      "phoneNumber",
      "bio",
      "name",
      "lastName",
      "dateOfBirth",
      "maritalStatus",
      "theme",
      "language",
      "timezone",
      "gender",
      "details",
      "notifications",
      "privacy",
      "maritalDate",
      "profileSummary",
      "address",
      "country",
      "city",
      "whatsAppNumber",
    ];

    const updateData = {};
    for (const field of allowedFields) {
      let value = req.body[field];
      if (["dateOfBirth", "maritalDate"].includes(field) && (!value || value === "null"))
        value = null;
      if (value !== undefined) updateData[field] = value;
    }

    // Parse social links
    if (req.body.socialLinks) {
      try {
        let links = {};

        if (typeof req.body.socialLinks === "string") {
          links = JSON.parse(req.body.socialLinks);
        } else if (Array.isArray(req.body.socialLinks)) {
          const valid = req.body.socialLinks.find((item) => {
            try {
              return item && JSON.parse(item);
            } catch {
              return false;
            }
          });
          if (valid) links = JSON.parse(valid);
        } else if (typeof req.body.socialLinks === "object") {
          links = req.body.socialLinks;
        }

        if (Object.keys(links).length > 0) {
          updateData.socialLinks = {
            facebook: links.facebook || "",
            instagram: links.instagram || "",
            twitter: links.twitter || "",
            youtube: links.youtube || "",
          };
        }
      } catch (err) {
        console.warn("⚠️ Invalid socialLinks data:", err.message);
      }
    }

    // Find profile
    const profile = await Profile.findOne({ userId });

    // -----------------------------------------
    // ✅ NEW LOCAL STORAGE HANDLING
    // -----------------------------------------
    if (req.localFile) {
      // 🧹 delete old profile avatar (local)
      if (profile?.profileAvatarFilename) {
        // Find the absolute path to delete old original
        const oldPath = path.join(
          __dirname,
          "../../media/user",
          userId.toString(),
          profile.profileAvatarFilename
        );
        deleteLocalFile(oldPath);
      }

      updateData.profileAvatar = req.localFile.url;
      updateData.profileAvatarFilename = req.localFile.filename;
      updateData.avatarUpdatedAt = req.localFile.uploadedAt;

      // 🧹 delete old modify avatar (local)
      if (profile?.modifyAvatarFilename) {
        const oldModifyPath = path.join(
          __dirname,
          "../../media/user",
          userId.toString(),
          "modify",
          profile.modifyAvatarFilename
        );
        deleteLocalFile(oldModifyPath);
      }

      // 🎨 background removal + fallback
      try {
        const localFilePath = req.localFile.path;

        const removedBg = await removeImageBackground(localFilePath, userId);

        if (removedBg?.secure_url) {
          updateData.modifyAvatar = removedBg.secure_url;
          updateData.modifyAvatarFilename = removedBg.public_id;
        } else {
          updateData.modifyAvatar = req.localFile.url;
          updateData.modifyAvatarFilename = req.localFile.filename;
        }
      } catch (err) {
        console.error("⚠️ Background removal failed:", err.message);
        updateData.modifyAvatar = req.localFile.url;
        updateData.modifyAvatarFilename = req.localFile.filename;
      }
    } // ✅ IMPORTANT: block closed here


    // Handle username
    const userName = req.body.userName?.replace(/\s+/g, "").trim();
    if (userName) updateData.userName = userName;

    // Update or create profile
    const updatedProfile = await Profile.findOneAndUpdate(
      { userId },
      { $set: updateData },
      { new: true, upsert: true }
    );

    // Sync username
    if (userName) {
      await User.findByIdAndUpdate(userId, { $set: { userName } });
    }

    await logUserActivity({
      userId,
      actionType: "UPDATE_PROFILE",
      targetId: userId,
      targetModel: "Feed",
      metadata: { platform: "web" },
    });

    // Populate profile
    const populatedProfile = await Profile.findById(updatedProfile._id)
      .populate("userId", "userName email role")
      .lean();

    if (populatedProfile) {
      populatedProfile.profileAvatar = getMediaUrl(populatedProfile.profileAvatar);
      populatedProfile.modifyAvatar = getMediaUrl(populatedProfile.modifyAvatar);
      populatedProfile.coverPhoto = getMediaUrl(populatedProfile.coverPhoto);
    }

    return res.status(200).json({
      message: "✅ User profile updated successfully",
      profile: populatedProfile,
    });
  } catch (error) {
    console.error("❌ Error in userProfileDetailUpdate:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};





// ------------------- Admin Profile Update -------------------

exports.adminProfileDetailUpdate = async (req, res) => {
  try {
    const adminId = req.Id;
    if (!adminId) return res.status(400).json({ message: "adminId is required" });

    const errors = validationResult(req);
    if (!errors.isEmpty())
      return res.status(400).json({ message: "Validation failed", errors: errors.array() });

    const allowedFields = [
      "phoneNumber",
      "bio",
      "displayName",
      "dateOfBirth",
      "maritalStatus",
      "theme",
      "maritalDate",
      "language",
      "timezone",
      "details",
      "notifications",
      "privacy",
      "gender",
    ];

    const updateData = {};

    allowedFields.forEach((field) => {
      let value = req.body[field];
      if ((field === "dateOfBirth" || field === "maritalDate") && (!value || value === "null"))
        value = null;
      if (value !== undefined) updateData[field] = value;
    });

    // ⭐ NEW: handle profile picture local upload
    const oldProfile = await Profile.findOne({ adminId });

    if (req.localFile) {
      if (oldProfile?.profileAvatar && oldProfile.profileAvatar !== req.localFile.url) {
        // deleteLocalFile(oldProfile.localAvatarPath);
      }

      updateData.profileAvatar = req.localFile.url;
      updateData.localAvatarPath = req.localFile.path;
      updateData.profileAvatarId = req.localFile.filename;

      // 🎨 background removal + fallback for admin
      try {
        const removedBg = await removeImageBackground(req.localFile.path, adminId);
        if (removedBg?.secure_url) {
          updateData.modifyAvatar = removedBg.secure_url;
        } else {
          updateData.modifyAvatar = req.localFile.url;
        }
      } catch (err) {
        console.error("⚠️ Admin Background removal failed:", err.message);
        updateData.modifyAvatar = req.localFile.url;
      }
    }

    // Handle username update
    const userName = req.body.userName?.replace(/\s+/g, "").trim();
    if (userName) updateData.userName = userName;

    const updatedProfile = await Profile.findOneAndUpdate(
      { adminId },
      { $set: updateData },
      { new: true, upsert: true }
    );

    if (userName) {
      await Admin.findByIdAndUpdate(
        adminId,
        { $set: { userName, profileSettings: updatedProfile._id } },
        { new: true }
      );
    }

    const populatedProfile = await Profile.findById(updatedProfile._id)
      .populate("adminId", "userName email role")
      .lean();

    if (populatedProfile) {
      populatedProfile.profileAvatar = getMediaUrl(populatedProfile.profileAvatar);
      populatedProfile.modifyAvatar = getMediaUrl(populatedProfile.modifyAvatar);
      populatedProfile.coverPhoto = getMediaUrl(populatedProfile.coverPhoto);
    }

    return res.status(200).json({
      message: "Admin profile updated successfully",
      profile: populatedProfile,
    });

  } catch (error) {
    console.error("Error in adminProfileDetailUpdate:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};





// ------------------- Child Admin Profile Update -------------------
exports.childAdminProfileDetailUpdate = async (req, res) => {
  try {
    const childAdminId = req.Id;
    if (!childAdminId)
      return res.status(400).json({ message: "childAdminId is required" });

    const errors = validationResult(req);
    if (!errors.isEmpty())
      return res.status(400).json({ message: "Validation failed", errors: errors.array() });

    const allowedFields = [
      "phoneNumber",
      "bio",
      "displayName",
      "dateOfBirth",
      "maritalStatus",
      "theme",
      "maritalDate",
      "language",
      "timezone",
      "details",
      "notifications",
      "privacy",
      "gender",
    ];

    const updateData = {};
    allowedFields.forEach((field) => {
      let value = req.body[field];
      if ((field === "dateOfBirth" || field === "maritalDate") && (!value || value === "null"))
        value = null;
      if (value !== undefined) updateData[field] = value;
    });

    const oldProfile = await Profile.findOne({ childAdminId });

    if (req.localFile) {
      if (oldProfile?.profileAvatar && oldProfile.profileAvatar !== req.localFile.url) {
        // deleteLocalFile(oldProfile.localAvatarPath);
      }

      updateData.profileAvatar = req.localFile.url;
      updateData.localAvatarPath = req.localFile.path;
      updateData.profileAvatarId = req.localFile.filename;

      // 🎨 background removal + fallback for child admin
      try {
        const removedBg = await removeImageBackground(req.localFile.path, childAdminId);
        if (removedBg?.secure_url) {
          updateData.modifyAvatar = removedBg.secure_url;
        } else {
          updateData.modifyAvatar = req.localFile.url;
        }
      } catch (err) {
        console.error("⚠️ Child Admin Background removal failed:", err.message);
        updateData.modifyAvatar = req.localFile.url;
      }
    }

    const userName = req.body.userName?.replace(/\s+/g, "").trim();
    if (userName) updateData.userName = userName;

    const updatedProfile = await Profile.findOneAndUpdate(
      { childAdminId },
      { $set: updateData },
      { new: true, upsert: true }
    );

    if (userName) {
      await ChildAdmin.findByIdAndUpdate(
        childAdminId,
        { $set: { userName, profileSettings: updatedProfile._id } },
        { new: true }
      );
    }

    const populatedProfile = await Profile.findById(updatedProfile._id)
      .populate("childAdminId", "userName email role parentAdminId")
      .lean();

    if (populatedProfile) {
      populatedProfile.profileAvatar = getMediaUrl(populatedProfile.profileAvatar);
      populatedProfile.modifyAvatar = getMediaUrl(populatedProfile.modifyAvatar);
      populatedProfile.coverPhoto = getMediaUrl(populatedProfile.coverPhoto);
    }

    return res.status(200).json({
      message: "Child Admin profile updated successfully",
      profile: populatedProfile,
    });

  } catch (error) {
    console.error("Error in childAdminProfileDetailUpdate:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};



exports.toggleFieldVisibility = async (req, res) => {
  try {
    const userId = req.Id;   // From token middleware
    const role = req.role;   // From token middleware
    const { field, value } = req.body;

    // ✅ Validate input
    const allowedValues = ["public", "followers", "private"];
    if (!field || !allowedValues.includes(value)) {
      return res.status(400).json({
        message:
          "Invalid request. Field and value ('public' | 'followers' | 'private') are required.",
      });
    }

    // ✅ Determine which profile to update
    let profileQuery = {};
    if (role === "Admin") profileQuery = { adminId: userId };
    else if (role === "Child_Admin") profileQuery = { childAdminId: userId };
    else if (role === "User") profileQuery = { userId: userId };
    else return res.status(403).json({ message: "Unauthorized role." });

    // ✅ Find ProfileSettings
    const profile = await ProfileSettings.findOne(profileQuery).populate("visibility");
    if (!profile)
      return res.status(404).json({ message: "ProfileSettings not found for this user." });

    // ✅ Ensure visibility document exists
    let visibilityDoc = profile.visibility;
    if (!visibilityDoc) {
      visibilityDoc = await ProfileVisibility.create({ profileSettingsId: profile._id });
      profile.visibility = visibilityDoc._id;
      await profile.save();
    }

    // ✅ Determine where to update the field
    const schemaPaths = Object.keys(ProfileVisibility.schema.paths);
    const socialLinksFields = Object.keys(ProfileVisibility.schema.paths.socialLinks?.schema?.paths || {});

    let updatedFieldPath = "";

    if (socialLinksFields.includes(field)) {
      // Field belongs to socialLinks
      visibilityDoc.socialLinks[field] = value;
      updatedFieldPath = `socialLinks.${field}`;
    } else if (schemaPaths.includes(field)) {
      // Field is top-level
      visibilityDoc[field] = value;
      updatedFieldPath = field;
    } else {
      return res.status(400).json({
        message: `Invalid field name: '${field}'. Field not found in visibility schema.`,
      });
    }

    // ✅ Save updated document
    await visibilityDoc.save();

    return res.status(200).json({
      success: true,
      message: `Visibility for '${updatedFieldPath}' updated to '${value}'.`,
      visibility: visibilityDoc,
    });
  } catch (err) {
    console.error("❌ Visibility Toggle Error:", err);
    return res.status(500).json({
      message: "Server error while updating visibility.",
      error: err.message,
    });
  }
};

// ===========================================================
// ✅ 2️⃣ Get visibility settings (API use)
// ===========================================================
exports.getVisibilitySettings = async (req, res) => {
  try {
    const userId = req.Id;
    const role = req.role;

    let profileQuery = {};
    if (role === "Admin") profileQuery = { adminId: userId };
    else if (role === "Child_Admin") profileQuery = { childAdminId: userId };
    else if (role === "User") profileQuery = { userId: userId };
    else return res.status(403).json({ message: "Unauthorized role" });

    const profile = await ProfileSettings.findOne(profileQuery).populate("visibility");
    if (!profile || !profile.visibility)
      return res.status(404).json({ message: "Visibility settings not found" });

    return res.json({
      success: true,
      visibility: profile.visibility,
    });
  } catch (err) {
    console.error("❌ Get Visibility Error:", err);
    return res.status(500).json({
      message: "Server error while fetching visibility.",
      error: err.message,
    });
  }
};

// ===========================================================
// ✅ 3️⃣ Update visibility (for Web UI - supports socialLinks.*)
// ===========================================================
exports.updateFieldVisibilityWeb = async (req, res) => {
  try {
    const userId = req.Id;
    const role = req.role;
    const { field, value } = req.body;

    const allowedValues = ["public", "followers", "private"];
    if (!field || !allowedValues.includes(value)) {
      return res.status(400).json({
        message:
          "Invalid request. Field and value ('public' | 'followers' | 'private') required.",
      });
    }

    // Role-based query
    let profileQuery = {};
    if (role === "Admin") profileQuery = { adminId: userId };
    else if (role === "Child_Admin") profileQuery = { childAdminId: userId };
    else if (role === "User") profileQuery = { userId: userId };
    else return res.status(403).json({ message: "Unauthorized role" });

    // Find ProfileSettings
    const profile = await ProfileSettings.findOne(profileQuery).populate("visibility");
    if (!profile) return res.status(404).json({ message: "Profile not found" });

    let visibility = profile.visibility;

    // If visibility missing create new
    if (!visibility) {
      visibility = await ProfileVisibility.create({});
      profile.visibility = visibility._id;
      await profile.save();
    }

    // ✅ Only allow valid fields from schema
    const validFields = Object.keys(ProfileVisibility.schema.paths).filter(
      (k) => !["_id", "__v", "createdAt", "updatedAt"].includes(k)
    );

    if (!validFields.includes(field)) {
      return res.status(400).json({ message: `Invalid field name: ${field}` });
    }

    // ✅ Update field directly (including socialLinks)
    visibility[field] = value;

    await visibility.save();

    return res.json({
      success: true,
      message: `Visibility for '${field}' updated to '${value}'`,
      visibility,
    });
  } catch (err) {
    console.error("❌ Update Visibility Web Error:", err);
    return res.status(500).json({ message: "Server error", error: err.message });
  }
};


// ===========================================================
// ✅ 4️⃣ Get visibility settings (Web)
// ===========================================================
exports.getVisibilitySettingsWeb = async (req, res) => {
  try {
    const userId = req.Id;  // Ensure your auth middleware sets req.Id
    const role = req.role;

    if (!userId || !role) {
      return res.status(400).json({
        success: false,
        message: "Missing user ID or role",
      });
    }

    // 🧹 Role → field mapping (clean)
    const roleMap = {
      Admin: { adminId: userId },
      Child_Admin: { childAdminId: userId },
      User: { userId: userId },
    };

    // ❌ If role doesn't exist in map → unauthorized
    const profileQuery = roleMap[role];
    if (!profileQuery) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized role",
      });
    }

    // 🔍 Fetch profile + visibility in one query
    const profile = await ProfileSettings.findOne(profileQuery).populate("visibility");

    if (!profile?.visibility) {
      return res.status(404).json({
        success: false,
        message: "Visibility settings not found",
      });
    }

    return res.json({
      success: true,
      visibility: profile.visibility,
    });

  } catch (err) {
    console.error("❌ Get Visibility Web Error:", err);

    return res.status(500).json({
      success: false,
      message: "Server error",
      error: err.message,
    });
  }
};





exports.getUserVisibilityByUserId = async (req, res) => {
  try {
    const { userId } = req.body;

    // Validate input
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "userId is required",
      });
    }

    // 🔍 Fetch the ProfileSettings of this user
    const profile = await ProfileSettings.findOne({ userId }).populate("visibility");

    if (!profile) {
      return res.status(404).json({
        success: false,
        message: "Profile settings not found for this user",
      });
    }

    if (!profile.visibility) {
      return res.status(404).json({
        success: false,
        message: "Visibility settings not found",
      });
    }

    // Success
    return res.status(200).json({
      success: true,
      visibility: profile.visibility,
    });

  } catch (err) {
    console.error("❌ Error getting user visibility:", err);
    return res.status(500).json({
      success: false,
      message: "Server error",
      error: err.message,
    });
  }
};













exports.getUserProfileDetail = async (req, res) => {
  try {
    const userId = req.Id || req.query.id;

    if (!userId) {
      return res.status(400).json({ message: "User ID is required" });
    }

    // ✅ Fetch profile and populate linked user info
    const profile = await Profile.findOne(
      { userId },
      `
        bio name lastName maritalStatus phoneNumber whatsAppNumber
        dateOfBirth maritalDate gender theme language timezone
        privacy notifications socialLinks country city address
        coverPhoto profileAvatar modifyAvatar details profileSummary
        visibility addImage
      `
    )
      .populate("userId", "userName email _id")
      .populate("visibility")
      .lean();

    if (!profile) {
      return res.status(404).json({ message: "Profile not found" });
    }

    let visibility = profile.visibility;
    if (!visibility) {
      let userVis = await ProfileVisibility.findOne({ userId }).lean();
      if (!userVis) {
        const newVis = new ProfileVisibility({});
        await newVis.save();
        userVis = newVis.toObject();
      }
      visibility = userVis;
      await Profile.updateOne({ _id: profile._id }, { $set: { visibility: userVis._id } });
    }

    // ✅ Extract safe fields with defaults
    const {
      bio = "",
      profileSummary = "",
      name = "",
      lastName = "",
      maritalStatus = "",
      phoneNumber = "",
      whatsAppNumber = "",
      dateOfBirth = null,
      maritalDate = null,
      gender = "",
      theme = "light",
      language = "en",
      timezone = "Asia/Kolkata",
      privacy = {},
      notifications = {},
      socialLinks = {},
      country = "",
      city = "",
      address = "",
      coverPhoto = "",
      details = "",
      profileAvatar = "",
      modifyAvatar = "",
      addImage = "",
      userId: user = {},
    } = profile;

    // ✅ Compute age safely
    const age = dateOfBirth ? calculateAge(dateOfBirth) : null;

    const finalProfile = {
      userId: user._id || userId,
      name,
      profileSummary,
      lastName,
      bio,
      maritalStatus,
      phoneNumber,
      whatsAppNumber,
      dateOfBirth,
      maritalDate,
      gender,
      theme,
      language,
      timezone,
      privacy,
      notifications,
      country,
      city,
      address,
      coverPhoto: getMediaUrl(coverPhoto || DEFAULT_COVER_PHOTO),
      details,
      profileAvatar: getMediaUrl(profileAvatar),
      modifyAvatar: getMediaUrl(modifyAvatar),
      addImage: getMediaUrl(addImage),
      userName: user.userName || null,
      userEmail: user.email || null,
      age,
      visibility,
      socialLinks: {
        facebook: socialLinks.facebook || "",
        instagram: socialLinks.instagram || "",
        twitter: socialLinks.twitter || "",
        linkedin: socialLinks.linkedin || "",
        github: socialLinks.github || "",
        website: socialLinks.website || "",
        youtube: socialLinks.youtube || "",
      },
    };

    // ✅ Build clean response
    return res.status(200).json({
      message: "Profile fetched successfully",
      profile: finalProfile
    });
  } catch (error) {
    console.error("❌ Error fetching profile:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};










exports.getAdminProfileDetail = async (req, res) => {
  try {
    const userId = req.Id;
    const role = req.role;



    if (!userId || !role) {
      return res.status(400).json({ message: "User ID and role are required" });
    }

    let profileQuery = {};
    let populateOptions = {};
    let profileType = "";

    if (role === "Admin") {
      profileQuery = { adminId: userId };
      populateOptions = {
        path: "adminId",
        select: "userName email adminType profileSettings",
      };
      profileType = "Admin";
    } else if (role === "Child_Admin") {
      profileQuery = { childAdminId: userId };
      populateOptions = {
        path: "childAdminId",
        select: "userName email adminType parentAdminId profileSettings",
      };
      profileType = "Child_Admin";
    } else {
      return res.status(403).json({ message: "Unauthorized role" });
    }

    let profile = await Profile.findOne(
      profileQuery,
      "bio displayName maritalStatus phoneNumber dateOfBirth profileAvatar modifyAvatar timezone maritalDate socialLinks"
    )
      .populate(populateOptions)
      .lean();

    if (!profile) {
      // Auto-create missing profile
      const newProfile = new Profile(profileQuery);
      await newProfile.save();
      profile = await Profile.findById(newProfile._id)
        .select("bio displayName maritalStatus phoneNumber dateOfBirth profileAvatar modifyAvatar timezone maritalDate socialLinks")
        .populate(populateOptions)
        .lean();
    }

    // ✅ Fetch parent admin if Child_Admin
    let parentAdmin = null;
    if (role === "Child_Admin" && profile.childAdminId?.parentAdminId) {
      parentAdmin = await Admin.findById(profile.childAdminId.parentAdminId)
        .select("userName email adminType")
        .lean();
    }

    // ✅ Helper function for age calculation
    const calculateAge = (dob) => {
      if (!dob) return null;
      const birthDate = new Date(dob);
      const today = new Date();
      let age = today.getFullYear() - birthDate.getFullYear();
      const m = today.getMonth() - birthDate.getMonth();
      if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
        age--;
      }
      return age;
    };

    // ✅ Avatar URLs
    const profileAvatarUrl = profile.profileAvatar || null;
    const modifyAvatarUrl = profile.modifyAvatar || null;

    // ✅ Extract social links (with null safety)
    const socialLinks = {
      facebook: profile.socialLinks?.facebook || null,
      instagram: profile.socialLinks?.instagram || null,
      twitter: profile.socialLinks?.twitter || null,
      youtube: profile.socialLinks?.youtube || null,
    };

    // ✅ Final response
    return res.status(200).json({
      message: `${profileType} profile fetched successfully`,
      profile: {
        bio: profile.bio || null,
        displayName: profile.displayName || null,
        maritalStatus: profile.maritalStatus || null,
        phoneNumber: profile.phoneNumber || null,
        dateOfBirth: profile.dateOfBirth || null,
        age: calculateAge(profile.dateOfBirth),
        userName:
          role === "Admin"
            ? profile.adminId?.userName
            : profile.childAdminId?.userName || null,
        userEmail:
          role === "Admin"
            ? profile.adminId?.email
            : profile.childAdminId?.email || null,
        adminType:
          role === "Admin"
            ? profile.adminId?.adminType
            : profile.childAdminId?.adminType || null,
        profileAvatar: profileAvatarUrl,
        modifyAvatar: modifyAvatarUrl,
        timezone: profile.timezone || null,
        maritalDate: profile.maritalDate || null,
        socialLinks, // ✅ Added field
        parentAdmin: parentAdmin
          ? {
            userName: parentAdmin.userName,
            email: parentAdmin.email,
            adminType: parentAdmin.adminType,
          }
          : null,
        profileSettings:
          role === "Admin"
            ? profile.adminId?.profileSettings
            : profile.childAdminId?.profileSettings || null,
      },
    });
  } catch (error) {
    console.error("Error fetching profile:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};













// Upload or Update Cover Photo
exports.updateCoverPhoto = async (req, res) => {
  try {
    const userId = req.Id || req.body.userId;
    if (!userId) return res.status(400).json({ message: "userId is required" });

    if (!req.localFile)
      return res.status(400).json({ message: "Cover photo file is missing" });

    const profile = await Profile.findOne({ userId });

    // ----------------------------------------------
    // 1️⃣ DELETE OLD COVER IMAGE IF EXISTS
    // ----------------------------------------------
    if (profile?.coverPhotoFilename) {
      const oldPath = path.join(
        __dirname,
        "../../media/user",
        userId.toString(),
        "coverpic",
        profile.coverPhotoFilename
      );

      deleteLocalFile(oldPath);
    }

    // ----------------------------------------------
    // 2️⃣ PREPARE NEW DATA
    // ----------------------------------------------
    const updateData = {
      coverPhoto: req.localFile.url,
      coverPhotoFilename: req.localFile.filename,
      coverUpdatedAt: req.localFile.uploadedAt,
    };

    // ----------------------------------------------
    // 3️⃣ UPDATE OR CREATE PROFILE
    // ----------------------------------------------
    const updatedProfile = await Profile.findOneAndUpdate(
      { userId },
      { $set: updateData },
      { new: true, upsert: true }
    ).populate("userId", "userName email role");

    return res.status(200).json({
      message: "Cover photo updated successfully",
      coverPhoto: updatedProfile.coverPhoto,
      profile: updatedProfile,
    });

  } catch (error) {
    console.error("❌ Error updating cover photo:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};


exports.deleteCoverPhoto = async (req, res) => {
  try {
    const userId = req.Id || req.body.userId;
    if (!userId) return res.status(400).json({ message: "userId is required" });

    const profile = await Profile.findOne({ userId });
    if (!profile)
      return res.status(404).json({ message: "Profile not found" });

    // Delete from Cloudinary if exists
    if (profile.coverPhotoId) {
      await userDeleteFromCloudinary(profile.coverPhotoId);
    }

    // Replace with default cover photo
    profile.coverPhoto = DEFAULT_COVER_PHOTO;
    profile.coverPhotoId = null;
    profile.modifiedCoverPhoto = DEFAULT_COVER_PHOTO;
    profile.modifiedCoverPhotoId = null;
    await profile.save();

    return res.status(200).json({
      message: "Cover photo deleted successfully, default applied",
      profile,
    });
  } catch (error) {
    console.error("❌ Error deleting cover photo:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

// Upload or Update Add Image
exports.updateAddImage = async (req, res) => {
  try {
    const userId = req.Id || req.body.userId;
    if (!userId) return res.status(400).json({ message: "userId is required" });

    if (!req.localFile)
      return res.status(400).json({ message: "Image file is missing" });

    const profile = await Profile.findOne({ userId });

    // 1️⃣ DELETE OLD IMAGE IF EXISTS
    if (profile?.addImageFilename) {
      const oldPath = path.join(
        __dirname,
        "../../media/user",
        userId.toString(),
        "addimage",
        profile.addImageFilename
      );
      deleteLocalFile(oldPath);
    }

    // 2️⃣ PREPARE NEW DATA
    const updateData = {
      addImage: req.localFile.url,
      addImageFilename: req.localFile.filename,
      addImageUpdatedAt: req.localFile.uploadedAt,
    };

    // 3️⃣ UPDATE OR CREATE PROFILE
    const updatedProfile = await Profile.findOneAndUpdate(
      { userId },
      { $set: updateData },
      { new: true, upsert: true }
    ).populate("userId", "userName email role");

    return res.status(200).json({
      message: "Additional image updated successfully",
      addImage: updatedProfile.addImage,
      profile: updatedProfile,
    });

  } catch (error) {
    console.error("❌ Error updating additional image:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

exports.deleteAddImage = async (req, res) => {
  try {
    const userId = req.Id || req.body.userId;
    if (!userId) return res.status(400).json({ message: "userId is required" });

    const profile = await Profile.findOne({ userId });
    if (!profile)
      return res.status(404).json({ message: "Profile not found" });

    if (profile.addImageFilename) {
      const oldPath = path.join(
        __dirname,
        "../../media/user",
        userId.toString(),
        "addimage",
        profile.addImageFilename
      );
      deleteLocalFile(oldPath);
    }

    const updatedProfile = await Profile.findOneAndUpdate(
      { userId },
      { $unset: { addImage: 1, addImageFilename: 1, addImageUpdatedAt: 1 } },
      { new: true }
    );

    return res.status(200).json({
      message: "Additional image deleted successfully",
      profile: updatedProfile,
    });
  } catch (error) {
    console.error("❌ Error deleting additional image:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};





exports.getProfileCompletion = async (req, res) => {
  try {
    const userId = req.Id || req.params.userId;

    if (!userId) {
      return res.status(400).json({ message: "User ID is required" });
    }

    const profile = await Profile.findOne({ userId }).lean();

    if (!profile) {
      return res.status(404).json({ message: "Profile not found" });
    }

    // ✅ Get both completion percentage and missing fields
    const { completion, missingFields } = calculateProfileCompletion(profile);

    return res.status(200).json({
      success: true,
      userId,
      completionPercentage: completion,
      missingFields,
      message: `Profile completion is ${completion}%`,
    });
  } catch (error) {
    console.error("Error fetching profile completion:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while calculating profile completion",
      error: error.message,
    });
  }
};







exports.getProfileOverview = async (req, res) => {
  try {
    const userId = req.Id || req.body.profileUserId;

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized: user ID not found" });
    }

    const userObjectId = new mongoose.Types.ObjectId(userId);

    // 1️⃣ Check profile exists
    const profileExists = await Profile.exists({ userId: userObjectId });
    if (!profileExists) {
      return res.status(404).json({ message: "Profile not found" });
    }

    // 2️⃣ Fetch user's personal activity counts (downloads & shares)
    const userActions = await UserFeedActions.findOne({
      $or: [{ userId: userObjectId }, { accountId: userObjectId }]
    }).lean();

    const downloadCount = userActions?.downloadedFeeds?.length || 0;
    const shareCount = userActions?.sharedFeeds?.length || 0;

    // 5️⃣ Response
    return res.status(200).json({
      message: "Profile overview fetched successfully",
      data: {
        userId,
        downloadCount,
        shareCount,
      },
    });

  } catch (error) {
    console.error("❌ Error fetching profile overview:", error);
    return res.status(500).json({
      message: "Internal server error",
      error: error.message,
    });
  }
};






exports.getProfileByUsername = async (req, res) => {
  try {
    const { username } = req.params;
    const viewerId = req.user?.id || null; // optional: authenticated viewer

    if (!username || typeof username !== "string") {
      return res.status(400).json({ success: false, message: "Invalid username." });
    }

    // 🔹 Find the profile by username
    const profile = await ProfileSettings.findOne({ userName: username })
      .populate("visibility") // get visibility reference
      .populate("userId", "email createdAt")
      .lean();

    if (!profile) {
      return res.status(404).json({
        success: false,
        message: "User profile not found.",
      });
    }

    // 🔹 Check follow relationship (to allow “followers” visibility)
    let isFollower = false;
    if (viewerId) {
      const creatorFollowers = await CreatorFollower.findOne({ creatorId: profile.userId }).lean();
      if (creatorFollowers?.followerIds?.some((id) => id.toString() === viewerId)) {
        isFollower = true;
      }
    }

    // 🔹 Helper: check visibility permission
    const canView = (fieldKey) => {
      const visibility = profile.visibility?.[fieldKey];
      if (!visibility || visibility === "public") return true;
      if (visibility === "followers" && isFollower) return true;
      return viewerId?.toString() === profile.userId?.toString(); // owner can view all
    };

    // 🔹 Get follower/following data
    const [creatorFollowers, followingData] = await Promise.all([
      Follower.findOne({ creatorId: profile.userId }).lean(),
      Following.findOne({ userId: profile.userId }).lean(),
    ]);

    const followerCount = creatorFollowers?.followerIds?.length || 0;
    const followingCount = followingData?.followingIds?.length || 0;

    // 🔹 Get user feeds (visible to all if public)
    const userFeeds = await Feed.find({
      $or: [
        { createdByAccount: profile.userId },
        { "postedBy.userId": profile.userId }
      ],
      roleRef: "User",
      status: { $in: ["Published", "published"] },
    })
      .populate("category", "name")
      .sort({ createdAt: -1 })
      .lean();

    const feedIds = userFeeds.map(f => f._id);

    // 🔹 Fetch user's personal activity counts (downloads & shares)
    const ownerActions = await UserFeedActions.findOne({
      $or: [{ userId: profile.userId }, { accountId: profile.userId }]
    }).lean();

    const downloadCount = ownerActions?.downloadedFeeds?.length || 0;
    const shareCount = ownerActions?.sharedFeeds?.length || 0;

    // ✅ Apply visibility filter to data
    const filteredData = {
      _id: profile._id,
      userName: canView("userName") ? profile.userName : null,
      name: canView("name") ? profile.name : null,
      lastName: canView("lastName") ? profile.lastName : null,
      bio: canView("bio") ? profile.bio : null,
      profileSummary: canView("bio") ? profile.profileSummary : null,
      gender: canView("gender") ? profile.gender : null,
      maritalStatus: canView("maritalStatus") ? profile.maritalStatus : null,
      dateOfBirth: canView("dateOfBirth") ? profile.dateOfBirth : null,
      maritalDate: canView("maritalDate") ? profile.maritalDate : null,
      phoneNumber: canView("phoneNumber") ? profile.phoneNumber : null,
      whatsAppNumber: canView("whatsAppNumber") ? profile.whatsAppNumber : null,
      address: canView("address") ? profile.address : null,
      city: canView("city") ? profile.city : null,
      country: canView("country") ? profile.country : null,
      profileAvatar: canView("profileAvatar") ? profile.profileAvatar : null,
      coverPhoto: canView("coverPhoto") ? profile.coverPhoto : null,
      theme: profile.theme,
      language: profile.language,
      timezone: profile.timezone,
      isPublished: profile.isPublished,
      shareableLink: profile.shareableLink,
      createdAt: profile.createdAt,
      updatedAt: profile.updatedAt,
      downloadCount,
      shareCount,
      feeds: userFeeds,
    };

    // 🔹 Filter social links per platform visibility
    const socialVisibility = profile.visibility?.socialLinks || {};
    filteredData.socialLinks = {};
    for (const [platform, value] of Object.entries(profile.socialLinks || {})) {
      const vis = socialVisibility[platform] || "public";
      if (vis === "public" || (vis === "followers" && isFollower) || viewerId?.toString() === profile.userId?.toString()) {
        filteredData.socialLinks[platform] = value;
      }
    }

    return res.status(200).json({
      success: true,
      message: "Profile fetched successfully",
      data: filteredData,
      permissions: {
        isFollower,
        viewerId,
      },
    });
  } catch (error) {
    console.error("❌ Error fetching profile by username:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while fetching user profile",
      error: error.message,
    });
  }
};


// ------------------- Visibility Settings -------------------

exports.getUserVisibilitySettings = async (req, res) => {
  try {
    const userId = req.Id;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const profile = await ProfileSettings.findOne({ userId }).populate("visibility");

    if (!profile) {
      return res.status(404).json({ message: "Profile not found" });
    }

    // If visibility document doesn't exist, create one
    if (!profile.visibility) {
      const newVisibility = new ProfileVisibility({});
      await newVisibility.save();
      profile.visibility = newVisibility._id;
      await profile.save();
      return res.status(200).json({ status: true, data: newVisibility });
    }

    return res.status(200).json({ status: true, visibility: profile.visibility });

  } catch (error) {
    console.error("Error fetching visibility settings:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

exports.updateUserVisibilitySettings = async (req, res) => {
  try {
    const userId = req.Id;
    let updates = req.body;

    // ✅ FIX: specific handling for { field, value } structure sent by ProfileSettings.jsx / mobile app
    if (updates.field && updates.value) {
      updates = { [updates.field]: updates.value };
    }

    if (updates.name) {
      updates.displayName = updates.name;
    }

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const profile = await ProfileSettings.findOne({ userId });

    if (!profile) {
      return res.status(404).json({ message: "Profile not found" });
    }

    let visibilityId = profile.visibility;

    if (!visibilityId) {
      // Create new if missing
      const newVisibility = new ProfileVisibility(updates);
      await newVisibility.save();
      profile.visibility = newVisibility._id;
      await profile.save();
      return res.status(200).json({ status: true, message: "Visibility settings updated", data: newVisibility });
    } else {
      // Update existing
      const updatedVisibility = await ProfileVisibility.findByIdAndUpdate(
        visibilityId,
        { $set: updates },
        { new: true }
      );
      return res.status(200).json({ status: true, message: "Visibility settings updated", data: updatedVisibility });
    }

  } catch (error) {
    console.error("Error updating visibility settings:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};














