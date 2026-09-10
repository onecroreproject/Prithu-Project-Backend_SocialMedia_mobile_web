const mongoose = require("mongoose");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

const { prithuDB } = require("../database");
const PostGlobalOption = require("../models/PostGlobalOption");
const DropdownConfig = require("../models/DropdownConfig");

const SESSIONS_DATA = [
  {
    name: "Morning",
    startTime: "04:00 AM",
    endTime: "11:00 AM",
    timeRange: "04:00 AM - 11:00 AM",
    isActive: true,
  },
  {
    name: "Afternoon",
    startTime: "12:00 PM",
    endTime: "05:00 PM",
    timeRange: "12:00 PM - 05:00 PM",
    isActive: true,
  },
  {
    name: "Evening",
    startTime: "05:00 PM",
    endTime: "08:00 PM",
    timeRange: "05:00 PM - 08:00 PM",
    isActive: true,
  },
  {
    name: "Night",
    startTime: "08:00 PM",
    endTime: "04:00 AM",
    timeRange: "08:00 PM - 04:00 AM",
    isActive: true,
  },
];

async function runSeed() {
  try {
    console.log("Connecting to database...");
    let config = await PostGlobalOption.findOne({ singletonId: "global_post_options" });
    if (!config) {
      console.log("No PostGlobalOption found, creating new one...");
      config = new PostGlobalOption({
        singletonId: "global_post_options",
        sessions: SESSIONS_DATA.map((s) => s.name),
        sessionsDetailed: SESSIONS_DATA,
      });
    } else {
      console.log("Existing PostGlobalOption found. Updating sessions & sessionsDetailed...");
      config.sessions = SESSIONS_DATA.map((s) => s.name);
      config.sessionsDetailed = SESSIONS_DATA;
    }
    await config.save();
    console.log("✅ PostGlobalOption updated successfully with", config.sessionsDetailed.length, "detailed sessions!");

    let legacy = await DropdownConfig.findOne();
    if (!legacy) {
      legacy = new DropdownConfig({
        sessions: SESSIONS_DATA.map((s) => s.name),
        sessionsDetailed: SESSIONS_DATA,
      });
    } else {
      legacy.sessions = SESSIONS_DATA.map((s) => s.name);
      legacy.sessionsDetailed = SESSIONS_DATA;
    }
    await legacy.save();
    console.log("✅ DropdownConfig synced successfully!");

    console.log("Session list summary:");
    config.sessionsDetailed.forEach((s) => {
      console.log(` - ${s.name}: ${s.timeRange}`);
    });

    process.exit(0);
  } catch (error) {
    console.error("❌ Seed error:", error);
    process.exit(1);
  }
}

runSeed();
