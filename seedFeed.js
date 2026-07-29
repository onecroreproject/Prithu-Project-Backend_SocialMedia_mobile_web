require("dotenv").config();
const mongoose = require("mongoose");
const fs = require("fs");
const path = require("path");
const { prithuDB } = require("./database");
const Feed = require("./models/feedModel");
const Category = require("./models/categorySchema");
const Admin = require("./models/adminModels/adminModel");

async function seedFeed() {
  try {
    // Wait for connection to be ready if needed, or just let Mongoose queue it
    if (prithuDB.readyState !== 1) {
      await new Promise(resolve => prithuDB.once("connected", resolve));
    }

    const admin = await Admin.findOne({ adminType: "Admin" });
    if (!admin) {
      console.log("No Admin found. Please run seedAdmin.js first.");
      return;
    }

    let category = await Category.findOne({});
    if (!category) {
      console.log("No Category found. Creating one...");
      category = new Category({
        name: "General",
        slug: "general",
        description: "General feeds",
        isActive: true,
      });
      await category.save();
    }

    const sourceFile = "c:\\Agathiyan\\Prithu-Full-Project\\newProject\\Prithu_app\\assets\\intro2.png";
    const destDir = path.join(__dirname, "media", "feeds", "general", "image");
    
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }

    const filename = `seed_feed_${Date.now()}.png`;
    const destFile = path.join(destDir, filename);

    if (fs.existsSync(sourceFile)) {
      fs.copyFileSync(sourceFile, destFile);
      console.log(`Copied source image to ${destFile}`);
    } else {
      console.log(`Source file not found: ${sourceFile}.`);
    }

    // Relative URL for DB matching storageEngine output
    const mediaUrl = `/media/feeds/general/image/${filename}`;

    const newFeed = new Feed({
      uploadType: "template",
      postType: "image",
      uploadMode: "template",
      language: "en",
      category: [category._id],
      mediaUrl: mediaUrl,
      files: [
        {
          url: mediaUrl,
          type: "image",
          uploadMode: "template",
          mimeType: "image/png",
          order: 0,
        },
      ],
      designMetadata: {
        isTemplate: true,
        templateName: "Calendar Template",
        overlayElements: [
          {
            id: "calendar",
            type: "calendar",
            xPercent: 70,
            yPercent: 20,
            wPercent: 20,
            hPercent: 15,
            visible: true,
            zIndex: 10,
            animation: {
              enabled: true,
              direction: "right",
              speed: 1
            }
          }
        ]
      },
      caption: "This is a seeded feed using intro2.png",
      roleRef: "Admin",
      postedBy: {
        userId: admin._id,
        name: admin.userName || "Admin",
        role: "Admin",
      },
      status: "published"
    });

    await newFeed.save();
    console.log("✅ Successfully seeded Feed with intro2.png");
  } catch (error) {
    console.error("❌ Error seeding feed:", error);
  } finally {
    process.exit(0);
  }
}

seedFeed();
