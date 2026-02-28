const mongoose = require("mongoose");
const { prithuDB } = require("../database");

const blogSchema = new mongoose.Schema(
    {
        title: {
            type: String,
            required: true,
            trim: true
        },
        slug: {
            type: String,
            required: true,
            unique: true,
            lowercase: true,
            trim: true
        },
        content: {
            type: String,
            required: true
        },
        image: {
            type: String,
            required: true
        },
        author: {
            type: mongoose.Schema.Types.ObjectId,
            refPath: "roleRef"
        },
        roleRef: {
            type: String,
            enum: ["Admin", "Child_Admin", "User"],
            default: "Admin"
        },
        isPublished: {
            type: Boolean,
            default: false
        }
    },
    { timestamps: true }
);

module.exports = prithuDB.model("Blog", blogSchema, "Blogs");
