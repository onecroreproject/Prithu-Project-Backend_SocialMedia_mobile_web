const Block =require("../../models/userBlockShema");


exports.blockUser = async (req, res) => {
  try {
    const blockerId = req.Id;
    const blockedId = req.body.blockedId;

    if (blockerId === blockedId)
      return res.status(400).json({ message: "You cannot block yourself" });

    // 1️⃣ Create block entry
    await Block.create({ blockerId, blockedId }).catch(err => {
      if (err.code === 11000) {
        return res.status(400).json({ message: "Already blocked" });
      }
      throw err;
    });

    // 2️⃣ Remove follow relationships in both directions
    await Follow.deleteMany({
      $or: [
        { creatorId: blockerId, followerId: blockedId },
        { creatorId: blockedId, followerId: blockerId },
      ],
    });

    res.status(200).json({ message: "User blocked successfully" });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
};





exports.unblockUser = async (req, res) => {
  try {
    const blockerId = req.Id;
    const blockedId = req.body.blockedId;

    const result = await Block.deleteOne({ blockerId, blockedId });

    if (result.deletedCount === 0)
      return res.status(400).json({ message: "Not blocked" });

    res.status(200).json({ message: "User unblocked successfully" });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
};
