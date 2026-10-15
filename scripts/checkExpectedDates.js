import mongoose from 'mongoose'
import dotenv from 'dotenv'
import Tenant from '../models/Tenant.model.js'
import { getTenantDB } from '../utils/dbManager.js'

dotenv.config()

async function checkExpectedDates() {
  try {
    await mongoose.connect(process.env.MAIN_DB_URI)
    const tenant = await Tenant.findOne({ subdomain: 'register' })
    const db = await getTenantDB(tenant.dbUri)
    const PO = db.model('PurchaseOrder', new mongoose.Schema({}, {strict: false}), 'purchaseorders')
    
    const orders = await PO.find({}).sort({ createdAt: -1 }).limit(5).lean()
    
    console.log('\n📋 Recent 5 Orders:\n')
    orders.forEach((o, i) => {
      console.log(`${i+1}. ${o.poNo}`)
      console.log(`   Expected Date: ${o.expectedDate || 'MISSING'}`)
      console.log(`   Created: ${o.createdAt || 'MISSING'}`)
      console.log('')
    })
    
    process.exit(0)
  } catch (err) {
    console.error(err)
    process.exit(1)
  }
}

checkExpectedDates()
