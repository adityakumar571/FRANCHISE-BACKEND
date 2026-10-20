/**
 * Test script to check and fix medicine image URLs
 */
import './config/env.js'
import mongoose from 'mongoose'

const MONGO_URI = 'mongodb+srv://adityakumar33114:UCxu6G2uZG_83SM@cluster0.quxrn.mongodb.net/register'

const medicineSchema = new mongoose.Schema({}, { strict: false })
const Medicine = mongoose.model('Medicine', medicineSchema, 'medicines')

async function checkImages() {
  try {
    await mongoose.connect(MONGO_URI)
    console.log('✅ Connected to database')

    // Get all medicines
    const medicines = await Medicine.find({}).select('name imageUrl images').limit(10)
    
    console.log('\n📊 Medicine Image Status:')
    console.log('━'.repeat(80))
    
    medicines.forEach((med, idx) => {
      console.log(`\n${idx + 1}. ${med.name}`)
      console.log(`   imageUrl: ${med.imageUrl || '❌ NOT SET'}`)
      console.log(`   images array: ${med.images?.length || 0} images`)
      if (med.images?.length > 0) {
        med.images.forEach((img, i) => {
          console.log(`      [${i}]: ${img}`)
        })
      }
    })

    console.log('\n━'.repeat(80))
    
    // Count medicines with images
    const withImageUrl = await Medicine.countDocuments({ imageUrl: { $exists: true, $ne: null, $ne: '' } })
    const withImagesArray = await Medicine.countDocuments({ 'images.0': { $exists: true } })
    const total = await Medicine.countDocuments({})
    
    console.log(`\n📈 Statistics:`)
    console.log(`   Total medicines: ${total}`)
    console.log(`   With imageUrl: ${withImageUrl}`)
    console.log(`   With images array: ${withImagesArray}`)
    
    // Fix: Set imageUrl from first image in array if missing
    console.log('\n🔧 Fixing imageUrl from images array...')
    const result = await Medicine.updateMany(
      { 
        $or: [
          { imageUrl: { $exists: false } },
          { imageUrl: null },
          { imageUrl: '' }
        ],
        'images.0': { $exists: true }
      },
      [
        { $set: { imageUrl: { $arrayElemAt: ['$images', 0] } } }
      ]
    )
    
    console.log(`✅ Fixed ${result.modifiedCount} medicines`)
    
    await mongoose.disconnect()
    console.log('\n✅ Done!\n')
    
  } catch (error) {
    console.error('❌ Error:', error)
    process.exit(1)
  }
}

checkImages()
