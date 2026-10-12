import mongoose from 'mongoose'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

dotenv.config({ path: join(__dirname, '..', '.env') })

const checkTenants = async () => {
  try {
    await mongoose.connect(process.env.MAIN_DB_URI)
    console.log('✅ Connected to database')

    const Tenant = mongoose.models.Tenant || mongoose.model('Tenant', new mongoose.Schema({}, { strict: false }))

    const tenants = await Tenant.find({}).lean()
    
    console.log(`\n📊 Total tenants: ${tenants.length}\n`)
    
    if (tenants.length > 0) {
      console.log('🔍 First tenant fields:', Object.keys(tenants[0]))
      console.log('\nFull first tenant:')
      console.log(JSON.stringify(tenants[0], null, 2))
    }
    
    tenants.forEach((t, i) => {
      console.log(`\n${i + 1}. ${t.subdomain}`)
      console.log(`   Status: ${t.status}`)
      console.log(`   dbUri: ${t.dbUri ? '✅ EXISTS' : '❌ MISSING'}`)
      console.log(`   Franchise: ${t.franchiseDetails?.name || 'N/A'}`)
    })

    const activeWithDb = await Tenant.countDocuments({ 
      status: 'Active',
      dbUri: { $exists: true, $ne: null }
    })
    
    console.log(`✅ Active tenants with dbUri: ${activeWithDb}`)

    process.exit(0)
  } catch (err) {
    console.error('❌ Error:', err)
    process.exit(1)
  }
}

checkTenants()
