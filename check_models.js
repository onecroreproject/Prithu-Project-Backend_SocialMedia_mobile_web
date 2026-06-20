require("dotenv").config();
const { OpenAI } = require("openai");

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

async function checkModels() {
  try {
    const models = await client.models.list();
    console.log("Available models:");
    console.log(models.data.map((m) => m.id));
  } catch (error) {
    console.error("Error fetching models:", error.message);
  }
}

checkModels();
