/**
 * Create Super Admin for LOCAL MongoDB (VPS Server)
 * Uses: mongodb://127.0.0.1:27017/cloudFranchaize
 */
import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';

dotenv.config();

// MainUser Schema
const mainUserSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  name: { type: String, required: true },
  email: { type: String, required: true },
  phone: { type: String },
  gender: { type: String },
  role: { type: String, required: true },
  isActive: { type: Boolean, default: true }
}, { timestamps: true, collection: 'mainusers' });

async function createSuperAdmin() {
  try {
    const dbUri = process.env.MAIN_DB_URI || 'mongodb://127.0.0.1:27017/cloudFranchaize';
    
    console.log('🔗 Connecting to LOCAL MongoDB...');
    console.log('📍 Database:', dbUri);
    
    await mongoose.connect(dbUri);
    console.log('✅ Connected successfully!');

    const MainUser = mongoose.model('MainUser', mainUserSchema);

    // Check if Super Admin exists
    const existing = await MainUser.findOne({ userId: 'superadmin' });
    
    if (existing) {
      console.log('\n⚠️  Super Admin already exists!');
      console.log('User ID:', existing.userId);
      console.log('Email:', existing.email);
      console.log('Role:', existing.role);
      
      // Update password
      console.log('\n🔄 Updating password...');
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash('SuperAdmin@123', salt);
      
      await MainUser.updateOne(
        { userId: 'superadmin' },
        { $set: { password: hashedPassword, isActive: true } }
      );
      
      console.log('✅ Password updated!');
    } else {
      // Create new Super Admin
      console.log('\n👤 Creating Super Admin...');
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash('SuperAdmin@123', salt);
      
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

      console.log('\n✅ Super Admin created successfully!');
      console.log('User ID:', superAdmin.userId);
      console.log('Email:', superAdmin.email);
    }
    
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🔑 Login Credentials:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('Backend:  https://api.sevvaii.com');
    console.log('User ID:  superadmin');
    console.log('Password: SuperAdmin@123');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    console.log('\n🌐 Frontend URLs:');
    console.log('• https://franchise.doctoradda.com');
    console.log('• https://register.sewvaii.com');
    
    console.log('\n📡 API Login Endpoint:');
    console.log('POST https://api.sevvaii.com/api/mainUser/login');

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
