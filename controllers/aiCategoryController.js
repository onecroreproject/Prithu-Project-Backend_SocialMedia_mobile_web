const AICategory = require("../models/AICategory");
const Prompt = require("../models/Prompt");

const INITIAL_CATEGORIES = [
  {
    name: "Couple",
    subcategories: ["Traditional", "Modern & Casual", "Romantic", "Wedding", "Travel"]
  },
  {
    name: "Kids",
    subcategories: ["Kids Boy", "Kids Girl", "Toddler", "Playing & Outdoor"]
  },
  {
    name: "Halloween",
    subcategories: ["Spooky Cottage", "Costumes", "Pumpkin & Ghost", "Fantasy"]
  },
  {
    name: "Anniversary",
    subcategories: ["Dinner Date", "Romantic Setup", "Celebration", "Flowers & Decor"]
  },
  {
    name: "Birthday",
    subcategories: ["Neon Party", "Kids Birthday", "Celebration & Cake", "Milestone"]
  },
  {
    name: "Diwali",
    subcategories: ["Diyas & Lights", "Rangoli", "Traditional Attire", "Celebration"]
  },
  {
    name: "Navaratri",
    subcategories: ["Garba Dance", "Dandiya", "Chaniya Choli", "Festive Lights"]
  },
  {
    name: "Women",
    subcategories: ["Floral & Nature", "Traditional Saree", "Modern Fashion", "Portraits"]
  },
  {
    name: "Men",
    subcategories: ["Modern Style", "Traditional Kurta", "Urban & Casual", "Professional"]
  },
  {
    name: "3D Model",
    subcategories: ["Gods & Mythological", "Sculpture", "Sci-Fi & Cyberpunk", "Fantasy Art"]
  }
];

// Auto-seed categories if empty
exports.autoSeedCategories = async () => {
  try {
    const count = await AICategory.countDocuments();
    if (count === 0) {
      console.log("🌱 AICategories collection is empty. Seeding initial categories with subcategories...");
      await AICategory.insertMany(INITIAL_CATEGORIES);
      console.log("✅ Successfully seeded initial categories with subcategories!");
    } else {
      // Also ensure existing categories have subcategories if empty
      for (const initial of INITIAL_CATEGORIES) {
        const existing = await AICategory.findOne({
          name: { $regex: new RegExp(`^${initial.name}$`, "i") }
        });
        if (existing && (!existing.subcategories || existing.subcategories.length === 0)) {
          existing.subcategories = initial.subcategories;
          await existing.save();
        }
      }
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
    const { name, subcategories } = req.body;
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

    const parsedSubs = Array.isArray(subcategories)
      ? subcategories.map(s => String(s).trim()).filter(Boolean)
      : typeof subcategories === "string"
      ? subcategories.split(",").map(s => s.trim()).filter(Boolean)
      : [];

    const newCategory = new AICategory({
      name: trimmedName,
      subcategories: parsedSubs
    });
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
    const { name, subcategories } = req.body;
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
    if (subcategories !== undefined) {
      category.subcategories = Array.isArray(subcategories)
        ? subcategories.map(s => String(s).trim()).filter(Boolean)
        : typeof subcategories === "string"
        ? subcategories.split(",").map(s => s.trim()).filter(Boolean)
        : [];
    }
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
    const seeded = await AICategory.insertMany(INITIAL_CATEGORIES);
    res.status(200).json({
      success: true,
      message: "Categories seeded successfully with standard categories and subcategories!",
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
