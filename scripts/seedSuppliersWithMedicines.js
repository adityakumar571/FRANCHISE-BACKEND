/**
 * Seed Database with Sample Suppliers and Medicines
 * Creates 3 suppliers with 5 common medicines each
 */

import mongoose from 'mongoose'
import bcrypt from 'bcryptjs'
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
    minOrderQuantity: { type: Number, default: 1 },
    scheme: String,
    description: String,
    isAvailable: { type: Boolean, default: true },
    expiryDate: Date,
  }],
}, { timestamps: true })

const Supplier = mongoose.model('Supplier', SupplierSchema)

// Common medicines with standardized generic names
const commonMedicines = [
  {
    genericName: 'Paracetamol',
    brands: ['Dolo 650', 'Crocin 650', 'Calpol 650'],
    manufacturer: ['Micro Labs', 'GSK', 'Abbott'],
    strength: '650mg',
    packSize: '15 Tablets',
    category: 'Analgesics',
    baseMRP: 35,
  },
  {
    genericName: 'Amoxicillin',
    brands: ['Mox 500', 'Novamox 500', 'Acmox 500'],
    manufacturer: ['Ranbaxy', 'Cipla', 'Alkem'],
    strength: '500mg',
    packSize: '10 Capsules',
    category: 'Antibiotics',
    baseMRP: 85,
  },
  {
    genericName: 'Pantoprazole',
    brands: ['Pan 40', 'Pantop 40', 'Panzole 40'],
    manufacturer: ['Sun Pharma', 'Alkem', 'Torrent'],
    strength: '40mg',
    packSize: '15 Tablets',
    category: 'Antacids',
    baseMRP: 120,
  },
  {
    genericName: 'Cetirizine',
    brands: ['Cetrizine 10mg', 'Alerid 10mg', 'Okacet 10mg'],
    manufacturer: ['Cipla', 'Sun Pharma', 'Dr Reddy'],
    strength: '10mg',
    packSize: '10 Tablets',
    category: 'Antihistamines',
    baseMRP: 28,
  },
  {
    genericName: 'Metformin',
    brands: ['Glycomet 500', 'Obimet 500', 'Gluformin 500'],
    manufacturer: ['USV', 'Cipla', 'Sun Pharma'],
    strength: '500mg',
    packSize: '20 Tablets',
    category: 'Antidiabetic',
    baseMRP: 45,
  },
]

// Sample suppliers
const suppliers = [
  {
    companyName: 'MediCare Distributors',
    contactPerson: 'Rajesh Kumar',
    email: 'medicare@example.com',
    phone: '9876543210',
    password: 'supplier123',
    address: {
      street: '123 Medical Plaza',
      city: 'Mumbai',
      state: 'Maharashtra',
      pincode: '400001',
    },
    businessType: 'Distributor',
    rating: 4.5,
    priceMultiplier: 0.80, // 20% discount from MRP
  },
  {
    companyName: 'HealthFirst Pharma',
    contactPerson: 'Priya Sharma',
    email: 'healthfirst@example.com',
    phone: '9876543211',
    password: 'supplier123',
    address: {
      street: '456 Pharma Street',
      city: 'Delhi',
      state: 'Delhi',
      pincode: '110001',
    },
    businessType: 'Wholesaler',
    rating: 4.3,
    priceMultiplier: 0.75, // 25% discount from MRP
  },
  {
    companyName: 'QuickMeds Supply',
    contactPerson: 'Amit Patel',
    email: 'quickmeds@example.com',
    phone: '9876543212',
    password: 'supplier123',
    address: {
      street: '789 Supply Lane',
      city: 'Bangalore',
      state: 'Karnataka',
      pincode: '560001',
    },
    businessType: 'Distributor',
    rating: 4.7,
    priceMultiplier: 0.78, // 22% discount from MRP
  },
]

async function seedDatabase() {
  try {
    console.log('🔌 Connecting to MongoDB...')
    const mongoUri = process.env.MAIN_DB_URI
    await mongoose.connect(mongoUri)
    console.log('✅ Connected to MongoDB\n')

    console.log('🌱 Seeding suppliers with medicines...\n')

    for (const supplierData of suppliers) {
      // Hash password
      const hashedPassword = await bcrypt.hash(supplierData.password, 10)
      
      // Generate medicines for this supplier
      const medicines = commonMedicines.map((med, index) => {
        const brandIndex = suppliers.indexOf(supplierData) % med.brands.length
        const supplierPrice = Math.round(med.baseMRP * supplierData.priceMultiplier * 100) / 100
        const stock = 100 + Math.floor(Math.random() * 200) // 100-300 stock
        
        return {
          name: med.brands[brandIndex],
          genericName: med.genericName,
          manufacturer: med.manufacturer[brandIndex],
          category: med.category,
          strength: med.strength,
          packSize: med.packSize,
          mrp: med.baseMRP,
          supplierPrice: supplierPrice,
          stock: stock,
          minOrderQuantity: 10,
          scheme: index % 2 === 0 ? 'Buy 10 Get 1 Free' : 'No Scheme',
          description: `High quality ${med.genericName} from ${med.manufacturer[brandIndex]}`,
          isAvailable: true,
          expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year from now
        }
      })

      // Create supplier with medicines
      const supplier = await Supplier.create({
        companyName: supplierData.companyName,
        contactPerson: supplierData.contactPerson,
        email: supplierData.email,
        phone: supplierData.phone,
        password: hashedPassword,
        address: supplierData.address,
        businessType: supplierData.businessType,
        status: 'Active',
        rating: supplierData.rating,
        medicines: medicines,
      })

      console.log(`✅ Created: ${supplier.companyName}`)
      console.log(`   📧 Email: ${supplier.email}`)
      console.log(`   🔑 Password: supplier123`)
      console.log(`   💊 Medicines: ${supplier.medicines.length}`)
      console.log('')
    }

    console.log('\n🎉 Database seeding completed!\n')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('📋 SUPPLIER LOGIN CREDENTIALS:')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    suppliers.forEach((s, i) => {
      console.log(`\n${i + 1}. ${s.companyName}`)
      console.log(`   Email: ${s.email}`)
      console.log(`   Password: supplier123`)
      console.log(`   Login URL: http://localhost:3000/supplier/login`)
    })
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')
    console.log('💡 Franchise Admin can now compare medicines at:')
    console.log('   http://localhost:5180/suppliers/live-rates\n')

  } catch (error) {
    console.error('❌ Error:', error.message)
    process.exit(1)
  } finally {
    await mongoose.connection.close()
    console.log('🔌 Database connection closed')
    process.exit(0)
  }
}

seedDatabase()
