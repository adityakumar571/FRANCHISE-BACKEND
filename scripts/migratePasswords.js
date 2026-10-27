import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import User from '../models/user.modal.js';
import Tenant from '../models/tenant.model.js';
import { getUserModel } from '../models/tenant/user.model.js';
import dotenv from 'dotenv';

dotenv.config();

/**
 * 🔐 PASSWORD MIGRATION SCRIPT
 * 
 * This script migrates all existing plaintext passwords to bcrypt hashed passwords.
 * 
 * ⚠️ IMPORTANT: Run this ONCE after deploying the new password hashing system
 * 
 * Usage:
 *   node scripts/migratePasswords.js
 */

async function migrateMainUserPasswords() {
  console.log('\n🔄 Migrating Main/Admin User Passwords...');
  
  const users = await User.find({});
  let migratedCount = 0;
  let skippedCount = 0;

  for (const user of users) {
    // Skip if already hashed (bcrypt hashes start with $2b$)
    if (user.password && user.password.startsWith('$2b$')) {
      console.log(`⏭️  Skipping ${user.userId} - already hashed`);
      skippedCount++;
      continue;
    }

    if (user.password) {
      const plainPassword = user.password;
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(plainPassword, salt);
      
      // Update password directly without triggering pre-save hook
      await User.updateOne(
        { _id: user._id },
        { password: hashedPassword }
      );
      
      console.log(`✅ Migrated user: ${user.userId}`);
      migratedCount++;
    }
  }

  console.log(`\n✅ Main Users: ${migratedCount} migrated, ${skippedCount} skipped`);
  return { migrated: migratedCount, skipped: skippedCount };
}

async function migrateTenantUserPasswords() {
  console.log('\n🔄 Migrating Franchise User Passwords...');
  
  const tenants = await Tenant.find({ isActive: true });
  let totalMigrated = 0;
  let totalSkipped = 0;

  for (const tenant of tenants) {
    console.log(`\n📦 Processing franchise: ${tenant.schoolName} (${tenant.subdomain})`);
    
    const tenantDbUri = `${process.env.MONGO_URI}${tenant.subdomain}`;
    const tenantConnection = await mongoose.createConnection(tenantDbUri).asPromise();
    
    const TenantUser = getUserModel(tenantConnection);
    const users = await TenantUser.find({});
    
    let migratedCount = 0;
    let skippedCount = 0;

    for (const user of users) {
      // Skip if already hashed
      if (user.password && user.password.startsWith('$2b$')) {
        console.log(`  ⏭️  Skipping ${user.userId} - already hashed`);
        skippedCount++;
        continue;
      }

      if (user.password) {
        const plainPassword = user.password;
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(plainPassword, salt);
        
        // Update password directly
        await TenantUser.updateOne(
          { _id: user._id },
          { password: hashedPassword }
        );
        
        console.log(`  ✅ Migrated user: ${user.userId}`);
        migratedCount++;
      }
    }

    await tenantConnection.close();
    
    console.log(`  📊 ${tenant.subdomain}: ${migratedCount} migrated, ${skippedCount} skipped`);
    totalMigrated += migratedCount;
    totalSkipped += skippedCount;
  }

  console.log(`\n✅ Franchise Users: ${totalMigrated} migrated, ${totalSkipped} skipped`);
  return { migrated: totalMigrated, skipped: totalSkipped };
}

async function migrateAllPasswords() {
  try {
    console.log('🚀 Starting Password Migration...\n');
    console.log(`📡 Connecting to: ${process.env.CENTRAL_MONGO_URI}\n`);
    
    // Connect to central database
    await mongoose.connect(process.env.CENTRAL_MONGO_URI);
    console.log('✅ Connected to Central Database\n');

    // Migrate main/admin users
    const mainResults = await migrateMainUserPasswords();

    // Migrate franchise users
    const tenantResults = await migrateTenantUserPasswords();

    // Summary
    console.log('\n═══════════════════════════════════════════');
    console.log('🎉 PASSWORD MIGRATION COMPLETE');
    console.log('═══════════════════════════════════════════');
    console.log(`Main Users:      ${mainResults.migrated} migrated, ${mainResults.skipped} skipped`);
    console.log(`Franchise Users: ${tenantResults.migrated} migrated, ${tenantResults.skipped} skipped`);
    console.log(`Total:           ${mainResults.migrated + tenantResults.migrated} migrated, ${mainResults.skipped + tenantResults.skipped} skipped`);
    console.log('═══════════════════════════════════════════\n');

    await mongoose.disconnect();
    console.log('✅ Database connection closed\n');
    
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Migration Error:', error.message);
    console.error(error);
    process.exit(1);
  }
}

// Run migration
migrateAllPasswords();
