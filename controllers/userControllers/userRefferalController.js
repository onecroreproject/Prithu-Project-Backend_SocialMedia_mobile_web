const ReferralEdge = require("../../models/userModels/userRefferalModels/refferalEdgeModle");
const User = require("../../models/userModels/userModel");
const mongoose=require('mongoose');

async function buildReferralTree(userId) {
    console.log(userId)
  // Fetch user details
  const user = await User.findById(userId, "userName email referralCode");
  if (!user) return null;

  // Fetch direct children (edges where this user is parent)
  const edges = await ReferralEdge.find({ parentId: userId }).populate(
    "childId",
    "userName email referralCode"
  );

  // Separate left and right children
  const leftChild = edges.find((e) => e.side === "left");
  const rightChild = edges.find((e) => e.side === "right");

  return {
    user,
    left: leftChild ? await buildReferralTree(leftChild.childId._id) : null,
    right: rightChild ? await buildReferralTree(rightChild.childId._id) : null,
  };
}



