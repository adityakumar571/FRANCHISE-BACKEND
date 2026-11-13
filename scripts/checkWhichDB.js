/**
 * Quick check - which MongoDB is backend using?
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

async function checkDB() {
  try {
    const dbUri = process.env.MAIN_DB_URI;
    
    console.log('\n📋 Environment Variable:');
    console.log('MAIN_DB_URI =', dbUri);
    
    console.log('\n🔗 Connecting...');
    await mongoose.connect(dbUri);
    
    console.log('\n✅ Connected Successfully!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('Host:', mongoose.connection.host);
    console.log('Port:', mongoose.connection.port);
    console.log('Database:', mongoose.connection.name);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    if (mongoose.connection.host === '127.0.0.1' || mongoose.connection.host === 'localhost') {
      console.log('\n✅ Using LOCAL MongoDB (VPS Server)');
      console.log('💾 Fresh empty database - Super Admin needed');
    } else {
      console.log('\n⚠️  Using REMOTE MongoDB (Atlas)');
      console.log('🚫 This is the FULL database (539MB/512MB)');
      console.log('⚠️  Update .env file to use local MongoDB!');
    }
    
    await mongoose.disconnect();
    process.exit(0);

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
}

checkDB();
