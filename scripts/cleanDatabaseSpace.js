/**
 * Clean database to free up space
 * WARNING: This will delete old/duplicate medicine records
 */
import mongoose from 'mongoose';

const DB_URI = 'mongodb+srv://adityakumar33114:UCxu6G2uZG_83SM@cluster0.quxrn.mongodb.net/cloudFranchaize';

async function cleanDatabase() {
  try {
    console.log('🔗 Connecting to database...');
    await mongoose.connect(DB_URI);
    console.log('✅ Connected');

    const db = mongoose.connection.db;
    const medicines = db.collection('medicines');
    
    // Check current count
    const totalCount = await medicines.countDocuments();
    console.log('\n📊 Current medicines:', totalCount);
    
    // Option 1: Keep only recent 50,000 medicines (delete oldest)
    console.log('\n🗑️  Deleting old medicine records to free space...');
    
    // Get all medicine IDs sorted by creation date (oldest first)
    const oldMedicines = await medicines
      .find({}, { projection: { _id: 1 } })
      .sort({ createdAt: 1 })
      .limit(143000) // Keep only 50k, delete 143k
      .toArray();
    
    const idsToDelete = oldMedicines.map(m => m._id);
    
    console.log('Planning to delete:', idsToDelete.length, 'old records');
    console.log('\n⚠️  This will keep only the 50,000 most recent medicines.');
    console.log('⚠️  Press Ctrl+C to cancel, or wait 5 seconds...');
    
    // Wait 5 seconds
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    console.log('\n🗑️  Deleting...');
    const result = await medicines.deleteMany({ _id: { $in: idsToDelete } });
    
    console.log('✅ Deleted:', result.deletedCount, 'records');
    
    const remainingCount = await medicines.countDocuments();
    console.log('📊 Remaining medicines:', remainingCount);
    
    console.log('\n✨ Database space freed up!');
    console.log('You can now create Super Admin.');

    await mongoose.disconnect();
    process.exit(0);

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    await mongoose.disconnect();
    process.exit(1);
  }
}

cleanDatabase();
