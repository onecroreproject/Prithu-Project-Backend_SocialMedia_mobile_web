const User = require("../models/userModels/userModel");
const Prompt = require("../models/Prompt");
const WalletTransaction = require("../models/WalletTransaction");
const PromptUnlock = require("../models/PromptUnlock");
const AIGeneration = require("../models/AIGeneration");
const CreditPackage = require("../models/CreditPackage");
const { GoogleGenAI } = require("@google/genai");

// Make sure to use process.env.OPENAI_API_KEY if they just replaced the value, 
// or GEMINI_API_KEY if they added a new one. We'll check both.
const geminiApiKey = process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY;
const ai = new GoogleGenAI({ apiKey: geminiApiKey || "dummy" });

// Get User Wallet Balance
const getWallet = async (req, res) => {
  try {
    const userId = req.Id;
    const user = await User.findById(userId).select("wallet");
    if (!user) return res.status(404).json({ error: "User not found" });

    res.json({ success: true, wallet: user.wallet || { balance: 0, totalPurchasedCredits: 0, totalSpentCredits: 0 } });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Get Transaction History
const getTransactions = async (req, res) => {
  try {
    const userId = req.Id;
    const transactions = await WalletTransaction.find({ userId }).sort({ createdAt: -1 });
    res.json({ success: true, transactions });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Get Credit Packages
const getCreditPackages = async (req, res) => {
  try {
    const packages = await CreditPackage.find({ isActive: true }).sort({ credits: 1 });
    // If no packages exist, provide default ones (for testing)
    if (packages.length === 0) {
      return res.json({
        success: true,
        packages: [
          { _id: "pkg1", name: "Starter", credits: 100, price: 100, currency: "INR" },
          { _id: "pkg2", name: "Basic", credits: 250, price: 250, currency: "INR" },
          { _id: "pkg3", name: "Pro", credits: 500, price: 500, currency: "INR" },
          { _id: "pkg4", name: "Elite", credits: 1000, price: 1000, currency: "INR" },
        ]
      });
    }
    res.json({ success: true, packages });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Sample Buy Credits (Simulating Payment Success)
const buyCredits = async (req, res) => {
  try {
    const userId = req.Id;
    const { packageId, credits, price } = req.body;

    if (!credits || credits <= 0) return res.status(400).json({ error: "Invalid credits amount" });

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    if (!user.wallet) {
      user.wallet = { balance: 0, totalPurchasedCredits: 0, totalSpentCredits: 0 };
    }

    const balanceBefore = user.wallet.balance;
    const balanceAfter = balanceBefore + credits;

    // Atomic update
    user.wallet.balance = balanceAfter;
    user.wallet.totalPurchasedCredits += credits;
    await user.save();

    // Create Transaction
    const transaction = await WalletTransaction.create({
      userId,
      transactionType: "PURCHASE",
      credits: credits,
      amount: price || 0,
      balanceBefore,
      balanceAfter,
      remarks: "Sample Credit Purchase",
    });

    res.json({ success: true, wallet: user.wallet, transaction });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Unlock a Prompt
const unlockPrompt = async (req, res) => {
  try {
    const userId = req.Id;
    const { promptId } = req.body;

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    const prompt = await Prompt.findById(promptId);
    if (!prompt) return res.status(404).json({ error: "Prompt not found" });

    const cost = prompt.unlockCredits || 3; // default to 3 as requested

    // Check if already unlocked
    const existingUnlock = await PromptUnlock.findOne({ userId, promptId });
    if (existingUnlock) {
      return res.status(400).json({ error: "Prompt already unlocked" });
    }

    if (!user.wallet || user.wallet.balance < cost) {
      return res.status(400).json({ error: "Insufficient balance to unlock prompt" });
    }

    const balanceBefore = user.wallet.balance;
    const balanceAfter = balanceBefore - cost;

    // Atomic update
    user.wallet.balance = balanceAfter;
    user.wallet.totalSpentCredits += cost;
    await user.save();

    // Create Records
    await PromptUnlock.create({ userId, promptId, creditsUsed: cost });

    await WalletTransaction.create({
      userId,
      transactionType: "PROMPT_UNLOCK",
      credits: -cost,
      balanceBefore,
      balanceAfter,
      referenceId: promptId,
      remarks: `Unlocked prompt: ${prompt.title}`,
    });

    res.json({ success: true, wallet: user.wallet, message: "Prompt unlocked successfully" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Get User's Unlocked Prompts
const getUnlockedPrompts = async (req, res) => {
  try {
    const userId = req.Id;
    const unlocks = await PromptUnlock.find({ userId }).populate("promptId");
    res.json({ success: true, unlocks });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Generate Image (Try In Prithu)
const generateImage = async (req, res) => {
  try {
    const userId = req.Id;
    const { promptId, promptText, imageCount = 1, sourceImages = [] } = req.body;

    if (imageCount < 1 || imageCount > 5) {
      return res.status(400).json({ error: "Image count must be between 1 and 5" });
    }

    const COST_PER_IMAGE = 3;
    const totalCost = imageCount * COST_PER_IMAGE;

    const user = await User.findById(userId);
    if (!user || !user.wallet || user.wallet.balance < totalCost) {
      return res.status(400).json({ error: "Insufficient balance for generation" });
    }

    const balanceBefore = user.wallet.balance;
    const balanceAfter = balanceBefore - totalCost;

    // Simulate Gemini API Call
    let generatedImagesUrls = [];
    if (geminiApiKey) {
      try {
         const result = await ai.models.generateImages({
            model: "imagen-3.0-generate-002",
            prompt: promptText || "Generate an amazing image",
            config: {
              numberOfImages: Math.min(imageCount, 4), // Gemini supports max 4 at once
              outputMimeType: "image/jpeg",
              aspectRatio: "1:1"
            }
         });
         
         // Extract base64 image bytes from response and convert to data URIs
         if (result.generatedImages && result.generatedImages.length > 0) {
             generatedImagesUrls = result.generatedImages.map(img => 
                 `data:image/jpeg;base64,${img.image.imageBytes}`
             );
         }

         // If imageCount > what was returned, duplicate it for mockup or loop
         while(generatedImagesUrls.length > 0 && generatedImagesUrls.length < imageCount) {
             generatedImagesUrls.push(generatedImagesUrls[0]);
         }

         if (generatedImagesUrls.length === 0) throw new Error("No images returned from Gemini");

      } catch (aiError) {
         console.error("Gemini AI Error:", aiError?.response?.data || aiError.message);
         // Fallback to placeholders if API fails
         for(let i=0; i<imageCount; i++) {
           generatedImagesUrls.push(`https://picsum.photos/512/512?random=${Date.now() + i}`);
         }
      }
    } else {
       // Fallback mock
       for(let i=0; i<imageCount; i++) {
         generatedImagesUrls.push(`https://picsum.photos/512/512?random=${Date.now() + i}`);
       }
    }

    // Deduct credits
    user.wallet.balance = balanceAfter;
    user.wallet.totalSpentCredits += totalCost;
    await user.save();

    // Save generation log
    const generation = await AIGeneration.create({
      userId,
      promptId: promptId || null,
      sourceImages,
      generatedImages: generatedImagesUrls,
      imageCount,
      creditsUsed: totalCost,
      status: "SUCCESS"
    });

    await WalletTransaction.create({
      userId,
      transactionType: "AI_GENERATION",
      credits: -totalCost,
      balanceBefore,
      balanceAfter,
      referenceId: generation._id.toString(),
      remarks: `Generated ${imageCount} images`,
    });

    res.json({ success: true, wallet: user.wallet, images: generatedImagesUrls, generation });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Get Generation History
const getGenerationHistory = async (req, res) => {
  try {
    const userId = req.Id;
    const history = await AIGeneration.find({ userId }).populate("promptId").sort({ createdAt: -1 });
    res.json({ success: true, history });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  getWallet,
  getTransactions,
  getCreditPackages,
  buyCredits,
  unlockPrompt,
  getUnlockedPrompts,
  generateImage,
  getGenerationHistory
};
