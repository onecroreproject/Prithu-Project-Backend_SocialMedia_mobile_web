const mongoose = require("mongoose");
const { prithuDB } = require("../database");

const dropdownConfigSchema = new mongoose.Schema(
  {
    sessions: {
      type: [String],
      default: ["Morning", "Afternoon", "Evening", "Night"],
    },
    days: {
      type: [String],
      default: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
    },
    specialDays: {
      type: [String],
      default: [
        "New Year",
        "Pongal",
        "Republic Day",
        "Valentine's Day",
        "Maha Shivaratri",
        "Holi",
        "Ugadi",
        "Good Friday",
        "Easter",
        "Tamil New Year",
        "Eid ul-Fitr",
        "Labor Day",
        "Bakrid",
        "Independence Day",
        "Raksha Bandhan",
        "Krishna Janmashtami",
        "Ganesh Chaturthi",
        "Gandhi Jayanti",
        "Navaratri / Dussehra",
        "Diwali",
        "Guru Nanak Jayanti",
        "Christmas"
      ],
    },
  },
  { timestamps: true }
);

module.exports = prithuDB.model("DropdownConfig", dropdownConfigSchema);
