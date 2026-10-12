/**
 * Force clean ALL tenant databases' suppliers
 */

import mongoose from 'mongoose'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

dotenv.config({ path: join(__dirname, '../.env') })

async function cleanAllTenantSuppliers() {
  try {
    const baseUri = process.env.BASE_DB_URI
    const mainUri = process.env.MAIN_DB_URI
    
    console.log('🔌 Connecting to MongoDB...')
    await mongoose.connect(mainUri)
    console.log('✅ Connected\n')

    // Get admin connection to list all databases
    const admin = mongoose.connection.db.admin()
    const { databases } = await admin.listDatabases()

    console.log(`📊 Found ${databases.length} total databases\n`)

    let cleaned = 0

    for (const dbInfo of databases) {
      const dbName = dbInfo.name

      // Skip system databases and main database
      if (['admin', 'local', 'config', 'cloudFranchaize'].includes(dbName)) {
        continue
      }

      // Check if it's a tenant database
      if (dbName.startsWith('tenant_') || dbName === 'register' || dbName === 'sharma') {
        console.log(`\n🔍 Checking: ${dbName}`)

        try {
          const tenantConn = mongoose.createConnection(`${baseUri}/${dbName}`)
          await new Promise(resolve => tenantConn.once('open', resolve))

          const collections = await tenantConn.db.listCollections().toArray()
          const hasSuppliers = collections.some(c => c.name === 'suppliers')

          if (hasSuppliers) {
            const count = await tenantConn.db.collection('suppliers').countDocuments()
            console.log(`   📦 Found ${count} supplier(s)`)

            if (count > 0) {
              const suppliers = await tenantConn.db.collection('suppliers').find({}).limit(10).toArray()
              console.log('   Suppliers:')
              suppliers.forEach((s, i) => {
                console.log(`      ${i+1}. ${s.name}`)
              })

              // DELETE ALL
              const result = await tenantConn.db.collection('suppliers').deleteMany({})
              console.log(`   ✅ Deleted ${result.deletedCount} supplier(s)`)
              cleaned++
            }
          } else {
            console.log('   ✓ No suppliers collection')
          }

          await tenantConn.close()
        } catch (err) {
          console.error(`   ❌ Error: ${err.message}`)
        }
      }
    }

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log(`✅ Cleaned ${cleaned} tenant database(s)`)
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')
    console.log('💡 Tenant suppliers removed!')
    console.log('   Tenants should now use main suppliers\n')

  } catch (error) {
    console.error('❌ Error:', error.message)
    process.exit(1)
  } finally {
    await mongoose.connection.close()
    process.exit(0)
  }
}

cleanAllTenantSuppliers()
