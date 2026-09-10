const mongoose = require('mongoose');
const {prithuDB}=require("../../database");


const FcmTokenSchema = new mongoose.Schema({
  token: { type: String, required: true },
  platform: { type: String, enum: ['web','android','ios','other'], default: 'web' },
  topics: { type: [String], default: [] },
  lastSeenAt: { type: Date, default: Date.now },
});

const UserSchema = new mongoose.Schema({
  email: String,
  passwordHash: String,
  roles: [String], // e.g. ['user','creator']
  // ...
  fcmTokens: { type: [FcmTokenSchema], default: [] },
});

module.exports = prithuDB.model('UserToken', UserSchema,'UserFCMTokens');
