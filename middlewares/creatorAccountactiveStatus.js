const User=require("../models/userModels/userModel")

exports.getActiveCreatorAccount = async (userId) => {
  const user = await User.findById(userId).populate("activeAccount");
  console.log("user",user)
  if (!user || !user.activeAccount || user.activeAccount.type !== "Creator") return null;
  return user.activeAccount; // populated Account
}

exports.getActiveUserAccount = async (userId) => {
  const user = await User.findById(userId).populate("activeAccount");
  if (!user || !user.activeAccount || user.activeAccount.type !== "User") return null;
  return user.activeAccount; // populated Account
}

exports.getActiveBusinessAccount = async (userId) => {
  const user = await User.findById(userId).populate("activeAccount");
  if (!user || !user.activeAccount || user.activeAccount.type !== "Business") return null;
  return user.activeAccount; // populated Account
}