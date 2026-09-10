const mongoose = require('mongoose');
const { prithuDB } = require('../database');
const PostGlobalOption = require('../models/PostGlobalOption');
const DropdownConfig = require('../models/DropdownConfig');

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

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

const ALL_SPECIAL_DAYS = [
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

async function seedSpecialDaysData() {
  try {
    let config = await PostGlobalOption.findOne({ singletonId: "global_post_options" });
    if (!config) {
      config = new PostGlobalOption({ singletonId: "global_post_options" });
    }

    const formattedSpecialDays = ALL_SPECIAL_DAYS.map((item) => ({
      name: item.name,
      date: item.date,
      dayOfWeek: calculateDayOfWeek(item.date),
      isRecurringYearly: item.isRecurringYearly !== undefined ? item.isRecurringYearly : true,
      isActive: true,
    }));

    config.specialDays = formattedSpecialDays;
    await config.save();
    console.log("SUCCESS: Seeded " + formattedSpecialDays.length + " special days into PostGlobalOption.");

    // Also sync with DropdownConfig legacy
    let legacy = await DropdownConfig.findOne();
    if (!legacy) {
      legacy = new DropdownConfig();
    }
    legacy.specialDays = formattedSpecialDays.map((s) => s.name);
    legacy.specialDaysDetailed = formattedSpecialDays;
    await legacy.save();
    console.log("SUCCESS: Synced special days with legacy DropdownConfig.");
  } catch (error) {
    console.error("ERROR seeding special days data:", error);
  } finally {
    process.exit(0);
  }
}

seedSpecialDaysData();
