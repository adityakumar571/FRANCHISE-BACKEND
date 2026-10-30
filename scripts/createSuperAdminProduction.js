/**
 * Create Super Admin directly in Production Database
 * Run: node scripts/createSuperAdminProduction.js
 */
import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';

dotenv.config();

// User Schema (inline copy to avoid import issues)
const userSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  name: { type: String, required: true },
  email: { type: String, required: true },
  phone: { type: String },
  gender: { type: String },
  role: { type: String, required: true },
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

const User = mongoose.model('User', userSchema);

async function createSuperAdmin() {
  try {
    // Connect to PRODUCTION database
    const dbUri = process.env.MAIN_DB_URI;
    
    if (!dbUri) {
      console.error('❌ MAIN_DB_URI not found in .env file');
      process.exit(1);
    }

    console.log('🔗 Connecting to production database...');
    await mongoose.connect(dbUri);
    console.log('✅ Connected to:', dbUri.split('@')[1]); // Hide credentials

    // Check if Super Admin exists
    const existing = await User.findOne({ userId: 'superadmin' });
    
    if (existing) {
      console.log('\n⚠️  Super Admin already exists!');
      console.log('User ID:', existing.userId);
      console.log('Role:', existing.role);
      console.log('Email:', existing.email);
      console.log('Active:', existing.isActive);
      
      // Update password with bcrypt hash
      console.log('\n🔄 Updating password with bcrypt hash...');
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash('SuperAdmin@123', salt);
      
      await User.updateOne(
        { userId: 'superadmin' },
        { $set: { password: hashedPassword, isActive: true } }
      );
      
      console.log('✅ Password updated successfully!');
      console.log('\n📋 Login Credentials:');
      console.log('   User ID: superadmin');
      console.log('   Password: SuperAdmin@123');
      
      await mongoose.disconnect();
      process.exit(0);
    }

    // Create new Super Admin with bcrypt hash
    console.log('\n🔐 Hashing password with bcrypt...');
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash('SuperAdmin@123', salt);
    
    console.log('👤 Creating Super Admin user...');
    const superAdmin = await User.create({
      userId: 'superadmin',
      password: hashedPassword,
      name: 'Super Admin',
      email: 'superadmin@cloudxsupport.com',
      phone: '+919999999999',
      gender: 'Male',
      role: 'SuperAdmin',
      isActive: true
    });

    console.log('\n✅ Super Admin created successfully!');
    console.log('\n📋 User Details:');
    console.log('   User ID:', superAdmin.userId);
    console.log('   Name:', superAdmin.name);
    console.log('   Email:', superAdmin.email);
    console.log('   Role:', superAdmin.role);
    console.log('   Active:', superAdmin.isActive);
    
    console.log('\n📋 Login Credentials:');
    console.log('   User ID: superadmin');
    console.log('   Password: SuperAdmin@123');
    
    console.log('\n🚀 You can now login at:');
    console.log('   https://saas-backend-f40t.onrender.com/api/mainUser/login');

    await mongoose.disconnect();
    console.log('\n✅ Database connection closed');
    process.exit(0);

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error);
    await mongoose.disconnect();
    process.exit(1);
  }
}

createSuperAdmin();
