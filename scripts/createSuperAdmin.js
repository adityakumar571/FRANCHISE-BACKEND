/**
 * SuperAdmin Create Script
 * Run: node scripts/createSuperAdmin.js
 *
 * SuperAdmin account create karta hai ya already exist ho to skip karta hai.
 * Safe to run multiple times.
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';

// Development DB use karo (jahan actual server connect hota hai)
dotenv.config({ path: '.env.development' });

// ── User Schema (inline) ──────────────────────────────────────────────────────
const UserSchema = new mongoose.Schema(
  {
    phone:      { type: String },
    userId:     { type: String, required: true, unique: true, index: true },
    name:       String,
    gender:     { type: String, enum: ['Male', 'Female', 'Other'] },
    role:       { type: String, enum: ['Admin', 'SuperAdmin'], default: 'Admin', required: true },
    email:      { type: String, trim: true, lowercase: true },
    profilePic: String,
    password:   { type: String },
    fcmToken:   { type: String },
    isActive:   { type: Boolean, default: true },
    lastLogin:  Date,
    tenantId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', default: null },
  },
  { timestamps: true }
);

UserSchema.methods.generateAuthToken = function () {
  return jwt.sign(
    { userId: this._id, role: this.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRE || '30d' }
  );
};

const User = mongoose.models.User || mongoose.model('User', UserSchema);

// ── SuperAdmin Details ────────────────────────────────────────────────────────
// Login form mein "User ID" field hai, isliye userId = 'superadmin'
const SUPER_ADMIN = {
  userId:   'superadmin',         // ← login form mein enter karo
  password: 'SuperAdmin@123',     // ← login form mein enter karo
  name:     'Super Admin',
  email:    'superadmin@cloudxsupport.com',
  phone:    '+919999999999',
  gender:   'Male',
  role:     'SuperAdmin',
};

// ── Script ────────────────────────────────────────────────────────────────────
const run = async () => {
  try {
    const uri = process.env.MAIN_DB_URI;
    if (!uri) throw new Error('MAIN_DB_URI not found in .env');

    console.log('🔗  Connecting to database...');
    await mongoose.connect(uri);
    console.log('✅  Connected!\n');

    // Check if SuperAdmin already exists
    const existing = await User.findOne({ userId: SUPER_ADMIN.userId });
    if (existing) {
      console.log('⚠️   SuperAdmin already exists!');
      console.log(`     User ID  : ${existing.userId}`);
      console.log(`     Role     : ${existing.role}`);
      console.log('\nChange karna ho to DB se purana record delete karo ya userId update karo.');
      return;
    }

    // NOTE: Login controller plain text compare karta hai (user.password === password)
    // isliye password plain text store ho raha hai — same as existing app logic
    const superAdmin = await User.create({
      userId:   SUPER_ADMIN.userId,
      name:     SUPER_ADMIN.name,
      email:    SUPER_ADMIN.email,
      password: SUPER_ADMIN.password,   // plain text — app ki existing logic ke hisaab se
      phone:    SUPER_ADMIN.phone,
      gender:   SUPER_ADMIN.gender,
      role:     'SuperAdmin',
      isActive: true,
      tenantId: null,
    });

    console.log('🎉  SuperAdmin successfully created!\n');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`  User ID  : ${superAdmin.userId}`);
    console.log(`  Password : ${SUPER_ADMIN.password}`);
    console.log(`  Role     : ${superAdmin.role}`);
    console.log(`  Name     : ${superAdmin.name}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('\n✅  Ab login form mein:');
    console.log(`     User ID  → ${superAdmin.userId}`);
    console.log(`     Password → ${SUPER_ADMIN.password}`);

  } catch (err) {
    console.error('❌  Script failed:', err.message);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌  Disconnected.');
  }
};

run();
