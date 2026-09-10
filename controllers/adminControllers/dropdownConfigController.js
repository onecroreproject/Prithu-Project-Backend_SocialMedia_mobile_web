const DropdownConfig = require("../../models/DropdownConfig");
const PostGlobalOption = require("../../models/PostGlobalOption");

// @desc Get dropdown config (sessions, days, specialDays, gods)
// @route GET /api/admin/dropdown-config
exports.getDropdownConfig = async (req, res) => {
  try {
    const postGlobal = await PostGlobalOption.findOne({ singletonId: "global_post_options" });
    let config = await DropdownConfig.findOne();
    if (!config) {
      config = await DropdownConfig.create({});
    }

    const configObj = config.toObject ? config.toObject() : { ...config };

    if (postGlobal) {
      if (postGlobal.sessions && postGlobal.sessions.length) {
        configObj.sessions = postGlobal.sessions;
      }
      if (postGlobal.days && postGlobal.days.length) {
        configObj.days = postGlobal.days;
      }
      if (postGlobal.specialDays && postGlobal.specialDays.length) {
        configObj.specialDays = postGlobal.specialDays
          .filter((sd) => sd.isActive !== false)
          .map((sd) => sd.name);
        configObj.specialDaysDetailed = postGlobal.specialDays;
      }
      if (postGlobal.weekGods && postGlobal.weekGods.length) {
        configObj.gods = Array.from(
          new Set(
            postGlobal.weekGods
              .filter((wg) => wg.isActive !== false)
              .map((wg) => wg.godName)
              .filter(Boolean)
          )
        );
        configObj.weekGodsDetailed = postGlobal.weekGods;
      }
    }

    return res.status(200).json({
      success: true,
      config: configObj,
    });
  } catch (error) {
    console.error("Error fetching dropdown config:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch dropdown configuration",
    });
  }
};

// @desc Update dropdown config
// @route PUT /api/admin/dropdown-config
exports.updateDropdownConfig = async (req, res) => {
  try {
    const { sessions, days, specialDays } = req.body;
    let config = await DropdownConfig.findOne();
    if (!config) {
      config = new DropdownConfig();
    }

    if (Array.isArray(sessions)) config.sessions = sessions;
    if (Array.isArray(days)) config.days = days;
    if (Array.isArray(specialDays)) config.specialDays = specialDays;

    await config.save();

    // Also keep PostGlobalOption sessions and days in sync
    const postGlobal = await PostGlobalOption.findOne({ singletonId: "global_post_options" });
    if (postGlobal) {
      if (Array.isArray(sessions)) postGlobal.sessions = sessions;
      if (Array.isArray(days)) postGlobal.days = days;
      await postGlobal.save();
    }

    return res.status(200).json({
      success: true,
      message: "Dropdown configuration updated successfully",
      config,
    });
  } catch (error) {
    console.error("Error updating dropdown config:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to update dropdown configuration",
    });
  }
};
