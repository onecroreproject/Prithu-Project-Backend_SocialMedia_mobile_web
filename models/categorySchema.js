const mongoose = require('mongoose');
const {prithuDB}=require("../database");

const categorySchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    index:true,
  },
  
  feedIds:[{type:mongoose.Schema.Types.ObjectId,ref:'Feed'}],
  
  createdAt: {
    type: Date,
    default: Date.now
  }

});

module.exports = prithuDB.model('Categories', categorySchema, 'Categories');
