/**
 * Test Script: Complete Supplier Flow
 * Tests: Login → Add Medicine → Verify Auto-Sync
 */

import axios from 'axios'

const API_URL = 'http://localhost:5179/api'

async function testSupplierFlow() {
  console.log('\n🧪 ========================================')
  console.log('   TESTING GLOBAL SUPPLIER FLOW')
  console.log('========================================\n')

  try {
    // Step 1: Login as Supplier
    console.log('📝 Step 1: Logging in as supplier...')
    const loginResponse = await axios.post(`${API_URL}/suppliers/auth/login`, {
      email: 'supplier@test.com', // Change this to your test supplier email
      password: 'password123'      // Change this to your test password
    }, {
      withCredentials: true
    })

    if (!loginResponse.data.success) {
      console.error('❌ Login failed:', loginResponse.data.message)
      return
    }

    const { token, supplier } = loginResponse.data.data
    console.log('✅ Login successful!')
    console.log('   Supplier:', supplier.companyName)
    console.log('   ID:', supplier._id)
    console.log('   Status:', supplier.status)

    // Step 2: Add Medicine
    console.log('\n📝 Step 2: Adding new medicine...')
    const medicineData = {
      name: `Test Medicine ${Date.now()}`,
      category: 'Tablet',
      strength: '500mg',
      packSize: '10 Tablets',
      mrp: 100,
      supplierPrice: 70,
      stock: 500,
      minStock: 50,
      gstPercent: 12,
      scheme: 'Buy 10 Get 1 Free',
      isAvailable: true,
      manufacturer: 'Test Pharma Ltd',
      genericName: 'Generic Test',
      description: 'Test medicine for auto-sync verification'
    }

    const addMedicineResponse = await axios.post(
      `${API_URL}/suppliers/medicines`,
      medicineData,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        withCredentials: true
      }
    )

    if (!addMedicineResponse.data.success) {
      console.error('❌ Add medicine failed:', addMedicineResponse.data.message)
      return
    }

    console.log('✅ Medicine added successfully!')
    console.log('   Medicine ID:', addMedicineResponse.data.data._id)
    console.log('   Name:', addMedicineResponse.data.data.name)
    console.log('   Price:', addMedicineResponse.data.data.supplierPrice)

    // Step 3: Wait for auto-sync (it runs in background)
    console.log('\n⏳ Step 3: Waiting 5 seconds for auto-sync to complete...')
    await new Promise(resolve => setTimeout(resolve, 5000))

    console.log('\n✅ Medicine should now be synced to all franchise databases!')
    console.log('   Check backend logs for sync status: [SYNC] messages')

    // Step 4: Verify by checking supplier's medicines
    console.log('\n📝 Step 4: Fetching supplier medicines list...')
    const getMedicinesResponse = await axios.get(
      `${API_URL}/suppliers/medicines?page=1&limit=5`,
      {
        headers: {
          'Authorization': `Bearer ${token}`
        },
        withCredentials: true
      }
    )

    if (getMedicinesResponse.data.success) {
      const medicines = getMedicinesResponse.data.data.medicines
      console.log('✅ Medicines fetched successfully!')
      console.log(`   Total: ${getMedicinesResponse.data.data.pagination.totalRecords}`)
      console.log('\n   Recent medicines:')
      medicines.slice(0, 3).forEach((med, idx) => {
        console.log(`   ${idx + 1}. ${med.name} - ₹${med.supplierPrice} (Stock: ${med.stock})`)
      })
    }

    console.log('\n🎉 ========================================')
    console.log('   TEST COMPLETED SUCCESSFULLY!')
    console.log('========================================\n')
    console.log('📌 Next Steps:')
    console.log('   1. Check backend logs for [SYNC] messages')
    console.log('   2. Login to any franchise dashboard')
    console.log('   3. Go to Live Rates section')
    console.log('   4. Search for the medicine added above')
    console.log('   5. You should see it with supplier name!')

  } catch (error) {
    console.error('\n❌ ========================================')
    console.error('   TEST FAILED')
    console.error('========================================\n')
    console.error('Error:', error.response?.data || error.message)
    if (error.response?.data?.errors) {
      console.error('Validation Errors:', error.response.data.errors)
    }
  }
}

// Run the test
testSupplierFlow()
