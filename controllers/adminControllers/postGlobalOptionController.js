const PostGlobalOption = require("../../models/PostGlobalOption");
const DropdownConfig = require("../../models/DropdownConfig");
const Category = require("../../models/categorySchema");

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const DEFAULT_WEEK_GODS = [
  { day: "Monday", godName: "Lord Murugan" },
  { day: "Monday", godName: "Lord Shiva" },
  { day: "Monday", godName: "Allah" },
  { day: "Tuesday", godName: "Lord Ganesha" },
  { day: "Tuesday", godName: "Lord Hanuman" },
  { day: "Tuesday", godName: "Lord Murugan" },
  { day: "Wednesday", godName: "Lord Krishna" },
  { day: "Wednesday", godName: "Lord Perumal / Vishnu" },
  { day: "Thursday", godName: "Guru Bhagavan" },
  { day: "Thursday", godName: "Shirdi Sai Baba" },
  { day: "Thursday", godName: "Lord Dakshinamurthy" },
  { day: "Friday", godName: "Goddess Mahalakshmi" },
  { day: "Friday", godName: "Goddess Durga / Amman" },
  { day: "Friday", godName: "Mother Mary" },
  { day: "Saturday", godName: "Lord Venkateswara / Balaji" },
  { day: "Saturday", godName: "Lord Shani" },
  { day: "Sunday", godName: "Surya Bhagavan" },
  { day: "Sunday", godName: "Jesus Christ" },
];

const DEFAULT_SPECIAL_DAYS = [
  { name: "New Year", date: "2026-01-01", isRecurringYearly: true },
  { name: "Pongal", date: "2026-01-14", isRecurringYearly: true },
  { name: "Mattu Pongal", date: "2026-01-15", isRecurringYearly: true },
  { name: "Kaanum Pongal", date: "2026-01-16", isRecurringYearly: true },
  { name: "Republic Day", date: "2026-01-26", isRecurringYearly: true },
  { name: "Maha Shivaratri", date: "2026-02-15", isRecurringYearly: true },
  { name: "Holi", date: "2026-03-04", isRecurringYearly: true },
  { name: "International Women's Day", date: "2026-03-08", isRecurringYearly: true },
  { name: "Ugadi / Telugu New Year", date: "2026-03-19", isRecurringYearly: true },
  { name: "Ramzan (Eid-ul-Fitr)", date: "2026-03-21", isRecurringYearly: true },
  { name: "Good Friday", date: "2026-04-03", isRecurringYearly: true },
  { name: "Easter Sunday", date: "2026-04-05", isRecurringYearly: true },
  { name: "Tamil New Year (Puthandu)", date: "2026-04-14", isRecurringYearly: true },
  { name: "May Day / Labor Day", date: "2026-05-01", isRecurringYearly: true },
  { name: "Mother's Day", date: "2026-05-10", isRecurringYearly: true },
  { name: "Bakrid (Eid al-Adha)", date: "2026-05-27", isRecurringYearly: true },
  { name: "Father's Day", date: "2026-06-21", isRecurringYearly: true },
  { name: "Independence Day", date: "2026-08-15", isRecurringYearly: true },
  { name: "Onam", date: "2026-08-26", isRecurringYearly: true },
  { name: "Raksha Bandhan", date: "2026-08-28", isRecurringYearly: true },
  { name: "Krishna Jayanti / Janmashtami", date: "2026-09-04", isRecurringYearly: true },
  { name: "Teachers' Day", date: "2026-09-05", isRecurringYearly: true },
  { name: "Vinayagar Chaturthi / Ganesh Chaturthi", date: "2026-09-14", isRecurringYearly: true },
  { name: "Gandhi Jayanti", date: "2026-10-02", isRecurringYearly: true },
  { name: "Ayudha Pooja", date: "2026-10-19", isRecurringYearly: true },
  { name: "Saraswati Pooja", date: "2026-10-19", isRecurringYearly: true },
  { name: "Vijayadasami / Dussehra", date: "2026-10-20", isRecurringYearly: true },
  { name: "Diwali / Deepavali", date: "2026-11-08", isRecurringYearly: true },
  { name: "Children's Day", date: "2026-11-14", isRecurringYearly: true },
  { name: "Christmas", date: "2026-12-25", isRecurringYearly: true },
  { name: "New Year's Eve", date: "2026-12-31", isRecurringYearly: true },
];

const DEFAULT_SESSIONS_DETAILED = [
  { name: "Morning", startTime: "04:00 AM", endTime: "11:00 AM", timeRange: "04:00 AM - 11:00 AM", isActive: true },
  { name: "Afternoon", startTime: "12:00 PM", endTime: "05:00 PM", timeRange: "12:00 PM - 05:00 PM", isActive: true },
  { name: "Evening", startTime: "05:00 PM", endTime: "08:00 PM", timeRange: "05:00 PM - 08:00 PM", isActive: true },
  { name: "Night", startTime: "08:00 PM", endTime: "04:00 AM", timeRange: "08:00 PM - 04:00 AM", isActive: true },
];

// Helper: compute day of week name from "YYYY-MM-DD"
const calculateDayOfWeek = (dateStr) => {
  if (!dateStr) return "";
  try {
    const parts = dateStr.split("-");
    if (parts.length === 3) {
      const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
      return DAY_NAMES[d.getDay()] || "";
    }
    const d = new Date(dateStr);
    return DAY_NAMES[d.getDay()] || "";
  } catch {
    return "";
  }
};

// Helper: sync data with legacy DropdownConfig so FeedUpload & mobile continue working seamlessly
const syncLegacyDropdownConfig = async (config) => {
  try {
    let legacy = await DropdownConfig.findOne();
    if (!legacy) {
      legacy = new DropdownConfig();
    }

    if (config.sessions && config.sessions.length > 0) {
      legacy.sessions = config.sessions;
    }
    if (config.sessionsDetailed && config.sessionsDetailed.length > 0) {
      legacy.sessionsDetailed = config.sessionsDetailed;
    }
    if (config.days && config.days.length > 0) {
      legacy.days = config.days;
    }

    // Special days string list
    if (config.specialDays && config.specialDays.length > 0) {
      const specialDayStrings = Array.from(
        new Set(
          config.specialDays
            .filter((sd) => sd.isActive !== false)
            .map((sd) => sd.name.trim())
            .filter(Boolean)
        )
      );
      if (specialDayStrings.length > 0) {
        legacy.specialDays = specialDayStrings;
      }
    }

    await legacy.save();
  } catch (err) {
    console.error("Error syncing legacy dropdown config:", err);
  }
};

// Helper: get or initialize singleton configuration document
const getOrCreateConfig = async () => {
  let config = await PostGlobalOption.findOne({ singletonId: "global_post_options" });
  if (!config) {
    const initializedSpecialDays = DEFAULT_SPECIAL_DAYS.map((sd) => ({
      ...sd,
      dayOfWeek: calculateDayOfWeek(sd.date),
      isActive: true,
    }));

    config = await PostGlobalOption.create({
      singletonId: "global_post_options",
      sessions: ["Morning", "Afternoon", "Evening", "Night"],
      sessionsDetailed: DEFAULT_SESSIONS_DETAILED,
      days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
      weekGods: DEFAULT_WEEK_GODS,
      specialDays: initializedSpecialDays,
    });

    await syncLegacyDropdownConfig(config);
  } else {
    // If sessionsDetailed is not yet populated in existing document
    if (!config.sessionsDetailed || config.sessionsDetailed.length === 0) {
      config.sessionsDetailed = DEFAULT_SESSIONS_DETAILED;
      await config.save();
      await syncLegacyDropdownConfig(config);
    }
  }
  return config;
};

// ==========================================
// 1. GET ALL POST GLOBAL OPTIONS
// ==========================================
exports.getPostGlobalOptions = async (req, res) => {
  try {
    const config = await getOrCreateConfig();
    const categories = await Category.find({}).select("_id name subcategories").lean();
    const formattedCategories = categories.map((c) => ({
      _id: c._id,
      categoryId: c._id,
      name: c.name,
      categoriesName: c.name,
      subcategories: Array.isArray(c.subcategories) ? c.subcategories : [],
    }));

    return res.status(200).json({
      success: true,
      config,
      categories: formattedCategories,
    });
  } catch (error) {
    console.error("Error getting post global options:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch post global options",
    });
  }
};

// ==========================================
// 2. WEEK GODS CRUD
// ==========================================

// @desc Add a new deity/entity to a specific week day
// @route POST /api/admin/post-global-options/week-gods
exports.addWeekGod = async (req, res) => {
  try {
    const { day, godName, isActive } = req.body;

    if (!day || !godName || !godName.trim()) {
      return res.status(400).json({
        success: false,
        message: "Day and God Name are required",
      });
    }

    const config = await getOrCreateConfig();

    const newWeekGod = {
      day: day.trim(),
      godName: godName.trim(),
      isActive: isActive !== undefined ? Boolean(isActive) : true,
    };

    config.weekGods.push(newWeekGod);
    await config.save();
    await syncLegacyDropdownConfig(config);

    const addedItem = config.weekGods[config.weekGods.length - 1];

    return res.status(201).json({
      success: true,
      message: `Added ${godName} to ${day} successfully`,
      item: addedItem,
      config,
    });
  } catch (error) {
    console.error("Error adding week god:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to add week god option",
    });
  }
};

// @desc Update an existing week god entry
// @route PUT /api/admin/post-global-options/week-gods/:id
exports.updateWeekGod = async (req, res) => {
  try {
    const { id } = req.params;
    const { day, godName, isActive } = req.body;

    const config = await getOrCreateConfig();
    const item = config.weekGods.id(id);

    if (!item) {
      return res.status(404).json({
        success: false,
        message: "Week God item not found",
      });
    }

    if (day) item.day = day.trim();
    if (godName) item.godName = godName.trim();
    if (isActive !== undefined) item.isActive = Boolean(isActive);

    await config.save();
    await syncLegacyDropdownConfig(config);

    return res.status(200).json({
      success: true,
      message: "Week God item updated successfully",
      item,
      config,
    });
  } catch (error) {
    console.error("Error updating week god:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to update week god option",
    });
  }
};

// @desc Delete a week god entry
// @route DELETE /api/admin/post-global-options/week-gods/:id
exports.deleteWeekGod = async (req, res) => {
  try {
    const { id } = req.params;
    const config = await getOrCreateConfig();

    const item = config.weekGods.id(id);
    if (!item) {
      return res.status(404).json({
        success: false,
        message: "Week God item not found",
      });
    }

    config.weekGods.pull(id);
    await config.save();
    await syncLegacyDropdownConfig(config);

    return res.status(200).json({
      success: true,
      message: "Week God item deleted successfully",
      config,
    });
  } catch (error) {
    console.error("Error deleting week god:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to delete week god option",
    });
  }
};

// ==========================================
// 3. SPECIAL DAYS CRUD
// ==========================================

// @desc Add a new Special Day with date
// @route POST /api/admin/post-global-options/special-days
exports.addSpecialDay = async (req, res) => {
  try {
    const { name, date, isRecurringYearly, isActive } = req.body;

    if (!name || !name.trim() || !date || !date.trim()) {
      return res.status(400).json({
        success: false,
        message: "Special Day Name and Date (YYYY-MM-DD) are required",
      });
    }

    const config = await getOrCreateConfig();

    const cleanDate = date.trim();
    const dayOfWeek = calculateDayOfWeek(cleanDate);

    const newSpecialDay = {
      name: name.trim(),
      date: cleanDate,
      dayOfWeek,
      isRecurringYearly: isRecurringYearly !== undefined ? Boolean(isRecurringYearly) : true,
      isActive: isActive !== undefined ? Boolean(isActive) : true,
    };

    config.specialDays.push(newSpecialDay);
    await config.save();
    await syncLegacyDropdownConfig(config);

    const addedItem = config.specialDays[config.specialDays.length - 1];

    return res.status(201).json({
      success: true,
      message: `Added Special Day "${name}" on ${date} successfully`,
      item: addedItem,
      config,
    });
  } catch (error) {
    console.error("Error adding special day:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to add special day",
    });
  }
};

// @desc Update an existing Special Day
// @route PUT /api/admin/post-global-options/special-days/:id
exports.updateSpecialDay = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, date, isRecurringYearly, isActive } = req.body;

    const config = await getOrCreateConfig();
    const item = config.specialDays.id(id);

    if (!item) {
      return res.status(404).json({
        success: false,
        message: "Special Day item not found",
      });
    }

    if (name) item.name = name.trim();
    if (date) {
      item.date = date.trim();
      item.dayOfWeek = calculateDayOfWeek(item.date);
    }
    if (isRecurringYearly !== undefined) item.isRecurringYearly = Boolean(isRecurringYearly);
    if (isActive !== undefined) item.isActive = Boolean(isActive);

    await config.save();
    await syncLegacyDropdownConfig(config);

    return res.status(200).json({
      success: true,
      message: "Special Day updated successfully",
      item,
      config,
    });
  } catch (error) {
    console.error("Error updating special day:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to update special day",
    });
  }
};

// @desc Delete a Special Day
// @route DELETE /api/admin/post-global-options/special-days/:id
exports.deleteSpecialDay = async (req, res) => {
  try {
    const { id } = req.params;
    const config = await getOrCreateConfig();

    const item = config.specialDays.id(id);
    if (!item) {
      return res.status(404).json({
        success: false,
        message: "Special Day not found",
      });
    }

    config.specialDays.pull(id);
    await config.save();
    await syncLegacyDropdownConfig(config);

    return res.status(200).json({
      success: true,
      message: "Special Day deleted successfully",
      config,
    });
  } catch (error) {
    console.error("Error deleting special day:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to delete special day",
    });
  }
};

// ==========================================
// 4. SESSIONS & DAYS
// ==========================================

// @desc Update Sessions list
// @route PUT /api/admin/post-global-options/sessions
exports.updateSessions = async (req, res) => {
  try {
    const rawSessions = req.body.sessionsDetailed || req.body.sessions;
    if (!Array.isArray(rawSessions)) {
      return res.status(400).json({ success: false, message: "Sessions must be an array" });
    }

    const config = await getOrCreateConfig();
    const updatedDetailed = [];
    const updatedStringNames = [];

    rawSessions.forEach((item) => {
      if (typeof item === "string") {
        const name = item.trim();
        if (name) {
          updatedStringNames.push(name);
          const existing = config.sessionsDetailed?.find((s) => s.name?.toLowerCase() === name.toLowerCase());
          if (existing) {
            updatedDetailed.push({
              name: existing.name,
              startTime: existing.startTime || "",
              endTime: existing.endTime || "",
              timeRange: existing.timeRange || "",
              isActive: existing.isActive !== false,
            });
          } else {
            const def = DEFAULT_SESSIONS_DETAILED.find((d) => d.name?.toLowerCase() === name.toLowerCase());
            updatedDetailed.push({
              name,
              startTime: def ? def.startTime : "",
              endTime: def ? def.endTime : "",
              timeRange: def ? def.timeRange : "",
              isActive: true,
            });
          }
        }
      } else if (item && typeof item === "object") {
        const name = (item.name || "").trim();
        if (name) {
          const startTime = (item.startTime || "").trim();
          const endTime = (item.endTime || "").trim();
          let timeRange = (item.timeRange || "").trim();
          if (!timeRange && startTime && endTime) {
            timeRange = `${startTime} - ${endTime}`;
          }
          updatedStringNames.push(name);
          updatedDetailed.push({
            name,
            startTime,
            endTime,
            timeRange,
            isActive: item.isActive !== false,
          });
        }
      }
    });

    config.sessions = updatedStringNames;
    config.sessionsDetailed = updatedDetailed;
    await config.save();
    await syncLegacyDropdownConfig(config);

    return res.status(200).json({
      success: true,
      message: "Sessions updated successfully",
      config,
    });
  } catch (error) {
    console.error("Error updating sessions:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to update sessions",
    });
  }
};

// @desc Update Days list
// @route PUT /api/admin/post-global-options/days
exports.updateDays = async (req, res) => {
  try {
    const { days } = req.body;
    if (!Array.isArray(days)) {
      return res.status(400).json({ success: false, message: "Days must be an array" });
    }

    const config = await getOrCreateConfig();
    config.days = days.map((d) => String(d).trim()).filter(Boolean);
    await config.save();
    await syncLegacyDropdownConfig(config);

    return res.status(200).json({
      success: true,
      message: "Days updated successfully",
      config,
    });
  } catch (error) {
    console.error("Error updating days:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to update days",
    });
  }
};
