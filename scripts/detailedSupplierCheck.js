/**
 * Detailed Supplier Check with Medicines
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
  rating: Number,
  medicines: [{
    name: String,
    genericName: String,
    manufacturer: String,
    category: String,
    strength: String,
    packSize: String,
    mrp: Number,
    supplierPrice: Number,
    stock: Number,
    isAvailable: Boolean,
  }],
}, { timestamps: true })

const Supplier = mongoose.model('Supplier', SupplierSchema)

async function checkSuppliers() {
  try {
    const mongoUri = process.env.MAIN_DB_URI
    await mongoose.connect(mongoUri)
    console.log('✅ Connected to MongoDB\n')

    const suppliers = await Supplier.find({})
    
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log(`📊 Total Suppliers in Database: ${suppliers.length}`)
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')
    
    if (suppliers.length === 0) {
      console.log('⚠️  No suppliers found!')
    } else {
      suppliers.forEach((supplier, index) => {
        console.log(`${index + 1}. ${supplier.companyName}`)
        console.log(`   ID: ${supplier._id}`)
        console.log(`   Email: ${supplier.email}`)
        console.log(`   Phone: ${supplier.phone}`)
        console.log(`   Status: ${supplier.status}`)
        console.log(`   Rating: ${supplier.rating}`)
        console.log(`   Location: ${supplier.address?.city}, ${supplier.address?.state}`)
        console.log(`   Total Medicines: ${supplier.medicines?.length || 0}`)
        
        if (supplier.medicines && supplier.medicines.length > 0) {
          console.log('   Medicines:')
          supplier.medicines.forEach((med, i) => {
            console.log(`      ${i+1}. ${med.name} (${med.genericName}) - ₹${med.supplierPrice} - Stock: ${med.stock}`)
          })
        }
        console.log('')
      })
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

    // Check for Clavin 625
    console.log('🔍 Searching for "Clavin 625" or "Amoxicillin"...\n')
    const suppliersWithClavin = suppliers.filter(s => 
      s.medicines?.some(m => 
        m.name?.toLowerCase().includes('clavin') || 
        m.genericName?.toLowerCase().includes('amoxicillin')
      )
    )

    if (suppliersWithClavin.length > 0) {
      console.log(`Found ${suppliersWithClavin.length} supplier(s) with Clavin/Amoxicillin:\n`)
      suppliersWithClavin.forEach(s => {
        console.log(`- ${s.companyName}`)
        const meds = s.medicines.filter(m => 
          m.name?.toLowerCase().includes('clavin') || 
          m.genericName?.toLowerCase().includes('amoxicillin')
        )
        meds.forEach(m => {
          console.log(`  → ${m.name} - ₹${m.supplierPrice}`)
        })
      })
    } else {
      console.log('No suppliers found with Clavin/Amoxicillin')
    }

  } catch (error) {
    console.error('❌ Error:', error.message)
  } finally {
    await mongoose.connection.close()
    process.exit(0)
  }
}

checkSuppliers()
