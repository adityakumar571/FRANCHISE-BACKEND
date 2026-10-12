/**
 * Add Clavm 625 medicine to all 3 main suppliers
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
  email: String,
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
    minOrderQuantity: Number,
    scheme: String,
    description: String,
    isAvailable: Boolean,
    expiryDate: Date,
  }],
}, { timestamps: true })

const Supplier = mongoose.model('Supplier', SupplierSchema)

async function addClavmToSuppliers() {
  try {
    const mongoUri = process.env.MAIN_DB_URI
    await mongoose.connect(mongoUri)
    console.log('✅ Connected to MongoDB\n')

    const suppliers = await Supplier.find({})
    console.log(`Found ${suppliers.length} supplier(s)\n`)

    // Clavm 625 medicine data for each supplier
    const clavmMedicines = [
      {
        companyName: 'MediCare Distributors',
        medicine: {
          name: 'Clavm 625 Tablet',
          genericName: 'Amoxicillin + Clavulanic Acid',
          manufacturer: 'Alkem Laboratories',
          category: 'Antibiotics',
          strength: '625mg',
          packSize: 'Strip of 10',
          mrp: 210,
          supplierPrice: 63,
          stock: 120,
          minOrderQuantity: 10,
          scheme: '10+1',
          description: 'Amoxicillin 500mg + Clavulanic Acid 125mg combination antibiotic',
          isAvailable: true,
          expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year
        }
      },
      {
        companyName: 'HealthFirst Pharma',
        medicine: {
          name: 'Clavm 625 Tablet',
          genericName: 'Amoxicillin + Clavulanic Acid',
          manufacturer: 'Alkem Laboratories',
          category: 'Antibiotics',
          strength: '625mg',
          packSize: 'Strip of 10',
          mrp: 210,
          supplierPrice: 64,
          stock: 85,
          minOrderQuantity: 10,
          scheme: 'No Scheme',
          description: 'Amoxicillin 500mg + Clavulanic Acid 125mg combination antibiotic',
          isAvailable: true,
          expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        }
      },
      {
        companyName: 'QuickMeds Supply',
        medicine: {
          name: 'Clavm 625 Tablet',
          genericName: 'Amoxicillin + Clavulanic Acid',
          manufacturer: 'Alkem Laboratories',
          category: 'Antibiotics',
          strength: '625mg',
          packSize: 'Strip of 10',
          mrp: 210,
          supplierPrice: 65,
          stock: 200,
          minOrderQuantity: 10,
          scheme: '5+1',
          description: 'Amoxicillin 500mg + Clavulanic Acid 125mg combination antibiotic',
          isAvailable: true,
          expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        }
      },
    ]

    for (const supplierData of clavmMedicines) {
      const supplier = suppliers.find(s => s.companyName === supplierData.companyName)
      
      if (!supplier) {
        console.log(`⚠️  Supplier not found: ${supplierData.companyName}`)
        continue
      }

      // Check if Clavm already exists
      const existingClavm = supplier.medicines.find(m => 
        m.name.toLowerCase().includes('clavm') || 
        m.genericName.toLowerCase().includes('amoxicillin') && 
        m.genericName.toLowerCase().includes('clavulanic')
      )

      if (existingClavm) {
        console.log(`✓ ${supplier.companyName} already has Clavm medicine`)
        continue
      }

      // Add Clavm medicine
      supplier.medicines.push(supplierData.medicine)
      await supplier.save()

      console.log(`✅ Added Clavm 625 to ${supplier.companyName}`)
      console.log(`   Price: ₹${supplierData.medicine.supplierPrice}`)
      console.log(`   Stock: ${supplierData.medicine.stock}`)
      console.log(`   Scheme: ${supplierData.medicine.scheme}`)
      console.log('')
    }

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('✅ Clavm 625 added to all suppliers!')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

    // Verify
    const updated = await Supplier.find({})
    console.log('📊 Current Medicine Count:')
    updated.forEach(s => {
      const clavmMed = s.medicines.find(m => m.name.toLowerCase().includes('clavm'))
      console.log(`   ${s.companyName}: ${s.medicines.length} medicines`)
      if (clavmMed) {
        console.log(`      ✓ Clavm 625: ₹${clavmMed.supplierPrice}`)
      }
    })
    console.log('')

  } catch (error) {
    console.error('❌ Error:', error.message)
    process.exit(1)
  } finally {
    await mongoose.connection.close()
    process.exit(0)
  }
}

addClavmToSuppliers()
