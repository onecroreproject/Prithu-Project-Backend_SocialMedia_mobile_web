require("dotenv").config();
const { prithuDB } = require("../database");
const Prompt = require("../models/Prompt");
const { autoSeedPrompts } = require("../controllers/promptController");

async function run() {
  console.log("Connecting to database...");
  await new Promise((resolve) => {
    if (prithuDB.readyState === 1) resolve();
    else prithuDB.once("connected", resolve);
  });

  console.log("Database connected successfully! Checking prompt count...");
  const initialCount = await Prompt.countDocuments();
  console.log(`Current prompts in DB: ${initialCount}`);

  console.log("Running autoSeedPrompts...");
  await autoSeedPrompts();

  const finalCount = await Prompt.countDocuments();
  console.log(`Final prompts in DB: ${finalCount}`);

  // Fetch a sample prompt
  const sample = await Prompt.findOne();
  if (sample) {
    console.log("Sample Prompt from DB:", {
      title: sample.title,
      category: sample.category,
      prompt: sample.prompt,
      imageUrl: sample.imageUrl,
      aspectRatio: sample.aspectRatio,
      tags: sample.tags
    });
  }

  console.log("Closing DB connection...");
  await prithuDB.close();
  console.log("Done!");
  process.exit(0);
}

run().catch((err) => {
  console.error("Execution failed:", err);
  process.exit(1);
});
