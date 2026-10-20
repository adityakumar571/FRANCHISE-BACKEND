/**
 * Update Existing Suppliers with Delivery Time
 * Sets realistic delivery times based on city
 */

import mongoose from 'mongoose';
import Supplier from '../models/Supplier.model.js';
import dotenv from 'dotenv';

dotenv.config();

// Delivery time based on city tier
const cityDeliveryMapping = {
  // Tier 1 cities - Same Day
  'Mumbai': 'Same Day',
  'Delhi': 'Same Day',
  'Bangalore': 'Same Day',
  'Hyderabad': 'Same Day',
  'Chennai': 'Same Day',
  'Kolkata': 'Same Day',
  'Pune': 'Same Day',
  'Ahmedabad': 'Same Day',
  
  // Tier 2 cities - Next Day
  'Jaipur': 'Next Day',
  'Lucknow': 'Next Day',
  'Kanpur': 'Next Day',
  'Nagpur': 'Next Day',
  'Indore': 'Next Day',
  'Bhopal': 'Next Day',
  'Visakhapatnam': 'Next Day',
  'Patna': 'Next Day',
  
  // Default - 2-3 Days
  'default': '2-3 Days'
};

async function updateDeliveryTimes() {
  try {
    console.log('🔌 Connecting to MongoDB...\n');
    await mongoose.connect(process.env.MAIN_DB_URI);
    console.log('✅ Connected\n');
    
    const suppliers = await Supplier.find({});
    console.log(`📦 Found ${suppliers.length} suppliers\n`);
    
    let updated = 0;
    
    for (const supplier of suppliers) {
      const city = supplier.address?.city || 'Unknown';
      let deliveryTime = cityDeliveryMapping[city] || cityDeliveryMapping['default'];
      
      // Update supplier (skip validation since category enum is strict)
      await Supplier.updateOne(
        { _id: supplier._id },
        {
          $set: {
            deliveryTime: deliveryTime,
            deliveryAvailable: true,
            minimumOrderValue: 0
          }
        }
      );
      updated++;
      
      console.log(`✓ ${supplier.companyName}`);
      console.log(`  City: ${city}`);
      console.log(`  Delivery: ${deliveryTime}`);
      console.log('');
    }
    
    console.log(`\n✅ Updated ${updated} suppliers successfully!`);
    console.log('\n📊 Summary:');
    
    const sameDayCount = await Supplier.countDocuments({ deliveryTime: 'Same Day' });
    const nextDayCount = await Supplier.countDocuments({ deliveryTime: 'Next Day' });
    const twoDaysCount = await Supplier.countDocuments({ deliveryTime: '2-3 Days' });
    
    console.log(`  Same Day: ${sameDayCount}`);
    console.log(`  Next Day: ${nextDayCount}`);
    console.log(`  2-3 Days: ${twoDaysCount}`);
    
    await mongoose.disconnect();
    console.log('\n✅ Done');
    
  } catch (error) {
    console.error('\n❌ Error:', error);
    process.exit(1);
  }
}

updateDeliveryTimes();
