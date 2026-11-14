import mongoose from 'mongoose';

const MONGODB_URI = 'mongodb+srv://saas:bb6UzuEUs7IrqYel@cluster0.y2zlwwm.mongodb.net/admin';

async function cleanupDatabase() {
  try {
    console.log('🔍 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected!');

    // Get all databases
    const admin = mongoose.connection.db.admin();
    const dbList = await admin.listDatabases();
    
    console.log('\n📊 Current Databases:');
    dbList.databases.forEach(db => {
      console.log(`  - ${db.name}: ${(db.sizeOnDisk / 1024 / 1024).toFixed(2)} MB`);
    });

    // Delete old/test databases to free up space
    const dbsToDelete = ['test', 'local', 'config', 'tempdb'];
    
    for (const dbName of dbsToDelete) {
      try {
        await mongoose.connection.db.admin().dropDatabase();
        console.log(`✅ Dropped database: ${dbName}`);
      } catch (err) {
        console.log(`⚠️  Could not drop ${dbName}: ${err.message}`);
      }
    }

    // List collections in current DB and clean old records
    const collections = await mongoose.connection.db.listCollections().toArray();
    console.log(`\n🧹 Cleaning collections...`);
    
    for (const col of collections) {
      const collection = mongoose.connection.db.collection(col.name);
      const count = await collection.countDocuments();
      
      // Delete records older than 30 days (optional)
      if (count > 1000) {
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const result = await collection.deleteMany({ 
          createdAt: { $lt: thirtyDaysAgo }
        }).catch(() => ({ deletedCount: 0 }));
        
        if (result.deletedCount > 0) {
          console.log(`  ✅ ${col.name}: Deleted ${result.deletedCount} old records`);
        }
      }
    }

    const newDbList = await admin.listDatabases();
    console.log('\n📊 After Cleanup:');
    newDbList.databases.forEach(db => {
      console.log(`  - ${db.name}: ${(db.sizeOnDisk / 1024 / 1024).toFixed(2)} MB`);
    });

    console.log('\n✅ Cleanup Complete!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

cleanupDatabase();
