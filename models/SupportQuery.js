const mongoose = require("mongoose");
const { prithuDB } = require("../database");

const supportQuerySchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: false
        },
        name: {
            type: String,
            required: true,
            trim: true
        },
        email: {
            type: String,
            required: true,
            trim: true,
            lowercase: true
        },
        subject: {
            type: String,
            required: true,
            trim: true
        },
        message: {
            type: String,
            required: true,
            trim: true
        },
        status: {
            type: String,
            enum: ["pending", "resolved"],
            default: "pending"
        }
    },
    { timestamps: true }
);

module.exports = prithuDB.model("SupportQuery", supportQuerySchema, "SupportQuery");
