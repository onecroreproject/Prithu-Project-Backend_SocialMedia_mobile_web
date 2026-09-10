const User = require('../../models/userModels/userModel');
const { placeReferral } = require('../../middlewares/referralMiddleware/referralCount');

// exports.applyReferralCode = async (req, res) => {
//   try {
//     const { referralCode } = req.body;
//     const userId = req.Id || req.body.userId;
//     if (!userId || !referralCode) {
//       return res.status(400).json({ message: "userId and referralCode required" });
//     }

//     // find & atomically increment usage in one step
//     const parentUser = await User.findOneAndUpdate(
//       { referralCode, referralCodeIsValid: true, referralCodeUsageCount: { $lt: 2 } },
//       { $inc: { referralCodeUsageCount: 1 } },
//       { new: true }
//     );
//     if (!parentUser) {
//       return res.status(400).json({ message: "Referral code invalid or not available" });
//     }

//     if (parentUser._id.toString() === userId) {
//       return res.status(400).json({ message: "Cannot use your own referral code" });
//     }

//     const childUser = await User.findById(userId);
//     if (!childUser) return res.status(400).json({ message: "Child user not found" });
//     if (childUser.referredByUserId) {
//       return res.status(400).json({ message: "Referral code already applied" });
//     }

//     // update child user
//     childUser.referredByUserId = parentUser._id;
//     childUser.referredByCode = referralCode;
//     await childUser.save();

//     // push into parent's directReferrals
//     await User.findByIdAndUpdate(parentUser._id, { $push: { directReferrals: childUser._id } });

//     // place referral (safe)
//     try {
//       await placeReferral({ parentId: parentUser._id, childId: childUser._id });
//     } catch (err) {
//       console.warn("placeReferral warning:", err.message);
//     }

//     return res.status(200).json({ message: "Referral code applied successfully" });
//   } catch (err) {
//     console.error("applyReferralCode error:", err);
//     return res.status(500).json({ message: "Server error" });
//   }
// };




