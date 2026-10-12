/**
 * Clean tenant-specific suppliers (dummy data)
 * This cleans local suppliers from tenant databases
 */

import mongoose from 'mongoose'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

dotenv.config({ path: join(__dirname, '../.env') })

async function cleanTenantSuppliers() {
  try {
    const mongoUri = process.env.MAIN_DB_URI
    await mongoose.connect(mongoUri)
    console.log('✅ Connected to MongoDB\n')

    // Get all tenants
    const TenanSchema = new mongoose.Schema({}, { strict: false })
    const Tenant = mongoose.model('Tenant', TenanSchema)
    const tenants = await Tenant.find({})

    console.log(`Found ${tenants.length} tenant(s)\n`)

    for (const tenant of tenants) {
      const tenantDbName = tenant.dbName
      if (!tenantDbName) continue

      console.log(`\n🔍 Checking tenant: ${tenant.name || tenant.subdomain}`)
      console.log(`   Database: ${tenantDbName}`)

      // Connect to tenant database
      const tenantConn = mongoose.createConnection(mongoUri.replace('/cloudFranchaize', `/${tenantDbName}`))
      
      await new Promise(resolve => tenantConn.once('open', resolve))

      // Check if suppliers collection exists
      const collections = await tenantConn.db.listCollections().toArray()
      const supplierCollection = collections.find(c => c.name === 'suppliers')

      if (supplierCollection) {
        const SupplierModel = tenantConn.model('Supplier', new mongoose.Schema({}, { strict: false }))
        const count = await SupplierModel.countDocuments()

        console.log(`   📦 Found ${count} supplier(s) in tenant database`)

        if (count > 0) {
          // Show suppliers before deleting
          const suppliers = await SupplierModel.find({}).select('name supplierCode').lean()
          console.log('   Suppliers to be deleted:')
          suppliers.forEach((s, i) => {
            console.log(`      ${i+1}. ${s.name} (${s.supplierCode || 'N/A'})`)
          })

          // Delete all tenant suppliers
          const result = await SupplierModel.deleteMany({})
          console.log(`   ✅ Deleted ${result.deletedCount} supplier(s)`)
        } else {
          console.log('   ✅ No suppliers to clean')
        }
      } else {
        console.log('   ✅ No supplier collection found')
      }

      await tenantConn.close()
    }

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('✅ Tenant supplier cleanup completed!')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')
    console.log('💡 Now tenants will use ONLY main suppliers from:')
    console.log('   Main Database > suppliers collection\n')

  } catch (error) {
    console.error('❌ Error:', error.message)
    process.exit(1)
  } finally {
    await mongoose.connection.close()
    process.exit(0)
  }
}

cleanTenantSuppliers()
