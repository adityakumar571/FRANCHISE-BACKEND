import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { getTenantDB } from '../utils/dbManager.js';
import Tenant from '../models/tenant.model.js';
import { getPurchaseOrderModel } from '../models/tenant/franchise/PurchaseOrder.model.js';
import { getLiveOrderModel } from '../models/tenant/franchise/LiveOrder.model.js';

dotenv.config();

/**
 * Migration Script: Merge LiveOrder collection into PurchaseOrder
 * 
 * Purpose: Unify order tracking across Purchase and Live Rates modules
 * 
 * What this does:
 * 1. Reads all LiveOrder documents
 * 2. Transforms them to PurchaseOrder format with source='live_rates_module'
 * 3. Creates corresponding PurchaseOrder documents
 * 4. Optionally backs up and deletes LiveOrder documents
 */

async function migrateLiveOrdersToPurchaseOrder() {
  console.log('🚀 Starting LiveOrder → PurchaseOrder Migration...\n');

  const tenantSubdomain = process.env.DEFAULT_TENANT_SUBDOMAIN || 'register';
  
  try {
    // Connect to main database to get tenant info
    console.log('🔌 Connecting to main database...');
    await mongoose.connect(process.env.MAIN_DB_URI);
    console.log('✅ Connected to main database\n');

    // Get tenant
    console.log(`📋 Fetching tenant: ${tenantSubdomain}...`);
    const tenant = await Tenant.findOne({ subdomain: tenantSubdomain });
    
    if (!tenant) {
      console.error(`❌ Tenant "${tenantSubdomain}" not found`);
      console.log('\nAvailable tenants:');
      const allTenants = await Tenant.find().select('subdomain').lean();
      allTenants.forEach(t => console.log(`  - ${t.subdomain}`));
      process.exit(1);
    }
    
    if (!tenant.dbUri) {
      console.error(`❌ Tenant "${tenantSubdomain}" has no database URI configured`);
      process.exit(1);
    }
    
    console.log(`✅ Found tenant: ${tenant.subdomain}`);
    console.log(`   Status: ${tenant.accountStatus}`);
    console.log(`   Active: ${tenant.isActive}\n`);

    // Connect to tenant database
    console.log('🔗 Connecting to tenant database...');
    const connection = await getTenantDB(tenant.dbUri);
    console.log(`✅ Connected to tenant database\n`);

    const LiveOrder = getLiveOrderModel(connection);
    const PurchaseOrder = getPurchaseOrderModel(connection);

    // Step 1: Get all LiveOrders
    const liveOrders = await LiveOrder.find().lean();
    console.log(`\n📦 Found ${liveOrders.length} LiveOrder documents to migrate`);

    if (liveOrders.length === 0) {
      console.log('✅ No LiveOrders to migrate. Migration complete!');
      await mongoose.connection.close();
      process.exit(0);
    }

    // Step 2: Transform and insert into PurchaseOrder
    let successCount = 0;
    let errorCount = 0;
    const errors = [];

    for (const liveOrder of liveOrders) {
      try {
        // Check if already migrated
        const existing = await PurchaseOrder.findOne({ poNo: liveOrder.orderId });
        if (existing) {
          console.log(`⚠️  Order ${liveOrder.orderId} already exists in PurchaseOrder, skipping...`);
          continue;
        }

        // Transform LiveOrder to PurchaseOrder format
        const purchaseOrderData = {
          poNo: liveOrder.orderId,
          supplierId: liveOrder.supplierId,
          supplier: liveOrder.supplierName || '',
          
          // Transform items
          items: liveOrder.items.map(item => ({
            medicineId: item.medicineId,
            medicineName: item.medicineName,
            qty: item.qty,
            ptr: item.price || 0,
            mrp: 0, // Not available in LiveOrder
            scheme: '',
            amount: item.amount,
          })),
          
          // Financial fields
          totalAmount: liveOrder.grandTotal,
          totalMRP: liveOrder.totalMRP || 0,
          discountAmt: liveOrder.discountAmt || 0,
          gstAmt: liveOrder.gstAmt || 0,
          grandTotal: liveOrder.grandTotal,
          
          // Status mapping
          status: liveOrder.status || 'Pending',
          
          // Source tracking
          source: 'live_rates_module',
          
          notes: liveOrder.notes || '',
          
          // Preserve timestamps
          createdAt: liveOrder.createdAt,
          updatedAt: liveOrder.updatedAt,
        };

        // Create PurchaseOrder
        const newPO = await PurchaseOrder.create(purchaseOrderData);
        console.log(`✅ Migrated: ${liveOrder.orderId} → PurchaseOrder (ID: ${newPO._id})`);
        successCount++;

      } catch (error) {
        console.error(`❌ Error migrating ${liveOrder.orderId}:`, error.message);
        errors.push({ orderId: liveOrder.orderId, error: error.message });
        errorCount++;
      }
    }

    // Step 3: Summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 Migration Summary');
    console.log('='.repeat(60));
    console.log(`✅ Successfully migrated: ${successCount}`);
    console.log(`❌ Failed: ${errorCount}`);
    console.log(`📦 Total processed: ${liveOrders.length}`);

    if (errors.length > 0) {
      console.log('\n❌ Errors:');
      errors.forEach(e => console.log(`   - ${e.orderId}: ${e.error}`));
    }

    // Step 4: Backup and cleanup (optional - commented out for safety)
    console.log('\n⚠️  LiveOrder collection is still intact.');
    console.log('   To delete LiveOrder documents, uncomment the cleanup code in this script.');
    
    /*
    // UNCOMMENT TO DELETE LIVEORDER DOCUMENTS AFTER VERIFICATION
    if (successCount > 0) {
      console.log('\n🗑️  Deleting migrated LiveOrder documents...');
      const deleteResult = await LiveOrder.deleteMany({
        orderId: { $in: liveOrders.map(lo => lo.orderId) }
      });
      console.log(`✅ Deleted ${deleteResult.deletedCount} LiveOrder documents`);
    }
    */

    console.log('\n✅ Migration completed successfully!\n');

    // Close connections
    await connection.close();
    await mongoose.connection.close();
    process.exit(0);

  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.close();
    }
    process.exit(1);
  }
}

// Run migration
migrateLiveOrdersToPurchaseOrder();
