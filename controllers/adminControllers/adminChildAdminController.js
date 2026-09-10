const ChildAdmin = require('../../models/childAdminModel');
const ProfileSettings = require("../../models/profileSettingModel");
const { ALL_PERMISSIONS } = require("../../Config/permissions");
const mongoose = require('mongoose');


exports.getChildAdmins = async (req, res) => {
  try {
    const parentAdminId = req.Id;
    if (!parentAdminId) {
      return res.status(400).json({ success: false, message: 'Admin ID not found' });
    }

    const today = new Date().toISOString().split('T')[0];

    // Use aggregation to get admins, their profiles, and today's activity stats
    const childAdmins = await ChildAdmin.aggregate([
      { $match: { parentAdminId: new mongoose.Types.ObjectId(parentAdminId) } },
      {
        $lookup: {
          from: "ProfileSettings",
          localField: "_id",
          foreignField: "childAdminId",
          as: "profile"
        }
      },
      { $unwind: { path: "$profile", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: "ChildAdminActivities",
          let: { adminId: "$_id" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$childAdminId", "$$adminId"] },
                    { $eq: ["$date", today] },
                    { $eq: ["$status", "Online"] }
                  ]
                }
              }
            }
          ],
          as: "todayActivities"
        }
      },
      {
        $addFields: {
          profileAvatar: "$profile.profileAvatar",
          todayDurationMs: {
            $sum: {
              $map: {
                input: "$todayActivities",
                as: "act",
                in: {
                  $subtract: [
                    { $ifNull: ["$$act.logoutTime", new Date()] },
                    "$$act.loginTime"
                  ]
                }
              }
            }
          }
        }
      },
      {
        $project: {
          userName: 1,
          email: 1,
          childAdminId: 1,
          childAdminType: 1,
          isApprovedByParent: 1,
          isOnline: 1,
          createdAt: 1,
          profileAvatar: 1,
          onlineHoursToday: { $divide: ["$todayDurationMs", 3600000] } // Convert ms to hours
        }
      },
      { $sort: { createdAt: -1 } }
    ]);

    return res.status(200).json({ success: true, admins: childAdmins });
  } catch (error) {
    console.error('Error fetching child admins:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};







exports.getChildAdminPermissions = async (req, res) => {
  try {
    const { childAdminId } = req.params;
    if (!childAdminId) {
      return res.status(400).json({ success: false, message: 'Child Admin ID is required' });
    }


    const childAdmin = await ChildAdmin.findById(childAdminId)
      .select('childAdminId userName email grantedPermissions ungrantedPermissions customPermissions menuPermissions isApprovedByParent')
      .lean();

    if (!childAdmin) {
      return res.status(404).json({ success: false, message: 'Child admin not found' });
    }

    // Compute ungrantedPermissions on the fly
    let ungrantedPermissions = ALL_PERMISSIONS.filter(perm => !childAdmin.grantedPermissions.includes(perm));

    return res.status(200).json({
      success: true,
      childAdmin: {
        childAdminId: childAdmin.childAdminId,
        userName: childAdmin.userName,
        email: childAdmin.email,
        isApprovedByParent: childAdmin.isApprovedByParent,
        grantedPermissions: childAdmin.grantedPermissions,
        ungrantedPermissions,
        customPermissions: childAdmin.customPermissions,
        menuPermissions: childAdmin.menuPermissions,
      },
    });
  } catch (error) {
    console.error('Failed to fetch child admin permissions:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};




exports.updateChildAdminPermissions = async (req, res) => {
  try {
    const { id } = req.params;

    const { grantedPermissions = [], customPermissions = {}, menuPermissions = [] } = req.body;

    if (!Array.isArray(grantedPermissions)) {
      return res.status(400).json({ success: false, message: 'grantedPermissions must be an array' });
    }

    // ✅ List of all defined system permissions

    // Compute ungranted permissions
    const ungrantedPermissions = ALL_PERMISSIONS.filter(p => !grantedPermissions.includes(p));

    // ✅ Update efficiently using findOneAndUpdate
    const updatedAdmin = await ChildAdmin.findByIdAndUpdate(
      id,
      {
        grantedPermissions,
        customPermissions,
        menuPermissions,

      },
      { new: true, lean: true }
    );


    if (!updatedAdmin) {
      return res.status(404).json({ success: false, message: 'Child admin not found' });
    }

    return res.status(200).json({
      success: true,
      message: 'Permissions updated successfully',
      childAdmin: {
        childAdminId: updatedAdmin.childAdminId,
        grantedPermissions: updatedAdmin.grantedPermissions,
        customPermissions: updatedAdmin.customPermissions,
        menuPermissions: updatedAdmin.menuPermissions,
      },
    });
  } catch (error) {
    console.error('Error updating child admin permissions:', error);
    return res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};






exports.getChildAdminById = async (req, res) => {
  try {
    const { id } = req.params || req.body;


    const { role: currentUserRole, Id: currentUserId, grantedPermissions } = req;
    const isSelf = currentUserId === id;
    const hasPermission = grantedPermissions?.includes('canManageChildAdmins') || grantedPermissions?.includes('ALL');

    if (currentUserRole !== "Admin" && !isSelf && !hasPermission) {
      return res.status(403).json({
        success: false,
        message: "Access denied. You do not have permission to view this child admin profile."
      });
    }

    // 1️⃣ Fetch ChildAdmin basic details (excluding password), populate parent
    const childAdmin = await ChildAdmin.findById(id)
      .populate({
        path: "parentAdminId",
        select: "userName email role",
      })
      .select("-passwordHash")
      .lean();

    if (!childAdmin) {
      return res.status(404).json({ message: "Child Admin not found." });
    }

    // 2️⃣ Fetch related Profile Settings
    const profile = await ProfileSettings.findOne({ childAdminId: id })
      .select(
        "displayName gender userName bio dateOfBirth maritalDate maritalStatus phoneNumber profileAvatar modifyAvatar theme privacy language timezone"
      )
      .lean();

    // 3️⃣ Determine ungranted permissions
    let ungrantedPermissions = ALL_PERMISSIONS.filter(
      (perm) => !childAdmin.grantedPermissions.includes(perm)
    );



    // 4️⃣ Combine both data sources
    const combinedData = {
      _id: childAdmin._id,
      userName: childAdmin.userName,
      email: childAdmin.email,
      parentAdmin: childAdmin.parentAdminId,
      menuPermissions: childAdmin.menuPermissions,
      grantedPermissions: childAdmin.grantedPermissions,
      ungrantedPermissions,
      isActive: childAdmin.isActive,
      isApprovedByParent: childAdmin.isApprovedByParent,
      createdAt: childAdmin.createdAt,
      updatedAt: childAdmin.updatedAt,
      profile: profile || null,
    };

    // 5️⃣ Send response
    res.status(200).json({
      message: "Child Admin fetched successfully.",
      data: combinedData,
    });
  } catch (error) {
    console.error("❌ Error fetching child admin:", error);
    res.status(500).json({
      message: "Server error while fetching child admin.",
      error: error.message,
    });
  }
};






exports.blockChildAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id)
      return res
        .status(400)
        .json({ success: false, message: "Child admin ID is required" });

    const childAdmin = await ChildAdmin.findById(id);
    if (!childAdmin)
      return res
        .status(404)
        .json({ success: false, message: "Child admin not found" });

    // Toggle active status
    childAdmin.isActive = !childAdmin.isActive;
    await childAdmin.save();

    return res.status(200).json({
      success: true,
      message: `Child admin ${childAdmin.userName} is now ${childAdmin.isActive ? "active" : "blocked"
        }`,
      data: childAdmin,
    });
  } catch (error) {
    console.error("Error toggling child admin status:", error);
    return res
      .status(500)
      .json({ success: false, message: "Server error", error: error.message });
  }
};


// ✅ Delete child admin
exports.deleteChildAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ success: false, message: "Child admin ID is required" });
    console.log(id)
    const childAdmin = await ChildAdmin.findByIdAndDelete(id);
    if (!childAdmin) return res.status(404).json({ success: false, message: "Child admin not found" });

    return res.status(200).json({
      success: true,
      message: `Child admin ${childAdmin.userName} deleted successfully`,
    });
  } catch (error) {
    console.error("Error deleting child admin:", error);
    return res.status(500).json({ success: false, message: "Server error", error: error.message });
  }
};


// ✅ Update child admin profile details, social links, and avatar
exports.updateChildAdminProfileById = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      userName,
      email: newEmail,
      password: newPassword,
      phoneNumber,
      bio,
      gender,
      displayName,
      socialLinks,
      privacy,
      fieldPrivacy
    } = req.body;
    const { role: currentUserRole, Id: currentUserId } = req;

    // 0️⃣ Authorization check: Admin can update anyone, Child Admin can only update themselves
    const isSelf = currentUserId === id;
    if (currentUserRole !== "Admin" && !isSelf) {
      return res.status(403).json({
        success: false,
        message: "Access denied. You can only update your own profile."
      });
    }

    // 1️⃣ Find Child Admin
    const childAdmin = await ChildAdmin.findById(id);
    if (!childAdmin) {
      return res.status(404).json({ success: false, message: "Child admin not found" });
    }

    // 2️⃣ Handle Email and Password (Only for Admin or self where allowed)
    if (newEmail && newEmail !== childAdmin.email) {
      const existingEmail = await ChildAdmin.findOne({ email: newEmail });
      if (existingEmail && existingEmail._id.toString() !== id) {
        return res.status(400).json({ success: false, message: "Email already in use" });
      }
      childAdmin.email = newEmail;
    }

    if (newPassword && currentUserRole === "Admin") {
      const bcrypt = require('bcrypt');
      childAdmin.passwordHash = await bcrypt.hash(newPassword, 10);
    }

    // 3️⃣ Update ChildAdmin basic info
    if (userName) childAdmin.userName = userName;
    await childAdmin.save();

    // 4️⃣ Find or Create Profile Settings
    let profile = await ProfileSettings.findOne({ childAdminId: id });
    if (!profile) {
      profile = new ProfileSettings({ childAdminId: id });
    }

    // 5️⃣ Update Profile Details
    if (phoneNumber) profile.phoneNumber = phoneNumber;
    if (bio) profile.bio = bio;
    if (gender) profile.gender = gender;
    if (displayName) profile.displayName = displayName;
    if (userName) profile.userName = userName;

    // 5.1️⃣ Handle Privacy (Fix for 500 Validation Error)
    if (privacy) {
      if (typeof privacy === "string") {
        profile.privacy = privacy;
      } else if (typeof privacy === "object") {
        // If frontend sends fieldPrivacy object inside privacy field, map it correctly
        profile.fieldPrivacy = { ...profile.fieldPrivacy, ...privacy };
      }
    }

    if (fieldPrivacy && typeof fieldPrivacy === "object") {
      profile.fieldPrivacy = { ...profile.fieldPrivacy, ...fieldPrivacy };
    }

    // 6️⃣ Handle Social Links
    if (socialLinks) {
      try {
        const parsedLinks = typeof socialLinks === 'string' ? JSON.parse(socialLinks) : socialLinks;
        profile.socialLinks = {
          ...profile.socialLinks,
          ...parsedLinks
        };
      } catch (err) {
        console.warn("⚠️ Invalid socialLinks format:", err.message);
      }
    }

    // 7️⃣ Handle Avatar Upload (Local Storage with Absolute URL)
    if (req.childAdminAvatar) {
      // 🧹 Delete old profile avatar if it exists
      if (profile.profileAvatarFilename) {
        try {
          const { BASE_MEDIA_DIR } = require("../../utils/storageEngine");
          const oldAvatarPath = path.join(BASE_MEDIA_DIR, 'child-admins', id, 'avatar', profile.profileAvatarFilename);
          if (require('fs').existsSync(oldAvatarPath)) {
            require('fs').unlinkSync(oldAvatarPath);
          }
        } catch (err) {
          console.error("❌ Failed to delete old avatar:", err.message);
        }
      }

      profile.profileAvatar = req.childAdminAvatar.url;
      profile.profileAvatarFilename = req.childAdminAvatar.filename;
    }

    await profile.save();

    return res.status(200).json({
      success: true,
      message: "Child Admin profile updated successfully",
      data: {
        _id: childAdmin._id,
        userName: childAdmin.userName,
        email: childAdmin.email,
        profile: profile
      }
    });

  } catch (error) {
    console.error("❌ Error updating child admin profile:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while updating child admin profile",
      error: error.message
    });
  }
};
