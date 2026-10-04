import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

dotenv.config();

// Connect to tenant database
const TENANT_DB_URI = 'mongodb+srv://adityakumar33114:UCxu6G2uZG_83SM@cluster0.quxrn.mongodb.net/register';

async function setSupplierPasswords() {
  try {
    console.log('🔌 Connecting to database...');
    await mongoose.connect(TENANT_DB_URI);
    console.log('✅ Connected!');

    const db = mongoose.connection.db;
    
    // Get all suppliers
    const suppliers = await db.collection('suppliers').find({}).toArray();
    console.log(`📦 Found ${suppliers.length} suppliers`);

    for (const supplier of suppliers) {
      // Set password to supplierCode (default)
      const plainPassword = supplier.supplierCode || 'TEMP@123';
      const hashedPassword = await bcrypt.hash(plainPassword, 10);
      
      await db.collection('suppliers').updateOne(
        { _id: supplier._id },
        { 
          $set: { 
            password: hashedPassword,
            isActive: true,
            isFirstLogin: true
          } 
        }
      );
      
      console.log(`✅ Updated: ${supplier.name} (${supplier.email})`);
      console.log(`   Password: ${plainPassword}`);
      console.log(`   Email: ${supplier.email}`);
      console.log('');
    }

    console.log('🎉 All suppliers updated!');
    await mongoose.disconnect();
    
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

setSupplierPasswords();
