const PostGlobalOption = require("../models/PostGlobalOption");
const DropdownConfig = require("../models/DropdownConfig");
const Categories = require("../models/categorySchema");

// Comprehensive list of major special days with recurring MM-DD dates
const DEFAULT_SPECIAL_DAYS = [
  { name: "New Year", date: "01-01", isRecurringYearly: true },
  { name: "Pongal", date: "01-14", isRecurringYearly: true },
  { name: "Mattu Pongal", date: "01-15", isRecurringYearly: true },
  { name: "Kaanum Pongal", date: "01-16", isRecurringYearly: true },
  { name: "Republic Day", date: "01-26", isRecurringYearly: true },
  { name: "Maha Shivaratri", date: "02-15", isRecurringYearly: true },
  { name: "Holi", date: "03-04", isRecurringYearly: true },
  { name: "International Women's Day", date: "03-08", isRecurringYearly: true },
  { name: "Ugadi / Telugu New Year", date: "03-19", isRecurringYearly: true },
  { name: "Ramzan (Eid-ul-Fitr)", date: "03-21", isRecurringYearly: true },
  { name: "Good Friday", date: "04-03", isRecurringYearly: true },
  { name: "Easter Sunday", date: "04-05", isRecurringYearly: true },
  { name: "Tamil New Year (Puthandu)", date: "04-14", isRecurringYearly: true },
  { name: "May Day / Labor Day", date: "05-01", isRecurringYearly: true },
  { name: "Mother's Day", date: "05-10", isRecurringYearly: true },
  { name: "Bakrid (Eid al-Adha)", date: "05-27", isRecurringYearly: true },
  { name: "Father's Day", date: "06-21", isRecurringYearly: true },
  { name: "Independence Day", date: "08-15", isRecurringYearly: true },
  { name: "Onam", date: "08-26", isRecurringYearly: true },
  { name: "Raksha Bandhan", date: "08-28", isRecurringYearly: true },
  { name: "Krishna Jayanti / Janmashtami", date: "09-04", isRecurringYearly: true },
  { name: "Teachers' Day", date: "09-05", isRecurringYearly: true },
  { name: "Vinayagar Chaturthi / Ganesh Chaturthi", date: "09-14", isRecurringYearly: true },
  { name: "Gandhi Jayanti", date: "10-02", isRecurringYearly: true },
  { name: "Ayudha Pooja", date: "10-19", isRecurringYearly: true },
  { name: "Saraswati Pooja", date: "10-19", isRecurringYearly: true },
  { name: "Vijayadasami / Dussehra", date: "10-20", isRecurringYearly: true },
  { name: "Diwali / Deepavali", date: "11-08", isRecurringYearly: true },
  { name: "Children's Day", date: "11-14", isRecurringYearly: true },
  { name: "Christmas", date: "12-25", isRecurringYearly: true },
  { name: "New Year's Eve", date: "12-31", isRecurringYearly: true },
];

/**
 * Get current date string in Indian Standard Time (IST)
 * Returns { fullDate: "YYYY-MM-DD", monthDay: "MM-DD" }
 */
const getISTDateStrings = () => {
  const now = new Date();
  const istFormatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const fullDate = istFormatter.format(now); // "YYYY-MM-DD"
  const monthDay = fullDate.slice(5); // "MM-DD"
  return { fullDate, monthDay };
};

/**
 * Check if today matches any active special day in configuration or default calendar
 */
const getTodaySpecialDayInfo = async () => {
  try {
    const { fullDate, monthDay } = getISTDateStrings();

    let specialDaysList = [];
    try {
      const config = await PostGlobalOption.findOne({ singletonId: "global_post_options" }).lean();
      if (config && config.specialDays && config.specialDays.length > 0) {
        specialDaysList = config.specialDays.filter((sd) => sd.isActive !== false);
      }
    } catch (e) {
      // Fallback
    }

    if (!specialDaysList || specialDaysList.length === 0) {
      try {
        const legacy = await DropdownConfig.findOne().lean();
        if (legacy && legacy.specialDaysDetailed && legacy.specialDaysDetailed.length > 0) {
          specialDaysList = legacy.specialDaysDetailed.filter((sd) => sd.isActive !== false);
        }
      } catch (e) {
        // Fallback
      }
    }

    if (!specialDaysList || specialDaysList.length === 0) {
      specialDaysList = DEFAULT_SPECIAL_DAYS;
    }

    const matchedDays = [];
    for (const item of specialDaysList) {
      if (!item.date || !item.name) continue;
      const cleanDate = String(item.date).trim();
      const isYearly = item.isRecurringYearly !== false;

      const itemMonthDay = cleanDate.length === 5 ? cleanDate : cleanDate.slice(5);
      const itemFullDate = cleanDate;

      if (isYearly) {
        if (itemMonthDay === monthDay) {
          matchedDays.push(item.name.trim());
        }
      } else {
        if (itemFullDate === fullDate) {
          matchedDays.push(item.name.trim());
        }
      }
    }

    const uniqueNames = Array.from(new Set(matchedDays));
    const isSpecialDayToday = uniqueNames.length > 0;

    return {
      isSpecialDayToday,
      todayDate: fullDate,
      todayMonthDay: monthDay,
      specialDayNames: uniqueNames,
      primarySpecialDay: uniqueNames[0] || null,
    };
  } catch (err) {
    console.error("Error in getTodaySpecialDayInfo:", err);
    return {
      isSpecialDayToday: false,
      todayDate: "",
      todayMonthDay: "",
      specialDayNames: [],
      primarySpecialDay: null,
    };
  }
};

let cachedSpecialDaysCatId = null;
let lastCatIdFetchTime = 0;

const getSpecialDaysCategoryId = async () => {
  const now = Date.now();
  if (cachedSpecialDaysCatId && now - lastCatIdFetchTime < 10 * 60 * 1000) {
    return cachedSpecialDaysCatId;
  }
  try {
    const cat = await Categories.findOne({
      name: { $regex: /^special\s*days?$/i },
    })
      .select("_id name")
      .lean();
    if (cat) {
      cachedSpecialDaysCatId = cat._id;
      lastCatIdFetchTime = now;
    }
  } catch (err) {
    console.error("Error fetching Special Days Category ID:", err);
  }
  return cachedSpecialDaysCatId;
};

const isSpecialDaysCategory = (categoryOrName) => {
  if (!categoryOrName) return false;
  if (typeof categoryOrName === "string") {
    return /^special\s*days?$/i.test(categoryOrName.trim());
  }
  const name = categoryOrName.name || categoryOrName.categoryName || categoryOrName.categoriesName || "";
  if (/^special\s*days?$/i.test(String(name).trim())) {
    return true;
  }
  if (categoryOrName.isSpecialDay === true) {
    return true;
  }
  return false;
};

const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const FALLBACK_WEEK_GODS = {
  Sunday: ["Surya Bhagavan", "Jesus Christ", "Lord Shiva", "Lord Krishna"],
  Monday: ["🔱 Lord Shiva", "Goddess Parvati", "Lord Nataraja"],
  Tuesday: ["Lord Murugan", "Lord Ganesha", "Goddess Kali / Durga / Amman", "Lord Karuppasamy"],
  Wednesday: ["Lord Ganesha / Vinayagar", "Goddess Saraswati", "Lord Ayyanar"],
  Thursday: ["Shirdi Sai Baba", "Lord Dakshinamurthy", "Lord Rama", "Lord Perumal"],
  Friday: ["Goddess Mahalakshmi", "Goddess Durga / Amman", "Mother Mary", "Goddess Meenakshi", "Goddess Mariamman"],
  Saturday: ["Lord Venkateswara / Balaji", "Lord Shani", "Lord Hanuman", "Lord Ayyappa"]
};

/**
 * Get active deities / gods for today's weekday in IST
 */
const getTodayWeekGodsInfo = async () => {
  try {
    const now = new Date();
    const istWeekdayFormatter = new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Kolkata",
      weekday: "long"
    });
    const currentDay = istWeekdayFormatter.format(now); // e.g. "Tuesday"

    let godsList = [];
    try {
      const config = await PostGlobalOption.findOne({ singletonId: "global_post_options" }).lean();
      if (config && config.weekGods && config.weekGods.length > 0) {
        godsList = config.weekGods.filter(
          (wg) => wg.isActive !== false && wg.day && wg.day.toLowerCase() === currentDay.toLowerCase()
        );
      }
    } catch (e) {}

    let godNames = godsList.map((g) => g.godName).filter(Boolean);
    if (!godNames || godNames.length === 0) {
      godNames = FALLBACK_WEEK_GODS[currentDay] || [];
    }

    const uniqueGods = Array.from(new Set(godNames));
    return {
      currentDay,
      gods: uniqueGods,
      primaryGod: uniqueGods[0] || null,
      description: `Today (${currentDay})'s Deities: ${uniqueGods.join(", ")}`
    };
  } catch (err) {
    console.error("Error in getTodayWeekGodsInfo:", err);
    return {
      currentDay: "Tuesday",
      gods: [],
      primaryGod: null,
      description: ""
    };
  }
};

module.exports = {
  getISTDateStrings,
  getTodaySpecialDayInfo,
  getTodayWeekGodsInfo,
  getSpecialDaysCategoryId,
  isSpecialDaysCategory,
  DEFAULT_SPECIAL_DAYS,
  FALLBACK_WEEK_GODS,
  WEEKDAY_NAMES,
};
