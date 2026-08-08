const User = require('../../models/userModels/userModel');
const bcrypt = require('bcrypt');
const { checkAndClearDeactivatedUser } = require('../../controllers/userControllers/userDeleteController');

exports.changePassword = async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        const userId = req.Id;

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        const isMatch = await bcrypt.compare(currentPassword, user.passwordHash);
        if (!isMatch) {
            return res.status(400).json({ message: "Incorrect current password" });
        }

        const passwordHash = await bcrypt.hash(newPassword, 10);
        user.passwordHash = passwordHash;
        await user.save();

        res.status(200).json({ message: "Password updated successfully" });
    } catch (error) {
        console.error("Change Password Error:", error);
        res.status(500).json({ message: "Server error" });
    }
};

exports.toggleTwoFactor = async (req, res) => {
    try {
        const { isEnabled } = req.body;
        const userId = req.Id;

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        if (!user.securitySettings) {
            user.securitySettings = {};
        }

        user.securitySettings.twoFactorEnabled = isEnabled;
        await user.save();

        res.status(200).json({ 
            message: `Two-Factor Authentication ${isEnabled ? 'enabled' : 'disabled'}`,
            twoFactorEnabled: isEnabled
        });
    } catch (error) {
        console.error("Toggle 2FA Error:", error);
        res.status(500).json({ message: "Server error" });
    }
};

exports.toggleBiometrics = async (req, res) => {
    try {
        const { isEnabled } = req.body;
        const userId = req.Id;

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        if (!user.securitySettings) {
            user.securitySettings = {};
        }

        user.securitySettings.biometricsEnabled = isEnabled;
        await user.save();

        res.status(200).json({ 
            message: `Biometric login ${isEnabled ? 'enabled' : 'disabled'}`,
            biometricsEnabled: isEnabled
        });
    } catch (error) {
        console.error("Toggle Biometrics Error:", error);
        res.status(500).json({ message: "Server error" });
    }
};

exports.getActiveSessions = async (req, res) => {
    try {
        const userId = req.Id;
        const user = await User.findById(userId).select('fcmTokens lastLoginAt');
        
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        // Return FCM tokens as active sessions for now
        const sessions = user.fcmTokens.map(token => ({
            platform: token.platform,
            lastSeenAt: token.lastSeenAt,
            // We don't send the actual token back for security reasons
        }));

        res.status(200).json({ sessions });
    } catch (error) {
        console.error("Get Active Sessions Error:", error);
        res.status(500).json({ message: "Server error" });
    }
};

exports.getSecuritySettings = async (req, res) => {
    try {
        const userId = req.Id;
        const user = await User.findById(userId).select('securitySettings');
        
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        res.status(200).json({ 
            securitySettings: user.securitySettings || { twoFactorEnabled: false, biometricsEnabled: false }
        });
    } catch (error) {
        console.error("Get Security Settings Error:", error);
        res.status(500).json({ message: "Server error" });
    }
};

exports.requestDataDownload = async (req, res) => {
    try {
        const userId = req.Id;
        const user = await User.findById(userId).select('-passwordHash -otpCode');
        
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        // Mock generating a data download link.
        res.status(200).json({ 
            message: "Data download requested successfully. A link will be sent to your email.",
            dataSummary: user
        });
    } catch (error) {
        console.error("Request Data Download Error:", error);
        res.status(500).json({ message: "Server error" });
    }
};

exports.deleteAccountRequest = async (req, res) => {
    try {
        const { reason } = req.body;
        const userId = req.Id;
        const user = await User.findById(userId);
        
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        user.isActive = false;
        if (reason) {
            user.deletionReason = reason;
        }
        await user.save();

        // If there's an existing cleanup method:
        if (typeof checkAndClearDeactivatedUser === 'function') {
            checkAndClearDeactivatedUser(userId).catch(console.error);
        }

        res.status(200).json({ message: "Account deleted successfully" });
    } catch (error) {
        console.error("Delete Account Error:", error);
        res.status(500).json({ message: "Server error" });
    }
};
