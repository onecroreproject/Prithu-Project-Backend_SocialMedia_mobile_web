require("dotenv").config();
const mongoose = require("mongoose");
const { prithuDB } = require("../database");
const Blog = require("../models/Blog");
const { getMediaUrl } = require("../utils/storageEngine");

async function syncBlogImages() {
    console.log("🚀 Starting blog image URL synchronization...");

    try {
        // Wait for DB connection
        await new Promise((resolve) => {
            if (mongoose.connection.readyState === 1) resolve();
            else mongoose.connection.once("open", resolve);
        });

        const blogs = await Blog.find({});
        console.log(`Found ${blogs.length} blogs to process.`);

        let updatedCount = 0;
        for (const blog of blogs) {
            const originalPath = blog.image;

            // Check if it's already an absolute URL
            if (originalPath && (originalPath.startsWith("http://") || originalPath.startsWith("https://"))) {
                console.log(`- Skipping absolute URL: ${blog.title}`);
                continue;
            }

            // Convert relative path to absolute URL
            if (originalPath) {
                const absoluteUrl = getMediaUrl(originalPath);
                blog.image = absoluteUrl;
                await blog.save();
                updatedCount++;
                console.log(`✅ Updated: ${blog.title} -> ${absoluteUrl}`);
            } else {
                console.log(`- Skipping empty image: ${blog.title}`);
            }
        }

        console.log(`\n✨ Synchronization complete!`);
        console.log(`Total blogs processed: ${blogs.length}`);
        console.log(`Blogs updated: ${updatedCount}`);

        process.exit(0);
    } catch (error) {
        console.error("❌ Error during synchronization:", error);
        process.exit(1);
    }
}

syncBlogImages();
