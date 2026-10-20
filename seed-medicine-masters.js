/**
 * Seed Medicine Master Data
 * Adds default categories, formulations, companies to Medicine Masters
 * Run: node seed-medicine-masters.js
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

// Medicine Masters Schema
const medicineMasterSchema = new mongoose.Schema({
  type: { type: String, enum: ['category', 'unit', 'company'], required: true },
  name: { type: String, required: true },
  description: String,
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

async function seedMasters() {
  try {
    console.log('🌱 Seeding Medicine Master Data...\n');
    
    // Connect to MongoDB
    const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/franchise_db';
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected to MongoDB\n');
    
    // Get or create model
    const MedicineMaster = mongoose.models.MedicineMaster || 
                          mongoose.model('MedicineMaster', medicineMasterSchema);
    
    // Check if data already exists
    const existingCount = await MedicineMaster.countDocuments();
    console.log(`📊 Existing master data: ${existingCount} records\n`);
    
    // Define seed data
    const categories = [
      { type: 'category', name: 'Analgesic', description: 'Pain relief medicines' },
      { type: 'category', name: 'Antibiotic', description: 'Infection treatment' },
      { type: 'category', name: 'Antacid', description: 'Acidity & digestion' },
      { type: 'category', name: 'Antipyretic', description: 'Fever reduction' },
      { type: 'category', name: 'Vitamin', description: 'Nutritional supplements' },
      { type: 'category', name: 'Antiviral', description: 'Viral infection treatment' },
      { type: 'category', name: 'Cardiovascular', description: 'Heart & BP medicines' },
      { type: 'category', name: 'Diabetes', description: 'Blood sugar management' },
      { type: 'category', name: 'Antiallergic', description: 'Allergy relief' },
      { type: 'category', name: 'Respiratory', description: 'Cough & cold medicines' },
    ];
    
    const formulations = [
      { type: 'category', name: 'Tablet', description: 'Solid oral dosage form' },
      { type: 'category', name: 'Capsule', description: 'Gelatin shell dosage' },
      { type: 'category', name: 'Syrup', description: 'Liquid oral medication' },
      { type: 'category', name: 'Injection', description: 'Injectable solution' },
      { type: 'category', name: 'Ointment', description: 'Topical cream/gel' },
      { type: 'category', name: 'Drops', description: 'Eye/Ear drops' },
      { type: 'category', name: 'Suspension', description: 'Liquid suspension' },
      { type: 'category', name: 'Powder', description: 'Powder form' },
      { type: 'category', name: 'Inhaler', description: 'Respiratory inhaler' },
      { type: 'category', name: 'Spray', description: 'Nasal/Oral spray' },
    ];
    
    const companies = [
      { type: 'company', name: 'Cipla', description: 'Leading pharma company' },
      { type: 'company', name: 'Sun Pharma', description: 'Largest pharma in India' },
      { type: 'company', name: 'Dr. Reddy\'s', description: 'Global pharma company' },
      { type: 'company', name: 'Lupin', description: 'Research-driven pharma' },
      { type: 'company', name: 'Biocon', description: 'Biopharmaceutical company' },
      { type: 'company', name: 'Torrent Pharma', description: 'Indian pharma leader' },
      { type: 'company', name: 'Alkem Labs', description: 'Fast-growing pharma' },
      { type: 'company', name: 'Mankind Pharma', description: 'Affordable medicines' },
      { type: 'company', name: 'Zydus Cadila', description: 'Healthcare solutions' },
      { type: 'company', name: 'Glenmark', description: 'Innovative pharma' },
    ];
    
    const units = [
      { type: 'unit', name: 'Strip', description: 'Blister pack of tablets' },
      { type: 'unit', name: 'Box', description: 'Cardboard box packaging' },
      { type: 'unit', name: 'Bottle', description: 'Liquid container' },
      { type: 'unit', name: 'Piece', description: 'Individual unit' },
      { type: 'unit', name: 'Tube', description: 'Ointment tube' },
      { type: 'unit', name: 'Vial', description: 'Injection vial' },
      { type: 'unit', name: 'Sachet', description: 'Powder sachet' },
      { type: 'unit', name: 'Jar', description: 'Cream jar' },
    ];
    
    // Combine all data
    const allData = [...categories, ...formulations, ...companies, ...units];
    
    console.log('📝 Seed data prepared:');
    console.log(`   Categories: ${categories.length}`);
    console.log(`   Formulations: ${formulations.length}`);
    console.log(`   Companies: ${companies.length}`);
    console.log(`   Units: ${units.length}`);
    console.log(`   Total: ${allData.length} records\n`);
    
    // Insert data (skip duplicates)
    let inserted = 0;
    let skipped = 0;
    
    for (const item of allData) {
      const exists = await MedicineMaster.findOne({ 
        type: item.type, 
        name: item.name 
      });
      
      if (!exists) {
        await MedicineMaster.create(item);
        inserted++;
      } else {
        skipped++;
      }
    }
    
    console.log('✅ Seeding completed!');
    console.log(`   Inserted: ${inserted} new records`);
    console.log(`   Skipped: ${skipped} existing records\n`);
    
    // Verify final count
    const finalCount = await MedicineMaster.countDocuments();
    console.log(`📊 Total master data in database: ${finalCount} records\n`);
    
    console.log('━'.repeat(60));
    console.log('✅ SUCCESS: Master data seeded successfully!');
    console.log('━'.repeat(60));
    console.log('\n📌 Next steps:');
    console.log('1. Restart backend server: npm run dev');
    console.log('2. Open Add Medicine page');
    console.log('3. Click "Refresh Dropdowns" button');
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
