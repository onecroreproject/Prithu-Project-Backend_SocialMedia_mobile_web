const mongoose = require('mongoose');

const chatLeadSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
  },
  email: {
    type: String,
  },
  mobileNumber: {
    type: String,
  },
  searchQuery: {
    type: String,
    required: true,
  },
  sessionId: {
    type: String,
  },
  status: {
    type: String,
    enum: ['new', 'contacted', 'resolved'],
    default: 'new',
  }
}, { timestamps: true });

module.exports = mongoose.model('ChatLead', chatLeadSchema);
