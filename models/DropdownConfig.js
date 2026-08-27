const mongoose = require('mongoose');
const { prithuDB } = require("../database");

const dropdownConfigSchema = new mongoose.Schema({
  singletonId: {
    type: String,
    default: "global_dropdowns",
    unique: true
  },
  sessions: [{
    type: String,
    trim: true
  }],
  days: [{
    type: String,
    trim: true
  }],
  specialDays: [{
    type: String,
    trim: true
  }],
  gods: [{
    type: String,
    trim: true
  }],
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Update the updatedAt timestamp before saving
dropdownConfigSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = prithuDB.model('DropdownConfig', dropdownConfigSchema, 'DropdownConfigs');
