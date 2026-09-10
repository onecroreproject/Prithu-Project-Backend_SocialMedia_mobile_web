const User = require("../models/userModels/userModel");


exports.requestPostInterest = async (req, res) => {
  try {
    const userId = req.Id;

    const user = await User.findById(userId).select("allowToPost");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Already allowed
    if (user.allowToPost === "allow") {
      return res.status(200).json({
        success: true,
        message: "Posting already allowed",
        status: user.allowToPost,
      });
    }

    // Already requested
    if (user.allowToPost === "interest") {
      return res.status(200).json({
        success: true,
        message: "Interest already submitted",
        status: user.allowToPost,
      });
    }

    // Update to interest
    user.allowToPost = "interest";
    await user.save();

    return res.status(200).json({
      success: true,
      message: "Interest submitted successfully",
      status: "interest",
    });

  } catch (error) {
    console.error("REQUEST POST INTEREST ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};




exports.getPostInterestStatus = async (req, res) => {
  try {
    const userId = req.Id;

    const user = await User.findById(userId).select("allowToPost");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    return res.status(200).json({
      success: true,
      status: user.allowToPost,   // allow | interest | notallow
    });

  } catch (error) {
    console.error("GET POST INTEREST STATUS ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

