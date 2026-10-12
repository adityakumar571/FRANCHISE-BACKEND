/**
 * Database Cleanup Script
 * Run this to remove all suppliers and their medicines
 * 
 * Usage: node scripts/cleanDatabase.js
 */

import mongoose from 'mongoose'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Load environment variables
dotenv.config({ path: join(__dirname, '../.env') })

// Import models
const SupplierSchema = new mongoose.Schema({
  companyName: String,
  contactPerson: String,
  email: String,
  phone: String,
  password: String,
  address: {
    street: String,
    city: String,
    state: String,
    pincode: String,
  },
  businessType: String,
  status: { type: String, default: 'Active' },
  rating: { type: Number, default: 4.0 },
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

async function cleanDatabase() {
  try {
    console.log('🔌 Connecting to MongoDB...')
    const mongoUri = process.env.MAIN_DB_URI || process.env.MONGO_URI
    
    if (!mongoUri) {
      throw new Error('MAIN_DB_URI not found in environment variables')
    }
    
    await mongoose.connect(mongoUri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    })
    console.log('✅ Connected to MongoDB')

    console.log('\n⚠️  WARNING: This will delete ALL suppliers and their medicines!')
    console.log('⏳ Starting in 3 seconds...\n')
    
    await new Promise(resolve => setTimeout(resolve, 3000))

    // Count existing data
    const count = await Supplier.countDocuments()
    console.log(`📊 Found ${count} supplier(s) in database`)

    if (count === 0) {
      console.log('✅ Database is already clean!')
      process.exit(0)
    }

    // Delete all suppliers
    const result = await Supplier.deleteMany({})
    console.log(`\n🗑️  Deleted ${result.deletedCount} supplier(s)`)
    
    console.log('\n✅ Database cleanup completed successfully!')
    console.log('💡 You can now add fresh suppliers and medicines\n')

  } catch (error) {
    console.error('❌ Error cleaning database:', error.message)
    process.exit(1)
  } finally {
    await mongoose.connection.close()
    console.log('🔌 Database connection closed')
    process.exit(0)
  }
}

cleanDatabase()
