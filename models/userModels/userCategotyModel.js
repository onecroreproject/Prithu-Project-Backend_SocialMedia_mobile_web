const mongoose = require("mongoose");
const { prithuDB } = require("../../database");


const UserCategorySchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
      unique: true,
    },

    /**
     * 🚀 FAST lists with only ObjectIds
     * No extra objects → faster queries, less document size
     */
    interestedCategories: [
      { type: mongoose.Schema.Types.ObjectId, ref: "Categories" }
    ],

    nonInterestedCategories: [
      { type: mongoose.Schema.Types.ObjectId, ref: "Categories" }
    ],

    /**
     * ⚡ OPTIONAL: Track updated times WITHOUT storing large objects
     * Key → categoryId
     * Value → timestamp
     */
    updatedAtMap: {
      type: Map,
      of: Date,
      default: {},
    },

    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

/**
 * Extra index → high performance when filtering categories
 */
UserCategorySchema.index({ interestedCategories: 1 });
UserCategorySchema.index({ nonInterestedCategories: 1 });

module.exports = prithuDB.model(
  "UserCategory",
  UserCategorySchema,
  "UserCategorys"
);
