const Prompt = require("../models/Prompt");

// Initial seed prompts matching the screenshot exactly
const INITIAL_PROMPTS = [
  {
    title: "Rajasthani Palace Corridor Walk",
    category: "Couple",
    prompt: "A highly detailed 3D digital illustration of a young Indian couple, a boy and a girl, walking hand-in-hand through an ancient Rajasthani palace corridor. The boy is wearing a deep brown traditional kurta and the girl is in a vibrant pink embroidered salwar-suit. Sunlight filters through the archways creating warm, golden highlights. Hyper-realistic details, cinematic lighting, 8k resolution.",
    imageUrl: "https://images.unsplash.com/photo-1605649487212-47bdab064df7?w=600&auto=format&fit=crop",
    aspectRatio: "9:16",
    tags: ["couple", "traditional", "palace", "sunlight"]
  },
  {
    title: "Cozy Modern Cafe Date",
    category: "Couple",
    prompt: "A hyper-realistic 3D illustration of a modern couple sitting cozy in a cafe. The boy has a black sleeveless t-shirt, the girl is holding a tea cup, smiling at him. Soft warm indoor cafe lighting. Extremely detailed faces, romantic ambiance, detailed coffee shop background.",
    imageUrl: "https://images.unsplash.com/photo-1464746133101-a2c3f88e0dd9?w=600&auto=format&fit=crop",
    aspectRatio: "1:1",
    tags: ["couple", "cafe", "cozy", "casual"]
  },
  {
    title: "Park Bench Conversation",
    category: "Couple",
    prompt: "A 3D digital artwork of an Indian couple sitting together on a park bench. The girl is wearing a white printed top, boy in a dark casual shirt. They are looking at each other, green lush trees in the background. Calm and peaceful summer afternoon setting.",
    imageUrl: "https://images.unsplash.com/photo-1517048676732-d65bc937f952?w=600&auto=format&fit=crop",
    aspectRatio: "9:16",
    tags: ["couple", "park", "summer", "conversation"]
  },
  {
    title: "Dense Forest Embrace",
    category: "Couple",
    prompt: "3D render of a couple hugging tightly in a dense forest. The girl is in a white dress, the boy is in a grey hoodie. Soft, cinematic sun rays filtering through the tall green pine trees, misty and romantic atmospheric depth.",
    imageUrl: "https://images.unsplash.com/photo-1548013146-72479768bada?w=600&auto=format&fit=crop",
    aspectRatio: "1:1",
    tags: ["couple", "forest", "embrace", "nature"]
  },
  {
    title: "Taj Mahal Romantic Pose",
    category: "Couple",
    prompt: "A romantic 3D digital illustration of a couple posing in front of the Taj Mahal in Agra. The boy in a sleek black suit, the girl in a beautiful red traditional saree. Clear sky, gorgeous reflections in the pool. Masterpiece detailing, cinematic shot.",
    imageUrl: "https://images.unsplash.com/photo-1524492412937-b28074a5d7da?w=600&auto=format&fit=crop",
    aspectRatio: "9:16",
    tags: ["couple", "taj mahal", "saree", "romantic"]
  },
  {
    title: "Midnight Rain Under Umbrella",
    category: "Couple",
    prompt: "A stunning 3D illustration of a couple standing under a black umbrella in heavy rain at night. Saffron-themed streetlights, droplets reflecting light, warm yellow and deep black tones, hyper-detailed render, water splashes on the road.",
    imageUrl: "https://images.unsplash.com/photo-1534361960057-19889db9621e?w=600&auto=format&fit=crop",
    aspectRatio: "9:16",
    tags: ["couple", "rain", "umbrella", "night"]
  },
  {
    title: "Smiling Traditional Walk",
    category: "Couple",
    prompt: "A beautiful 3D render of a traditional couple smiling at each other. The boy in a green shirt, the girl in a sky blue floral patterned kurta. Natural outdoor background with golden hour lighting.",
    imageUrl: "https://images.unsplash.com/photo-1530103862676-de8c9debad1d?w=600&auto=format&fit=crop",
    aspectRatio: "9:16",
    tags: ["couple", "traditional", "outdoor", "golden hour"]
  },
  {
    title: "Courtyard Silk Saree Moment",
    category: "Couple",
    prompt: "A heartwarming 3D illustration of a traditional Indian couple, a boy and a girl, standing close together, looking at each other lovingly. The boy is in a white kurta with beautiful yellow embroidery, and the girl is wearing a bright red silk saree with gold details. Warm, soft glowing evening lighting, traditional house courtyard in the background.",
    imageUrl: "https://images.unsplash.com/photo-1583505260063-f24f9c51325c?w=600&auto=format&fit=crop",
    aspectRatio: "9:16",
    tags: ["couple", "traditional", "saree", "courtyard"]
  },
  {
    title: "Twilight Lehenga Dance",
    category: "Couple",
    prompt: "A highly cinematic 3D digital art of a couple standing on a terrace during twilight, looking into each other's eyes. The girl is wearing a gorgeous deep blue lehenga with silver mirror work, and the boy is wearing a matching blue kurta. The background shows a beautifully lit royal palace under a starry sky, cozy fairy lights in the foreground, 8k resolution, romantic mood.",
    imageUrl: "https://images.unsplash.com/photo-1502602898657-3e91760cbb34?w=600&auto=format&fit=crop",
    aspectRatio: "9:16",
    tags: ["couple", "lehenga", "palace", "twilight"]
  },
  {
    title: "Spooky Pumpkin Kid",
    category: "Halloween",
    prompt: "A highly detailed 3D digital illustration of a cheerful child wearing a classic pumpkin costume, standing on the porch of a beautifully decorated Halloween house. Glowing jack-o'-lanterns, purple eerie lighting, bats silhouette against a massive yellow full moon, cinematic lighting, magical spooky vibes.",
    imageUrl: "https://images.unsplash.com/photo-1508349082403-b187a020736c?w=600&auto=format&fit=crop",
    aspectRatio: "1:1",
    tags: ["halloween", "kids", "spooky", "pumpkin"]
  },
  {
    title: "Spooky Witch Cottage",
    category: "Halloween",
    prompt: "An atmospheric 3D render of a small cozy cottage decorated for Halloween. Giant glowing pumpkins on the steps, hanging skeletons, black cats resting near a bubbling green cauldron. Eerie purple mist flowing on the ground, full moon in the dark starry sky, hyper-detailed, trending on ArtStation.",
    imageUrl: "https://images.unsplash.com/photo-1547592180-85f173990554?w=600&auto=format&fit=crop",
    aspectRatio: "16:9",
    tags: ["halloween", "cottage", "spooky", "witch"]
  },
  {
    title: "Elegant Anniversary Dinner Date",
    category: "Anniversary",
    prompt: "A beautiful 3D render of a luxurious outdoor anniversary dinner setup. A heart-shaped arch made of glowing white and red roses, warm fairy lights hung across trees, a beautifully set table with a customized cake showing 'Happy Anniversary' in gold lettering. Soft romantic golden hour backdrop.",
    imageUrl: "https://images.unsplash.com/photo-1505236858219-8359eb29e3a9?w=600&auto=format&fit=crop",
    aspectRatio: "16:9",
    tags: ["anniversary", "dinner", "flowers", "roses"]
  },
  {
    title: "Cute Kids Playing in Autumn",
    category: "Kids",
    prompt: "A lovely 3D digital art of two little kids, a boy and a girl, playing happily in a park full of falling orange autumn leaves. The kids are wearing warm cozy sweaters and beanies, laughing and tossing leaves into the air. Soft golden sunlight filtering through the trees, happy nostalgic vibes.",
    imageUrl: "https://images.unsplash.com/photo-1503919545889-aef636e10ad4?w=600&auto=format&fit=crop",
    aspectRatio: "1:1",
    tags: ["kids", "autumn", "park", "play"]
  },
  {
    title: "Glowing 21st Birthday Boy",
    category: "Birthday",
    prompt: "A 3D digital rendering of a boy celebrating his 21st birthday. He is wearing a modern black sweatshirt with '21' written in a glowing blue neon font. Holding a golden cupcake with a sparkling candle, glowing balloons and confetti floating around in a dark room with cool ambient neon-blue highlights.",
    imageUrl: "https://images.unsplash.com/photo-1513151233558-d860c5398176?w=600&auto=format&fit=crop",
    aspectRatio: "1:1",
    tags: ["birthday", "neon", "balloons", "boy"]
  },
  {
    title: "Vibrant Diwali Diya Lighting",
    category: "Diwali",
    prompt: "A gorgeous 3D illustration of a young woman wearing a traditional yellow silk saree, lighting decorative clay diyas on the balcony of her house for Diwali. The background is filled with glowing lanterns, colorful rangoli on the floor, and distant fireworks lighting up the starry night sky. Extremely warm, festive, and detailed.",
    imageUrl: "https://images.unsplash.com/photo-1548013146-72479768bada?w=600&auto=format&fit=crop",
    aspectRatio: "9:16",
    tags: ["diwali", "diyas", "saree", "festival"]
  },
  {
    title: "Mystic Mahadev Shiva Render",
    category: "3D Model",
    prompt: "A powerful 3D sculpture render of Lord Shiva meditating on a snowy peak of Mount Kailash. The third eye glowing with divine light, Ganga river flowing from the locks, Trishul standing majestically next to him with a red flag. Cosmic background with nebulas and stars, high fidelity 3D asset style, hyper-detailed.",
    imageUrl: "https://images.unsplash.com/photo-1561361062-6522af7afe63?w=600&auto=format&fit=crop",
    aspectRatio: "9:16",
    tags: ["3D model", "mahadev", "shiva", "divine"]
  },
  {
    title: "Graceful Garba Dancer",
    category: "Navaratri",
    prompt: "A vibrant 3D rendering of a girl performing Garba dance for Navaratri. She is wearing a highly colorful, heavy mirror-work chaniya choli which is spinning dynamically. Holding decorated dandiya sticks, traditional festive lighting, joyful crowd blurred in the background, high energy, detailed embroidery, 8k.",
    imageUrl: "https://images.unsplash.com/photo-1566737236500-c8ac43014a67?w=600&auto=format&fit=crop",
    aspectRatio: "9:16",
    tags: ["navaratri", "garba", "dance", "traditional"]
  },
  {
    title: "Elegant Women Portrait in Forest",
    category: "Women",
    prompt: "A stunning 3D illustration of an elegant woman wearing a floral dress, standing in a magical sunlit forest clearing. Butterfies floating around her, holding a basket of fresh wildflowers, warm gentle breeze, highly detailed face with realistic expression, soft dreamy color grading.",
    imageUrl: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=600&auto=format&fit=crop",
    aspectRatio: "9:16",
    tags: ["women", "floral", "forest", "dreamy"]
  },
  {
    title: "Sleek Modern Men Style",
    category: "Men",
    prompt: "A hyper-detailed 3D digital model of a stylish man wearing a customized smart casual beige blazer and a white crewneck shirt, standing in front of a modern urban glass skyscraper during twilight. Sharp facial features, cinematic side-lighting, elegant and professional aesthetic.",
    imageUrl: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=600&auto=format&fit=crop",
    aspectRatio: "9:16",
    tags: ["men", "fashion", "urban", "skyscraper"]
  }
];

// Seed function to automatically populate database
exports.autoSeedPrompts = async () => {
  try {
    const count = await Prompt.countDocuments();
    if (count === 0) {
      console.log("🌱 Database is empty of Prompts. Seeding standard 19 prompts...");
      await Prompt.insertMany(INITIAL_PROMPTS);
      console.log("✅ Successfully seeded 19 prompts to MongoDB!");
    }
  } catch (err) {
    console.error("❌ Failed to auto-seed prompts:", err);
  }
};

// Manually trigger a seed/reset of prompts database
exports.manualSeedPrompts = async (req, res) => {
  try {
    // Optional: Clear existing first
    await Prompt.deleteMany({});
    const seeded = await Prompt.insertMany(INITIAL_PROMPTS);
    res.status(200).json({
      success: true,
      message: "Database seeded successfully with screenshot prompts!",
      count: seeded.length,
      data: seeded
    });
  } catch (err) {
    console.error("Manual Seed Error:", err);
    res.status(500).json({
      success: false,
      message: "Failed to seed prompts database",
      error: err.message
    });
  }
};

// Get all prompts (filterable, searchable)
exports.getAllPrompts = async (req, res) => {
  try {
    const { category, search, aspectRatio } = req.query;
    let query = {};

    if (category && category !== "All") {
      query.category = { $regex: new RegExp(`^${category}$`, "i") };
    }

    if (aspectRatio && aspectRatio !== "All") {
      query.aspectRatio = aspectRatio;
    }

    if (search) {
      const searchRegex = new RegExp(search, "i");
      query.$or = [
        { title: searchRegex },
        { prompt: searchRegex },
        { tags: { $in: [searchRegex] } }
      ];
    }

    const prompts = await Prompt.find(query).sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: prompts.length,
      data: prompts
    });
  } catch (err) {
    console.error("Get Prompts Error:", err);
    res.status(500).json({
      success: false,
      message: "Server error retrieving prompts",
      error: err.message
    });
  }
};

// Get single prompt details
exports.getPromptById = async (req, res) => {
  try {
    const prompt = await Prompt.findById(req.params.id);
    if (!prompt) {
      return res.status(404).json({
        success: false,
        message: "Prompt not found"
      });
    }
    res.status(200).json({
      success: true,
      data: prompt
    });
  } catch (err) {
    console.error("Get Prompt By Id Error:", err);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: err.message
    });
  }
};

// Create a new prompt (Admin)
exports.createPrompt = async (req, res) => {
  try {
    const { title, category, prompt, imageUrl, aspectRatio, tags } = req.body;
    
    if (!title || !category || !prompt || !imageUrl) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields: title, category, prompt, or imageUrl"
      });
    }

    const newPrompt = new Prompt({
      title,
      category,
      prompt,
      imageUrl,
      aspectRatio: aspectRatio || "1:1",
      tags: Array.isArray(tags) ? tags : tags ? tags.split(",").map(t => t.trim()).filter(Boolean) : []
    });

    await newPrompt.save();

    res.status(201).json({
      success: true,
      message: "Prompt created successfully!",
      data: newPrompt
    });
  } catch (err) {
    console.error("Create Prompt Error:", err);
    res.status(500).json({
      success: false,
      message: "Server error creating prompt",
      error: err.message
    });
  }
};

// Update an existing prompt (Admin)
exports.updatePrompt = async (req, res) => {
  try {
    const { title, category, prompt, imageUrl, aspectRatio, tags } = req.body;
    
    const promptDoc = await Prompt.findById(req.params.id);
    if (!promptDoc) {
      return res.status(404).json({
        success: false,
        message: "Prompt not found"
      });
    }

    if (title) promptDoc.title = title;
    if (category) promptDoc.category = category;
    if (prompt) promptDoc.prompt = prompt;
    if (imageUrl) promptDoc.imageUrl = imageUrl;
    if (aspectRatio) promptDoc.aspectRatio = aspectRatio;
    if (tags) {
      promptDoc.tags = Array.isArray(tags) ? tags : tags.split(",").map(t => t.trim()).filter(Boolean);
    }

    await promptDoc.save();

    res.status(200).json({
      success: true,
      message: "Prompt updated successfully!",
      data: promptDoc
    });
  } catch (err) {
    console.error("Update Prompt Error:", err);
    res.status(500).json({
      success: false,
      message: "Server error updating prompt",
      error: err.message
    });
  }
};

// Delete a prompt (Admin)
exports.deletePrompt = async (req, res) => {
  try {
    const promptDoc = await Prompt.findByIdAndDelete(req.params.id);
    if (!promptDoc) {
      return res.status(404).json({
        success: false,
        message: "Prompt not found"
      });
    }

    res.status(200).json({
      success: true,
      message: "Prompt deleted successfully!"
    });
  } catch (err) {
    console.error("Delete Prompt Error:", err);
    res.status(500).json({
      success: false,
      message: "Server error deleting prompt",
      error: err.message
    });
  }
};

const fs = require("fs");
const path = require("path");

exports.uploadPromptImage = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "No image file uploaded"
      });
    }

    const mediaDir = path.join(__dirname, "../media/ai_images");
    if (!fs.existsSync(mediaDir)) {
      fs.mkdirSync(mediaDir, { recursive: true });
    }

    const now = new Date();
    const timeStr = `${now.getFullYear()}${(now.getMonth() + 1).toString().padStart(2, '0')}${now.getDate().toString().padStart(2, '0')}_${now.getHours().toString().padStart(2, '0')}${now.getMinutes().toString().padStart(2, '0')}${now.getSeconds().toString().padStart(2, '0')}`;
    const ext = path.extname(req.file.originalname) || ".png";
    const filename = `ai_image_${timeStr}${ext}`;

    const filePath = path.join(mediaDir, filename);
    fs.writeFileSync(filePath, req.file.buffer);

    const liveUrl = `/media/ai_images/${filename}`;

    res.status(200).json({
      success: true,
      message: "Image uploaded and saved successfully",
      imageUrl: liveUrl
    });
  } catch (err) {
    console.error("Upload Prompt Image Error:", err);
    res.status(500).json({
      success: false,
      message: "Failed to upload image",
      error: err.message
    });
  }
};

// trigger restart
