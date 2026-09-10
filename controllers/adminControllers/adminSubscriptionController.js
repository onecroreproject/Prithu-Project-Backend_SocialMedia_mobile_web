const SubscriptionPlan = require("../../models/subscriptionModels/subscriptionPlanModel.js");

/**
 * Create a new subscription plan
 */
exports.createPlan = async (req, res) => {
  try {
    const { name, price, durationDays, limits, description, isActive } = req.body;

    if (!name || durationDays === undefined) {
      return res.status(400).json({ message: "Name and durationDays are required" });
    }

    if (price === undefined || price === null) {
      return res.status(400).json({ message: "Price is required" });
    }

    const plan = await SubscriptionPlan.create({
      name,
      price,
      durationDays,
      limits: {
        deviceLimit: limits?.deviceLimit || 1,
      },
      description: description || "",
      planType: "basic",
      isActive: isActive !== undefined ? isActive : true,
    });

    res.status(201).json({ success: true, message: "Subscription plan created successfully", plan });
  } catch (error) {
    console.error("Error creating plan:", error);
    res.status(500).json({ message: "Server error while creating plan" });
  }
};

/**
 * Update an existing plan
 */
exports.updatePlan = async (req, res) => {
  try {
    const planId = req.params.id;
    if (!planId) {
      return res.status(400).json({ message: "Plan ID is required" });
    }

    const allowedFields = [
      "name",
      "price",
      "durationDays",
      "limits",
      "description",
      "planType",
      "isActive"
    ];

    const updates = {};
    allowedFields.forEach((field) => {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    });

    updates.updatedAt = new Date();

    const plan = await SubscriptionPlan.findByIdAndUpdate(planId, updates, {
      new: true,
      runValidators: true,
    });

    if (!plan) {
      return res.status(404).json({ message: "Plan not found" });
    }

    res.status(200).json({ success: true, message: "Plan updated successfully", plan });
  } catch (error) {
    console.error("Error updating plan:", error);
    res.status(500).json({ message: "Server error" });
  }
};

/**
 * Delete a plan
 */
exports.deletePlan = async (req, res) => {
  try {
    const planId = req.params.id;
    if (!planId) {
      return res.status(400).json({ message: "Plan ID is required" });
    }
    await SubscriptionPlan.findByIdAndDelete(planId);
    res.status(200).json({ success: true, message: "Plan deleted successfully" });
  } catch (error) {
    console.error("Error deleting plan:", error);
    res.status(500).json({ message: "Server error" });
  }
};

/**
 * Get all available plans
 */
exports.getAllPlans = async (req, res) => {
  try {
    const plans = await SubscriptionPlan.find().lean();
    if (!plans || plans.length === 0) {
      return res.status(404).json({ message: "No plans found" });
    }

    // Enhance response with calculated fields if needed
    const enhancedPlans = plans.map(plan => ({
      ...plan,
      durationDescription: plan.durationDays >= 365
        ? `${(plan.durationDays / 365).toFixed(1)} Year(s)`
        : `${plan.durationDays} Days`
    }));

    res.status(200).json({ success: true, plans: enhancedPlans });
  } catch (error) {
    console.error("Error fetching plans:", error);
    res.status(500).json({ message: "Server error" });
  }
};

