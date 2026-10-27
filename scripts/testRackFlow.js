/**
 * Test Rack & Medicine Flow - Production Validation
 * Tests complete rack-medicine sync flow
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { getRackModel } from '../models/tenant/franchise/Rack.model.js';
import { getMedicineModel } from '../models/tenant/franchise/Medicine.model.js';
import { getMedicineBatchModel } from '../models/tenant/franchise/MedicineBatch.model.js';

const testRackFlow = async () => {
  try {
    console.log('🧪 Starting Rack & Medicine Flow Test...\n');
    
    // Connect to database
    const dbUri = `${process.env.BASE_DB_URI}/cloudFranchaize`;
    await mongoose.connect(dbUri);
    console.log('✅ Connected to database\n');

    const Rack = getRackModel(mongoose.connection);
    const Medicine = getMedicineModel(mongoose.connection);
    const MedicineBatch = getMedicineBatchModel(mongoose.connection);

    // TEST 1: Check Racks
    console.log('📦 TEST 1: Checking Racks...');
    const racks = await Rack.find({ isActive: true }).lean();
    console.log(`   Found ${racks.length} active racks`);
    
    if (racks.length === 0) {
      console.log('   ⚠️  WARNING: No racks found! Run seed or create racks manually.');
    } else {
      racks.forEach(rack => {
        console.log(`   ✅ ${rack.name || rack.code} - ${rack.description} (Capacity: ${rack.capacity})`);
      });
    }
    console.log('');

    // TEST 2: Check Medicines with Rack Locations
    console.log('💊 TEST 2: Checking Medicines with Rack Locations...');
    const medicinesWithRacks = await Medicine.find({ 
      'rackLocation.rackId': { $exists: true, $ne: null },
      isActive: true 
    }).lean();
    
    console.log(`   Found ${medicinesWithRacks.length} medicines with rack locations`);
    
    if (medicinesWithRacks.length > 0) {
      medicinesWithRacks.slice(0, 5).forEach(med => {
        const pos = med.rackLocation?.position || `${med.rackLocation?.rackId}-?-?-?`;
        console.log(`   ✅ ${med.name} → ${pos}`);
      });
      if (medicinesWithRacks.length > 5) {
        console.log(`   ... and ${medicinesWithRacks.length - 5} more`);
      }
    } else {
      console.log('   ⚠️  No medicines with rack locations found');
    }
    console.log('');

    // TEST 3: Validate Rack-Medicine Sync
    console.log('🔗 TEST 3: Validating Rack-Medicine Sync...');
    for (const rack of racks.slice(0, 3)) { // Test first 3 racks
      const medsInRack = await Medicine.countDocuments({ 
        'rackLocation.rackId': rack.code,
        isActive: true 
      });
      const utilization = rack.capacity > 0 ? Math.round((medsInRack / rack.capacity) * 100) : 0;
      console.log(`   ${rack.name || rack.code}: ${medsInRack}/${rack.capacity} items (${utilization}% full)`);
    }
    console.log('');

    // TEST 4: Check Batch-Medicine Rack Sync
    console.log('📦 TEST 4: Checking Batch-Medicine Rack Sync...');
    const batchesWithLocation = await MedicineBatch.find({
      'rackLocation.rackId': { $exists: true, $ne: null }
    }).countDocuments();
    
    const totalBatches = await MedicineBatch.countDocuments({ isActive: true });
    console.log(`   ${batchesWithLocation}/${totalBatches} batches have rack locations`);
    
    if (batchesWithLocation > 0) {
      const sampleBatch = await MedicineBatch.findOne({
        'rackLocation.rackId': { $exists: true }
      }).populate('medicineId', 'name').lean();
      
      if (sampleBatch) {
        console.log(`   Sample: ${sampleBatch.medicineId?.name} (Batch ${sampleBatch.batchNo})`);
        console.log(`           → ${sampleBatch.rackLocation?.position || 'No position'}`);
      }
    }
    console.log('');

    // TEST 5: Schema Validation
    console.log('📋 TEST 5: Schema Validation...');
    const medicinesWithBadRackData = await Medicine.find({
      $or: [
        { 'rackLocation.rackId': { $exists: true, $eq: null } },
        { 'rackLocation.rackId': '' }
      ],
      isActive: true
    }).countDocuments();
    
    if (medicinesWithBadRackData === 0) {
      console.log('   ✅ All medicines have valid rack data');
    } else {
      console.log(`   ⚠️  ${medicinesWithBadRackData} medicines have invalid rack data`);
    }
    console.log('');

    // Summary
    console.log('📊 SUMMARY:');
    console.log(`   Racks: ${racks.length} active`);
    console.log(`   Medicines with racks: ${medicinesWithRacks.length}`);
    console.log(`   Batches with racks: ${batchesWithLocation}/${totalBatches}`);
    console.log(`   Invalid rack data: ${medicinesWithBadRackData}`);
    console.log('');
    
    const status = racks.length > 0 && medicinesWithBadRackData === 0 ? '✅ PASS' : '⚠️  NEEDS ATTENTION';
    console.log(`🎯 Overall Status: ${status}`);

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
};

testRackFlow();
