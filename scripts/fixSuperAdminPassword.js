/**
 * Fix SuperAdmin Password - Force Update with bcrypt
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
}, { timestamps: true });

const run = async () => {
  try {
    const uri = process.env.MAIN_DB_URI;
    await mongoose.connect(uri);
    console.log('✅ Connected\n');

    const User = mongoose.model('User', UserSchema);
    const superAdmin = await User.findOne({ userId: 'superadmin' });

    if (!superAdmin) {
      console.log('❌ SuperAdmin NOT FOUND!\n');
      return;
    }

    console.log('📋 Current State:');
    console.log('   Password:', superAdmin.password);
    console.log('   Is hashed?:', superAdmin.password?.startsWith('$2b$'));
    console.log('');

    // Manually hash the password
    const plainPassword = 'SuperAdmin@123';
    console.log('🔐 Hashing password manually...');
    
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(plainPassword, salt);
    
    console.log('   Salt:', salt);
    console.log('   Hashed:', hashedPassword.substring(0, 30) + '...');
    console.log('');

    // Update directly without model hooks
    await User.updateOne(
      { userId: 'superadmin' },
      { $set: { password: hashedPassword } }
    );

    console.log('✅ Password updated!\n');

    // Verify
    const updated = await User.findOne({ userId: 'superadmin' });
    console.log('🧪 Verification:');
    console.log('   New password (first 30):', updated.password.substring(0, 30) + '...');
    console.log('   Is bcrypt hash?:', updated.password.startsWith('$2b$'));
    
    const testMatch = await bcrypt.compare(plainPassword, updated.password);
    console.log('   Password test:', testMatch ? '✅ WORKS!' : '❌ FAILED');
    console.log('');

    if (testMatch) {
      console.log('🎉 SUCCESS! SuperAdmin password is now properly hashed!');
      console.log('');
      console.log('📋 Login Credentials:');
      console.log('   User ID:  superadmin');
      console.log('   Password: SuperAdmin@123');
      console.log('');
    }

    await mongoose.disconnect();
  } catch (error) {
    console.error('❌ Error:', error);
  }
};

run();
