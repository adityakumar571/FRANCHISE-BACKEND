/**
 * Test Complete Purchase Orders Flow
 * Run: node scripts/testPurchaseOrdersFlow.js
 * 
 * Tests:
 * 1. Fetch purchase orders list
 * 2. Check date formatting
 * 3. Test single order details
 * 4. Verify all fields
 */

import mongoose from 'mongoose'
import dotenv from 'dotenv'
import Tenant from '../models/Tenant.model.js'
import { getTenantDB } from '../utils/dbManager.js'

dotenv.config()

async function testPurchaseOrdersFlow() {
  try {
    console.log('🔗 Connecting to main database...')
    await mongoose.connect(process.env.MAIN_DB_URI)
    console.log('✅ Connected!\n')

    // Get register tenant (from your screenshot)
    console.log('📋 Fetching register tenant...')
    const tenant = await Tenant.findOne({ subdomain: 'register' })
    
    if (!tenant) {
      console.error('❌ Tenant "register" not found')
      process.exit(1)
    }

    console.log(`✅ Found tenant: ${tenant.subdomain}`)
    console.log(`   Account Status: ${tenant.accountStatus}`)
    console.log(`   DB URI exists: ${!!tenant.dbUri}\n`)

    // Connect to tenant DB
    console.log('🔗 Connecting to tenant database...')
    const tenantDb = await getTenantDB(tenant.dbUri)
    
    if (!tenantDb) {
      console.error('❌ Could not connect to tenant DB')
      process.exit(1)
    }

    console.log('✅ Connected to tenant DB\n')

    // Create PO model
    const PurchaseOrder = tenantDb.model(
      'PurchaseOrder',
      new mongoose.Schema({}, { strict: false }),
      'purchaseorders'
    )

    // Fetch all purchase orders
    console.log('📦 Fetching purchase orders...')
    const orders = await PurchaseOrder.find({}).sort({ createdAt: -1 }).limit(10).lean()
    
    console.log(`✅ Found ${orders.length} orders\n`)

    if (orders.length === 0) {
      console.log('⚠️  No purchase orders found!')
      console.log('💡 Create some orders from franchise portal first\n')
      process.exit(0)
    }

    // Analyze each order
    console.log('═'.repeat(80))
    console.log('📊 ORDER ANALYSIS')
    console.log('═'.repeat(80))

    orders.forEach((order, idx) => {
      console.log(`\n${idx + 1}. Order: ${order.poNo || 'NO-PO-NUMBER'}`)
      console.log(`   ID: ${order._id}`)
      console.log(`   Supplier: ${order.supplier || 'MISSING'}`)
      console.log(`   Supplier ID: ${order.supplierId || 'MISSING'} (${typeof order.supplierId})`)
      console.log(`   Items: ${order.items?.length || 0}`)
      console.log(`   Amount: ₹${order.totalAmount || 0}`)
      console.log(`   Status: ${order.status || 'MISSING'}`)
      
      // Date analysis
      console.log(`   Created At:`)
      console.log(`      Value: ${order.createdAt}`)
      console.log(`      Type: ${typeof order.createdAt}`)
      console.log(`      Valid Date: ${order.createdAt ? !isNaN(new Date(order.createdAt).getTime()) : false}`)
      
      console.log(`   Expected Date:`)
      console.log(`      Value: ${order.expectedDate}`)
      console.log(`      Type: ${typeof order.expectedDate}`)
      console.log(`      Valid Date: ${order.expectedDate ? !isNaN(new Date(order.expectedDate).getTime()) : false}`)

      // Check what would be returned by API
      const formatDate = (date) => {
        if (!date) return '—';
        try {
          const d = new Date(date);
          if (isNaN(d.getTime())) return '—';
          return d.toISOString().split('T')[0];
        } catch (e) {
          return '—';
        }
      };

      console.log(`   API Would Return:`)
      console.log(`      createdAt: ${formatDate(order.createdAt)}`)
      console.log(`      expectedDate: ${formatDate(order.expectedDate)}`)
    })

    console.log('\n' + '═'.repeat(80))
    console.log('🔍 RECOMMENDATIONS')
    console.log('═'.repeat(80))

    // Check for missing dates
    const ordersWithMissingDates = orders.filter(o => 
      !o.createdAt || !o.expectedDate
    )

    if (ordersWithMissingDates.length > 0) {
      console.log(`\n⚠️  ${ordersWithMissingDates.length} orders have missing dates`)
      console.log('\n💡 Run this to fix:')
      console.log('   node scripts/fixMissingOrderDates.js')
    } else {
      console.log('\n✅ All orders have proper dates!')
    }

    // Check for missing supplier IDs
    const ordersWithoutSupplierId = orders.filter(o => !o.supplierId)
    if (ordersWithoutSupplierId.length > 0) {
      console.log(`\n⚠️  ${ordersWithoutSupplierId.length} orders missing supplierId`)
      console.log('   These orders will not appear in supplier portal!')
      ordersWithoutSupplierId.forEach(o => {
        console.log(`   - ${o.poNo}: Supplier="${o.supplier}" but no supplierId`)
      })
    } else {
      console.log('\n✅ All orders have supplierId!')
    }

    console.log('\n' + '═'.repeat(80))

  } catch (error) {
    console.error('❌ Error:', error.message)
    console.error(error)
  } finally {
    await mongoose.disconnect()
    console.log('\n🔌 Disconnected')
  }
}

testPurchaseOrdersFlow()
