/**
 * Test script to check if meta API is working
 * Run: node test-meta-api.js
 */

const BASE_URL = 'http://localhost:5000/api';

// Get JWT token from your browser localStorage
const JWT_TOKEN = 'YOUR_JWT_TOKEN_HERE'; // Update this!

async function testMetaAPI() {
  console.log('🧪 Testing Medicine Meta API\n');
  console.log('━'.repeat(60));

  try {
    console.log('\n📋 Test: GET /franchise/medicines/meta');
    
    const response = await fetch(`${BASE_URL}/franchise/medicines/meta`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${JWT_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });

    console.log('Status:', response.status);
    
    if (!response.ok) {
      const error = await response.text();
      console.error('❌ Error:', error);
      return;
    }

    const result = await response.json();
    console.log('\n✅ Response received:');
    console.log(JSON.stringify(result, null, 2));
    
    if (result.data) {
      console.log('\n📊 Data Summary:');
      console.log('Categories:', result.data.categories?.length || 0);
      console.log('Formulations:', result.data.formulations?.length || 0);
      console.log('Companies:', result.data.companies?.length || 0);
      
      if (result.data.categories?.length > 0) {
        console.log('\nSample Categories:', result.data.categories.slice(0, 5).join(', '));
      }
      if (result.data.formulations?.length > 0) {
        console.log('Sample Formulations:', result.data.formulations.slice(0, 5).join(', '));
      }
      if (result.data.companies?.length > 0) {
        console.log('Sample Companies:', result.data.companies.slice(0, 5).join(', '));
      }
      
      // Check if empty
      if (result.data.categories?.length === 0 && 
          result.data.formulations?.length === 0 && 
          result.data.companies?.length === 0) {
        console.log('\n⚠️  WARNING: All arrays are EMPTY!');
        console.log('This means no medicines exist in database yet.');
        console.log('\nTo fix:');
        console.log('1. Add medicines through Add Medicine page');
        console.log('2. Or add master data through Medicine Masters page');
        console.log('3. Then refresh Add Medicine page');
      }
    }

  } catch (error) {
    console.error('\n❌ Test Failed:');
    console.error('Error:', error.message);
    
    if (error.message.includes('fetch')) {
      console.error('\n📌 Possible causes:');
      console.error('1. Backend server not running');
      console.error('2. Wrong BASE_URL (check port number)');
      console.error('3. Network connectivity issue');
    }
  }
}

console.log('');
console.log('╔════════════════════════════════════════════════════════════╗');
console.log('║  Medicine Meta API Test Script                            ║');
console.log('╚════════════════════════════════════════════════════════════╝');
console.log('');

if (JWT_TOKEN === 'YOUR_JWT_TOKEN_HERE') {
  console.log('⚠️  Please update JWT_TOKEN on line 7 before running!');
  console.log('');
  console.log('How to get JWT token:');
  console.log('1. Login to franchise portal');
  console.log('2. Open Browser DevTools (F12)');
  console.log('3. Go to Application → Local Storage');
  console.log('4. Find "token" or "jwt" key');
  console.log('5. Copy the value');
  console.log('6. Paste it on line 7 of this file');
  console.log('');
} else {
  testMetaAPI();
}
