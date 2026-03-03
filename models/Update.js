const mongoose = require('mongoose');

const updateSchema = new mongoose.Schema({
    title: {
        type: String,
        required: [true, 'Update title is required'],
        trim: true
    },
    description: {
        type: String,
        required: [true, 'Update description is required']
    },
    media: {
        type: String, // Full public URL
        default: null
    },
    targetRole: {
        type: String,
        enum: ['all', 'User', 'Admin', 'Child_Admin'],
        default: 'all'
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Admin', // Could be Admin or ChildAdmin, using a generic ref or just storing the ID
        required: true
    },
    isActive: {
        type: Boolean,
        default: true
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('Update', updateSchema);
