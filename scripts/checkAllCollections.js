/**
 * Check all collections in database
 */

import mongoose from 'mongoose'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

dotenv.config({ path: join(__dirname, '../.env') })

async function checkAllCollections() {
  try {
    const mongoUri = process.env.MAIN_DB_URI
    await mongoose.connect(mongoUri)
    console.log('✅ Connected to MongoDB\n')
    console.log(`📂 Database: ${mongoose.connection.name}\n`)

    // Get all collections
    const collections = await mongoose.connection.db.listCollections().toArray()
    
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log(`📊 Total Collections: ${collections.length}`)
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

    for (const collection of collections) {
      const count = await mongoose.connection.db.collection(collection.name).countDocuments()
      console.log(`📁 ${collection.name}: ${count} documents`)
      
      // If contains "supplier" in name, show sample
      if (collection.name.toLowerCase().includes('supplier')) {
        const samples = await mongoose.connection.db.collection(collection.name).find({}).limit(5).toArray()
        if (samples.length > 0) {
          console.log('   Sample data:')
          samples.forEach((doc, i) => {
            console.log(`   ${i+1}. ${doc.companyName || doc.name || doc._id}`)
          })
        }
        console.log('')
      }
    }

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  } catch (error) {
    console.error('❌ Error:', error.message)
  } finally {
    await mongoose.connection.close()
    process.exit(0)
  }
}

checkAllCollections()
