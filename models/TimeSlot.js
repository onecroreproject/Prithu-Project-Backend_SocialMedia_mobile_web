const mongoose = require("mongoose");
const { prithuDB } = require("../database");

const timeSlotSchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true }, // e.g. "Morning"
    startTime: { type: Number, required: true }, // Hour (0-24)
    endTime: { type: Number, required: true }, // Hour (0-24)
    priority: { type: Number, default: 1 },
    isActive: { type: Boolean, default: true }
});

module.exports = prithuDB.model("TimeSlot", timeSlotSchema, "TimeSlots");
