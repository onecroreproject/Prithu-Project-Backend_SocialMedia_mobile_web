const Blog = require("../models/Blog");

/**
 * Get all published blogs
 */
exports.getAllBlogs = async (req, res) => {
    try {
        const blogs = await Blog.find({ isPublished: true }).sort({ createdAt: -1 });
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

        // Generate slug from title
        const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

        // Check if slug already exists
        const existingBlog = await Blog.findOne({ slug });
        if (existingBlog) {
            return res.status(400).json({ message: "A blog with a similar title already exists" });
        }

        const newBlog = new Blog({
            title,
            content,
            image,
            slug,
            isPublished: isPublished !== undefined ? isPublished : true
        });

        await newBlog.save();
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

        const blog = await Blog.findById(id);
        if (!blog) {
            return res.status(404).json({ message: "Blog not found" });
        }

        if (title) {
            blog.title = title;
            // Regenerate slug if title changes
            blog.slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
        }

        if (content) blog.content = content;
        if (image) blog.image = image;
        if (isPublished !== undefined) blog.isPublished = isPublished;

        await blog.save();
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
