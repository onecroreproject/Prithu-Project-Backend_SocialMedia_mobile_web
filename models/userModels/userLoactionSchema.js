const mongoose = require("mongoose");
const {prithuDB}=require("../../database");


const locationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: false,
    },
    latitude: {
      type: Number,
      default: null,
    },
    longitude: {
      type: Number,
      default: null,
    },
    address: {
      type: String,
      default: "Location not available",
    },
    permissionStatus: {
      type: String,
      enum: ["granted", "denied", "prompt"],
      default: "prompt",
    },
  },
  { timestamps: true }
);

module.exports = prithuDB.model("Location", locationSchema, "UserLocations");
