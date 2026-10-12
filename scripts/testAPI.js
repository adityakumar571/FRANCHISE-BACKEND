/**
 * Test API Logic Directly
 */

import mongoose from 'mongoose';
import Supplier from '../models/Supplier.model.js';
import dotenv from 'dotenv';

dotenv.config();

async function testAPILogic() {
  try {
    console.log('🔌 Connecting...');
    await mongoose.connect(process.env.MAIN_DB_URI);
    console.log('✅ Connected to:', mongoose.connection.db.databaseName);
    
    const medicine = 'Clavm 625 Tablet';
    
    console.log('\n🔍 Testing API Query...');
    console.log('Search term:', medicine);
    console.log('Regex:', new RegExp(medicine.trim(), 'i'));
    
    // EXACT API QUERY
    const suppliers = await Supplier.find({
      isActive: true,
      'medicines.name': new RegExp(medicine.trim(), 'i')
    }).lean();
    
    console.log('\n📦 Query Result:', suppliers.length, 'suppliers');
    
    if (suppliers.length === 0) {
      console.log('\n❌ NO SUPPLIERS FOUND WITH API QUERY!');
      console.log('\nDebugging...\n');
      
      // Check isActive field
      const allSuppliers = await Supplier.find({}).select('companyName isActive').lean();
      console.log('All suppliers (isActive check):');
      allSuppliers.forEach(s => {
        console.log(`  - ${s.companyName}: isActive = ${s.isActive} (type: ${typeof s.isActive})`);
      });
      
      // Try without isActive filter
      const withoutActive = await Supplier.find({
        'medicines.name': new RegExp(medicine.trim(), 'i')
      }).lean();
      console.log(`\n✅ Without isActive filter: ${withoutActive.length} suppliers`);
      
      // Check medicine names
      console.log('\nChecking medicine names in first supplier:');
      const first = await Supplier.findOne({});
      if (first && first.medicines) {
        console.log('Medicines in', first.companyName + ':');
        first.medicines.slice(0, 3).forEach(m => {
          console.log(`  - "${m.name}"`);
        });
      }
      
    } else {
      console.log('\n✅ API Query Working!');
      suppliers.forEach(s => {
        console.log(`  - ${s.companyName} (${s.medicines?.length} medicines)`);
      });
    }
    
    await mongoose.disconnect();
    console.log('\n✅ Test Complete');
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
  }
}

testAPILogic();
