const HelpFAQ = require("../../models/faqSchema");


exports.createHelpSection = async (req, res) => {
  try {
    const { sectionKey, title, description, faqs, order } = req.body;

    if (!sectionKey || !title) {
      return res.status(400).json({
        success: false,
        message: "sectionKey and title are required",
      });
    }

    const section = await HelpFAQ.create({
      sectionKey,
      title,
      description,
      faqs,
      order,
    });

    res.status(201).json({
      success: true,
      message: "Help section created",
      data: section,
    });
  } catch (err) {
    console.error("Create Help Section Error:", err);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};




exports.updateHelpSection = async (req, res) => {
  try {
    const { id } = req.params;

    const section = await HelpFAQ.findByIdAndUpdate(
      id,
      req.body,
      { new: true }
    );

    if (!section) {
      return res.status(404).json({
        success: false,
        message: "Help section not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Help section updated",
      data: section,
    });
  } catch (err) {
    console.error("Update Help Section Error:", err);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};



exports.deleteHelpSection = async (req, res) => {
  try {
    const { id } = req.params;

    const section = await HelpFAQ.findByIdAndDelete(id);

    if (!section) {
      return res.status(404).json({
        success: false,
        message: "Help section not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Help section deleted",
    });
  } catch (err) {
    console.error("Delete Help Section Error:", err);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};



exports.bulkCreateHelpFAQ = async (req, res) => {
  try {
    const { sections } = req.body;

    if (!Array.isArray(sections) || sections.length === 0) {
      return res.status(400).json({
        success: false,
        message: "sections array is required",
      });
    }

    // Prevent duplicate sectionKey insert
    const sectionKeys = sections.map((s) => s.sectionKey);

    const existingSections = await HelpFAQ.find({
      sectionKey: { $in: sectionKeys },
    }).select("sectionKey");

    if (existingSections.length > 0) {
      return res.status(409).json({
        success: false,
        message: "Some sections already exist",
        existingSections: existingSections.map((s) => s.sectionKey),
      });
    }

    // Insert all sections at once
    const insertedSections = await HelpFAQ.insertMany(sections, {
      ordered: true, // stop if any error occurs
    });

    return res.status(201).json({
      success: true,
      message: "All FAQ sections inserted successfully",
      totalInserted: insertedSections.length,
      data: insertedSections,
    });
  } catch (error) {
    console.error("❌ Bulk FAQ Insert Error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};


exports.getHelpFAQ = async (req, res) => {
  try {
    const { search } = req.query;

    // Base query: only active sections
    const query = { isActive: true };

    const sections = await HelpFAQ.find(query)
      .sort({ order: 1 })
      .lean();

    const searchRegex = search
      ? new RegExp(search.trim(), "i")
      : null;

    const filteredSections = sections
      .map((section) => {
        // Filter active FAQs
        let faqs = section.faqs.filter((faq) => faq.isActive);

        // Apply search if provided
        if (searchRegex) {
          faqs = faqs.filter(
            (faq) =>
              searchRegex.test(faq.question) ||
              searchRegex.test(faq.answer) ||
              searchRegex.test(section.title)
          );
        }

        // Sort FAQs
        faqs.sort((a, b) => a.order - b.order);

        return {
          ...section,
          faqs,
        };
      })
      // Remove sections with no matching FAQs
      .filter((section) => section.faqs.length > 0);

    res.status(200).json({
      success: true,
      totalSections: filteredSections.length,
      totalFAQs: filteredSections.reduce(
        (sum, section) => sum + section.faqs.length,
        0
      ),
      data: filteredSections,
    });
  } catch (err) {
    console.error("Get Help FAQ Error:", err);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};