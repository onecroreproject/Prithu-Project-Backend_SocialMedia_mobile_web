const mongoose = require('mongoose');
const dotenv = require('dotenv');

dotenv.config({ path: '../.env' }); // or whichever path .env is

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/prithuDB"; // Adjust accordingly

async function migrateCollections() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log("Connected to MongoDB.");

    const db = mongoose.connection.db;

    // 1. Merge users and Users into User
    const mainUserCollection = db.collection('User');
    const lowercaseUsersCollection = db.collection('users');
    const uppercaseUsersCollection = db.collection('Users');

    const lowercaseUsers = await lowercaseUsersCollection.find({}).toArray();
    const uppercaseUsers = await uppercaseUsersCollection.find({}).toArray();

    console.log(`Found ${lowercaseUsers.length} in 'users' and ${uppercaseUsers.length} in 'Users'`);

    if (lowercaseUsers.length > 0) {
      await mainUserCollection.insertMany(lowercaseUsers);
      console.log("Merged 'users' into 'User'.");
      await lowercaseUsersCollection.drop();
      console.log("Dropped 'users' collection.");
    }

    if (uppercaseUsers.length > 0) {
      await mainUserCollection.insertMany(uppercaseUsers);
      console.log("Merged 'Users' into 'User'.");
      await uppercaseUsersCollection.drop();
      console.log("Dropped 'Users' collection.");
    }

    // 2. Drop empty ghost collections
    const collections = await db.listCollections().toArray();
    const collectionNames = collections.map(c => c.name);

    const ghostsToDrop = [
      { ghost: 'categories', real: 'Categories' },
      { ghost: 'analyticsmetrics', real: 'AnalyticsMetrics' },
      { ghost: 'imagestats', real: 'ImageStats' },
      { ghost: 'videostats', real: 'VideoStats' },
      { ghost: 'profilesettings', real: 'ProfileSettings' } // Found in lookup
    ];

    for (const pair of ghostsToDrop) {
      if (collectionNames.includes(pair.ghost)) {
        const count = await db.collection(pair.ghost).countDocuments();
        if (count === 0) {
          await db.collection(pair.ghost).drop();
          console.log(`Dropped empty ghost collection: '${pair.ghost}'`);
        } else {
          console.log(`Ghost collection '${pair.ghost}' is not empty (${count} docs). Did not drop.`);
          // If you want to merge them, you can do:
          // const docs = await db.collection(pair.ghost).find({}).toArray();
          // await db.collection(pair.real).insertMany(docs);
          // await db.collection(pair.ghost).drop();
        }
      }
    }

    console.log("Migration complete.");
    process.exit(0);
  } catch (error) {
    console.error("Migration failed:", error);
    process.exit(1);
  }
}

migrateCollections();
