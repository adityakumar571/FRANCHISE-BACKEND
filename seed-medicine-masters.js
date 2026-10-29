/**
 * Seed Medicine Master Data
 * Adds default categories, formulations (as units), companies to SupplierMaster collection
 * Run: node seed-medicine-masters.js
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

// Import the actual model
import SupplierMaster from './models/SupplierMaster.model.js';

async function seedMasters() {
  try {
    console.log('🌱 Seeding Medicine Master Data...\n');
    
    // Connect to MongoDB
    const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/franchise_db';
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected to MongoDB\n');
    
    // Check if data already exists
    const existingCount = await SupplierMaster.countDocuments();
    console.log(`📊 Existing master data: ${existingCount} records\n`);
    
    // Define seed data - using the SupplierMaster model schema
    const categories = [
      { type: 'category', name: 'Analgesic', description: 'Pain relief medicines', isActive: true },
      { type: 'category', name: 'Antibiotic', description: 'Infection treatment', isActive: true },
      { type: 'category', name: 'Antacid', description: 'Acidity & digestion', isActive: true },
      { type: 'category', name: 'Antipyretic', description: 'Fever reduction', isActive: true },
      { type: 'category', name: 'Vitamin', description: 'Nutritional supplements', isActive: true },
      { type: 'category', name: 'Antiviral', description: 'Viral infection treatment', isActive: true },
      { type: 'category', name: 'Cardiovascular', description: 'Heart & BP medicines', isActive: true },
      { type: 'category', name: 'Diabetes', description: 'Blood sugar management', isActive: true },
      { type: 'category', name: 'Antiallergic', description: 'Allergy relief', isActive: true },
      { type: 'category', name: 'Respiratory', description: 'Cough & cold medicines', isActive: true },
    ];
    
    const units = [
      { type: 'unit', name: 'Tablet', description: 'Solid oral dosage form', isActive: true },
      { type: 'unit', name: 'Capsule', description: 'Gelatin shell dosage', isActive: true },
      { type: 'unit', name: 'Syrup', description: 'Liquid oral medication', isActive: true },
      { type: 'unit', name: 'Injection', description: 'Injectable solution', isActive: true },
      { type: 'unit', name: 'Ointment', description: 'Topical cream/gel', isActive: true },
      { type: 'unit', name: 'Drops', description: 'Eye/Ear drops', isActive: true },
      { type: 'unit', name: 'Suspension', description: 'Liquid suspension', isActive: true },
      { type: 'unit', name: 'Powder', description: 'Powder form', isActive: true },
      { type: 'unit', name: 'Inhaler', description: 'Respiratory inhaler', isActive: true },
      { type: 'unit', name: 'Spray', description: 'Nasal/Oral spray', isActive: true },
    ];
    
    const companies = [
      { type: 'company', name: 'Cipla', description: 'Leading pharma company', isActive: true },
      { type: 'company', name: 'Sun Pharma', description: 'Largest pharma in India', isActive: true },
      { type: 'company', name: 'Dr. Reddy\'s', description: 'Global pharma company', isActive: true },
      { type: 'company', name: 'Lupin', description: 'Research-driven pharma', isActive: true },
      { type: 'company', name: 'Biocon', description: 'Biopharmaceutical company', isActive: true },
      { type: 'company', name: 'Torrent Pharma', description: 'Indian pharma leader', isActive: true },
      { type: 'company', name: 'Alkem Labs', description: 'Fast-growing pharma', isActive: true },
      { type: 'company', name: 'Mankind Pharma', description: 'Affordable medicines', isActive: true },
      { type: 'company', name: 'Zydus Cadila', description: 'Healthcare solutions', isActive: true },
      { type: 'company', name: 'Glenmark', description: 'Innovative pharma', isActive: true },
    ];
    
    // Combine all data
    const allData = [...categories, ...units, ...companies];
    
    console.log('📝 Seed data prepared:');
    console.log(`   Categories: ${categories.length}`);
    console.log(`   Units (Formulations): ${units.length}`);
    console.log(`   Companies: ${companies.length}`);
    console.log(`   Total: ${allData.length} records\n`);
    
    // Insert data (skip duplicates)
    let inserted = 0;
    let skipped = 0;
    
    for (const item of allData) {
      const exists = await SupplierMaster.findOne({ 
        type: item.type, 
        name: item.name 
      });
      
      if (!exists) {
        await SupplierMaster.create(item);
        inserted++;
        console.log(`   ✓ Created: ${item.type} - ${item.name}`);
      } else {
        skipped++;
      }
    }
    
    console.log('\n✅ Seeding completed!');
    console.log(`   Inserted: ${inserted} new records`);
    console.log(`   Skipped: ${skipped} existing records\n`);
    
    // Verify final count
    const finalCount = await SupplierMaster.countDocuments();
    const catCount = await SupplierMaster.countDocuments({ type: 'category' });
    const unitCount = await SupplierMaster.countDocuments({ type: 'unit' });
    const compCount = await SupplierMaster.countDocuments({ type: 'company' });
    
    console.log(`📊 Verification:`);
    console.log(`   Total in SupplierMaster collection: ${finalCount} records`);
    console.log(`   Categories: ${catCount}`);
    console.log(`   Units: ${unitCount}`);
    console.log(`   Companies: ${compCount}\n`);
    
    console.log('━'.repeat(60));
    console.log('✅ SUCCESS: Master data seeded successfully!');
    console.log('━'.repeat(60));
    console.log('\n📌 Next steps:');
    console.log('1. Restart backend server: npm run dev');
    console.log('2. Open Add Medicine page in frontend');
    console.log('3. Dropdowns should now show all categories, units, and companies');
    
    process.exit(0);
  } catch (err) {
    console.error('❌ Seeding failed:', err);
    process.exit(1);
  }
}

seedMasters();
    console.log('4. Dropdowns will now show the seeded data!\n');
    
  } catch (error) {
    console.error('\n❌ Seeding failed:');
    console.error('Error:', error.message);
    console.error('\nStack:', error.stack);
  } finally {
    await mongoose.connection.close();
    console.log('🔌 Database connection closed\n');
    process.exit(0);
  }
}

// Run seeding
console.log('');
console.log('╔════════════════════════════════════════════════════════════╗');
console.log('║  Medicine Master Data Seeder                              ║');
console.log('╚════════════════════════════════════════════════════════════╝');
console.log('');

seedMasters();
