const mongoose = require("mongoose");
const { prithuDB } = require("../database");

const ProfileVisibilitySchema = new mongoose.Schema(
  {
    // 🔹 Basic Details
    name: {
      type: String,
      enum: ["public", "followers", "private"],
      default: "private",
    },
    lastName: {
      type: String,
      enum: ["public", "followers", "private"],
      default: "private",
    },
    displayName: {
      type: String,
      enum: ["public", "followers", "private"],
      default: "private",
    },
    gender: {
      type: String,
      enum: ["public", "followers", "private"],
      default: "private",
    },
    userName: {
      type: String,
      enum: ["public", "followers", "private"],
      default: "private",
    },
    bio: {
      type: String,
      enum: ["public", "followers", "private"],
      default: "private",
    },

    dateOfBirth: {
      type: String,
      enum: ["public", "followers", "private"],
      default: "private",
    },
    maritalDate: {
      type: String,
      enum: ["public", "followers", "private"],
      default: "private",
    },
    maritalStatus: {
      type: String,
      enum: ["public", "followers", "private"],
      default: "private",
    },

    // 🔹 Contact Details
    phoneNumber: {
      type: String,
      enum: ["public", "followers", "private"],
      default: "private",
    },
    whatsAppNumber: {
      type: String,
      enum: ["public", "followers", "private"],
      default: "private",
    },
    email: {
      type: String,
      enum: ["public", "followers", "private"],
      default: "private",
    },

    // 🔹 Location
    address: {
      type: String,
      enum: ["public", "followers", "private"],
      default: "private",
    },
    country: {
      type: String,
      enum: ["public", "followers", "private"],
      default: "private",
    },
    city: {
      type: String,
      enum: ["public", "followers", "private"],
      default: "private",
    },

    // 🔹 Avatar & Cover
    profileAvatar: {
      type: String,
      enum: ["public", "followers", "private"],
      default: "private",
    },
    coverPhoto: {
      type: String,
      enum: ["public", "followers", "private"],
      default: "private",
    },

    facebook: {
      type: String,
      enum: ["public", "followers", "private"],
      default: "private",
    },
    instagram: {
      type: String,
      enum: ["public", "followers", "private"],
      default: "private",
    },
    twitter: {
      type: String,
      enum: ["public", "followers", "private"],
      default: "private",
    },
    linkedin: {
      type: String,
      enum: ["public", "followers", "private"],
      default: "private",
    },
    github: {
      type: String,
      enum: ["public", "followers", "private"],
      default: "private",
    },
    youtube: {
      type: String,
      enum: ["public", "followers", "private"],
      default: "private",
    },
    website: {
      type: String,
      enum: ["public", "followers", "private"],
      default: "private",
    },
    socialIcons: {
      type: String,
      enum: ["public", "followers", "private"],
      default: "private",
    },

    // 🔹 Extra / Privacy fields
    location: {
      type: String,
      enum: ["public", "followers", "private"],
      default: "private",
    },
  },
  { timestamps: true }
);

module.exports = prithuDB.model(
  "ProfileVisibility",
  ProfileVisibilitySchema,
  "ProfileVisibility"
);
