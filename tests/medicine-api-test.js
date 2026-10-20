/**
 * Medicine Management System API Testing Script
 * Production-level end-to-end testing
 * 
 * Run with: node tests/medicine-api-test.js
 */

const BASE_URL = 'http://localhost:5000/api'; // Update with your server URL
const FRANCHISE_TOKEN = 'YOUR_JWT_TOKEN_HERE'; // Get from login

// Test data
const TEST_MEDICINE = {
  name: 'Test Dolo 650',
  salt: 'Paracetamol',
  genericName: 'Paracetamol',
  strength: '650mg',
  formulation: 'Tablet',
  category: 'Analgesic',
  company: 'Micro Labs',
  packSize: '15 tablets',
  mrp: 30,
  purchasePrice: 25,
  gstPercent: 12,
  rackLocation: {
    rackId: 'RACK-A',
    shelf: 3,
    row: 'B',
    column: 5
  },
  batches: [
    {
      batchNo: 'DL001',
      mfgDate: '2024-01-01',
      expiryDate: '2025-12-31',
      quantity: 100,
      mrp: 30,
      purchasePrice: 25
    }
  ],
  reorderLevel: 20,
  minStock: 10,
  maxStock: 200
};

let createdMedicineId = null;

// Helper function to make API calls
async function apiCall(endpoint, method = 'GET', body = null) {
  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${FRANCHISE_TOKEN}`
    }
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  try {
    const response = await fetch(`${BASE_URL}${endpoint}`, options);
    const data = await response.json();
    return { ok: response.ok, status: response.status, data };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

// Test functions
const tests = {
  async test1_GenerateBarcode() {
    console.log('\n🧪 TEST 1: Generate Barcode');
    const result = await apiCall('/franchise/medicines/barcode/generate', 'POST');
    
    if (result.ok && result.data?.data?.barcode) {
      console.log('✅ PASS - Barcode generated:', result.data.data.barcode);
      TEST_MEDICINE.barcode = result.data.data.barcode;
      return true;
    } else {
      console.log('❌ FAIL -', result.data?.message || result.error);
      return false;
    }
  },

  async test2_CreateMedicine() {
    console.log('\n🧪 TEST 2: Create Medicine with Batch + Rack Location');
    const result = await apiCall('/franchise/medicines', 'POST', TEST_MEDICINE);
    
    if (result.ok && result.data?.data?._id) {
      createdMedicineId = result.data.data._id;
      console.log('✅ PASS - Medicine created:', createdMedicineId);
      console.log('   Position:', result.data.data.rackLocation?.position);
      console.log('   Stock:', result.data.data.currentStock);
      return true;
    } else {
      console.log('❌ FAIL -', result.data?.message || result.error);
      return false;
    }
  },

  async test3_CreateMedicineWithoutRack() {
    console.log('\n🧪 TEST 3: Try Creating Medicine Without Rack (Should Fail)');
    const invalidData = { ...TEST_MEDICINE };
    delete invalidData.rackLocation;
    
    const result = await apiCall('/franchise/medicines', 'POST', invalidData);
    
    if (!result.ok && result.data?.message?.includes('rack')) {
      console.log('✅ PASS - Validation working: Rack location required');
      return true;
    } else {
      console.log('❌ FAIL - Should have rejected medicine without rack');
      return false;
    }
  },

  async test4_CreateMedicineWithoutBatch() {
    console.log('\n🧪 TEST 4: Try Creating Medicine Without Batch (Should Fail)');
    const invalidData = { ...TEST_MEDICINE };
    invalidData.batches = [];
    
    const result = await apiCall('/franchise/medicines', 'POST', invalidData);
    
    if (!result.ok && result.data?.message?.includes('batch')) {
      console.log('✅ PASS - Validation working: At least one batch required');
      return true;
    } else {
      console.log('❌ FAIL - Should have rejected medicine without batch');
      return false;
    }
  },

  async test5_GetMedicineById() {
    console.log('\n🧪 TEST 5: Get Medicine by ID');
    if (!createdMedicineId) {
      console.log('⏭️  SKIP - No medicine created');
      return false;
    }

    const result = await apiCall(`/franchise/medicines/${createdMedicineId}`);
    
    if (result.ok && result.data?.data?.name) {
      console.log('✅ PASS - Medicine retrieved');
      console.log('   Name:', result.data.data.name);
      console.log('   Position:', result.data.data.rackLocation?.position);
      console.log('   Batches:', result.data.data.batches?.length);
      return true;
    } else {
      console.log('❌ FAIL -', result.data?.message || result.error);
      return false;
    }
  },

  async test6_GetMedicinesWithLocation() {
    console.log('\n🧪 TEST 6: Get Medicines with Location Filter');
    const result = await apiCall('/franchise/medicines?withLocation=true&rackId=RACK-A');
    
    if (result.ok && Array.isArray(result.data?.data?.medicines)) {
      const medicines = result.data.data.medicines;
      console.log('✅ PASS - Found', medicines.length, 'medicines in RACK-A');
      return true;
    } else {
      console.log('❌ FAIL -', result.data?.message || result.error);
      return false;
    }
  },

  async test7_SearchByLocation() {
    console.log('\n🧪 TEST 7: Search by Exact Location');
    const result = await apiCall('/franchise/medicines/search-by-location?position=RACK-A-3-B-5');
    
    if (result.ok) {
      const count = result.data?.data?.count || 0;
      console.log('✅ PASS - Found', count, 'medicine(s) at position RACK-A-3-B-5');
      return true;
    } else {
      console.log('❌ FAIL -', result.data?.message || result.error);
      return false;
    }
  },

  async test8_AddBatchToMedicine() {
    console.log('\n🧪 TEST 8: Add New Batch to Medicine');
    if (!createdMedicineId) {
      console.log('⏭️  SKIP - No medicine created');
      return false;
    }

    const newBatch = {
      batchNo: 'DL002',
      mfgDate: '2024-06-01',
      expiryDate: '2026-06-30',
      quantity: 50,
      mrp: 32,
      purchasePrice: 26
    };

    const result = await apiCall(`/franchise/medicines/${createdMedicineId}/batch`, 'POST', newBatch);
    
    if (result.ok) {
      console.log('✅ PASS - Batch added');
      console.log('   Total Stock:', result.data?.data?.currentStock);
      console.log('   Total Batches:', result.data?.data?.batches?.length);
      return true;
    } else {
      console.log('❌ FAIL -', result.data?.message || result.error);
      return false;
    }
  },

  async test9_UpdateLocation() {
    console.log('\n🧪 TEST 9: Update Medicine Location');
    if (!createdMedicineId) {
      console.log('⏭️  SKIP - No medicine created');
      return false;
    }

    const newLocation = {
      rackId: 'RACK-B',
      shelf: 2,
      row: 'C',
      column: 8
    };

    const result = await apiCall(`/franchise/medicines/${createdMedicineId}/location`, 'PUT', newLocation);
    
    if (result.ok && result.data?.data?.rackLocation) {
      console.log('✅ PASS - Location updated');
      console.log('   New Position:', result.data.data.rackLocation.position);
      return true;
    } else {
      console.log('❌ FAIL -', result.data?.message || result.error);
      return false;
    }
  },

  async test10_GetMedicinesByRack() {
    console.log('\n🧪 TEST 10: Get All Medicines in RACK-B');
    const result = await apiCall('/franchise/medicines/racks/RACK-B');
    
    if (result.ok) {
      const count = result.data?.data?.count || 0;
      console.log('✅ PASS - Found', count, 'medicine(s) in RACK-B');
      return true;
    } else {
      console.log('❌ FAIL -', result.data?.message || result.error);
      return false;
    }
  },

  async test11_GetExpiringSoon() {
    console.log('\n🧪 TEST 11: Get Medicines Expiring in 60 Days');
    const result = await apiCall('/franchise/medicines/expiring-soon?days=60');
    
    if (result.ok) {
      const count = result.data?.data?.count || 0;
      console.log('✅ PASS - Found', count, 'batch(es) expiring soon');
      if (count > 0) {
        const sample = result.data.data.expiringMedicines[0];
        console.log('   Sample:', sample.medicineName, '-', sample.daysLeft, 'days left');
      }
      return true;
    } else {
      console.log('❌ FAIL -', result.data?.message || result.error);
      return false;
    }
  },

  async test12_GetExpired() {
    console.log('\n🧪 TEST 12: Get Expired Medicines');
    const result = await apiCall('/franchise/medicines/expired');
    
    if (result.ok) {
      const count = result.data?.data?.count || 0;
      const totalValue = result.data?.data?.totalValue || 0;
      console.log('✅ PASS - Found', count, 'expired batch(es)');
      console.log('   Total Value:', '₹' + totalValue.toFixed(2));
      return true;
    } else {
      console.log('❌ FAIL -', result.data?.message || result.error);
      return false;
    }
  },

  async test13_GetRackSummary() {
    console.log('\n🧪 TEST 13: Get Rack Summary');
    const result = await apiCall('/franchise/medicines/rack-summary');
    
    if (result.ok && Array.isArray(result.data?.data?.racks)) {
      const racks = result.data.data.racks;
      console.log('✅ PASS - Summary retrieved for', racks.length, 'rack(s)');
      racks.forEach(rack => {
        console.log(`   ${rack.rackId}: ${rack.medicineCount} medicines, ${rack.totalStock} units, ₹${rack.totalValue}`);
      });
      return true;
    } else {
      console.log('❌ FAIL -', result.data?.message || result.error);
      return false;
    }
  },

  async test14_DuplicateBarcode() {
    console.log('\n🧪 TEST 14: Try Creating Medicine with Duplicate Barcode (Should Fail)');
    const duplicateData = { ...TEST_MEDICINE };
    duplicateData.name = 'Duplicate Medicine';
    duplicateData.rackLocation.column = 6; // Different position
    
    const result = await apiCall('/franchise/medicines', 'POST', duplicateData);
    
    if (!result.ok && result.data?.message?.includes('Barcode')) {
      console.log('✅ PASS - Validation working: Duplicate barcode rejected');
      return true;
    } else {
      console.log('❌ FAIL - Should have rejected duplicate barcode');
      return false;
    }
  }
};

// Run all tests
async function runAllTests() {
  console.log('╔═══════════════════════════════════════════════════════════════╗');
  console.log('║   MEDICINE MANAGEMENT SYSTEM - API TEST SUITE                 ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝');
  console.log('\n📋 Testing', Object.keys(tests).length, 'endpoints...\n');

  if (FRANCHISE_TOKEN === 'YOUR_JWT_TOKEN_HERE') {
    console.log('❌ ERROR: Please update FRANCHISE_TOKEN in the script');
    console.log('   1. Login to franchise portal');
    console.log('   2. Open browser console');
    console.log('   3. Run: localStorage.getItem("LMS")');
    console.log('   4. Copy the token and update FRANCHISE_TOKEN variable');
    return;
  }

  const results = [];
  
  for (const [name, testFn] of Object.entries(tests)) {
    const passed = await testFn();
    results.push({ name, passed });
    await new Promise(resolve => setTimeout(resolve, 500)); // Wait between tests
  }

  // Summary
  console.log('\n╔═══════════════════════════════════════════════════════════════╗');
  console.log('║   TEST SUMMARY                                                ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝\n');

  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  const total = results.length;

  console.log(`✅ Passed: ${passed}/${total}`);
  console.log(`❌ Failed: ${failed}/${total}`);
  console.log(`📊 Success Rate: ${((passed/total)*100).toFixed(1)}%`);

  if (failed > 0) {
    console.log('\n❌ Failed Tests:');
    results.filter(r => !r.passed).forEach(r => {
      console.log(`   - ${r.name}`);
    });
  }

  console.log('\n' + (failed === 0 ? '🎉 ALL TESTS PASSED!' : '⚠️  SOME TESTS FAILED'));
  
  if (createdMedicineId) {
    console.log('\n💡 Test Medicine ID:', createdMedicineId);
    console.log('   You can view it at: /franchise/medicines/' + createdMedicineId);
  }
}

// Run tests
runAllTests().catch(console.error);
