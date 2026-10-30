/**
 * Check SuperAdmin password in database
 */
import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';

dotenv.config({ path: '.env' });

const UserSchema = new mongoose.Schema({
  userId: String,
  password: String,
  role: String,
  name: String,
  isActive: Boolean
});

const run = async () => {
  try {
    const uri = process.env.MAIN_DB_URI;
    await mongoose.connect(uri);
    console.log('✅ Connected\n');

    const User = mongoose.model('User', UserSchema);
    const superAdmin = await User.findOne({ userId: 'superadmin' });

    if (!superAdmin) {
      console.log('❌ SuperAdmin NOT FOUND in database!\n');
      return;
    }

    console.log('📋 SuperAdmin Found:');
    console.log('   User ID:', superAdmin.userId);
    console.log('   Role:', superAdmin.role);
    console.log('   Active:', superAdmin.isActive);
    console.log('   Password (first 30 chars):', superAdmin.password?.substring(0, 30) + '...');
    console.log('   Is bcrypt hash?:', superAdmin.password?.startsWith('$2b$') || superAdmin.password?.startsWith('$2a$'));
    console.log('');

    // Test password comparison
    const testPassword = 'SuperAdmin@123';
    console.log('🧪 Testing password comparison...');
    console.log('   Test password:', testPassword);
    
    try {
      const isMatch = await bcrypt.compare(testPassword, superAdmin.password);
      console.log('   ✅ bcrypt.compare result:', isMatch ? 'MATCH ✓' : 'NO MATCH ✗');
    } catch (err) {
      console.log('   ❌ bcrypt.compare failed:', err.message);
      console.log('   💡 Password might be plain text, not hashed!');
    }

    await mongoose.disconnect();
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
};

run();
