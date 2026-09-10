const AICategory = require("../models/AICategory");
const Prompt = require("../models/Prompt");

const INITIAL_CATEGORIES = [
  "Halloween",
  "Anniversary",
  "Kids",
  "Couple",
  "Birthday",
  "Diwali",
  "Women",
  "3D Model",
  "Men",
  "Navaratri"
];

// Auto-seed categories if empty
exports.autoSeedCategories = async () => {
  try {
    const count = await AICategory.countDocuments();
    if (count === 0) {
      console.log("🌱 AICategories collection is empty. Seeding initial categories...");
      const seededDocs = INITIAL_CATEGORIES.map(name => ({ name }));
      await AICategory.insertMany(seededDocs);
      console.log("✅ Successfully seeded initial categories!");
    }
  } catch (err) {
    console.error("❌ Failed to auto-seed categories:", err);
  }
};

// Get all categories (Public / User API)
exports.getAllCategories = async (req, res) => {
  try {
    const categories = await AICategory.find().sort({ name: 1 });
    res.status(200).json({
      success: true,
      count: categories.length,
      data: categories
    });
  } catch (err) {
    console.error("Get Categories Error:", err);
    res.status(500).json({
      success: false,
      message: "Server error retrieving categories"
    });
  }
};

// Create dynamic category (Admin API)
exports.createCategory = async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: "Category name is required"
      });
    }

    const trimmedName = name.trim();
    // Check if category already exists
    const exists = await AICategory.findOne({ 
      name: { $regex: new RegExp(`^${trimmedName}$`, "i") } 
    });

    if (exists) {
      return res.status(400).json({
        success: false,
        message: "Category already exists"
      });
    }

    const newCategory = new AICategory({ name: trimmedName });
    await newCategory.save();

    res.status(201).json({
      success: true,
      data: newCategory
    });
  } catch (err) {
    console.error("Create Category Error:", err);
    res.status(500).json({
      success: false,
      message: "Server error creating category"
    });
  }
};

// Update category (Admin API)
exports.updateCategory = async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: "Category name is required"
      });
    }

    const trimmedName = name.trim();
    const categoryId = req.params.id;

    // Check if category exists
    const category = await AICategory.findById(categoryId);
    if (!category) {
      return res.status(404).json({
        success: false,
        message: "Category not found"
      });
    }

    // Check duplicate name excluding current category
    const duplicate = await AICategory.findOne({
      _id: { $ne: categoryId },
      name: { $regex: new RegExp(`^${trimmedName}$`, "i") }
    });

    if (duplicate) {
      return res.status(400).json({
        success: false,
        message: "A category with this name already exists"
      });
    }

    const oldName = category.name;
    category.name = trimmedName;
    await category.save();

    // Optionally: Update all associated prompts with the new category name
    if (oldName.toLowerCase() !== trimmedName.toLowerCase()) {
      await Prompt.updateMany(
        { category: oldName },
        { $set: { category: trimmedName } }
      );
    }

    res.status(200).json({
      success: true,
      data: category
    });
  } catch (err) {
    console.error("Update Category Error:", err);
    res.status(500).json({
      success: false,
      message: "Server error updating category"
    });
  }
};

// Delete category (Admin API)
exports.deleteCategory = async (req, res) => {
  try {
    const categoryId = req.params.id;
    const category = await AICategory.findById(categoryId);
    
    if (!category) {
      return res.status(404).json({
        success: false,
        message: "Category not found"
      });
    }

    // Check if any prompts are currently using this category
    const countUsing = await Prompt.countDocuments({ category: category.name });
    if (countUsing > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete category. ${countUsing} prompt(s) are currently associated with it.`
      });
    }

    await AICategory.findByIdAndDelete(categoryId);

    res.status(200).json({
      success: true,
      message: "Category deleted successfully"
    });
  } catch (err) {
    console.error("Delete Category Error:", err);
    res.status(500).json({
      success: false,
      message: "Server error deleting category"
    });
  }
};

// Reset/Seed Categories (Admin API)
exports.manualSeedCategories = async (req, res) => {
  try {
    await AICategory.deleteMany({});
    const docs = INITIAL_CATEGORIES.map(name => ({ name }));
    const seeded = await AICategory.insertMany(docs);
    res.status(200).json({
      success: true,
      message: "Categories seeded successfully with standard list!",
      count: seeded.length,
      data: seeded
    });
  } catch (err) {
    console.error("Manual Seed Categories Error:", err);
    res.status(500).json({
      success: false,
      message: "Server error seeding categories"
    });
  }
};
