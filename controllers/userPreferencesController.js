const User = require('../../models/userModels/userModel');

exports.getUserPreferences = async (req, res) => {
    try {
        const userId = req.Id;
        const user = await User.findById(userId).select('notificationSettings appearanceSettings');
        
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        res.status(200).json({ 
            notificationSettings: user.notificationSettings || {
                pushNotifications: true,
                emailNotifications: true,
                newFollowers: true,
                likesAndComments: true,
            },
            appearanceSettings: user.appearanceSettings || {
                theme: 'system'
            }
        });
    } catch (error) {
        console.error("Get User Preferences Error:", error);
        res.status(500).json({ message: "Server error" });
    }
};

exports.updateUserPreferences = async (req, res) => {
    try {
        const userId = req.Id;
        const { notificationSettings, appearanceSettings } = req.body;

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        if (notificationSettings) {
            user.notificationSettings = {
                ...user.notificationSettings,
                ...notificationSettings
            };
        }

        if (appearanceSettings) {
            user.appearanceSettings = {
                ...user.appearanceSettings,
                ...appearanceSettings
            };
        }

        await user.save();

        res.status(200).json({ 
            message: "Preferences updated successfully",
            notificationSettings: user.notificationSettings,
            appearanceSettings: user.appearanceSettings
        });
    } catch (error) {
        console.error("Update User Preferences Error:", error);
        res.status(500).json({ message: "Server error" });
    }
};
