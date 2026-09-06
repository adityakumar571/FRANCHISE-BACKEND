/**
 * Seed script — creates one test user for each pharmacy role
 * Run: node scripts/seedRoleUsers.js
 */
import mongoose from 'mongoose'
import dotenv from 'dotenv'
dotenv.config({ path: '.env' })

import Tenant from '../models/tenant.model.js'
import { getTenantDB } from '../utils/dbManager.js'
import { getUserModel } from '../models/tenant/user.model.js'

await mongoose.connect(process.env.MAIN_DB_URI)
console.log('✅ Connected to main DB')

const tenant = await Tenant.findOne({ subdomain: 'register' }).lean()
if (!tenant) { console.error('❌ Tenant "register" not found'); process.exit(1) }

const db = await getTenantDB(tenant.dbUri)
const User = getUserModel(db)

const SEED_USERS = [
  { userId: 'accounts_01',  name: 'Ramesh Gupta',   role: 'Accounts', password: 'acc@123'   },
  { userId: 'staff_01',     name: 'Priya Singh',    role: 'Staff',    password: 'staff@123' },
  { userId: 'customer_01',  name: 'Anil Mehta',     role: 'Customer', password: 'cust@123'  },
  { userId: 'vendor_01',    name: 'MedLine Pharma', role: 'Vendor',   password: 'vend@123'  },
]

console.log('\n📋 Creating users for tenant:', tenant.schoolName, `(${tenant.subdomain})\n`)

for (const u of SEED_USERS) {
  const exists = await User.findOne({ userId: u.userId })
  if (exists) {
    console.log(`⚠️  Already exists — ${u.role}: ${u.userId} / ${u.password}`)
    continue
  }
  await User.create({ ...u, isNew: false, isActive: true })
  console.log(`✅ Created — ${u.role.padEnd(10)} userId: ${u.userId.padEnd(15)} password: ${u.password}`)
}

// Print full table at end
console.log('\n' + '═'.repeat(70))
console.log('  ALL LOGIN CREDENTIALS')
console.log('═'.repeat(70))

const allUsers = await User.find({}, 'userId password role name isActive').lean()
console.log('\n  Subdomain (Franchise ID): register\n')
console.log(`  ${'ROLE'.padEnd(12)} ${'USER ID'.padEnd(22)} ${'PASSWORD'.padEnd(14)} NAME`)
console.log('  ' + '─'.repeat(62))
for (const u of allUsers) {
  const active = u.isActive ? '✅' : '❌'
  console.log(`  ${u.role.padEnd(12)} ${u.userId.padEnd(22)} ${u.password.padEnd(14)} ${u.name}  ${active}`)
}
console.log('')

process.exit(0)
