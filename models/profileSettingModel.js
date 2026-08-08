const mongoose = require("mongoose");
const { prithuDB } = require("../database");

const ProfileSettingsSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    adminId: { type: mongoose.Schema.Types.ObjectId, ref: "Admin" },
    childAdminId: { type: mongoose.Schema.Types.ObjectId, ref: "Child_Admin" },

    // Basic Details
    gender: { type: String },
    userName: { type: String },
    name: { type: String, index: true },
    lastName: { type: String, index: true },
    bio: { type: String },
    profileSummary: { type: String },
    dateOfBirth: { type: Date },
    maritalDate: { type: Date },
    maritalStatus: { type: String },
    phoneNumber: { type: Number },
    whatsAppNumber: { type: Number },

    // Location
    address: { type: String },
    country: { type: String },
    city: { type: String },

    // Profile Link
    shareableLink: { type: String },
    isPublished: { type: Boolean, default: false },

    // Avatar & Cover (LOCAL STORAGE)
    profileAvatar: { type: String },            // local URL
    profileAvatarFilename: { type: String },    // saved filename
    avatarUpdatedAt: { type: Date },
    modifyAvatar: { type: String },             // background-removed URL (LOCAL)
    modifyAvatarFilename: { type: String },     // local filename

    coverPhoto: { type: String },               // local URL
    coverPhotoFilename: { type: String },
    coverUpdatedAt: { type: Date },

    // Additional Image
    addImage: { type: String },
    addImageFilename: { type: String },
    addImageUpdatedAt: { type: Date },

    // Social Links
    socialLinks: {
      facebook: { type: String, default: "" },
      instagram: { type: String, default: "" },
      twitter: { type: String, default: "" },
      youtube: { type: String, default: "" },
      linkedin: { type: String, default: "" },
      github: { type: String, default: "" },
      website: { type: String, default: "" },
    },

    // Theme, Notifications, Privacy
    theme: { type: String, default: "light" },
    notifications: {
      email: { type: Boolean, default: true },
      sms: { type: Boolean, default: false },
    },
    // 📌 Global privacy control
    privacy: {
      type: String,
      enum: ["public", "private", "followers"],
      default: "public"
    },

    // 📌 Detailed field-level privacy (Old structure, kept for compatibility if needed)
    fieldPrivacy: {
      showEmail: { type: Boolean, default: false },
      showProfilePicture: { type: Boolean, default: true },
      showCoverPhoto: { type: Boolean, default: true },
      showLocation: { type: Boolean, default: true },
      showPhoneNumber: { type: Boolean, default: true },
      showWhatsAppNumber: { type: Boolean, default: true },
    },

    language: { type: String, default: "en" },
    timezone: { type: String, default: "Asia/Kolkata" },
    details: { type: mongoose.Schema.Types.Mixed },

    visibility: { type: mongoose.Schema.Types.ObjectId, ref: "ProfileVisibility" },
  },
  { timestamps: true }
);

// Indexes
ProfileSettingsSchema.index({ userId: 1 });
ProfileSettingsSchema.index({ adminId: 1 });
ProfileSettingsSchema.index({ childAdminId: 1 });
ProfileSettingsSchema.index({ accountId: 1 });
ProfileSettingsSchema.index({ userName: 1 });
ProfileSettingsSchema.index({ shareableLink: 1 });
ProfileSettingsSchema.index({ isPublished: 1 });
ProfileSettingsSchema.index({ userId: 1, adminId: 1, childAdminId: 1 });

module.exports = prithuDB.model("ProfileSettings", ProfileSettingsSchema, "ProfileSettings");
