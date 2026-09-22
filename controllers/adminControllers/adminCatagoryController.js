const Categories = require('../../models/categorySchema');
const { v2: cloudinary } = require("cloudinary");
const Feed = require('../../models/feedModel');
const { clearCategoryCache } = require('../categoriesController');
const { clearFeedsCache } = require('../feedControllers/feedsController');

exports.adminAddCategory = async (req, res) => {
  try {
    const { name, names, categoryName, subcategories } = req.body;
    const rawNames = name || names || categoryName;

    if (!rawNames || (typeof rawNames === "string" && !rawNames.trim())) {
      return res.status(400).json({ message: "Category name is required" });
    }

    // Process subcategories
    let subcategoriesArray = [];
    if (subcategories && typeof subcategories === "string") {
      subcategoriesArray = subcategories
        .split(",")
        .map((sub) => sub.trim())
        .filter((sub) => sub.length > 0)
        .map((sub) => sub.charAt(0).toUpperCase() + sub.slice(1));
    } else if (Array.isArray(subcategories)) {
      subcategoriesArray = subcategories
        .map((sub) => (typeof sub === "string" ? sub.trim() : ""))
        .filter((sub) => sub.length > 0)
        .map((sub) => sub.charAt(0).toUpperCase() + sub.slice(1));
    }
    // Deduplicate subcategories
    subcategoriesArray = [...new Set(subcategoriesArray)];

    // Convert rawNames into array
    let inputCategories = [];
    if (typeof rawNames === "string") {
      inputCategories = rawNames
        .split(",")
        .map((n) => n.trim())
        .filter((n) => n.length > 0)
        .map((n) => n.charAt(0).toUpperCase() + n.slice(1));
    } else if (Array.isArray(rawNames)) {
      inputCategories = rawNames
        .map((n) => (typeof n === "string" ? n.trim() : ""))
        .filter((n) => n.length > 0)
        .map((n) => n.charAt(0).toUpperCase() + n.slice(1));
    }
    inputCategories = [...new Set(inputCategories)];

    if (!inputCategories.length) {
      return res.status(400).json({ message: "No valid category names provided" });
    }

    // Find existing categories (case-insensitive)
    const existingCategories = await Categories.find({
      name: { $in: inputCategories.map((n) => new RegExp(`^${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i")) },
    });

    const existingNames = existingCategories.map((cat) => cat.name.toLowerCase());

    // If single category submitted and it already exists
    if (inputCategories.length === 1 && existingCategories.length > 0) {
      const existing = existingCategories[0];
      if (subcategoriesArray.length > 0) {
        // Merge new subcategories into existing category
        const currentSubs = existing.subcategories || [];
        const mergedSubs = [...new Set([...currentSubs, ...subcategoriesArray])];
        existing.subcategories = mergedSubs;
        await existing.save();

        clearCategoryCache();

        return res.status(200).json({
          success: true,
          message: `Category "${existing.name}" updated with new subcategories`,
          addedCategories: [{
            id: existing._id,
            categoryId: existing._id,
            name: existing.name,
            categoriesName: existing.name,
            subcategories: existing.subcategories || [],
          }],
          category: {
            id: existing._id,
            categoryId: existing._id,
            name: existing.name,
            categoriesName: existing.name,
            subcategories: existing.subcategories || [],
          }
        });
      } else {
        return res.status(409).json({ message: `Category "${existing.name}" already exists` });
      }
    }

    // Filter out duplicates
    const newCategories = inputCategories.filter(
      (n) => !existingNames.includes(n.toLowerCase())
    );

    if (!newCategories.length) {
      return res.status(409).json({ message: `Category "${inputCategories.join(", ")}" already exists` });
    }

    const orderNum = Number(req.body.order);
    const initialOrder = !isNaN(orderNum) ? orderNum : 0;

    // Prepare docs to insert
    const docsToInsert = newCategories.map((catName) => {
      const doc = { name: catName, subcategories: [], order: initialOrder };
      if (subcategoriesArray.length > 0) {
        doc.subcategories = subcategoriesArray;
      }
      return doc;
    });

    // Insert new categories
    const createdCategories = await Categories.insertMany(docsToInsert);

    clearCategoryCache(); // 👈 Clear cache for instant UI update

    return res.status(201).json({
      success: true,
      message: "Category added successfully",
      addedCategories: createdCategories.map((cat) => ({
        id: cat._id,
        categoryId: cat._id,
        name: cat.name,
        categoriesName: cat.name,
        subcategories: cat.subcategories || [],
        order: cat.order || 0,
      })),
      category: createdCategories.length === 1 ? {
        id: createdCategories[0]._id,
        categoryId: createdCategories[0]._id,
        name: createdCategories[0].name,
        categoriesName: createdCategories[0].name,
        subcategories: createdCategories[0].subcategories || [],
        order: createdCategories[0].order || 0,
      } : null,
    });
  } catch (error) {
    console.error("Error adding categories:", error);
    if (error.code === 11000) {
      return res.status(409).json({ message: "A category with this name already exists" });
    }
    return res
      .status(500)
      .json({ message: "Server error", error: error.message });
  }
};

exports.deleteCategory = async (req, res) => {
  try {
    const id = req.params.id || req.body.id || req.body.categoryId || req.body._id;

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
      success: true,
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

// PUT /admin/update/category or /admin/category/update
exports.updateCategory = async (req, res) => {
  try {
    const id = req.params.id || req.body.id || req.body.categoryId || req.body._id;
    const { name, categoryName, subcategories } = req.body;
    const targetName = name || categoryName;

    if (!id || !targetName) {
      return res.status(400).json({ message: "Category ID and new name are required" });
    }

    // Capitalize first letter
    const formattedName = targetName.trim().charAt(0).toUpperCase() + targetName.trim().slice(1);
    
    // Process subcategories
    let subcategoriesArray = [];
    if (subcategories && typeof subcategories === 'string') {
      subcategoriesArray = subcategories
        .split(',')
        .map(sub => sub.trim())
        .filter(sub => sub.length > 0)
        .map(sub => sub.charAt(0).toUpperCase() + sub.slice(1));
    } else if (Array.isArray(subcategories)) {
      subcategoriesArray = subcategories
        .map(sub => (typeof sub === "string" ? sub.trim() : ""))
        .filter(sub => sub.length > 0)
        .map(sub => sub.charAt(0).toUpperCase() + sub.slice(1));
    }
    subcategoriesArray = [...new Set(subcategoriesArray)];

    const updateFields = {
      name: formattedName,
      subcategories: subcategoriesArray,
    };

    if (req.body.order !== undefined && req.body.order !== null && !isNaN(Number(req.body.order))) {
      updateFields.order = Number(req.body.order);
    }

    const category = await Categories.findByIdAndUpdate(
      id,
      { $set: updateFields },
      { new: true }
    );

    if (!category) {
      return res.status(404).json({ message: "Category not found" });
    }

    clearCategoryCache(); // 👈 Clear cache for instant UI update

    res.status(200).json({
      success: true,
      message: "Category updated successfully",
      updatedCategory: { 
        id: category._id, 
        categoryId: category._id,
        name: category.name,
        categoriesName: category.name,
        subcategories: category.subcategories || [],
        order: category.order || 0,
      },
    });
  } catch (error) {
    console.error("Error updating category:", error);
    if (error.code === 11000) {
      return res.status(409).json({ message: "A category with this name already exists" });
    }
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Helper for transient DB retry
const executeWithRetry = async (fn, maxRetries = 2, delayMs = 300) => {
  let lastError;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const isTransient =
        err.name === "MongoNetworkError" ||
        err.name === "MongoServerSelectionError" ||
        err.message?.includes("ECONNRESET") ||
        err.message?.includes("connection reset") ||
        err.message?.includes("socket closed");
      if (isTransient && attempt < maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, delayMs * attempt));
        continue;
      }
      throw err;
    }
  }
  throw lastError;
};

// PUT /admin/categories/reorder
// Accepts: { categories: [{ id, order }, ...] } OR { orderedIds: [id1, id2, ...] }
exports.reorderCategories = async (req, res) => {
  try {
    const categoriesInput = req.body.categories || req.body.orderList || req.body.orderedIds;

    if (!categoriesInput || !Array.isArray(categoriesInput)) {
      return res.status(400).json({ message: "Categories array is required for reordering" });
    }

    const bulkOps = categoriesInput.map((item, index) => {
      const catId = typeof item === "object" ? (item.id || item.categoryId || item._id) : item;
      const order = typeof item === "object" && typeof item.order === "number" ? item.order : index + 1;

      return {
        updateOne: {
          filter: { _id: catId },
          update: { $set: { order } },
        },
      };
    }).filter(op => Boolean(op.updateOne.filter._id));

    if (bulkOps.length > 0) {
      await executeWithRetry(() => Categories.bulkWrite(bulkOps));
    }

    clearCategoryCache();

    return res.status(200).json({
      success: true,
      message: "Categories reordered successfully",
      count: bulkOps.length,
    });
  } catch (error) {
    console.error("Error reordering categories:", error);
    return res.status(500).json({ message: "Server error", error: error.message });
  }
};

// PUT /admin/category/order or PUT /admin/category/:id/order
// Accepts: { id, categoryId, order }
exports.assignCategoryOrder = async (req, res) => {
  try {
    const id = req.params.id || req.body.id || req.body.categoryId || req.body._id;
    const order = Number(req.body.order);

    if (!id || isNaN(order)) {
      return res.status(400).json({ message: "Valid category ID and numeric order are required" });
    }

    const category = await executeWithRetry(() =>
      Categories.findByIdAndUpdate(
        id,
        { $set: { order } },
        { new: true }
      )
    );

    if (!category) {
      return res.status(404).json({ message: "Category not found" });
    }

    clearCategoryCache();

    return res.status(200).json({
      success: true,
      message: `Category "${category.name}" order set to ${order}`,
      category: {
        id: category._id,
        categoryId: category._id,
        name: category.name,
        categoriesName: category.name,
        order: category.order,
      },
    });
  } catch (error) {
    console.error("Error assigning category order:", error);
    return res.status(500).json({ message: "Server error", error: error.message });
  }
};


