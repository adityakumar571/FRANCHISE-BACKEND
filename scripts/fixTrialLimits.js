/**
 * fixTrialLimits.js
 * 
 * One-time script: Sabhi trial subscriptions jinki totalStudentLimit = 0 hai
 * unhe 350 pe set karo.
 * 
 * Run: node scripts/fixTrialLimits.js
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);

dotenv.config({ path: join(__dirname, '../.env') });

const MONGO_URI = process.env.MAIN_DB_URI || process.env.MONGO_URI || process.env.DATABASE_URL || process.env.DB_URI;

if (!MONGO_URI) {
  console.error('❌ MONGO_URI not found in .env');
  process.exit(1);
}

const LIMIT = 350;

async function run() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('✅ MongoDB connected');

    const db = mongoose.connection.db;
    const col = db.collection('tenantsubscriptions');

    // Count before
    const before = await col.countDocuments({ isTrial: true, totalStudentLimit: 0 });
    console.log(`📊 Found ${before} trial subscription(s) with limit 0`);

    if (before === 0) {
      console.log('✅ Nothing to fix — all trials already have a student limit set.');
      await mongoose.disconnect();
      return;
    }

    // Fix
    const result = await col.updateMany(
      { isTrial: true, totalStudentLimit: 0 },
      {
        $set: {
          totalStudentLimit:          LIMIT,
          'currentPlan.studentLimit': LIMIT,
        },
      }
    );

    console.log(`✅ Fixed: ${result.modifiedCount} subscription(s) → studentLimit set to ${LIMIT}`);

    // Verify
    const after = await col.countDocuments({ isTrial: true, totalStudentLimit: 0 });
    console.log(`📊 Remaining with limit 0: ${after}`);

  } catch (err) {
    console.error('❌ Error:', err.message);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 MongoDB disconnected');
  }
}

run();
