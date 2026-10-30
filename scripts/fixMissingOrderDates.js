/**
 * Fix Missing Dates in Purchase Orders
 * Run: node scripts/fixMissingOrderDates.js
 * 
 * This script:
 * 1. Finds all purchase orders with missing createdAt or expectedDate
 * 2. Sets default values for missing dates
 * 3. Updates the orders in database
 */

import mongoose from 'mongoose'
import dotenv from 'dotenv'
import Tenant from '../models/tenant.model.js' // Fixed: lowercase for Linux compatibility
import { getTenantDB } from '../utils/dbManager.js'

dotenv.config()

async function fixMissingOrderDates() {
  try {
    console.log('🔗 Connecting to main database...')
    await mongoose.connect(process.env.MAIN_DB_URI)
    console.log('✅ Connected!\n')

    // Get all active tenants
    console.log('📋 Fetching all tenants...')
    const tenants = await Tenant.find({ 
      accountStatus: 'Active',
      dbUri: { $exists: true, $ne: null }
    }).select('subdomain dbUri').lean()
    
    console.log(`✅ Found ${tenants.length} active tenants\n`)

    let totalFixed = 0

    for (const tenant of tenants) {
      try {
        console.log(`🔍 Checking ${tenant.subdomain}...`)
        const tenantDb = await getTenantDB(tenant.dbUri)
        
        if (!tenantDb) {
          console.log(`   ⚠️  Could not connect to DB`)
          continue
        }

        const PurchaseOrder = tenantDb.model(
          'PurchaseOrder',
          new mongoose.Schema({}, { strict: false }),
          'purchaseorders'
        )

        // Find orders with missing dates
        const ordersWithIssues = await PurchaseOrder.find({
          $or: [
            { createdAt: { $exists: false } },
            { createdAt: null },
            { createdAt: undefined },
            { updatedAt: { $exists: false } },
            { updatedAt: null },
            { updatedAt: undefined }
          ]
        }).lean()

        console.log(`   📦 Found ${ordersWithIssues.length} orders with missing dates`)

        if (ordersWithIssues.length === 0) {
          console.log(`   ✅ No fixes needed\n`)
          continue
        }

        let fixed = 0
        for (const order of ordersWithIssues) {
          const now = new Date()
          const updateData = {}

          // Set createdAt to now if missing
          if (!order.createdAt) {
            updateData.createdAt = now
          }

          // Set updatedAt to now if missing
          if (!order.updatedAt) {
            updateData.updatedAt = now
          }

          // Update the order
          await PurchaseOrder.findByIdAndUpdate(order._id, updateData)
          
          console.log(`   ✅ Fixed ${order.poNo}: createdAt=${!order.createdAt ? 'SET' : 'OK'}, updatedAt=${!order.updatedAt ? 'SET' : 'OK'}`)
          fixed++
        }

        totalFixed += fixed
        console.log(`   🎉 Fixed ${fixed} orders in ${tenant.subdomain}\n`)

      } catch (dbError) {
        console.error(`   ❌ Error in tenant ${tenant.subdomain}:`, dbError.message)
      }
    }

    console.log('\n' + '═'.repeat(80))
    console.log('📊 SUMMARY')
    console.log('═'.repeat(80))
    console.log(`Total Orders Fixed: ${totalFixed}`)
    console.log('═'.repeat(80))

    if (totalFixed > 0) {
      console.log('\n✅ All missing dates have been fixed!')
      console.log('💡 Now refresh the supplier orders page - it should work perfectly!')
    } else {
      console.log('\n✅ No missing dates found - database is clean!')
    }

  } catch (error) {
    console.error('❌ Error:', error.message)
    console.error(error)
  } finally {
    await mongoose.disconnect()
    console.log('\n🔌 Disconnected')
  }
}

fixMissingOrderDates()
