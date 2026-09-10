// utils/cloudinary.js
const cloudinary = require("cloudinary").v2;

exports.deleteFromCloudinary = async (public_id) => {
  try {
    await cloudinary.uploader.destroy(public_id);
    console.log("🗑️ Deleted old file:", public_id);
  } catch (err) {
    console.error("Cloudinary delete error:", err);
  }
};
