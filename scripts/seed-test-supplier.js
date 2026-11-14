/**
 * Seeder Script: Create Test Supplier with Sample Medicines
 * Usage: node scripts/seed-test-supplier.js
 */

import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const API_BASE_URL = process.env.BACKEND_URL || 'http://localhost:9001/api';

// Helper to make API calls
const postRequest = async (url, data, token) => {
  try {
    const response = await axios.post(`${API_BASE_URL}${url}`, data, {
      headers: {
        'Content-Type': 'application/json',
        ...(token && { Authorization: `Bearer ${token}` })
      },
      withCredentials: true
    });
    return response.data;
  } catch (error) {
    console.error(`❌ Error in POST ${url}:`, error.response?.data || error.message);
    throw error;
  }
};

const createTestSupplier = async () => {
  console.log('🚀 Starting Test Supplier Seeding...\n');

  try {
    // Step 1: Register a test supplier
    console.log('📝 Step 1: Registering test supplier...');
    
    const supplierData = {
      companyName: 'Test Pharma Solutions',
      contactPerson: 'John Doe',
      email: `test-supplier-${Date.now()}@example.com`,
      password: 'Test@1234',
      phone: '9876543210',
      address: {
        street: '123 Pharma Street',
        city: 'Mumbai',
        state: 'Maharashtra',
        pincode: '400001'
      },
      businessType: 'Distributor'
    };

    const registrationResponse = await postRequest('/suppliers/auth/register', supplierData);
    
    if (!registrationResponse.success) {
      throw new Error('Failed to register supplier: ' + registrationResponse.message);
    }

    console.log('✅ Supplier registered successfully!');
    console.log(`   Email: ${supplierData.email}`);
    console.log(`   Password: ${supplierData.password}\n`);

    // Step 2: Login as supplier to get token
    console.log('🔐 Step 2: Logging in as supplier...');
    
    const loginResponse = await postRequest('/suppliers/auth/login', {
      email: supplierData.email,
      password: supplierData.password
    });

    if (!loginResponse.success || !loginResponse.data?.token) {
      throw new Error('Failed to login: ' + loginResponse.message);
    }

    const supplierToken = loginResponse.data.token;
    console.log('✅ Supplier logged in successfully!\n');

    // Step 3: Add sample medicines
    console.log('💊 Step 3: Adding sample medicines to supplier inventory...\n');

    const sampleMedicines = [
      {
        name: 'Aspirin 500mg',
        generic_name: 'Acetylsalicylic Acid',
        manufacturer: 'Bayer Healthcare',
        category: 'Tablet',
        strength: '500mg',
        packSize: '10 tablets',
        mrp: 50,
        supplierPrice: 30,
        stock: 100,
        medical_system: 'Allopathy',
        description: 'Pain and fever reliever',
        isAvailable: true
      },
      {
        name: 'Amoxicillin 500mg',
        generic_name: 'Amoxicillin',
        manufacturer: 'GlaxoSmithKline',
        category: 'Capsule',
        strength: '500mg',
        packSize: '10 capsules',
        mrp: 120,
        supplierPrice: 75,
        stock: 50,
        medical_system: 'Allopathy',
        description: 'Antibiotic for bacterial infections',
        isAvailable: true
      },
      {
        name: 'Cough Syrup',
        generic_name: 'Dextromethorphan + Guaifenesin',
        manufacturer: 'Cipla',
        category: 'Syrup',
        strength: '10ml',
        packSize: '100ml bottle',
        mrp: 80,
        supplierPrice: 50,
        stock: 30,
        medical_system: 'Allopathy',
        description: 'For dry cough',
        isAvailable: true
      },
      {
        name: 'Vitamin D3 1000IU',
        generic_name: 'Cholecalciferol',
        manufacturer: 'Abbott',
        category: 'Tablet',
        strength: '1000IU',
        packSize: '30 tablets',
        mrp: 150,
        supplierPrice: 90,
        stock: 75,
        medical_system: 'Allopathy',
        description: 'Vitamin D supplementation',
        isAvailable: true
      },
      {
        name: 'Blood Pressure Monitor',
        generic_name: 'Digital BP Device',
        manufacturer: 'OMRONIndia',
        category: 'Other',
        strength: 'Automatic',
        packSize: '1 unit',
        mrp: 2500,
        supplierPrice: 1800,
        stock: 15,
        medical_system: 'Allopathy',
        description: 'Automatic blood pressure monitor',
        isAvailable: true
      }
    ];

    let addedCount = 0;
    for (const medicine of sampleMedicines) {
      try {
        const response = await postRequest('/suppliers/medicines', medicine, supplierToken);
        
        if (response.success) {
          console.log(`   ✅ Added: ${medicine.name}`);
          addedCount++;
        } else {
          console.log(`   ⚠️  Failed to add ${medicine.name}: ${response.message}`);
        }
      } catch (error) {
        console.log(`   ❌ Error adding ${medicine.name}`);
      }
    }

    console.log(`\n📊 Summary:`);
    console.log(`   Total medicines added: ${addedCount}/${sampleMedicines.length}`);
    console.log(`\n✨ Test supplier seeding completed!\n`);
    console.log(`🎯 Test Supplier Credentials:`);
    console.log(`   Email: ${supplierData.email}`);
    console.log(`   Password: ${supplierData.password}`);
    console.log(`   Medicines added: ${addedCount}`);
    console.log(`\n🚀 You can now login to SupplierInventory and see the medicines!\n`);

  } catch (error) {
    console.error('❌ Seeding failed:', error.message);
    process.exit(1);
  }
};

// Run the seeder
createTestSupplier()
  .then(() => {
    console.log('Seeding complete!');
    process.exit(0);
  })
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
