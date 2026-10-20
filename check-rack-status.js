import mongoose from 'mongoose';

mongoose.connect('mongodb+srv://adityakumar33114:UCxu6G2uZG_83SM@cluster0.quxrn.mongodb.net/uat_shyam_pharma')
  .then(async () => {
    const db = mongoose.connection.useDb('uat_shyam_pharma');
    
    // Get medicines count
    const Medicine = db.collection('medicines');
    const medicineCount = await Medicine.countDocuments();
    const medicinesWithRack = await Medicine.countDocuments({ 
      'rackLocation.rackId': { $exists: true, $ne: null } 
    });
    const medicinesWithoutRack = medicineCount - medicinesWithRack;
    
    console.log('=== MEDICINES STATUS ===');
    console.log('Total Medicines:', medicineCount);
    console.log('With Rack Assigned:', medicinesWithRack);
    console.log('Without Rack:', medicinesWithoutRack);
    console.log('');
    
    // Sample medicines without rack
    const samplesWithoutRack = await Medicine.find({ 
      $or: [
        { 'rackLocation.rackId': { $exists: false } },
        { 'rackLocation.rackId': null }
      ]
    }).limit(5).toArray();
    
    if (samplesWithoutRack.length > 0) {
      console.log('Sample Medicines Without Rack:');
      samplesWithoutRack.forEach(m => {
        console.log(`- ${m.name} (ID: ${m._id})`);
      });
      console.log('');
    }
    
    // Get racks count
    const Rack = db.collection('racks');
    const rackCount = await Rack.countDocuments();
    const racks = await Rack.find({}).toArray();
    
    console.log('=== RACKS STATUS ===');
    console.log('Total Racks:', rackCount);
    
    if (racks.length > 0) {
      console.log('');
      console.log('Available Racks:');
      racks.forEach(rack => {
        console.log(`- ${rack.name} (ID: ${rack._id})`);
        console.log(`  Rows: ${rack.rows}, Cols: ${rack.columns}, Total Positions: ${rack.rows * rack.columns}`);
        console.log(`  Description: ${rack.description || 'N/A'}`);
      });
    } else {
      console.log('❌ No racks found! Need to create racks first.');
    }
    
    process.exit(0);
  })
  .catch(err => { 
    console.error('Error:', err.message); 
    process.exit(1); 
  });
