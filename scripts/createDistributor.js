/**
 * One-time script — creates a test distributor in the main DB
 * Run: node scripts/createDistributor.js
 */

import dotenv from 'dotenv'
dotenv.config({ path: '.env' })

import mongoose from 'mongoose'
import Distributor from '../models/Distributor.model.js'

await mongoose.connect(process.env.MAIN_DB_URI)
console.log('✅ Connected to main DB')

const mobile   = '9876543210'
const password = 'dist@123'

const exists = await Distributor.findOne({ mobile })
if (exists) {
  console.log('ℹ️  Distributor already exists:', { mobile, password })
  console.log('   Name:', exists.name, '| Code:', exists.distributorCode)
  process.exit(0)
}

const dist = await Distributor.create({
  name:           'Sharma Pharma Distributors',
  mobile,
  password,
  contactPerson:  'Rajesh Sharma',
  email:          'rajesh@sharmapharma.com',
  city:           'Mumbai',
  state:          'Maharashtra',
  type:           'Wholesale Distributor',
  gstNo:          '27AABCS1429B1Z1',
  totalSkus:      4820,
  activeFranchises: 24,
  rating:         4.7,
  distributorCode: 'DIST001',
})

console.log('🚀 Distributor created!')
console.log('   Name    :', dist.name)
console.log('   Code    :', dist.distributorCode)
console.log('   Mobile  :', dist.mobile)
console.log('   Password:', password)
console.log('\n👉 Use these credentials on /distributor/login')

process.exit(0)
