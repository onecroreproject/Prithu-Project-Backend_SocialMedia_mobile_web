const mongoose = require('mongoose');

const chatHistorySchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null, // Null for guest users
  },
  sessionId: {
    type: String,
    required: true, // For guest users tracking
  },
  question: {
    type: String,
    required: true,
  },
  matchedKeywords: [{
    type: String,
  }],
  matchedThreads: [{
    threadId: {
      type: mongoose.Schema.Types.ObjectId,
      // Ref can be dynamic or we just store the ID and the model type
    },
    modelType: {
      type: String,
      enum: ['Blog', 'FAQ', 'Feed'],
    }
  }],
}, { timestamps: true });

module.exports = mongoose.model('ChatHistory', chatHistorySchema);
