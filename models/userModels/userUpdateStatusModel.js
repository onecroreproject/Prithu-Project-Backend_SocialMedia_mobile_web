const mongoose = require('mongoose');

const userUpdateStatusSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    updateId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Update',
        required: true
    },
    isRead: {
        type: Boolean,
        default: false
    },
    readAt: {
        type: Date
    }
}, {
    timestamps: true
});

// Unique index to ensure one status record per user per update
userUpdateStatusSchema.index({ userId: 1, updateId: 1 }, { unique: true });

// Index for fast unread count calculation
userUpdateStatusSchema.index({ userId: 1, isRead: 1 });

module.exports = mongoose.model('UserUpdateStatus', userUpdateStatusSchema);
