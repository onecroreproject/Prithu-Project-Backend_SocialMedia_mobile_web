const mongoose = require("mongoose");
const { prithuDB } = require("../database");

const redirectSchema = new mongoose.Schema(
    {
        sourceUrl: {
            type: String,
            required: true,
            unique: true,
            trim: true
        },
        targetUrl: {
            type: String,
            required: true,
            trim: true
        },
        statusCode: {
            type: Number,
            enum: [301, 302],
            default: 301
        },
        isActive: {
            type: Boolean,
            default: true
        },
        clicks: {
            type: Number,
            default: 0
        },
        lastUpdatedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Admin"
        }
    },
    { timestamps: true }
);

module.exports = prithuDB.model("Redirect", redirectSchema, "Redirects");
