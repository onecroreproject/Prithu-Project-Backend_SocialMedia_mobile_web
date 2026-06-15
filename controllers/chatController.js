const ChatHistory = require('../models/ChatHistory');
const UnansweredQuestion = require('../models/UnansweredQuestion');
const ChatLead = require('../models/ChatLead');
const Blog = require('../models/Blog');
const HelpFAQ = require('../models/faqSchema');
const Feed = require('../models/feedModel');

// Basic Synonym Map
const SYNONYMS = {
  'ai': 'artificial intelligence',
  'ml': 'machine learning',
  'cyber security': 'information security',
  'cybersecurity': 'information security',
  'pwd': 'password',
  'dl': 'deep learning',
  'cv': 'computer vision',
  'nlp': 'natural language processing',
};

const extractKeywords = (query) => {
  let processedQuery = query.toLowerCase();
  
  // Replace synonyms
  for (const [key, value] of Object.entries(SYNONYMS)) {
    const regex = new RegExp(`\\b${key}\\b`, 'gi');
    processedQuery = processedQuery.replace(regex, value);
  }

  // Remove common stop words (very basic implementation)
  const stopWords = ['is', 'are', 'am', 'i', 'need', 'want', 'a', 'an', 'the', 'how', 'what', 'why', 'who', 'where', 'when', 'to', 'for', 'with', 'about', 'some'];
  const words = processedQuery.split(/\s+/);
  
  const keywords = words.filter(word => !stopWords.includes(word) && word.length > 2);
  return {
    searchString: processedQuery, // Use processed query for full text search
    keywords
  };
};

// 1. Search Database
exports.searchQuery = async (req, res) => {
  try {
    const { question, sessionId } = req.body;
    const userId = req.user ? req.user._id : null; // Assuming req.user from auth middleware
    
    if (!question || !sessionId) {
      return res.status(400).json({ success: false, message: 'Question and sessionId are required' });
    }

    const { searchString, keywords } = extractKeywords(question);
    
    // We will search across Blogs, FAQs, and Feeds using text search
    // Using $text $search with the processed string
    const textSearchQuery = { $text: { $search: searchString } };

    // Parallel search
    const [blogs, faqs, feeds] = await Promise.all([
      Blog.find(textSearchQuery, { score: { $meta: "textScore" } })
        .sort({ score: { $meta: "textScore" } })
        .limit(3)
        .lean(),
      HelpFAQ.find(textSearchQuery, { score: { $meta: "textScore" } })
        .sort({ score: { $meta: "textScore" } })
        .limit(3)
        .lean(),
      Feed.find(textSearchQuery, { score: { $meta: "textScore" } })
        .sort({ score: { $meta: "textScore" } })
        .limit(3)
        .lean()
    ]);

    // Format results into cards
    let results = [];
    
    blogs.forEach(blog => {
      results.push({
        id: blog._id,
        title: blog.title,
        description: blog.content.substring(0, 100) + '...',
        category: 'Blog',
        modelType: 'Blog',
        score: blog.score
      });
    });

    faqs.forEach(faq => {
      // FAQ schema has nested faqs, but text search matches the document.
      // We will just return the section title, or try to find the specific matched question.
      results.push({
        id: faq._id,
        title: faq.title,
        description: faq.description || 'Help Section',
        category: 'FAQ',
        modelType: 'FAQ',
        score: faq.score
      });
    });

    feeds.forEach(feed => {
      results.push({
        id: feed._id,
        title: feed.designMetadata?.templateName || feed.caption?.substring(0, 50) || 'Project Record',
        description: feed.caption?.substring(0, 100) || '',
        category: 'Project Record',
        modelType: 'Feed',
        score: feed.score
      });
    });

    // Sort combined results by text score
    results.sort((a, b) => b.score - a.score);
    const topResults = results.slice(0, 5); // Take top 5 overall matches

    // Save Chat History
    const matchedThreads = topResults.map(r => ({ threadId: r.id, modelType: r.modelType }));
    
    await ChatHistory.create({
      userId,
      sessionId,
      question,
      matchedKeywords: keywords,
      matchedThreads
    });

    if (topResults.length === 0) {
      // No match found - save to unanswered questions
      await UnansweredQuestion.findOneAndUpdate(
        { question: question.toLowerCase() },
        { $inc: { searchCount: 1 } },
        { upsert: true, new: true }
      );
    }

    res.status(200).json({
      success: true,
      hasMatch: topResults.length > 0,
      results: topResults,
      message: topResults.length > 0 ? "Here are some related threads." : "We couldn't find a related discussion."
    });

  } catch (error) {
    console.error("Chat Search Error:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

// 2. Capture Lead
exports.captureLead = async (req, res) => {
  try {
    const { name, email, mobileNumber, searchQuery, sessionId } = req.body;
    
    if (!name || !searchQuery) {
      return res.status(400).json({ success: false, message: 'Name and search query are required' });
    }

    const lead = await ChatLead.create({
      name, email, mobileNumber, searchQuery, sessionId
    });

    res.status(201).json({ success: true, message: 'Support request submitted successfully', lead });
  } catch (error) {
    console.error("Capture Lead Error:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

// 3. Get Chat History (User)
exports.getHistory = async (req, res) => {
  try {
    const { sessionId } = req.query;
    const userId = req.user ? req.user._id : null;
    
    let query = {};
    if (userId) {
      query.userId = userId;
    } else if (sessionId) {
      query.sessionId = sessionId;
    } else {
      return res.status(400).json({ success: false, message: 'User or sessionId required' });
    }

    const history = await ChatHistory.find(query).sort({ createdAt: 1 });
    res.status(200).json({ success: true, history });
  } catch (error) {
    console.error("Get History Error:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

// 4. Analytics Dashboard (Admin)
exports.getAnalytics = async (req, res) => {
  try {
    const totalSearches = await ChatHistory.countDocuments();
    const matchedSearches = await ChatHistory.countDocuments({ 'matchedThreads.0': { $exists: true } });
    const unmatchedSearches = totalSearches - matchedSearches;
    
    // Most searched keywords
    const topKeywordsAgg = await ChatHistory.aggregate([
      { $unwind: "$matchedKeywords" },
      { $group: { _id: "$matchedKeywords", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 }
    ]);

    // Top unanswered questions
    const topUnanswered = await UnansweredQuestion.find().sort({ searchCount: -1 }).limit(10);
    
    // Recent searches
    const recentSearches = await ChatHistory.find().sort({ createdAt: -1 }).limit(10);

    // Leads Count
    const newLeads = await ChatLead.countDocuments({ status: 'new' });

    res.status(200).json({
      success: true,
      stats: {
        totalSearches,
        matchedSearches,
        unmatchedSearches,
        newLeads
      },
      topKeywords: topKeywordsAgg,
      topUnanswered,
      recentSearches
    });

  } catch (error) {
    console.error("Get Analytics Error:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

// 5. Get Unanswered Questions (Admin)
exports.getUnansweredQuestions = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const skip = (page - 1) * limit;
    
    const questions = await UnansweredQuestion.find()
      .sort({ searchCount: -1 })
      .skip(skip)
      .limit(Number(limit));
      
    const total = await UnansweredQuestion.countDocuments();
    
    res.status(200).json({ success: true, questions, total, pages: Math.ceil(total / limit) });
  } catch (error) {
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

// 6. Get Leads (Admin)
exports.getLeads = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const skip = (page - 1) * limit;
    
    const leads = await ChatLead.find()
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit));
      
    const total = await ChatLead.countDocuments();
    
    res.status(200).json({ success: true, leads, total, pages: Math.ceil(total / limit) });
  } catch (error) {
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};
