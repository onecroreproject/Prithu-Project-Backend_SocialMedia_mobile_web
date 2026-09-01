const DropdownConfig = require("../../models/DropdownConfig");

// @desc Get dropdown config (sessions, days, specialDays)
// @route GET /api/admin/dropdown-config
exports.getDropdownConfig = async (req, res) => {
  try {
    let config = await DropdownConfig.findOne();
    if (!config) {
      config = await DropdownConfig.create({});
    }
    return res.status(200).json({
      success: true,
      config,
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
