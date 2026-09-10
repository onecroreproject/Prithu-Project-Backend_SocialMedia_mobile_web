
import mongoose from "mongoose";

const UserActionSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  feed: { type: mongoose.Schema.Types.ObjectId, ref: "Feed", required: true },

  // Type of action (one record = one action)
  action: { 
    type: String, 
    enum: ["like", "share", "download", "watch"], 
    required: true 
  },

  // Optional: extra details for future expansion
  metadata: { type: mongoose.Schema.Types.Mixed }  
}, { timestamps: true });

// Prevent duplicates: one user can only do one action type once per feed
UserActionSchema.index({ user: 1, feed: 1, action: 1 }, { unique: true });

export default prithuDB.model("UserAction", UserActionSchema);