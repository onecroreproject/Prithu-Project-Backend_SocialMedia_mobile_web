require("dotenv").config();
const { OpenAI } = require("openai");

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

async function testGen() {
  try {
    const result = await client.images.generate({
      model: "gpt-image-1",
      prompt: "A modern chatbot dashboard with analytics cards",
      size: "1024x1024",
    });
    console.log("SUCCESS:");
    console.log(result.data);
  } catch (error) {
    console.error("ERROR:");
    console.error(error.message);
    if(error.response) console.error(error.response.data);
  }
}

testGen();
