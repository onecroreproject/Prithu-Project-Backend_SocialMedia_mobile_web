const DropdownConfig = require("../models/DropdownConfig");

const DEFAULT_GODS = [
    "Lord Murugan",
    "Lord Shiva",
    "Lord Ganesha",
    "Goddess Parvati",
    "Goddess Meenakshi",
    "Goddess Kali",
    "Goddess Mariamman",
    "Goddess Angala Parameswari",
    "Goddess Kamakshi",
    "Goddess Abirami",
    "Goddess Andal",
    "Lord Vishnu / Perumal",
    "Lord Rama",
    "Lord Hanuman",
    "Lord Krishna"
];

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
            ],
            gods: DEFAULT_GODS
        });
        await config.save();
    } else if (!config.gods || config.gods.length === 0) {
        config.gods = DEFAULT_GODS;
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
        const { sessions, days, specialDays, gods } = req.body;
        
        const config = await getOrCreateConfig();
        
        if (sessions) config.sessions = sessions;
        if (days) config.days = days;
        if (specialDays) config.specialDays = specialDays;
        if (gods) config.gods = gods;
        
        await config.save();
        
        res.status(200).json({ success: true, config, message: "Dropdown options updated successfully" });
    } catch (error) {
        console.error("Error updating dropdown config:", error);
        res.status(500).json({ success: false, message: "Internal Server Error" });
    }
};
