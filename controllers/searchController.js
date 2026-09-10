// ✅ controllers/searchController.js
const Categories = require("../models/categorySchema");
const ProfileSettings = require("../models/profileSettingModel");
const Hashtag = require("../models/hashTagModel");
const Feed = require("../models/feedModel");
const { feedTimeCalculator } = require('../middlewares/feedTimeCalculator');
const mongoose = require("mongoose");





exports.globalSearch = async (req, res) => {
  try {
    const userId = req.Id ? new mongoose.Types.ObjectId(req.Id) : null;
    const query = req.query.q?.trim();

    if (!query) {
      return res.status(400).json({
        success: false,
        message: "Search query cannot be empty.",
      });
    }

    // 1️⃣ Aggregate categories with matching name and count videos
    const categories = await Feed.aggregate([
      { $match: { category: { $exists: true, $ne: [] } } },
      { $unwind: "$category" },
      {
        $addFields: {
          categoryObjId: {
            $cond: [
              { $eq: [{ $type: "$category" }, "objectId"] },
              "$category",
              {
                $cond: [
                  {
                    $and: [
                      { $ne: ["$category", null] },
                      {
                        $regexMatch: {
                          input: { $toString: "$category" },
                          regex: /^[0-9a-fA-F]{24}$/
                        }
                      }
                    ]
                  },
                  { $toObjectId: "$category" },
                  null
                ]
              }
            ]
          }
        }
      },
      {
        $group: {
          _id: "$categoryObjId",
          videoCount: {
            $sum: { $cond: [{ $eq: ["$postType", "video"] }, 1, 0] }
          }
        }
      },
      { $match: { _id: { $ne: null } } },
      {
        $lookup: {
          from: "Categories",
          localField: "_id",
          foreignField: "_id",
          as: "categoryDetails"
        }
      },
      { $unwind: "$categoryDetails" },
      {
        $match: {
          "categoryDetails.name": { $regex: query, $options: "i" }
        }
      },
      {
        $project: {
          _id: "$categoryDetails._id",
          name: "$categoryDetails.name",
          videoCount: 1
        }
      },
      { $limit: 10 }
    ]);

    // 2️⃣ Log search history if userId is available
    if (userId) {
      const SearchHistory = require("../models/analytics/searchHistoryModel");
      await SearchHistory.create({
        userId,
        query,
        timestamp: new Date()
      }).catch(err => console.error("❌ Search history log failed:", err));
    }

    /* -------------------------------------------
       RETURN FINAL RESPONSE
    --------------------------------------------*/
    return res.status(200).json({
      success: true,
      query,
      categories,
      people: [], // Empty for compatibility
      feeds: [],  // Empty for compatibility
    });

  } catch (error) {
    console.error("❌ Search Error:", error);
    return res.status(500).json({
      success: false,
      message: "An error occurred while searching.",
      error: error.message,
    });
  }
};

