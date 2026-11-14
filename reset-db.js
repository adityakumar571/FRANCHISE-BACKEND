import mongoose from 'mongoose';

const MONGODB_URI = 'mongodb+srv://saas:bb6UzuEUs7IrqYel@cluster0.y2zlwwm.mongodb.net/admin';

async function resetDatabase() {
  try {
    console.log('🔍 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB!');

    const admin = mongoose.connection.db.admin();

    // Get all database names
    const dbList = await admin.listDatabases();
    console.log('\n🗑️  Dropping all databases (except system)...');

    for (const db of dbList.databases) {
      if (!['admin', 'config', 'local'].includes(db.name)) {
        try {
          await admin.dropDatabase(db.name);
          console.log(`  ✅ Dropped: ${db.name}`);
        } catch (err) {
          console.log(`  ⚠️  ${db.name}: ${err.message}`);
        }
      }
    }

    console.log('\n✅ Database reset complete!');
    console.log('📊 All data has been cleared. Space quota should be free now.\n');
    
    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

resetDatabase();
