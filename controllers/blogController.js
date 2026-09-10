const Blog = require("../models/Blog");
const DOMPurify = require("isomorphic-dompurify");
const redisClient = require('../Config/redisConfig');

const BLOGS_CACHE_KEY = 'public_blogs_all';

/**
 * Helper to clear public blogs cache
 */
const clearBlogsCache = async () => {
    if (redisClient && redisClient.status === 'ready') {
        try {
            await redisClient.del(BLOGS_CACHE_KEY);
        } catch (err) {
            console.warn("⚠️ Redis Delete Error:", err.message);
        }
    }
};

/**
 * Normalizes blog content by stripping &nbsp;, fixing spacing, and ensuring safe HTML structure.
 */
const normalizeBlogContent = (content) => {
    if (!content || typeof content !== 'string') return content;

    // Replace all &nbsp; with standard spaces
    let normalized = content.replace(/&nbsp;/g, ' ');

    // Normalize multiple spaces between words (but be careful not to break HTML)
    // We mainly want to clean up trailing/leading spaces inside tags and around text nodes
    normalized = normalized.replace(/\s+/g, ' ');

    // Sanitize and fix nesting (isomorphic-dompurify works on Node.js)
    return DOMPurify.sanitize(normalized);
};

/**
 * Get all published blogs
 */
exports.getAllBlogs = async (req, res) => {
    try {
        // 🟢 Caching Logic
        if (redisClient && redisClient.status === 'ready') {
            try {
                const cachedData = await redisClient.get(BLOGS_CACHE_KEY);
                if (cachedData) {
                    return res.status(200).json(JSON.parse(cachedData));
                }
            } catch (err) {
                console.warn("⚠️ Redis Get Error:", err.message);
            }
        }

        const blogs = await Blog.find({ isPublished: true }).sort({ createdAt: -1 });

        // 🟢 Store in Redis for 1 hour
        if (redisClient && redisClient.status === 'ready') {
            try {
                await redisClient.setex(BLOGS_CACHE_KEY, 3600, JSON.stringify(blogs));
            } catch (err) {
                console.warn("⚠️ Redis Set Error:", err.message);
            }
        }

        res.status(200).json(blogs);
    } catch (error) {
        console.error("Error fetching blogs:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

/**
 * Get all blogs for admin (including unpublished)
 */
exports.getAllBlogsAdmin = async (req, res) => {
    try {
        const blogs = await Blog.find().sort({ createdAt: -1 });
        res.status(200).json(blogs);
    } catch (error) {
        console.error("Error fetching all blogs:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

/**
 * Create a new blog
 */
exports.createBlog = async (req, res) => {
    try {
        const { title, content, image, isPublished } = req.body;
        const normalizedContent = normalizeBlogContent(content);

        // Generate slug from title
        const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

        // Check if slug already exists
        const existingBlog = await Blog.findOne({ slug });
        if (existingBlog) {
            return res.status(400).json({ message: "A blog with a similar title already exists" });
        }

        const newBlog = new Blog({
            title,
            content: normalizedContent,
            image: req.blogImage ? req.blogImage.url : (typeof image === 'string' ? image : ""),
            slug,
            author: req.Id,
            roleRef: req.role || "Admin",
            isPublished: isPublished !== undefined ? (isPublished === 'true' || isPublished === true) : true
        });

        await newBlog.save();

        // 🟢 Invalidate Cache
        await clearBlogsCache();

        res.status(201).json({ message: "Blog created successfully", blog: newBlog });
    } catch (error) {
        console.error("Error creating blog:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

/**
 * Update a blog
 */
exports.updateBlog = async (req, res) => {
    try {
        const { id } = req.params;
        const { title, content, image, isPublished } = req.body;
        const normalizedContent = content ? normalizeBlogContent(content) : undefined;

        const blog = await Blog.findById(id);
        if (!blog) {
            return res.status(404).json({ message: "Blog not found" });
        }

        if (title) {
            blog.title = title;
            // Regenerate slug if title changes
            blog.slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
        }

        if (normalizedContent !== undefined) blog.content = normalizedContent;
        if (req.blogImage) {
            blog.image = req.blogImage.url;
        } else if (image && typeof image === 'string' && image.trim() !== '') {
            blog.image = image;
        }

        if (isPublished !== undefined) {
            blog.isPublished = isPublished === 'true' || isPublished === true;
        }

        // Always update who last modified it
        if (req.Id) {
            blog.author = req.Id;
            blog.roleRef = req.role || "Admin";
        }

        await blog.save();

        // 🟢 Invalidate Cache
        await clearBlogsCache();

        res.status(200).json({ message: "Blog updated successfully", blog });
    } catch (error) {
        console.error("Error updating blog:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

/**
 * Delete a blog
 */
exports.deleteBlog = async (req, res) => {
    try {
        const { id } = req.params;
        const blog = await Blog.findByIdAndDelete(id);
        if (!blog) {
            return res.status(404).json({ message: "Blog not found" });
        }

        // 🟢 Invalidate Cache
        await clearBlogsCache();

        res.status(200).json({ message: "Blog deleted successfully" });
    } catch (error) {
        console.error("Error deleting blog:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

/**
 * Toggle blog published status
 */
exports.toggleBlogStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const blog = await Blog.findById(id);
        if (!blog) {
            return res.status(404).json({ message: "Blog not found" });
        }

        blog.isPublished = !blog.isPublished;
        await blog.save();

        // 🟢 Invalidate Cache
        await clearBlogsCache();

        res.status(200).json({
            message: `Blog ${blog.isPublished ? 'published' : 'unpublished'} successfully`,
            isPublished: blog.isPublished
        });
    } catch (error) {
        console.error("Error toggling blog status:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

/**
 * Get a single blog by slug (Public)
 */
exports.getBlogBySlug = async (req, res) => {
    try {
        const { slug } = req.params;
        const blog = await Blog.findOne({ slug, isPublished: true });
        if (!blog) {
            return res.status(404).json({ message: "Blog not found" });
        }
        res.status(200).json(blog);
    } catch (error) {
        console.error("Error fetching blog:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};
