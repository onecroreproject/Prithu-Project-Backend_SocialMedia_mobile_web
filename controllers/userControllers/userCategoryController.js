const UserCategory = require('../../models/userModels/userCategotyModel')
const Feed = require('../../models/feedModel')
const mongoose = require('mongoose')


exports.userSelectCategory = async (req, res) => {
  try {
    const { categoryIds } = req.body; // Expecting array of categoryIds
    const userId = req.Id || req.body.userId;

    if (!userId) {
      return res.status(400).json({ message: "User ID is required" });
    }

    if (!Array.isArray(categoryIds) || categoryIds.length === 0) {
      return res.status(400).json({ message: "At least one Category ID is required" });
    }

    // ✅ Ensure UserCategory doc exists
    let userCategory = await UserCategory.findOneAndUpdate(
      { userId },
      { $setOnInsert: { userId, interestedCategories: [], nonInterestedCategories: [] } },
      { new: true, upsert: true }
    );

    // ✅ Convert existing IDs safely
    const existingInterested = userCategory.interestedCategories
      .filter(item => item.categoryId) // prevent undefined
      .map(item => item.categoryId.toString());

    const bulkOps = [];

    for (const id of categoryIds) {
      const categoryId = id.toString();

      if (existingInterested.includes(categoryId)) {
        // ✅ Already exists → update timestamp
        bulkOps.push({
          updateOne: {
            filter: { userId, "interestedCategories.categoryId": categoryId },
            update: { $set: { "interestedCategories.$.updatedAt": new Date() } }
          }
        });
      } else {
        // ✅ New category → push with timestamp
        bulkOps.push({
          updateOne: {
            filter: { userId },
            update: {
              $push: {
                interestedCategories: {
                  categoryId: new mongoose.Types.ObjectId(categoryId),
                  updatedAt: new Date()
                }
              }
            }
          }
        });
      }
    }

    if (bulkOps.length > 0) {
      await UserCategory.bulkWrite(bulkOps);
    }

    // ✅ Fetch final updated doc
    const updatedDoc = await UserCategory.findOne({ userId })
      .populate("interestedCategories.categoryId", "name")
      .populate("nonInterestedCategories.categoryId", "name")
      .lean();

    res.status(200).json({
      message: "Categories selected successfully",
      data: updatedDoc
    });
  } catch (err) {
    console.error("Error selecting categories:", err);
    res.status(500).json({
      message: "Error selecting categories",
      error: err.message
    });
  }
};


exports.userInterestedCategory = async (req, res) => {
  try {
    const { feedId } = req.body;
    const userId = req.Id || req.body.userId;

    if (!userId) return res.status(400).json({ message: "User ID is required" });
    if (!feedId) return res.status(400).json({ message: "Feed ID is required" });

    // Get category from feed
    const feed = await Feed.findById(feedId, { category: 1 }).lean();
    if (!feed?.category)
      return res.status(404).json({ message: "Feed or category not found" });

    const categories = Array.isArray(feed.category) ? feed.category : [feed.category];
    const categoryIds = categories.map(c => new mongoose.Types.ObjectId(c));

    // Construct dynamic update for timestamps
    const timestampUpdates = {};
    categoryIds.forEach(id => {
      timestampUpdates[`updatedAtMap.${id}`] = new Date();
    });

    // ⚡ SINGLE ATOMIC OPERATION — fastest
    await UserCategory.updateOne(
      { userId },

      {
        $pull: { nonInterestedCategories: { $in: categoryIds } },     // remove from nonInterested
        $addToSet: { interestedCategories: { $each: categoryIds } },     // add to interested
        $set: timestampUpdates // timestamp
      },

      { upsert: true }
    );

    res.status(200).json({
      message: "Category marked as interested successfully",
      categoryIds,
      categoryId: categoryIds[0] // Legacy support
    });

  } catch (err) {
    console.error("Error marking category as interested:", err);
    res.status(500).json({
      message: "Error marking category as interested",
      error: err.message
    });
  }
};




exports.userNotInterestedCategory = async (req, res) => {
  try {
    const { feedId } = req.body;
    const userId = req.Id || req.body.userId;

    if (!userId) return res.status(400).json({ message: "User ID is required" });
    if (!feedId) return res.status(400).json({ message: "Feed ID is required" });

    // Get category from feed
    const feed = await Feed.findById(feedId, { category: 1 }).lean();
    if (!feed?.category)
      return res.status(404).json({ message: "Feed or category not found" });

    const categories = Array.isArray(feed.category) ? feed.category : [feed.category];
    const categoryIds = categories.map(c => new mongoose.Types.ObjectId(c));

    // Construct dynamic update for timestamps
    const timestampUpdates = {};
    categoryIds.forEach(id => {
      timestampUpdates[`updatedAtMap.${id}`] = new Date();
    });

    // ⚡ SINGLE ATOMIC OPERATION — fastest
    await UserCategory.updateOne(
      { userId },

      {
        $pull: { interestedCategories: { $in: categoryIds } },         // remove from interested
        $addToSet: { nonInterestedCategories: { $each: categoryIds } },  // add to nonInterested
        $set: timestampUpdates // timestamp
      },

      { upsert: true }
    );

    res.status(200).json({
      message: "Category marked as NOT interested successfully",
      categoryIds,
      categoryId: categoryIds[0] // Legacy support
    });

  } catch (err) {
    console.error("Error marking category as not interested:", err);
    res.status(500).json({
      message: "Error marking category as not interested",
      error: err.message
    });
  }
};




/* ------------------------------------------------
    3️⃣ GET ALL NON-INTERESTED CATEGORIES (FULL DATA)
------------------------------------------------ */
exports.getNonInterestedCategories = async (req, res) => {
  try {
    const userId = req.Id;

    const userCategory = await UserCategory.findOne({ userId })
      .populate("nonInterestedCategories", "name icon slug")
      .lean();

    if (!userCategory) {
      return res.status(200).json({
        nonInterestedCategories: [],
        message: "No category preferences found",
      });
    }

    return res.status(200).json({
      nonInterestedCategories: userCategory.nonInterestedCategories || [],
    });

  } catch (err) {
    console.error("❌ Error fetching nonInterested categories:", err);
    return res.status(500).json({ message: err.message });
  }
};





/* ------------------------------------------------
    2️⃣ REMOVE CATEGORY FROM NON-INTERESTED LIST
------------------------------------------------ */
exports.removeNonInterestedCategory = async (req, res) => {
  try {
    const userId = req.Id;
    const { categoryId } = req.body;

    if (!categoryId) {
      return res.status(400).json({ message: "categoryId is required" });
    }

    await UserCategory.updateOne(
      { userId },
      {
        $pull: { nonInterestedCategories: categoryId },
        $set: { [`updatedAtMap.${categoryId}`]: new Date() },
      }
    );

    return res.status(200).json({
      message: "Category removed from Not Interested",
      categoryId,
    });

  } catch (err) {
    console.error("❌ Error removing nonInterested category:", err);
    return res.status(500).json({ message: err.message });
  }
};

















