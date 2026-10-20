/**
 * Fix Existing Orders - Set source field
 * Updates old PurchaseOrder documents to have source='purchase_module'
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { getTenantDB } from '../utils/dbManager.js';
import Tenant from '../models/tenant.model.js';
import { getPurchaseOrderModel } from '../models/tenant/franchise/PurchaseOrder.model.js';

dotenv.config();

async function fixExistingOrdersSource() {
  try {
    console.log('🔌 Connecting to main database...');
    await mongoose.connect(process.env.MAIN_DB_URI);
    console.log('✅ Connected\n');

    const tenantSubdomain = process.env.DEFAULT_TENANT_SUBDOMAIN || 'register';
    const tenant = await Tenant.findOne({ subdomain: tenantSubdomain });
    
    if (!tenant) {
      console.error(`❌ Tenant "${tenantSubdomain}" not found`);
      process.exit(1);
    }

    console.log('🔗 Connecting to tenant database...');
    const connection = await getTenantDB(tenant.dbUri);
    console.log('✅ Connected to tenant database\n');

    const PurchaseOrder = getPurchaseOrderModel(connection);

    // Find orders without source field
    const ordersWithoutSource = await PurchaseOrder.find({
      $or: [
        { source: { $exists: false } },
        { source: null }
      ]
    });

    console.log(`📦 Found ${ordersWithoutSource.length} orders without source field\n`);

    if (ordersWithoutSource.length === 0) {
      console.log('✅ All orders already have source field!');
      await connection.close();
      await mongoose.connection.close();
      process.exit(0);
    }

    console.log('🔄 Updating orders...\n');

    let updated = 0;
    for (const order of ordersWithoutSource) {
      await PurchaseOrder.updateOne(
        { _id: order._id },
        { $set: { source: 'purchase_module' } }
      );
      console.log(`✅ Updated: ${order.poNo} → source: 'purchase_module'`);
      updated++;
    }

    console.log('\n' + '═'.repeat(60));
    console.log('📊 Update Summary');
    console.log('═'.repeat(60));
    console.log(`✅ Successfully updated: ${updated}`);
    console.log(`📦 Total processed: ${ordersWithoutSource.length}\n`);

    // Verify
    console.log('🔍 Verifying...');
    const countBySource = await PurchaseOrder.aggregate([
      {
        $group: {
          _id: '$source',
          count: { $sum: 1 }
        }
      }
    ]);

    console.log('\nOrders by Source:');
    countBySource.forEach(result => {
      const sourceName = result._id || 'null/undefined';
      console.log(`  ${sourceName}: ${result.count} orders`);
    });

    console.log('\n✅ Fix completed successfully!\n');

    await connection.close();
    await mongoose.connection.close();
    process.exit(0);

  } catch (error) {
    console.error('\n❌ Fix failed:', error);
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.close();
    }
    process.exit(1);
  }
}

fixExistingOrdersSource();
