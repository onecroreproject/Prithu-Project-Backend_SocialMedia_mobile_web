


exports.creatorSelectCategory = async (req, res) => {
  try {
    const { categoryIds } = req.body; // Expecting array of categoryIds
    const accountId = req.accountId || req.body.accountId;

    if (!accountId) {
      return res.status(400).json({ message: "Account ID is required" });
    }
    if (!Array.isArray(categoryIds) || categoryIds.length === 0) {
      return res.status(400).json({ message: "At least one Category ID is required" });
    }

    // ✅ Ensure AccountCategory doc exists
    let accountCategory = await AccountCategory.findOneAndUpdate(
      { accountId },
      { $setOnInsert: { accountId, interestedCategories: [], nonInterestedCategories: [] } },
      { new: true, upsert: true }
    );

    // ✅ Convert existing IDs to string for comparison
    const existingInterested = accountCategory.interestedCategories.map(id => id.toString());

    // ✅ Separate new vs existing
    const toInsert = categoryIds.filter(id => !existingInterested.includes(id));

    if (toInsert.length > 0) {
      await AccountCategory.updateOne(
        { accountId },
        { $addToSet: { interestedCategories: { $each: toInsert } } }
      );
    }

    // ✅ Fetch final updated doc
    const updatedDoc = await AccountCategory.findOne({ accountId })
      .populate("interestedCategories", "name")
      .populate("nonInterestedCategories", "name")
      .lean();

    res.status(200).json({
      message: "Categories selected successfully",
      data: updatedDoc,
    });
  } catch (err) {
    console.error("Error selecting categories:", err);
    res.status(500).json({
      message: "Error selecting categories",
      error: err.message,
    });
  }
};


exports.creatorUnSelectCategory = async (req, res) => {
  try {
    const { categoryIds, nonInterestedIds } = req.body;
    // categoryIds -> interested categories
    // nonInterestedIds -> non-interested categories selected by user
    const accountId = req.accountId || req.body.accountId;

    if (!accountId) {
      return res.status(400).json({ message: "Account ID is required" });
    }

    if (!Array.isArray(categoryIds) || !Array.isArray(nonInterestedIds)) {
      return res.status(400).json({ message: "Both categoryIds and nonInterestedIds should be arrays" });
    }

    // ✅ Ensure AccountCategory doc exists
    let accountCategory = await AccountCategory.findOneAndUpdate(
      { accountId },
      { $setOnInsert: { accountId, interestedCategories: [], nonInterestedCategories: [] } },
      { new: true, upsert: true }
    );

    // ✅ Convert IDs to string for comparison
    const existingInterested = accountCategory.interestedCategories.map(id => id.toString());
    const existingNonInterested = accountCategory.nonInterestedCategories.map(id => id.toString());
    const newInterested = categoryIds.map(id => id.toString());
    const newNonInterested = nonInterestedIds.map(id => id.toString());

    /** -------------------
     *  1) Interested Flow
     * ------------------- */
    const toInsert = newInterested.filter(id => !existingInterested.includes(id));
    const toUnselect = existingInterested.filter(id => !newInterested.includes(id));

    if (toInsert.length > 0) {
      await AccountCategory.updateOne(
        { accountId },
        { $addToSet: { interestedCategories: { $each: toInsert } } }
      );
    }

    if (toUnselect.length > 0) {
      await AccountCategory.updateOne(
        { accountId },
        {
          $pull: { interestedCategories: { $in: toUnselect } },
          $addToSet: { nonInterestedCategories: { $each: toUnselect } }
        }
      );
    }

    /** -------------------
     *  2) Non-Interested Flow
     * ------------------- */
    for (let catId of newNonInterested) {
      if (existingInterested.includes(catId)) {
        await AccountCategory.updateOne(
          { accountId },
          {
            $pull: { interestedCategories: catId },
            $addToSet: { nonInterestedCategories: catId }
          }
        );
      } else if (!existingNonInterested.includes(catId)) {
        await AccountCategory.updateOne(
          { accountId },
          { $addToSet: { nonInterestedCategories: catId } }
        );
      }
    }

    // ✅ Fetch final updated doc
    const updatedDoc = await AccountCategory.findOne({ accountId })
      .populate("interestedCategories", "name")
      .populate("nonInterestedCategories", "name")
      .lean();

    res.status(200).json({
      message: "Categories updated successfully",
      data: updatedDoc,
    });
  } catch (err) {
    console.error("Error updating categories:", err);
    res.status(500).json({
      message: "Error updating categories",
      error: err.message,
    });
  }
};

