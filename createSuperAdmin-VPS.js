/**
 * Create Super Admin - VPS Version (ES Module)
 * Simple standalone script - no dependencies on other files
 * Just upload this one file and run: node createSuperAdmin-VPS.js
 */

import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';

dotenv.config();

// Database connection from .env or hardcoded
const DB_URI = process.env.MAIN_DB_URI || 'mongodb://127.0.0.1:27017/cloudFranchaize';

// Simple MainUser schema
const mainUserSchema = new mongoose.Schema({
  userId: String,
  password: String,
  name: String,
  email: String,
  phone: String,
  gender: String,
  role: String,
  isActive: Boolean
}, { timestamps: true, collection: 'mainusers' });

async function createSuperAdmin() {
  try {
    console.log('\n🔗 Connecting to database...');
    console.log('📍 URI:', DB_URI);
    
    await mongoose.connect(DB_URI);
    console.log('✅ Connected!');

    const MainUser = mongoose.model('MainUser', mainUserSchema);

    // Check existing
    const existing = await MainUser.findOne({ userId: 'superadmin' });
    
    if (existing) {
      console.log('\n⚠️  Super Admin already exists!');
      console.log('Updating password...');
      
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash('SuperAdmin@123', salt);
      
      await MainUser.updateOne(
        { userId: 'superadmin' },
        { $set: { password: hashedPassword, isActive: true } }
      );
      
      console.log('✅ Password updated!');
    } else {
      console.log('\n👤 Creating Super Admin...');
      
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash('SuperAdmin@123', salt);
      
      console.log('🔐 Password hashed');
      console.log('💾 Inserting into database...');
      
      const superAdmin = await MainUser.create({
        userId: 'superadmin',
        password: hashedPassword,
        name: 'Super Admin',
        email: 'superadmin@doctoradda.com',
        phone: '+919999999999',
        gender: 'Male',
        role: 'SuperAdmin',
        isActive: true
      });

      console.log('✅ Super Admin created!');
      console.log('📋 Created user ID:', superAdmin._id);
      console.log('📋 User details:', superAdmin);
    }
    
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🔑 Login Credentials:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('Backend:  https://api.sevvaii.com');
    console.log('User ID:  superadmin');
    console.log('Password: SuperAdmin@123');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    await mongoose.disconnect();
    process.exit(0);

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    await mongoose.disconnect();
    process.exit(1);
  }
}

createSuperAdmin();
