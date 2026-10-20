/**
 * Detailed DB Check - See exact medicine data
 */

import mongoose from 'mongoose';
import Supplier from '../models/Supplier.model.js';
import dotenv from 'dotenv';

dotenv.config();

async function checkDetailedDB() {
  try {
    console.log('🔌 Connecting...');
    await mongoose.connect(process.env.MAIN_DB_URI);
    console.log('✅ Connected\n');
    
    const suppliers = await Supplier.find({ status: 'Active' })
      .select('companyName email rating medicines')
      .lean();
    
    console.log(`📦 Total Active Suppliers: ${suppliers.length}\n`);
    
    suppliers.forEach((supplier, idx) => {
      console.log(`\n${'='.repeat(70)}`);
      console.log(`${idx + 1}. ${supplier.companyName}`);
      console.log(`${'='.repeat(70)}`);
      console.log(`Email: ${supplier.email}`);
      console.log(`Rating: ${supplier.rating || 'N/A'}`);
      console.log(`Total Medicines: ${supplier.medicines?.length || 0}`);
      
      if (supplier.medicines && supplier.medicines.length > 0) {
        console.log(`\n📋 Medicines:\n`);
        
        supplier.medicines.forEach((med, i) => {
          console.log(`  ${i + 1}. ${med.name}`);
          console.log(`     Generic: ${med.genericName || 'N/A'}`);
          console.log(`     MRP: ₹${med.mrp}`);
          console.log(`     Supplier Price: ₹${med.supplierPrice}`);
          console.log(`     Stock: ${med.stock}`);
          console.log(`     Scheme: ${med.scheme || 'No Scheme'}`);
          console.log(`     Available: ${med.isAvailable ? '✓' : '✗'}`);
          
          // Calculate discount manually
          const discount = ((med.mrp - med.supplierPrice) / med.mrp * 100).toFixed(2);
          console.log(`     Discount: ${discount}%`);
          console.log('');
        });
      }
    });
    
    // Test search for common names
    console.log(`\n${'='.repeat(70)}`);
    console.log('🔍 SEARCH TESTS');
    console.log(`${'='.repeat(70)}\n`);
    
    const searchTerms = ['Dolo', 'Clavm', 'Mox', 'Para'];
    
    for (const term of searchTerms) {
      const results = await Supplier.find({
        status: 'Active',
        $or: [
          { 'medicines.name': { $regex: term, $options: 'i' } },
          { 'medicines.genericName': { $regex: term, $options: 'i' } }
        ]
      }).select('companyName medicines.$');
      
      console.log(`Search: "${term}" → Found ${results.length} suppliers`);
      results.forEach(r => {
        console.log(`  - ${r.companyName}`);
      });
      console.log('');
    }
    
    await mongoose.disconnect();
    console.log('✅ Done');
    
  } catch (error) {
    console.error('\n❌ Error:', error);
  }
}

checkDetailedDB();
