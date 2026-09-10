exports.reportFeed = async (req, res) => {
  try {
    const userId = req.Id; // ✅ logged-in userId from auth middleware
    const { feedId, reason, description } = req.body;

    // Validate inputs
    if (!feedId || !reason) {
      return res.status(400).json({ message: "feedId and reason are required" });
    }

    if (!mongoose.Types.ObjectId.isValid(feedId)) {
      return res.status(400).json({ message: "Invalid feedId" });
    }

    // Check if feed exists
    const feedExists = await Feed.findById(feedId);
    if (!feedExists) {
      return res.status(404).json({ message: "Feed not found" });
    }

    // Prevent duplicate reports by the same user
    const alreadyReported = await Report.findOne({ feedId, reportedBy: userId });
    if (alreadyReported) {
      return res.status(400).json({ message: "You already reported this feed" });
    }

    // Create new report
    const newReport = new Report({
      feedId,
      reportedBy: userId,
      reason,
      description,
    });

    await newReport.save();

    res.status(201).json({
      message: "Report submitted successfully",
      report: newReport,
    });
  } catch (err) {
    console.error("Error reporting feed:", err);
    res.status(500).json({ message: "Internal server error" });
  }
};