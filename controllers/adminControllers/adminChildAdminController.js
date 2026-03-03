const ChildAdmin = require('../../models/childAdminModel');
const ProfileSettings = require("../../models/profileSettingModel");
const { ALL_PERMISSIONS } = require("../../Config/permissions");


exports.getChildAdmins = async (req, res) => {
  try {
    const parentAdminId = req.Id;
    if (!parentAdminId) {
      return res.status(400).json({ success: false, message: 'Admin ID not found' });
    }

    const childAdmins = await ChildAdmin.find(
      { parentAdminId },
      'userName email childAdminId childAdminType isApprovedByParent createdAt'
    ).sort({ createdAt: -1 });

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
      email: childAdmin.email,
      userName: childAdmin.userName,
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

