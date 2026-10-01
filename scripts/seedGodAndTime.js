const { connectPrithuDB } = require("../database");
const GodConfig = require("../models/GodConfig");
const TimeSlot = require("../models/TimeSlot");

const godRules = [
    { day: "Monday", god: "Shiva" },
    { day: "Tuesday", god: "Hanuman" },
    { day: "Wednesday", god: "Ganesha" },
    { day: "Thursday", god: "Vishnu" },
    { day: "Friday", god: "Devi" },
    { day: "Saturday", god: "Shani" },
    { day: "Sunday", god: "Surya" }
];

const timeRules = [
    { name: "Morning", startTime: 5, endTime: 11, priority: 2, isActive: true },
    { name: "Afternoon", startTime: 11, endTime: 17, priority: 1, isActive: true },
    { name: "Evening", startTime: 17, endTime: 22, priority: 2, isActive: true },
    { name: "Night", startTime: 22, endTime: 5, priority: 1, isActive: true }
];

async function seed() {
    try {
        await connectPrithuDB();
        console.log("Seeding God and Time configurations...");
        for (const rule of godRules) {
            await GodConfig.updateOne({ day: rule.day }, { $set: rule }, { upsert: true });
        }
        for (const slot of timeRules) {
            await TimeSlot.updateOne({ name: slot.name }, { $set: slot }, { upsert: true });
        }
        console.log("Seeding completed successfully.");
    } catch (err) {
        console.error("Seeding failed", err);
    } finally {
        process.exit(0);
    }
}

seed();
