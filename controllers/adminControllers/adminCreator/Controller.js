exports.getAllCreatorDetails = async (req, res) => {
  console.log("working");

  try {
    // Find all accounts and populate user and profileSettings
    const allCreators = await Account.find()
      .populate({
        path: "userId",
        select: "userName email profileSettings",
        populate: {
          path: "profileSettings",
          select:
            "profileAvatar timeAgo contentUrl contentFullUrl feedId likeCount shareCount comments downloadCount"
        }
      })
      .lean(); // returns plain JS objects

    if (!allCreators || allCreators.length === 0) {
      return res.status(400).json({ message: "Creators Details not Found" });
    }

    // Map creators and include feed count
    const creators = await Promise.all(
      allCreators.map(async (acc) => {
        const user = acc.userId || {};
        const profile = user.profileSettings || {};

        // Count feeds created by this account
        const feedCount = await Feed.countDocuments({ createdByAccount: acc._id });

        return {
          userName: user.userName || "Unknown",
          email:user.email,
          profileAvatar: profile.profileAvatar || "",
          followers:null,
          totalFeeds: feedCount
        };
      })
    );

    res.status(200).json({
      total: creators.length,
      creators
    });
  } catch (err) {
    console.error(err);
    res
      .status(500)
      .json({ message: "Cannot Fetch Creator Details", error: err });
  }
};




