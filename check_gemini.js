require("dotenv").config();
const { GoogleGenAI } = require("@google/genai");

async function checkGemini() {
  const geminiApiKey = process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY;
  if (!geminiApiKey || geminiApiKey === "dummy") {
    console.error("❌ No API Key found in .env! Please add GEMINI_API_KEY=your_key");
    return;
  }

  console.log("🔍 Checking Gemini API Key...");
  const ai = new GoogleGenAI({ apiKey: geminiApiKey });

  try {
    // We try to generate a tiny image to test imagen-3.0-generate-002
    const result = await ai.models.generateImages({
      model: "imagen-3.0-generate-002",
      prompt: "A small red dot",
      config: {
        numberOfImages: 1,
        outputMimeType: "image/jpeg",
        aspectRatio: "1:1"
      }
    });

    if (result.generatedImages && result.generatedImages.length > 0) {
      console.log("✅ SUCCESS! Your Gemini API Key is working perfectly and supports Imagen 3!");
      console.log(`🖼️  Generated an image of size: ${result.generatedImages[0].image.imageBytes.length} bytes`);
    } else {
      console.error("⚠️  Warning: API responded but returned no images.");
    }

  } catch (error) {
    console.error("❌ ERROR: Gemini API call failed!");
    console.error(error.message);
    if (error.response) {
      console.error(error.response.data);
    }
  }
}

checkGemini();
