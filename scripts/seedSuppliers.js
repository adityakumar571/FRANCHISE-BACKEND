/**
 * Quick Seed Script - Add Test Suppliers with Medicines
 * This will add 3 suppliers with Clavm 625 Tablet to Central DB
 */

import mongoose from 'mongoose';
import Supplier from '../models/Supplier.model.js';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';

dotenv.config();

const testSuppliers = [
  {
    companyName: 'HealthFirst Pharma',
    contactPerson: 'Rajesh Kumar',
    email: 'healthfirst@test.com',
    password: 'test123',
    phone: '9876543210',
    address: {
      street: '123 Medical Complex',
      city: 'Delhi',
      state: 'Delhi',
      pincode: '110001',
      country: 'India'
    },
    businessType: 'Distributor',
    gstNumber: 'GST001',
    isActive: true,
    medicines: [
      {
        name: 'Clavm 625 Tablet',
        genericName: 'Amoxicillin + Clavulanic Acid',
        manufacturer: 'Alkem Laboratories',
        category: 'Tablet',
        strength: '625mg',
        packSize: 'Strip of 6',
        batchNumber: 'BATCH001',
        expiryDate: new Date('2026-12-31'),
        mrp: 210,
        supplierPrice: 63,
        discount: 25,
        stock: 1200,
        minStock: 100,
        isAvailable: true,
        description: 'Antibiotic combination for bacterial infections'
      }
    ]
  },
  {
    companyName: 'QuickMeds Supply',
    contactPerson: 'Amit Sharma',
    email: 'quickmeds@test.com',
    password: 'test123',
    phone: '9876543211',
    address: {
      street: '456 Pharma Hub',
      city: 'Mumbai',
      state: 'Maharashtra',
      pincode: '400001',
      country: 'India'
    },
    businessType: 'Wholesaler',
    gstNumber: 'GST002',
    isActive: true,
    medicines: [
      {
        name: 'Clavm 625 Tablet',
        genericName: 'Amoxicillin + Clavulanic Acid',
        manufacturer: 'Alkem Laboratories',
        category: 'Tablet',
        strength: '625mg',
        packSize: 'Strip of 6',
        batchNumber: 'BATCH002',
        expiryDate: new Date('2026-11-30'),
        mrp: 210,
        supplierPrice: 65,
        discount: 22,
        stock: 800,
        minStock: 50,
        isAvailable: true,
        description: 'Antibiotic combination for bacterial infections'
      }
    ]
  },
  {
    companyName: 'MediCare Distributors',
    contactPerson: 'Priya Singh',
    email: 'medicare@test.com',
    password: 'test123',
    phone: '9876543212',
    address: {
      street: '789 Care Center',
      city: 'Bangalore',
      state: 'Karnataka',
      pincode: '560001',
      country: 'India'
    },
    businessType: 'Distributor',
    gstNumber: 'GST003',
    isActive: true,
    medicines: [
      {
        name: 'Clavm 625 Tablet',
        genericName: 'Amoxicillin + Clavulanic Acid',
        manufacturer: 'Alkem Laboratories',
        category: 'Tablet',
        strength: '625mg',
        packSize: 'Strip of 6',
        batchNumber: 'BATCH003',
        expiryDate: new Date('2027-01-31'),
        mrp: 210,
        supplierPrice: 68,
        discount: 20,
        stock: 500,
        minStock: 75,
        isAvailable: true,
        description: 'Antibiotic combination for bacterial infections'
      }
    ]
  }
];

async function seedSuppliers() {
  try {
    console.log('🔌 Connecting to Central DB...');
    console.log('URI:', process.env.MAIN_DB_URI?.substring(0, 50) + '...');
    
    await mongoose.connect(process.env.MAIN_DB_URI, {
      serverSelectionTimeoutMS: 10000
    });
    
    console.log('✅ Connected to:', mongoose.connection.db.databaseName);
    
    // Check if suppliers already exist
    const existingCount = await Supplier.countDocuments({
      email: { $in: testSuppliers.map(s => s.email) }
    });
    
    if (existingCount > 0) {
      console.log(`\n⚠️  ${existingCount} test supplier(s) already exist`);
      
      const existing = await Supplier.find({
        email: { $in: testSuppliers.map(s => s.email) }
      }).select('companyName email medicines');
      
      console.log('\n📦 Existing Suppliers:');
      existing.forEach(s => {
        console.log(`  - ${s.companyName} (${s.email})`);
        console.log(`    Medicines: ${s.medicines?.length || 0}`);
      });
      
      console.log('\n✅ Suppliers already seeded. No action needed.');
      await mongoose.disconnect();
      return;
    }
    
    console.log('\n🔐 Hashing passwords...');
    for (const supplier of testSuppliers) {
      supplier.password = await bcrypt.hash(supplier.password, 10);
    }
    
    console.log('💾 Inserting suppliers...');
    const result = await Supplier.insertMany(testSuppliers);
    
    console.log(`\n✅ Successfully created ${result.length} suppliers!`);
    console.log('\n📋 Supplier Details:');
    
    result.forEach((s, i) => {
      console.log(`\n${i + 1}. ${s.companyName}`);
      console.log(`   Email: ${s.email}`);
      console.log(`   Password: test123`);
      console.log(`   Medicines: ${s.medicines.length}`);
      s.medicines.forEach(m => {
        console.log(`     - ${m.name} (Stock: ${m.stock}, Price: ₹${m.supplierPrice})`);
      });
    });
    
    console.log('\n🎉 Seed completed successfully!');
    console.log('\n📝 Next Steps:');
    console.log('1. Restart backend server (Ctrl+C and npm run dev)');
    console.log('2. Login to franchise admin');
    console.log('3. Go to: Purchase > New Purchase');
    console.log('4. Search: "Clavm 625 Tablet"');
    console.log('5. Should see: 3 suppliers with different rates');
    
    await mongoose.disconnect();
    console.log('\n✅ Database disconnected');
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

seedSuppliers();
