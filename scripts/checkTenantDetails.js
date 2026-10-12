/**
 * Check tenant database details
 */

import mongoose from 'mongoose'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

dotenv.config({ path: join(__dirname, '../.env') })

async function checkTenants() {
  try {
    const mongoUri = process.env.MAIN_DB_URI
    await mongoose.connect(mongoUri)
    console.log('✅ Connected to MongoDB\n')

    const TenantSchema = new mongoose.Schema({}, { strict: false })
    const Tenant = mongoose.model('Tenant', TenantSchema)
    const tenants = await Tenant.find({}).lean()

    console.log(`Found ${tenants.length} tenant(s):\n`)
    
    tenants.forEach((t, i) => {
      console.log(`${i+1}. ${t.name || t.subdomain}`)
      console.log(`   Subdomain: ${t.subdomain}`)
      console.log(`   DB Name: ${t.dbName}`)
      console.log(`   Created: ${t.createdAt}`)
      console.log('')
    })

    // Check 'register' tenant database specifically
    const registerTenantDbName = 'tenant_register' // Common pattern
    console.log(`\n🔍 Checking register tenant database: ${registerTenantDbName}\n`)

    const tenantConn = mongoose.createConnection(mongoUri.replace('/cloudFranchaize', `/${registerTenantDbName}`))
    await new Promise((resolve, reject) => {
      tenantConn.once('open', resolve)
      tenantConn.once('error', reject)
      setTimeout(() => reject(new Error('Connection timeout')), 5000)
    })

    const collections = await tenantConn.db.listCollections().toArray()
    console.log(`Collections in ${registerTenantDbName}:`)
    
    for (const collection of collections) {
      const count = await tenantConn.db.collection(collection.name).countDocuments()
      console.log(`   📁 ${collection.name}: ${count} documents`)

      if (collection.name === 'suppliers') {
        const suppliers = await tenantConn.db.collection('suppliers').find({}).limit(10).toArray()
        console.log('\n   Suppliers found:')
        suppliers.forEach((s, i) => {
          console.log(`      ${i+1}. ${s.name} (${s.supplierCode || 'N/A'})`)
        })
        console.log('')
      }
    }

    await tenantConn.close()

  } catch (error) {
    console.error('❌ Error:', error.message)
  } finally {
    await mongoose.connection.close()
    process.exit(0)
  }
}

checkTenants()
