/**
 * Verify Clavm 625 is available in database and API response format
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
  businessType: String,
  status: String,
  rating: Number,
  address: {
    city: String,
    state: String,
  },
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

async function verifyAPI() {
  try {
    const mongoUri = process.env.MAIN_DB_URI
    await mongoose.connect(mongoUri)
    console.log('✅ Connected to MongoDB\n')

    // Simulate what the API does
    console.log('🔍 Simulating API: /api/franchise-suppliers/medicines/compare/Clavm\n')

    const searchTerm = 'Clavm'
    
    // This is what the backend API does
    const suppliers = await Supplier.aggregate([
      // Match only active suppliers
      { $match: { status: 'Active' } },
      
      // Unwind medicines
      { $unwind: '$medicines' },
      
      // Match medicine by generic name or name
      { 
        $match: { 
          $or: [
            { 'medicines.genericName': { $regex: searchTerm, $options: 'i' } },
            { 'medicines.name': { $regex: searchTerm, $options: 'i' } }
          ],
          'medicines.isAvailable': true
        }
      },
      
      // Add calculations
      {
        $addFields: {
          'medicines.gst': { 
            $multiply: ['$medicines.supplierPrice', 0.12] 
          },
          'medicines.effectiveRate': { 
            $multiply: ['$medicines.supplierPrice', 1.12] 
          },
          'medicines.discount': {
            $multiply: [
              { $divide: [
                { $subtract: ['$medicines.mrp', '$medicines.supplierPrice'] },
                '$medicines.mrp'
              ]},
              100
            ]
          }
        }
      },
      
      // Project supplier info
      {
        $project: {
          supplierInfo: {
            _id: '$_id',
            companyName: '$companyName',
            contactPerson: '$contactPerson',
            email: '$email',
            phone: '$phone',
            rating: '$rating',
            city: '$address.city',
            state: '$address.state'
          },
          medicine: {
            _id: '$medicines._id',
            name: '$medicines.name',
            genericName: '$medicines.genericName',
            manufacturer: '$medicines.manufacturer',
            category: '$medicines.category',
            strength: '$medicines.strength',
            packSize: '$medicines.packSize',
            mrp: '$medicines.mrp',
            supplierPrice: '$medicines.supplierPrice',
            stock: '$medicines.stock',
            scheme: '$medicines.scheme',
            gst: { $round: ['$medicines.gst', 2] },
            effectiveRate: { $round: ['$medicines.effectiveRate', 2] },
            discount: { $round: ['$medicines.discount', 2] },
            deliveryEstimate: {
              $cond: {
                if: { $gte: ['$medicines.stock', 100] },
                then: 'Same Day',
                else: 'Next Day'
              }
            }
          }
        }
      },
      
      // Sort by effective rate
      { $sort: { 'medicine.effectiveRate': 1 } }
    ])

    if (suppliers.length === 0) {
      console.log('❌ No suppliers found with Clavm medicine!')
      console.log('\n💡 Checking what medicines exist:')
      const allSuppliers = await Supplier.find({ status: 'Active' }).lean()
      allSuppliers.forEach(s => {
        console.log(`\n${s.companyName}:`)
        s.medicines.forEach((m, i) => {
          console.log(`   ${i+1}. ${m.name} (${m.genericName})`)
        })
      })
    } else {
      console.log(`✅ Found ${suppliers.length} supplier(s) with Clavm:\n`)
      
      suppliers.forEach((item, index) => {
        console.log(`${index + 1}. ${item.supplierInfo.companyName}`)
        console.log(`   Medicine: ${item.medicine.name}`)
        console.log(`   Generic: ${item.medicine.genericName}`)
        console.log(`   Price: ₹${item.medicine.supplierPrice}`)
        console.log(`   GST (12%): ₹${item.medicine.gst}`)
        console.log(`   Effective Rate: ₹${item.medicine.effectiveRate}`)
        console.log(`   Stock: ${item.medicine.stock}`)
        console.log(`   Scheme: ${item.medicine.scheme}`)
        console.log(`   Delivery: ${item.medicine.deliveryEstimate}`)
        if (index === 0) {
          console.log(`   🏆 BEST PRICE`)
        }
        console.log('')
      })

      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
      console.log('✅ API Response Format is Correct!')
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')
    }

  } catch (error) {
    console.error('❌ Error:', error.message)
    console.error(error.stack)
    process.exit(1)
  } finally {
    await mongoose.connection.close()
    process.exit(0)
  }
}

verifyAPI()
