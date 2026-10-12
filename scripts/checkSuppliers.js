/**
 * Check existing suppliers in database
 */

import mongoose from 'mongoose'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

dotenv.config({ path: join(__dirname, '../.env') })

const SupplierSchema = new mongoose.Schema({
  companyName: String,
  contactPerson: String,
  email: String,
  phone: String,
  address: {
    street: String,
    city: String,
    state: String,
    pincode: String,
  },
  businessType: String,
  status: String,
  medicines: Array,
}, { timestamps: true })

const Supplier = mongoose.model('Supplier', SupplierSchema)

async function checkSuppliers() {
  try {
    const mongoUri = process.env.MAIN_DB_URI
    await mongoose.connect(mongoUri)
    console.log('✅ Connected to MongoDB\n')

    const suppliers = await Supplier.find({}).select('companyName email phone status medicines')
    
    console.log(`📊 Total Suppliers: ${suppliers.length}\n`)
    
    if (suppliers.length === 0) {
      console.log('⚠️  No suppliers found in database')
      console.log('💡 Create suppliers through Super Admin panel at:')
      console.log('   http://localhost:3000/superadmin/suppliers\n')
    } else {
      suppliers.forEach((supplier, index) => {
        console.log(`${index + 1}. ${supplier.companyName}`)
        console.log(`   Email: ${supplier.email}`)
        console.log(`   Phone: ${supplier.phone}`)
        console.log(`   Status: ${supplier.status}`)
        console.log(`   Medicines: ${supplier.medicines?.length || 0}`)
        console.log('')
      })
    }

  } catch (error) {
    console.error('❌ Error:', error.message)
  } finally {
    await mongoose.connection.close()
    process.exit(0)
  }
}

checkSuppliers()
