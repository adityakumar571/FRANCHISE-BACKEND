import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { getSupplierModel } from '../models/tenant/franchise/Supplier.model.js';

dotenv.config();

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/franchise';

async function seedSupplierOrders() {
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
      const suppliers = await Supplier.find({}).limit(3).lean();
      
      if (suppliers.length === 0) {
        console.log('  ⚠️ No suppliers found, skipping...');
        await tenantConn.close();
        continue;
      }

      console.log(`  📦 Found ${suppliers.length} suppliers`);

      // Check if orders already exist
      const existingCount = await tenantConn.db.collection('supplierorders').countDocuments();
      if (existingCount > 0) {
        console.log(`  ℹ️ Already has ${existingCount} orders, skipping...`);
        await tenantConn.close();
        continue;
      }

      // Get order count for generating order IDs
      let orderCount = await tenantConn.db.collection('supplierorders').countDocuments();

      // Create sample orders for each supplier
      const statuses = ['pending', 'confirmed', 'processing', 'dispatched', 'delivered'];
      const ordersToInsert = [];

      for (const supplier of suppliers) {
        // Create 8-12 orders per supplier
        const numOrders = Math.floor(Math.random() * 5) + 8;
        
        for (let i = 0; i < numOrders; i++) {
          orderCount++;
          const orderId = `SO${String(orderCount).padStart(6, '0')}`;
          const status = statuses[Math.floor(Math.random() * statuses.length)];
          
          // Random date in last 60 days
          const daysAgo = Math.floor(Math.random() * 60);
          const createdAt = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
          
          // Random products (2-5 items)
          const numProducts = Math.floor(Math.random() * 4) + 2;
          const products = [];
          let subtotal = 0;
          
          for (let j = 0; j < numProducts; j++) {
            const quantity = Math.floor(Math.random() * 20) + 5;
            const price = Math.floor(Math.random() * 150) + 50;
            const total = quantity * price;
            subtotal += total;
            
            products.push({
              productId: new mongoose.Types.ObjectId().toString(),
              productName: `Medicine ${String.fromCharCode(65 + j)}`,
              productCode: `MED${String(j + 1).padStart(3, '0')}`,
              category: 'Medicine',
              quantity,
              unit: 'Strip',
              pricePerUnit: price,
              totalPrice: total,
              discount: 0,
              tax: 0,
            });
          }
          
          const discount = Math.floor(subtotal * 0.05); // 5% discount
          const tax = Math.floor((subtotal - discount) * 0.12); // 12% tax
          const totalAmount = subtotal - discount + tax;
          
          ordersToInsert.push({
            orderId,
            franchiseId: new mongoose.Types.ObjectId(),
            franchiseName: `Franchise ${String.fromCharCode(65 + Math.floor(Math.random() * 5))}`,
            franchiseCode: `FR${String(Math.floor(Math.random() * 100) + 1).padStart(3, '0')}`,
            supplierId: supplier._id,
            supplierName: supplier.name,
            supplierCode: supplier.supplierCode,
            products,
            orderType: 'Medicine',
            status,
            statusHistory: [{
              status,
              timestamp: createdAt,
              updatedBy: 'System',
              remarks: 'Order created',
            }],
            subtotal,
            discount,
            tax,
            shippingCharges: 0,
            totalAmount,
            paymentStatus: status === 'delivered' ? 'paid' : 'pending',
            paymentMethod: 'pending',
            deliveryAddress: {
              address: '123 Main Street',
              city: 'Mumbai',
              state: 'Maharashtra',
              pincode: '400001',
              contactPerson: 'Manager',
              contactNumber: '9876543210',
            },
            expectedDeliveryDate: new Date(createdAt.getTime() + 7 * 24 * 60 * 60 * 1000),
            actualDeliveryDate: status === 'delivered' ? new Date(createdAt.getTime() + 5 * 24 * 60 * 60 * 1000) : null,
            dispatchDate: ['dispatched', 'delivered'].includes(status) ? new Date(createdAt.getTime() + 2 * 24 * 60 * 60 * 1000) : null,
            notes: `Order for ${supplier.name}`,
            createdAt,
            updatedAt: createdAt,
          });
        }
      }

      // Insert orders
      if (ordersToInsert.length > 0) {
        const result = await tenantConn.db.collection('supplierorders').insertMany(ordersToInsert);
        console.log(`  ✅ Created ${result.insertedCount} orders`);
      }

      await tenantConn.close();
    }

    console.log('\n✅ Seeding completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error seeding supplier orders:', error);
    process.exit(1);
  }
}

seedSupplierOrders();
