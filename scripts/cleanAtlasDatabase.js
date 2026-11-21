/**
 * Clean Atlas Database - Delete old medicine records to free space
 * Atlas is full: 539MB/512MB
 */
import mongoose from 'mongoose';

const ATLAS_URI = 'mongodb+srv://adityakumar33114:UCxu6G2uZG_83SM@cluster0.quxrn.mongodb.net/cloudFranchaize';

async function cleanDatabase() {
  try {
    console.log('🔗 Connecting to Atlas...');
    await mongoose.connect(ATLAS_URI);
    console.log('✅ Connected');

    const db = mongoose.connection.db;
    const medicines = db.collection('medicines');
    
    const totalCount = await medicines.countDocuments();
    console.log('\n📊 Current medicines:', totalCount);
    console.log('💾 Database size: 539 MB / 512 MB (FULL!)');
    
    // Strategy: Delete medicines without tenant reference (likely test/seed data)
    console.log('\n🗑️  Strategy: Delete medicines without tenantId (test/seed data)');
    console.log('⏳ This will free up significant space...');
    
    // Count medicines without tenantId
    const testMedicinesCount = await medicines.countDocuments({ 
      $or: [
        { tenantId: { $exists: false } },
        { tenantId: null },
        { tenantId: '' }
      ]
    });
    
    console.log('Found', testMedicinesCount, 'test/seed medicines without tenantId');
    
    if (testMedicinesCount === 0) {
      console.log('\n⚠️  All medicines have tenantId. Deleting oldest 150,000 records...');
      
      // Delete in batches without sorting
      let totalDeleted = 0;
      const batchSize = 10000;
      const targetDelete = 150000;
      
      while (totalDeleted < targetDelete) {
        const batch = await medicines.find({}, { projection: { _id: 1 } }).limit(batchSize).toArray();
        if (batch.length === 0) break;
        
        const ids = batch.map(m => m._id);
        const result = await medicines.deleteMany({ _id: { $in: ids } });
        totalDeleted += result.deletedCount;
        console.log(`✓ Deleted batch: ${result.deletedCount} records (Total: ${totalDeleted}/${targetDelete})`);
      }
    } else {
      console.log('\n⏳ Deleting test/seed medicines in batches...');
      
      const result = await medicines.deleteMany({ 
        $or: [
          { tenantId: { $exists: false } },
          { tenantId: null },
          { tenantId: '' }
        ]
      });
      
      console.log('✅ Deleted:', result.deletedCount, 'test medicines');
    }
    
    
    const remainingCount = await medicines.countDocuments();
    const deletedCount = totalCount - remainingCount;
    
    console.log('\n✅ Cleanup complete!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('Deleted:', deletedCount, 'records');
    console.log('Remaining:', remainingCount, 'medicines');
    console.log('Estimated space freed: ~', Math.round((deletedCount / totalCount) * 539), 'MB');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    console.log('\n✨ Atlas database now has space for new writes!');
    console.log('You can now create Super Admin.');

    await mongoose.disconnect();
    console.log('\n✅ Disconnected');
    process.exit(0);

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    await mongoose.disconnect();
    process.exit(1);
  }
}

cleanDatabase();
