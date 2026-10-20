import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const mainDbUri = process.env.MAIN_DB_URI || 'mongodb+srv://adityakumar33114:UCxu6G2uZG_83SM@cluster0.quxrn.mongodb.net/cloudFranchaize';

console.log('🔌 Connecting to:', mainDbUri.replace(/:[^:]*@/, ':****@'));

mongoose.connect(mainDbUri)
  .then(async () => {
    console.log('✅ Connected!\n');
    
    const db = mongoose.connection.db;
    
    // Get tenants/schools
    const tenants = await db.collection('schools').find({}).toArray();
    
    console.log('=== TENANTS/SCHOOLS ===');
    console.log('Total:', tenants.length);
    console.log('');
    
    if (tenants.length > 0) {
      console.log('Available Tenants:');
      tenants.forEach((t, idx) => {
        console.log(`${idx + 1}. ${t.schoolName || t.name || 'Unnamed'}`);
        console.log(`   Subdomain: ${t.subdomain}`);
        console.log(`   DB URI: ${t.dbUri ? t.dbUri.substring(0, 50) + '...' : 'NOT SET'}`);
        console.log('');
      });
      
      // Now check first tenant's database
      if (tenants[0].dbUri) {
        console.log('\n=== CHECKING FIRST TENANT DATABASE ===');
        const tenantConn = await mongoose.createConnection(tenants[0].dbUri).asPromise();
        const tenantDb = tenantConn.db;
        
        console.log('Database Name:', tenantDb.databaseName);
        
        // Check medicines
        const medicineCount = await tenantDb.collection('medicines').countDocuments();
        console.log('Medicines:', medicineCount);
        
        // Check racks
        const rackCount = await tenantDb.collection('racks').countDocuments();
        console.log('Racks:', rackCount);
        
        if (medicineCount > 0) {
          console.log('\nSample Medicines:');
          const samples = await tenantDb.collection('medicines').find({}).limit(5).toArray();
          samples.forEach(m => {
            console.log(`- ${m.name} (Rack: ${m.rackLocation?.position || 'Not Assigned'})`);
          });
        }
        
        if (rackCount > 0) {
          console.log('\nAvailable Racks:');
          const racks = await tenantDb.collection('racks').find({}).toArray();
          racks.forEach(r => {
            console.log(`- ${r.name}: ${r.rows}x${r.columns} (${r.rows * r.columns} positions)`);
          });
        }
        
        await tenantConn.close();
      }
    } else {
      console.log('❌ No tenants found! System needs initialization.');
    }
    
    process.exit(0);
  })
  .catch(err => {
    console.error('❌ Error:', err.message);
    process.exit(1);
  });
