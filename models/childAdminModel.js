const mongoose = require("mongoose");
const { prithuDB } = require("../database");

// Sub-permission
const subPermissionSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    permission: {
      type: String,
      required: true,
    },
  },
  { _id: false }
);

// Main permission group
const menuPermissionSchema = new mongoose.Schema(
  {
    mainMenu: { type: String, required: true },
    mainPermission: {
      type: String,
      default: null,
    },
    subPermissions: {
      type: [subPermissionSchema],
      default: [],
    },
  },
  { _id: false }
);

// Child Admin Schema
const childAdminSchema = new mongoose.Schema(
  {
    userName: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },

    passwordHash: { type: String, required: true },

    parentAdminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      required: true,
      index: true,
    },

    childAdminId: {
      type: String,
      unique: true,
      default: () => new mongoose.Types.ObjectId().toString(),
    },

    menuPermissions: { type: [menuPermissionSchema], default: [] },

    grantedPermissions: { type: [String], default: [] },

    isActive: { type: Boolean, default: true },
    isApprovedByParent: { type: Boolean, default: false },
    isOnline: { type: Boolean, default: false },
    lastLoginTime: { type: Date, default: null },
    lastLogoutTime: { type: Date, default: null },
    lastActivityTime: { type: Date, default: null },
    currentSessionId: { type: mongoose.Schema.Types.ObjectId, ref: "Child_Admin_Activity", default: null },
  },
  { timestamps: true }
);

childAdminSchema.set("toJSON", { virtuals: true });
childAdminSchema.set("toObject", { virtuals: true });

module.exports = prithuDB.model("Child_Admin", childAdminSchema, "ChildAdmins");
