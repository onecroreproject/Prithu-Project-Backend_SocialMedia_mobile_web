require('dotenv').config();
const bcrypt = require('bcrypt');
const { connectPrithuDB } = require('./database');
const Admin = require('./models/adminModels/adminModel');

async function seedAdmin() {
    try {
        await connectPrithuDB();

        const email = 'admin@gmail.com';
        const password = 'admin1234';
        const userName = 'admin';
        
        let existingAdmin = await Admin.findOne({ email });
        if (existingAdmin) {
            console.log(`Admin with email ${email} already exists.`);
        } else {
            const passwordHash = await bcrypt.hash(password, 10);
            
            const admin = new Admin({
                userName,
                email,
                passwordHash,
                adminType: 'Admin',
                isActive: true,
                isEmailVerified: true
            });

            await admin.save();
            console.log(`✅ Admin ${email} created successfully with password: ${password}`);
        }

    } catch (err) {
        console.error('❌ Error seeding admin:', err);
    } finally {
        process.exit(0);
    }
}

seedAdmin();
