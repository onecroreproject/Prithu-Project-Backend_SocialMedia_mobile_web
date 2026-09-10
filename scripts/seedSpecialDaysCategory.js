const mongoose = require('mongoose');
const { prithuDB } = require('../database');
const Categories = require('../models/categorySchema');

const SPECIAL_DAYS_SUBCATEGORIES = [
  "New Year",
  "Pongal",
  "Mattu Pongal",
  "Kaanum Pongal",
  "Republic Day",
  "Maha Shivaratri",
  "Holi",
  "Ugadi / Telugu New Year",
  "Tamil New Year (Puthandu)",
  "Good Friday",
  "Easter Sunday",
  "Ramzan (Eid-ul-Fitr)",
  "Bakrid (Eid al-Adha)",
  "May Day / Labor Day",
  "Muharram",
  "Independence Day",
  "Raksha Bandhan",
  "Krishna Jayanti / Janmashtami",
  "Vinayagar Chaturthi / Ganesh Chaturthi",
  "Onam",
  "Gandhi Jayanti",
  "Ayudha Pooja",
  "Saraswati Pooja",
  "Vijayadasami / Dussehra",
  "Diwali / Deepavali",
  "Children's Day",
  "Christmas",
  "New Year's Eve",
  "Mother's Day",
  "Father's Day",
  "International Women's Day",
  "Teachers' Day"
];

async function seedSpecialDaysCategory() {
  try {
    let category = await Categories.findOne({
      name: { $regex: new RegExp("^special days$", "i") }
    });

    if (!category) {
      category = new Categories({
        name: "Special Days",
        subcategories: SPECIAL_DAYS_SUBCATEGORIES,
      });
      await category.save();
      console.log("SUCCESS: Created new category 'Special Days' with " + SPECIAL_DAYS_SUBCATEGORIES.length + " subcategories.");
    } else {
      const existing = category.subcategories || [];
      const combined = Array.from(new Set([...existing, ...SPECIAL_DAYS_SUBCATEGORIES]));
      category.name = "Special Days";
      category.subcategories = combined;
      await category.save();
      console.log("SUCCESS: Updated category 'Special Days' with total " + combined.length + " subcategories.");
    }
  } catch (error) {
    console.error("ERROR seeding Special Days category:", error);
  } finally {
    process.exit(0);
  }
}

seedSpecialDaysCategory();
