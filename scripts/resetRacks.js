/**
 * Reset Racks - Delete old racks and create new ones with proper structure
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { getRackModel } from '../models/tenant/franchise/Rack.model.js';

const resetRacks = async () => {
  try {
    console.log('🔌 Connecting to database...');
    const tenantDbUri = process.env.BASE_DB_URI;
    if (!tenantDbUri) {
      throw new Error('BASE_DB_URI not found in environment variables');
    }
    // Connect to main database
    await mongoose.connect(`${tenantDbUri}/cloudFranchaize`);
    console.log('✅ Connected to database');

    const Rack = getRackModel(mongoose.connection);
    
    // Delete all existing racks
    const deleteCount = await Rack.deleteMany({});
    console.log(`🗑️  Deleted ${deleteCount.deletedCount} existing racks`);

    // Create new racks with proper structure
    const newRacks = await Rack.insertMany([
      { code: 'A01', name: 'RACK-A', area: 'Main Store',  warehouse: 'Main Pharmacy', shelf: 'Shelf 1', section: 'Pain Relief', description: 'Analgesics & Antipyretics', capacity: 20, currentItems: 0, status: 'Active' },
      { code: 'A02', name: 'RACK-B', area: 'Main Store',  warehouse: 'Main Pharmacy', shelf: 'Shelf 2', section: 'Antibiotics', description: 'Antibiotics', capacity: 15, currentItems: 0, status: 'Active' },
      { code: 'B01', name: 'RACK-C', area: 'Main Store',  warehouse: 'Main Pharmacy', shelf: 'Shelf 3', section: 'Cardiac', description: 'Cardiac & BP', capacity: 12, currentItems: 0, status: 'Active' },
      { code: 'B02', name: 'RACK-D', area: 'Main Store',  warehouse: 'Main Pharmacy', shelf: 'Shelf 4', section: 'Diabetes', description: 'Antidiabetics', capacity: 15, currentItems: 0, status: 'Active' },
      { code: 'C01', name: 'RACK-E', area: 'Back Store',  warehouse: 'Back Store', shelf: 'Shelf 1', section: 'Cold & Cough', description: 'Cold & Cough', capacity: 20, currentItems: 0, status: 'Active' },
      { code: 'D01', name: 'RACK-F', area: 'Back Store',  warehouse: 'Back Store', shelf: 'Shelf 2', section: 'Vitamins', description: 'Vitamins & Supplements', capacity: 25, currentItems: 0, status: 'Active' },
      { code: 'REF', name: 'FRIDGE',  area: 'Refrigerator', warehouse: 'Cold Storage', shelf: 'Fridge', section: 'Cold Storage', description: 'Cold Storage - Insulin/Vaccines', capacity: 8, currentItems: 0, status: 'Active' },
    ]);
    
    console.log(`✅ Created ${newRacks.length} new racks:`);
    newRacks.forEach(rack => {
      console.log(`   📦 ${rack.name} (${rack.code}) - ${rack.warehouse} - ${rack.section}`);
    });

    await mongoose.disconnect();
    console.log('✅ Database disconnected');
    console.log('🎉 Racks reset successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error resetting racks:', error);
    process.exit(1);
  }
};

resetRacks();
