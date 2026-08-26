const DropdownConfig = require("../models/DropdownConfig");

// Helper to ensure default global config exists
const getOrCreateConfig = async () => {
    let config = await DropdownConfig.findOne({ singletonId: "global_dropdowns" });
    if (!config) {
        config = new DropdownConfig({
            singletonId: "global_dropdowns",
            sessions: ["Anytime", "Morning", "Afternoon", "Evening"],
            days: ["Everyday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
            specialDays: [
                "Amavasya", "Purnima", "Ekadashi", "Pradosham", "Chaturthi", 
                "Sashti", "Sankashti", "Shivaratri", "Navratri", "Diwali", 
                "Pongal / Makar Sankranti", "Tamil New Year", "Krishna Janmashtami", 
                "Ganesh Chaturthi", "Maha Shivaratri"
            ]
        });
        await config.save();
    }
    return config;
};

// GET /api/dropdown-config
exports.getConfig = async (req, res) => {
    try {
        const config = await getOrCreateConfig();
        res.status(200).json({ success: true, config });
    } catch (error) {
        console.error("Error fetching dropdown config:", error);
        res.status(500).json({ success: false, message: "Internal Server Error" });
    }
};

// PUT /api/dropdown-config
exports.updateConfig = async (req, res) => {
    try {
        const { sessions, days, specialDays } = req.body;
        
        const config = await getOrCreateConfig();
        
        if (sessions) config.sessions = sessions;
        if (days) config.days = days;
        if (specialDays) config.specialDays = specialDays;
        
        await config.save();
        
        res.status(200).json({ success: true, config, message: "Dropdown options updated successfully" });
    } catch (error) {
        console.error("Error updating dropdown config:", error);
        res.status(500).json({ success: false, message: "Internal Server Error" });
    }
};
