const mongoose = require("mongoose");
const {prithuDB}=require("../../database");


const UserLanguageSchema = new mongoose.Schema({
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: "User", 
    required: true, 
    index: true,          // ✅ Index for fast lookup
    unique: true          // ✅ Only one active preference per user
  },

  // App Language Preference
  appLanguageCode: { 
    type: String, 
    required: true, 
    index: true           // ✅ Useful if you need analytics by language
  },
  appNativeCode: { type: String },

  // Feed Language Preference
  feedLanguageCode: { 
    type: String, 
    required: true, 
    index: true           // ✅ For querying feed content by language
  },
  feedNativeCode: { type: String },

  active: { type: Boolean, default: true }
}, { 
  timestamps: true,
  versionKey: false        // ✅ Removes `__v`, saves storage
});

// ✅ Compound index if you want fast lookup by user & language
UserLanguageSchema.index({ userId: 1, appLanguageCode: 1 });
UserLanguageSchema.index({ userId: 1, feedLanguageCode: 1 });

module.exports = prithuDB.model("UserLanguage", UserLanguageSchema,"UserLanguage");
