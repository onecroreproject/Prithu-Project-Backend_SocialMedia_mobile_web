const mongoose = require("mongoose");
const { prithuDB } = require("../database");

const godConfigSchema = new mongoose.Schema({
    day: { type: String, required: true, unique: true }, // e.g. "Monday"
    god: { type: String, required: true } // e.g. "Shiva"
});

module.exports = prithuDB.model("GodConfig", godConfigSchema, "GodConfig");
