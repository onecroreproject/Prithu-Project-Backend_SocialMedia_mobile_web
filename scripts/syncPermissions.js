const mongoose = require('mongoose');
require('dotenv').config();

// Define Schemas (Minimal for migration)
const Admin = mongoose.model('Admin', new mongoose.Schema({}, { strict: false }), 'admins');
const ChildAdmin = mongoose.model('ChildAdmin', new mongoose.Schema({}, { strict: false }), 'childadmins');

const MAPPING = {
    'canManageFeedInfo': 'canManageFeeds',
    'canFaqManagement': 'canManageFAQs',
    'canManageDrive': 'canManageUpload',
    'canViewBilling': 'canManageSubscriptions',
    'canManagePlans': 'canManageSettingsSubscriptions',
    'canManageAdminRoles': 'canManageChildAdmins',
    'canManagePermissions': 'canManageChildAdmins',
    'canManageStudio': 'canManageUpload',
    'canManageSettings': 'canManageSubscriptions',
    'canManageReports': 'canManageReport'
};

async function migrate() {
    try {
        await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/prithu_social'); // Adjusted to project context
        console.log('Connected to MongoDB');

        // 1. Cleanup Admin Collection
        console.log('Cleaning up Admin collection...');
        const adminResult = await Admin.updateMany(
            {},
            { $unset: { permissions: "" } }
        );
        console.log(`Updated ${adminResult.modifiedCount} admin documents (removed obsolete permissions object).`);

        // 2. Cleanup & Sync ChildAdmin Collection
        console.log('Cleaning up ChildAdmin collection...');
        const childAdmins = await ChildAdmin.find({});

        for (const admin of childAdmins) {
            let updated = false;
            let newPermissions = [];

            if (admin.grantedPermissions) {
                newPermissions = admin.grantedPermissions.map(p => MAPPING[p] || p);
                // Remove duplicates and filter nulls
                newPermissions = [...new Set(newPermissions)].filter(Boolean);

                if (JSON.stringify(newPermissions) !== JSON.stringify(admin.grantedPermissions)) {
                    updated = true;
                }
            }

            const updateOp = { $unset: { ungrantedPermissions: "" } };
            if (updated || admin.ungrantedPermissions) {
                updateOp.$set = { grantedPermissions: newPermissions };
                updated = true;
            }

            if (updated) {
                await ChildAdmin.updateOne({ _id: admin._id }, updateOp);
            }
        }

        console.log(`Processed ${childAdmins.length} child admin documents.`);
        console.log('Migration completed successfully.');
        process.exit(0);
    } catch (error) {
        console.error('Migration failed:', error);
        process.exit(1);
    }
}

migrate();
