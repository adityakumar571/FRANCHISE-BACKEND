/**
 * Quick DB Check - See what's actually in database
 */

import mongoose from 'mongoose';
import Supplier from '../models/Supplier.model.js';
import dotenv from 'dotenv';

dotenv.config();

async function checkDB() {
  try {
    console.log('🔌 Connecting...');
    console.log('MAIN_DB_URI:', process.env.MAIN_DB_URI);
    
    await mongoose.connect(process.env.MAIN_DB_URI);
    
    console.log('\n✅ Connected to DB:', mongoose.connection.db.databaseName);
    console.log('📊 Collection:', mongoose.connection.db.collection('suppliers').collectionName);
    
    const count = await Supplier.countDocuments();
    console.log('\n📦 Total Suppliers:', count);
    
    if (count === 0) {
      console.log('\n❌ NO SUPPLIERS IN DATABASE!');
      console.log('➡️  Run: node scripts/seedSuppliers.js');
    } else {
      const suppliers = await Supplier.find({}).select('companyName email medicines').lean();
      console.log('\n📋 Suppliers Found:\n');
      suppliers.forEach((s, i) => {
        console.log(`${i + 1}. ${s.companyName}`);
        console.log(`   Email: ${s.email}`);
        console.log(`   Medicines: ${s.medicines?.length || 0}`);
        if (s.medicines?.length > 0) {
          s.medicines.slice(0, 2).forEach(m => {
            console.log(`     - ${m.name} (Stock: ${m.stock})`);
          });
        }
        console.log('');
      });
      
      // Search for Clavm
      console.log('\n🔍 Searching for "Clavm 625 Tablet"...');
      const withClavm = await Supplier.find({
        'medicines.name': /Clavm 625 Tablet/i
      }).select('companyName');
      
      console.log(`✅ Found ${withClavm.length} suppliers with Clavm 625 Tablet:`);
      withClavm.forEach(s => console.log(`   - ${s.companyName}`));
    }
    
    await mongoose.disconnect();
    console.log('\n✅ Done');
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
  }
}

checkDB();
