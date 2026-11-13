/**
 * Create Super Admin for api.sevvaii.com backend
 * This uses the actual production database connection from api.sevvaii.com
 */
import mongoose from 'mongoose';
import bcrypt from 'bcrypt';

// Same database as api.sevvaii.com uses
const DB_URI = 'mongodb+srv://adityakumar33114:UCxu6G2uZG_83SM@cluster0.quxrn.mongodb.net/cloudFranchaize';

// MainUser Schema (for Super Admin)
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
    console.log('🔗 Connecting to api.sevvaii.com database...');
    await mongoose.connect(DB_URI);
    console.log('✅ Connected to cloudFranchaize database');

    const MainUser = mongoose.model('MainUser', mainUserSchema);

    // Check if Super Admin exists
    const existing = await MainUser.findOne({ userId: 'superadmin' });
    
    if (existing) {
      console.log('\n⚠️  Super Admin already exists!');
      console.log('User ID:', existing.userId);
      console.log('Role:', existing.role);
      console.log('Email:', existing.email);
      console.log('Active:', existing.isActive);
      
      // Update password with fresh bcrypt hash
      console.log('\n🔄 Updating password with bcrypt hash...');
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash('SuperAdmin@123', salt);
      
      await MainUser.updateOne(
        { userId: 'superadmin' },
        { $set: { password: hashedPassword, isActive: true } }
      );
      
      console.log('✅ Password updated successfully!');
    } else {
      // Create new Super Admin
      console.log('\n🔐 Creating new Super Admin...');
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
    
    console.log('\n📋 Login Credentials:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('Backend:  https://api.sevvaii.com');
    console.log('User ID:  superadmin');
    console.log('Password: SuperAdmin@123');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    console.log('\n🚀 Login URL:');
    console.log('https://api.sevvaii.com/api/mainUser/login');
    
    console.log('\n🌐 Frontend URLs:');
    console.log('https://franchise.doctoradda.com');
    console.log('https://register.sewvaii.com');

    await mongoose.disconnect();
    console.log('\n✅ Done!');
    process.exit(0);

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error);
    await mongoose.disconnect();
    process.exit(1);
  }
}

createSuperAdmin();
