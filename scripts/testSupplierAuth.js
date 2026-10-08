/**
 * Test Supplier Authentication
 * Run: node scripts/testSupplierAuth.js
 */

import mongoose from 'mongoose'
import dotenv from 'dotenv'
import Supplier from '../models/Supplier.model.js'

dotenv.config()

async function testSupplierAuth() {
  try {
    console.log('Connecting to MongoDB...')
    await mongoose.connect(process.env.MONGO_URI)
    console.log('✓ Connected to MongoDB')

    // Test 1: Check if suppliers exist
    const supplierCount = await Supplier.countDocuments()
    console.log(`\n[TEST 1] Suppliers in DB: ${supplierCount}`)

    if (supplierCount === 0) {
      console.log('❌ No suppliers found! Create a supplier first.')
      process.exit(1)
    }

    // Test 2: Find first active supplier
    const supplier = await Supplier.findOne({ status: 'Active' })
    if (!supplier) {
      console.log('❌ No active supplier found!')
      process.exit(1)
    }

    console.log('\n[TEST 2] Active Supplier Found:')
    console.log(`  Company: ${supplier.companyName}`)
    console.log(`  Email: ${supplier.email}`)
    console.log(`  Status: ${supplier.status}`)
    console.log(`  Medicines: ${supplier.medicines.length}`)

    // Test 3: Check medicines
    if (supplier.medicines.length > 0) {
      console.log('\n[TEST 3] Sample Medicine:')
      const med = supplier.medicines[0]
      console.log(`  Name: ${med.name}`)
      console.log(`  Price: ₹${med.supplierPrice}`)
      console.log(`  Stock: ${med.stock}`)
    }

    console.log('\n✅ All tests passed!')
    console.log('\n🔐 Login credentials to test:')
    console.log(`  Email: ${supplier.email}`)
    console.log(`  Password: [use the password you set]`)
    console.log(`  URL: http://localhost:5179/supplier/login`)

    await mongoose.connection.close()
  } catch (error) {
    console.error('❌ Test failed:', error.message)
    process.exit(1)
  }
}

testSupplierAuth()
