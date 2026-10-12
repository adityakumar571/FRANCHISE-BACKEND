import mongoose from 'mongoose'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

dotenv.config({ path: join(__dirname, '..', '.env') })

const checkPO = async () => {
  try {
    // Connect to tenant DB (register)
    const tenantDbUri = 'mongodb+srv://adityakumar33114:UCxu6G2uZG_83SM@cluster0.quxrn.mongodb.net/register'
    await mongoose.connect(tenantDbUri)
    console.log('✅ Connected to tenant DB')

    const PO = mongoose.model('PurchaseOrder', new mongoose.Schema({}, { strict: false }), 'purchaseorders')

    // Get the latest PO
    const latestPO = await PO.findOne({ poNo: 'PO-2409' }).lean()
    
    console.log('\n📦 Latest PO (PO-2409):')
    console.log(JSON.stringify(latestPO, null, 2))
    
    console.log('\n🔍 SupplierId field details:')
    console.log('  Type:', typeof latestPO.supplierId)
    console.log('  Value:', latestPO.supplierId)
    console.log('  Is ObjectId?:', latestPO.supplierId instanceof mongoose.Types.ObjectId)

    // Try both queries
    const supplierId = '6ac99f8b9d1d2bab7ccbc922'
    
    console.log('\n🔍 Query 1: String match')
    const result1 = await PO.find({ supplierId }).lean()
    console.log('  Found:', result1.length)

    console.log('\n🔍 Query 2: ObjectId match')
    const result2 = await PO.find({ supplierId: new mongoose.Types.ObjectId(supplierId) }).lean()
    console.log('  Found:', result2.length)

    console.log('\n🔍 Query 3: All POs')
    const allPOs = await PO.find({}).select('poNo supplierId supplier').lean()
    console.log('  Total POs:', allPOs.length)
    allPOs.slice(0, 5).forEach(po => {
      console.log(`  - ${po.poNo}: supplierId=${po.supplierId} (${typeof po.supplierId})`)
    })

    process.exit(0)
  } catch (err) {
    console.error('❌ Error:', err)
    process.exit(1)
  }
}

checkPO()
