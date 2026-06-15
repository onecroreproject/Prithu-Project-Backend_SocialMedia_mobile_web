const mongoose = require('mongoose');

const unansweredQuestionSchema = new mongoose.Schema({
  question: {
    type: String,
    required: true,
    unique: true, // To avoid duplicates, we'll increment searchCount
  },
  searchCount: {
    type: Number,
    default: 1,
  },
  status: {
    type: String,
    enum: ['pending', 'resolved'],
    default: 'pending',
  }
}, { timestamps: true });

module.exports = mongoose.model('UnansweredQuestion', unansweredQuestionSchema);
