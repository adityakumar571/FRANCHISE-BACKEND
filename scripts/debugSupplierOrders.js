/**
 * Debug Supplier Orders
 * Run: node scripts/debugSupplierOrders.js <supplierEmail>
 * 
 * This script:
 * 1. Finds the supplier by email
 * 2. Searches all tenant databases for purchase orders with that supplierId
 * 3. Shows why orders may not be appearing in supplier portal
 */

import mongoose from 'mongoose'
import dotenv from 'dotenv'
import Supplier from '../models/Supplier.model.js'
import Tenant from '../models/tenant.model.js' // Fixed: lowercase for Linux compatibility
import { getTenantDB } from '../utils/dbManager.js'

dotenv.config()

const supplierEmail = process.argv[2]

if (!supplierEmail) {
  console.error('❌ Usage: node scripts/debugSupplierOrders.js <supplier-email>')
  console.error('   Example: node scripts/debugSupplierOrders.js supplier@example.com')
  process.exit(1)
}

async function debugSupplierOrders() {
  try {
    console.log('🔗 Connecting to main database...')
    await mongoose.connect(process.env.MAIN_DB_URI)
    console.log('✅ Connected!\n')

    // Step 1: Find supplier
    console.log(`🔍 Finding supplier: ${supplierEmail}`)
    const supplier = await Supplier.findOne({ email: supplierEmail })
    
    if (!supplier) {
      console.error(`❌ Supplier not found with email: ${supplierEmail}`)
      console.log('\n💡 Tip: Check if supplier is registered in the database')
      process.exit(1)
    }

    console.log('✅ Supplier found:')
    console.log(`   ID:      ${supplier._id}`)
    console.log(`   Name:    ${supplier.companyName}`)
    console.log(`   Email:   ${supplier.email}`)
    console.log(`   Status:  ${supplier.status}`)
    console.log(`   ID Type: ObjectId`)
    console.log('')

    const supplierId = supplier._id.toString()

    // Step 2: Get all tenants
    console.log('📋 Fetching all tenants...')
    const tenants = await Tenant.find({ 
      isActive: true,
      dbUri: { $exists: true, $ne: null }
    }).select('subdomain dbUri franchiseDetails schoolName').lean()
    
    console.log(`✅ Found ${tenants.length} active tenants\n`)

    // Step 3: Search each tenant database
    let totalOrders = 0
    const results = []

    for (const tenant of tenants) {
      try {
        console.log(`🔍 Searching ${tenant.subdomain}...`)
        const tenantDb = await getTenantDB(tenant.dbUri)
        
        if (!tenantDb) {
          console.log(`   ⚠️  Could not connect to DB`)
          continue
        }

        // Create dynamic model
        const PurchaseOrder = tenantDb.model(
          'PurchaseOrder',
          new mongoose.Schema({}, { strict: false }),
          'purchaseorders'
        )

        // Get all purchase orders (no filter first)
        const allOrders = await PurchaseOrder.find({}).limit(5).lean()
        console.log(`   📦 Total orders in DB: ${await PurchaseOrder.countDocuments()}`)
        
        if (allOrders.length > 0) {
          console.log(`   📋 Sample order supplierId types:`)
          allOrders.forEach((order, i) => {
            console.log(`      ${i + 1}. PO: ${order.poNo} | supplierId: ${order.supplierId} | Type: ${typeof order.supplierId} | Supplier: ${order.supplier}`)
          })
        }

        // Now search for this specific supplier using multiple strategies
        const strategies = [
          { name: 'String Match', filter: { supplierId: supplierId } },
          { name: 'ObjectId Match', filter: { supplierId: new mongoose.Types.ObjectId(supplierId) } },
          { name: 'String OR ObjectId', filter: { 
            $or: [
              { supplierId: supplierId },
              { supplierId: new mongoose.Types.ObjectId(supplierId) }
            ]
          }},
          { name: 'Supplier Name Match', filter: { supplier: new RegExp(supplier.companyName, 'i') } }
        ]

        let foundOrders = []
        for (const strategy of strategies) {
          const orders = await PurchaseOrder.find(strategy.filter).lean()
          if (orders.length > 0) {
            console.log(`   ✅ ${strategy.name}: Found ${orders.length} orders`)
            if (foundOrders.length === 0) foundOrders = orders
          } else {
            console.log(`   ❌ ${strategy.name}: No orders found`)
          }
        }

        if (foundOrders.length > 0) {
          totalOrders += foundOrders.length
          results.push({
            tenant: tenant.subdomain,
            count: foundOrders.length,
            orders: foundOrders.map(o => ({
              poNo: o.poNo,
              supplier: o.supplier,
              supplierIdInDB: o.supplierId,
              supplierIdType: typeof o.supplierId,
              amount: o.totalAmount,
              status: o.status
            }))
          })
        }
        
        console.log('')
      } catch (dbError) {
        console.error(`   ❌ Error: ${dbError.message}`)
      }
    }

    // Summary
    console.log('\n' + '═'.repeat(80))
    console.log('📊 SUMMARY')
    console.log('═'.repeat(80))
    console.log(`Supplier ID:     ${supplierId}`)
    console.log(`Total Orders:    ${totalOrders}`)
    console.log(`Tenants with Orders: ${results.length}`)
    console.log('')

    if (totalOrders === 0) {
      console.log('❌ NO ORDERS FOUND FOR THIS SUPPLIER')
      console.log('')
      console.log('🔍 Possible reasons:')
      console.log('   1. No purchase orders created yet')
      console.log('   2. Purchase orders use different supplierId')
      console.log('   3. Supplier name mismatch in orders')
      console.log('')
      console.log('💡 Solutions:')
      console.log('   1. Create a test purchase order from franchise portal')
      console.log('   2. Check if supplierId field is properly saved when creating PO')
      console.log('   3. Run: node scripts/seedSupplierOrders.js')
    } else {
      console.log('✅ ORDERS FOUND!')
      console.log('')
      results.forEach(r => {
        console.log(`📦 ${r.tenant}: ${r.count} orders`)
        r.orders.forEach(o => {
          console.log(`   • ${o.poNo} | ₹${o.amount} | ${o.status} | supplierId: ${o.supplierIdInDB} (${o.supplierIdType})`)
        })
      })
      console.log('')
      console.log('🔍 Diagnosis:')
      const firstOrder = results[0].orders[0]
      if (typeof firstOrder.supplierIdInDB === 'string') {
        console.log('   ✅ Orders have supplierId as STRING - backend filter should work')
      } else if (firstOrder.supplierIdInDB instanceof mongoose.Types.ObjectId) {
        console.log('   ✅ Orders have supplierId as ObjectId - backend filter should work')
      }
      
      console.log('')
      console.log('💡 If orders still not showing in supplier portal:')
      console.log('   1. Check if supplier is logged in correctly')
      console.log('   2. Verify JWT token has correct supplierId')
      console.log('   3. Check backend logs when accessing /api/franchise/suppliers/orders')
      console.log('   4. Verify cookie "supplierToken" is being sent')
    }

    console.log('═'.repeat(80))

  } catch (error) {
    console.error('❌ Error:', error.message)
    console.error(error)
  } finally {
    await mongoose.disconnect()
    console.log('\n🔌 Disconnected')
  }
}

debugSupplierOrders()
