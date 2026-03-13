const mongoose = require("mongoose");
const { prithuDB } = require("../../database");

const adminSchema = new mongoose.Schema({
  userName: {
    type: String,
    required: true,
    unique: true,
    minlength: 3,
    maxlength: 30,
    trim: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },

  passwordHash: { type: String, required: true },

  adminType: {
    type: String,
    enum: ["ChildAdmin", "Admin", "Moderator"],
    default: "Admin",
    index: true
  },


  profileSettings: { type: mongoose.Schema.Types.ObjectId, ref: "ProfileSettings" },

  isActive: { type: Boolean, default: true },
  isEmailVerified: { type: Boolean, default: false },
  lastLoginAt: { type: Date },

  loginAttempts: { type: Number, default: 0 },
  lockUntil: { type: Date },

  otpCode: { type: String },
  otpExpiresAt: { type: Date },

  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin", default: null },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin", default: null },

  feeds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Feed" }]
}, {
  timestamps: true,
  toJSON: {
    transform(doc, ret) {
      delete ret.passwordHash;
      delete ret.otpCode;
      delete ret.otpExpiresAt;
      return ret;
    }
  }
});

// Fix virtual
adminSchema.virtual("isLocked").get(function () {
  return Boolean(this.lockUntil && this.lockUntil > Date.now());
});

// Ensure DB-level unique indexes (already handled by field definitions)

module.exports = prithuDB.model("Admin", adminSchema, "Admin");
