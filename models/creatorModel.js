const mongoose = require('mongoose');
const {prithuDB}=require("../database");

const creatorsSchema = new mongoose.Schema({
  // Basic Information
  userName: { type: String, unique: true, required: true, minlength: 3, maxlength: 30, trim: true },
  creatorEmail: { type: String, unique: true, required: true, lowercase: true, trim: true },
  creatorPasswordHash: {
    type: String,
    required: true
  },

  // OTP Verification
  otpCode: { type: String },
  otpExpiresAt: { type: Date },

  // Profile
      profileSettings:{ type: mongoose.Schema.Types.ObjectId, ref: "ProfilesSetting" },
    
  // Role
  role: {
    type: String,
    enum: ['Admin', 'Creator', 'User', 'Business'],
    default: 'Creator'
  },

  // Statistics
  totalFeeds:             { type: Number, default: 0 },
  totalFeedWatchDuration: { type: Number, default: 0 },  // Ensured included and working
  totalViews:             { type: Number, default: 0 },
  totalLikes:             { type: Number, default: 0 },
  totalFollowers:         { type: Number, default: 0 },

  // Relations
  feeds: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Feed'
  }],

  followers: [{
    userId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    followedAt: { type: Date, default: Date.now }
  }],

  //Term and Condition 
  termsAccepted: {
    type: Boolean,
    required: true,
    default: false,
  },
  termsAcceptedAt: {
    type: Date,
  },

  // Account Status
  isVerified: { type: Boolean, default: false },
  isActive:   { type: Boolean, default: true }
},
{
  timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' }
});

// Indexes
creatorsSchema.index({ isVerified: 1 });
creatorsSchema.index({ isActive: 1 });

// Export model
module.exports = prithuDB.model('Creator', creatorsSchema, 'Creators');

