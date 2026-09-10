
const mongoose = require("mongoose");
const {prithuDB}=require("../../database");

const LevelConfigSchema = new mongoose.Schema({
  userLevel: { 
    type: Number, 
    required: true, 
    unique: true 
  },

  levelLimit: { 
    type: Number, 
    required: true 
  },

  tier: { 
    type: Number, 
    required: true 
  },

  createdAt: { 
    type: Date, 
    default: Date.now 
  }
});

module.exports = prithuDB.model(
  "LevelConfig",
  LevelConfigSchema,
  "LevelConfig"
);
