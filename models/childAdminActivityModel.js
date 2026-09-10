const mongoose = require("mongoose");
const { prithuDB } = require("../database");

const childAdminActivitySchema = new mongoose.Schema(
    {
        childAdminId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Child_Admin",
            required: true,
            index: true,
        },
        date: {
            type: String, // YYYY-MM-DD
            required: true,
        },
        loginTime: {
            type: Date,
            required: true,
        },
        logoutTime: {
            type: Date,
        },
        offlineFrom: {
            type: Date,
        },
        offlineTo: {
            type: Date,
        },
        duration: {
            type: String, // e.g., "2h 35m"
        },
        status: {
            type: String,
            enum: ["Online", "Offline"],
            default: "Online",
        },
    },
    { timestamps: true }
);

module.exports = prithuDB.model("Child_Admin_Activity", childAdminActivitySchema, "ChildAdminActivities");
