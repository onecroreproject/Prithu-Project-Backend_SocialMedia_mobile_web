
const mongoose =require ("mongoose");
const {prithuDB}=require("../database");
const QRSessionSchema = new mongoose.Schema({
  qrId: { type: String, unique: true },     // short id to show in QR
  code: String,                              // random secret in QR payload
  expiresAt: Date,
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  webLoginToken: { type: String, default: null }, // single-use, generated on approve
  consumedAt: { type: Date, default: null },
});
QRSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // auto TTL
export default prithuDB.model("QRSession", QRSessionSchema);
