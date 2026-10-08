import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { getSupplierModel } from '../models/tenant/franchise/Supplier.model.js';

dotenv.config();

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/franchise';

async function seedSupplierProducts() {
  try {
    // Connect to main database
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected to main database');

    // Get all tenant databases
    const admin = mongoose.connection.db.admin();
    const { databases } = await admin.listDatabases();
    
    const tenantDbs = databases
      .filter(db => db.name.startsWith('tenant_'))
      .map(db => db.name);

    console.log(`\n📊 Found ${tenantDbs.length} tenant databases`);

    for (const dbName of tenantDbs) {
      console.log(`\n🏢 Processing: ${dbName}`);
      
      // Connect to tenant database
      const tenantConn = await mongoose.createConnection(MONGO_URI.replace(/\/[^/]*$/, `/${dbName}`));
      
      // Get suppliers from tenant database
      const Supplier = getSupplierModel(tenantConn);
      const suppliers = await Supplier.find({}).limit(5).lean();
      
      if (suppliers.length === 0) {
        console.log('  ⚠️ No suppliers found, skipping...');
        await tenantConn.close();
        continue;
      }

      console.log(`  📦 Found ${suppliers.length} suppliers`);

      // Check if products already exist
      const existingCount = await tenantConn.db.collection('supplier_products').countDocuments();
      if (existingCount > 0) {
        console.log(`  ℹ️ Already has ${existingCount} products, skipping...`);
        await tenantConn.close();
        continue;
      }

      // Create sample products for each supplier
      const sampleProducts = [
        { name: 'Paracetamol 500mg', code: 'MED001', category: 'Medicine', manufacturer: 'Sun Pharma', unit: 'Strip', packing: '10 Tab', stock: 100, purchase: 20, selling: 25, mrp: 30 },
        { name: 'Amoxicillin 250mg', code: 'MED002', category: 'Medicine', manufacturer: 'Cipla', unit: 'Strip', packing: '10 Tab', stock: 80, purchase: 35, selling: 42, mrp: 50 },
        { name: 'Cough Syrup 100ml', code: 'MED003', category: 'Medicine', manufacturer: 'Himalaya', unit: 'Bottle', packing: '100ml', stock: 50, purchase: 60, selling: 75, mrp: 85 },
        { name: 'Digital Thermometer', code: 'EQP001', category: 'Equipment', manufacturer: 'Omron', unit: 'Piece', packing: '1 Unit', stock: 30, purchase: 200, selling: 250, mrp: 300 },
        { name: 'Surgical Mask Box', code: 'EQP002', category: 'Equipment', manufacturer: '3M', unit: 'Box', packing: '50 Pcs', stock: 150, purchase: 150, selling: 180, mrp: 200 },
        { name: 'Hand Sanitizer 500ml', code: 'MED004', category: 'Medicine', manufacturer: 'Dettol', unit: 'Bottle', packing: '500ml', stock: 200, purchase: 80, selling: 95, mrp: 110 },
        { name: 'Vitamin C Tablets', code: 'MED005', category: 'Medicine', manufacturer: 'HealthVit', unit: 'Strip', packing: '15 Tab', stock: 120, purchase: 45, selling: 55, mrp: 65 },
        { name: 'BP Monitor Digital', code: 'EQP003', category: 'Equipment', manufacturer: 'Omron', unit: 'Piece', packing: '1 Unit', stock: 25, purchase: 1200, selling: 1400, mrp: 1600 },
      ];

      const productsToInsert = [];
      
      for (const supplier of suppliers) {
        for (const product of sampleProducts) {
          productsToInsert.push({
            productCode: `${supplier.supplierCode}-${product.code}`,
            productName: product.name,
            category: product.category,
            manufacturer: product.manufacturer,
            supplierId: supplier._id,
            supplierName: supplier.name,
            supplierCode: supplier.supplierCode,
            batchNumber: `BATCH${Math.floor(Math.random() * 10000)}`,
            expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year from now
            stock: product.stock,
            reorderLevel: 20,
            purchasePrice: product.purchase,
            sellingPrice: product.selling,
            mrp: product.mrp,
            gst: 12,
            unit: product.unit,
            packing: product.packing,
            isActive: true,
            createdAt: new Date(),
            updatedAt: new Date(),
          });
        }
      }

      // Insert products
      const result = await tenantConn.db.collection('supplier_products').insertMany(productsToInsert);
      console.log(`  ✅ Created ${result.insertedCount} products`);

      await tenantConn.close();
    }

    console.log('\n✅ Seeding completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error seeding supplier products:', error);
    process.exit(1);
  }
}

seedSupplierProducts();
