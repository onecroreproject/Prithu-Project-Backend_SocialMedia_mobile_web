const Categories = require('../../models/categorySchema');
const { v2: cloudinary } = require("cloudinary");
const Feed = require('../../models/feedModel');
const { clearCategoryCache } = require('../categoriesController');
const { clearFeedsCache } = require('../feedControllers/feedsController');



exports.adminAddCategory = async (req, res) => {
  try {
    const { name, subcategories, names } = req.body;

    if (name) {
      // New logic: Single category with optional subcategories
      const formattedName = name.trim().charAt(0).toUpperCase() + name.trim().slice(1);
      
      let newSubcats = [];
      if (subcategories && typeof subcategories === 'string') {
        newSubcats = subcategories
          .split(",")
          .map(s => s.trim())
          .filter(s => s.length > 0);
      } else if (Array.isArray(subcategories)) {
        newSubcats = subcategories.map(s => s.trim()).filter(s => s.length > 0);
      }

      let category = await Categories.findOne({ name: formattedName });
      
      if (category) {
        // Category exists, append new subcategories
        if (newSubcats.length > 0) {
          const existingSubs = category.subcategories || [];
          const uniqueNewSubs = newSubcats.filter(s => !existingSubs.includes(s));
          
          if (uniqueNewSubs.length > 0) {
            category.subcategories = [...existingSubs, ...uniqueNewSubs];
            await category.save();
          }
        }
        clearCategoryCache();
        return res.status(200).json({
          message: "Category updated successfully",
          category: { id: category._id, name: category.name, subcategories: category.subcategories }
        });
      } else {
        // Create new category
        category = await Categories.create({
          name: formattedName,
          subcategories: newSubcats
        });
        clearCategoryCache();
        return res.status(201).json({
          message: "Category created successfully",
          category: { id: category._id, name: category.name, subcategories: category.subcategories }
        });
      }
    } else if (names) {
      // Legacy logic (comma separated main categories)
      const inputCategories = names
        .split(",")
        .map((n) => n.trim())
        .filter((n) => n.length > 0)
        .map((name) => name.charAt(0).toUpperCase() + name.slice(1));

      if (!inputCategories.length) {
        return res.status(400).json({ message: "No valid category names provided" });
      }

      // Find existing categories
      const existingCategories = await Categories.find({
        name: { $in: inputCategories },
      }).select("name").lean();

      const existingNames = existingCategories.map((cat) => cat.name);

      // Filter out duplicates
      const newCategories = inputCategories.filter(
        (n) => !existingNames.includes(n)
      );

      if (!newCategories.length) {
        return res.status(409).json({ message: "All categories already exist" });
      }

      // Insert new categories
      const createdCategories = await Categories.insertMany(
        newCategories.map((n) => ({ name: n }))
      );

      clearCategoryCache(); // 👈 Clear cache for instant UI update

      return res.status(201).json({
        message: "Categories added successfully",
        addedCategories: createdCategories.map((cat) => ({
          id: cat._id,
          name: cat.name,
        })),
      });
    } else {
      return res.status(400).json({ message: "Category name is required" });
    }
  } catch (error) {
    console.error("Error adding categories:", error);
    return res
      .status(500)
      .json({ message: "Server error", error: error.message });
  }
};





exports.deleteCategory = async (req, res) => {
  try {
    const id = req.params.id || req.body.id || req.body.categoryId;

    if (!id) {
      return res.status(400).json({ message: "Category ID is required" });
    }

    // ✅ Check if category exists
    const category = await Categories.findById(id);
    if (!category) {
      return res.status(404).json({ message: "Category not found" });
    }

    // ✅ Find all feeds linked to this category
    const feeds = await Feed.find({ category: id });

    // ✅ Delete media from Cloudinary and then remove feed docs
    for (const feed of feeds) {
      if (feed.cloudinaryId) {
        try {
          await cloudinary.uploader.destroy(feed.cloudinaryId, {
            resource_type: feed.type === "video" ? "video" : "image",
          });
        } catch (err) {
          console.error(`Cloudinary delete failed for feed ${feed._id}`, err);
        }
      }
      await Feed.findByIdAndDelete(feed._id);
    }

    // ✅ Finally, delete the category itself
    await Categories.findByIdAndDelete(id);

    clearCategoryCache(); // 👈 Clear cache for instant UI update
    await clearFeedsCache(); // 👈 Clear feeds cache since feeds were deleted

    return res.status(200).json({
      message: "Category and related feeds deleted successfully",
      deletedCategory: { id: category._id, name: category.name },
      deletedFeeds: feeds.map((f) => ({ id: f._id, contentUrl: f.contentUrl })),
    });
  } catch (error) {
    console.error("Error deleting category:", error);
    return res
      .status(500)
      .json({ message: "Server error", error: error.message });
  }
};



// PUT /admin/category/update
exports.updateCategory = async (req, res) => {
  try {
    const { id, name, subcategories } = req.body;
    if (!id || !name) {
      return res.status(400).json({ message: "Category ID and new name are required" });
    }

    // Capitalize first letter
    const formattedName = name.charAt(0).toUpperCase() + name.slice(1);

    const updateData = { name: formattedName };
    if (subcategories !== undefined) {
      if (typeof subcategories === 'string') {
        updateData.subcategories = subcategories.split(",").map(s => s.trim()).filter(s => s.length > 0);
      } else if (Array.isArray(subcategories)) {
        updateData.subcategories = subcategories.map(s => s.trim()).filter(s => s.length > 0);
      }
    }

    const category = await Categories.findByIdAndUpdate(
      id,
      updateData,
      { new: true }
    );

    if (!category) {
      return res.status(404).json({ message: "Category not found" });
    }

    clearCategoryCache(); // 👈 Clear cache for instant UI update

    res.status(200).json({
      message: "Category updated successfully",
      updatedCategory: { id: category._id, name: category.name, subcategories: category.subcategories },
    });
  } catch (error) {
    console.error("Error updating category:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};


