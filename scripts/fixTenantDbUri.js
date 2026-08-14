/**
 * Fix Tenant dbUri — double slash problem
 * Run: node scripts/fixTenantDbUri.js
 *
 * Problem: dbUri = "mongodb+srv://...net//dps4"  (double slash)
 * Fix:     dbUri = "mongodb+srv://...net/dps4"   (single slash)
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.development' });

const TenantSchema = new mongoose.Schema({}, { strict: false });
const Tenant = mongoose.model('Tenant', TenantSchema, 'tenants');

const run = async () => {
  try {
    await mongoose.connect(process.env.MAIN_DB_URI);
    console.log('✅ Connected\n');

    const all = await Tenant.find({});
    let fixed = 0;

    for (const t of all) {
      const uri = t.dbUri || '';
      // detect double slash after domain e.g. ".net//dps4"
      if (uri.includes('.net//') || uri.includes('.mongodb.net//')) {
        const fixedUri = uri.replace(/\.net\/\//, '.net/');
        console.log(`🔧 Fixing: ${t.subdomain}`);
        console.log(`   Before: ${uri}`);
        console.log(`   After : ${fixedUri}\n`);
        await Tenant.updateOne({ _id: t._id }, { $set: { dbUri: fixedUri } });
        fixed++;
      }
    }

    if (fixed === 0) {
      console.log('✅ Koi broken dbUri nahi mili — sab theek hain');
    } else {
      console.log(`✅ ${fixed} tenant(s) fix ho gaye`);
    }

  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected');
  }
};

run();
