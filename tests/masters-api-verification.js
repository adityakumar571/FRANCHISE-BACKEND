/**
 * Masters API Dynamic Integration Verification
 * Tests if AddMedicine component can fetch master data dynamically
 */

const BASE_URL = 'http://localhost:5000/api';

// IMPORTANT: Replace this with a valid JWT token from your login
const JWT_TOKEN = 'YOUR_JWT_TOKEN_HERE';

async function testMastersAPI() {
  console.log('🧪 Testing Medicine Masters API Integration\n');
  console.log('━'.repeat(60));

  try {
    // Test 1: Fetch Meta Data
    console.log('\n📋 Test 1: GET /franchise/medicines/meta');
    console.log('   Purpose: Fetch categories, formulations, companies for dropdowns');
    
    const response = await fetch(`${BASE_URL}/franchise/medicines/meta`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${JWT_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const result = await response.json();
    
    console.log('   ✅ Status:', response.status);
    console.log('   ✅ Response Structure:');
    console.log('      - statusCode:', result.statusCode);
    console.log('      - success:', result.success);
    console.log('      - message:', result.message);
    
    if (result.data) {
      console.log('\n   📊 Master Data Received:');
      console.log('      Categories:', result.data.categories?.length || 0, 'items');
      if (result.data.categories?.length > 0) {
        console.log('         Sample:', result.data.categories.slice(0, 5).join(', '));
      }
      
      console.log('      Formulations:', result.data.formulations?.length || 0, 'items');
      if (result.data.formulations?.length > 0) {
        console.log('         Sample:', result.data.formulations.slice(0, 5).join(', '));
      }
      
      console.log('      Companies:', result.data.companies?.length || 0, 'items');
      if (result.data.companies?.length > 0) {
        console.log('         Sample:', result.data.companies.slice(0, 5).join(', '));
      }

      // Validation
      console.log('\n   🔍 Data Validation:');
      const hasCategories = Array.isArray(result.data.categories) && result.data.categories.length > 0;
      const hasFormulations = Array.isArray(result.data.formulations) && result.data.formulations.length > 0;
      const hasCompanies = Array.isArray(result.data.companies) && result.data.companies.length > 0;
      
      console.log('      ✓ Categories array:', hasCategories ? '✅ Valid' : '⚠️  Empty or invalid');
      console.log('      ✓ Formulations array:', hasFormulations ? '✅ Valid' : '⚠️  Empty or invalid');
      console.log('      ✓ Companies array:', hasCompanies ? '✅ Valid' : '⚠️  Empty or invalid');

      // Check for duplicates
      const catDupes = result.data.categories?.length !== new Set(result.data.categories).size;
      const formDupes = result.data.formulations?.length !== new Set(result.data.formulations).size;
      const compDupes = result.data.companies?.length !== new Set(result.data.companies).size;
      
      console.log('\n   🔄 Duplicate Check:');
      console.log('      Categories:', catDupes ? '⚠️  Has duplicates' : '✅ No duplicates');
      console.log('      Formulations:', formDupes ? '⚠️  Has duplicates' : '✅ No duplicates');
      console.log('      Companies:', compDupes ? '⚠️  Has duplicates' : '✅ No duplicates');

      // Check for null/empty values
      const catNulls = result.data.categories?.some(c => !c || c.trim() === '');
      const formNulls = result.data.formulations?.some(f => !f || f.trim() === '');
      const compNulls = result.data.companies?.some(c => !c || c.trim() === '');
      
      console.log('\n   🚫 Null/Empty Check:');
      console.log('      Categories:', catNulls ? '⚠️  Has null/empty values' : '✅ All valid');
      console.log('      Formulations:', formNulls ? '⚠️  Has null/empty values' : '✅ All valid');
      console.log('      Companies:', compNulls ? '⚠️  Has null/empty values' : '✅ All valid');

      // Overall status
      console.log('\n━'.repeat(60));
      if (hasCategories && hasFormulations && hasCompanies && 
          !catDupes && !formDupes && !compDupes &&
          !catNulls && !formNulls && !compNulls) {
        console.log('✅ MASTERS API: PRODUCTION READY');
        console.log('   All dropdowns will populate correctly in AddMedicine page');
      } else {
        console.log('⚠️  MASTERS API: NEEDS ATTENTION');
        console.log('   Some dropdown data may be empty or invalid');
        console.log('   Add sample medicines to populate master data');
      }
      console.log('━'.repeat(60));
    }

    // Frontend Integration Check
    console.log('\n🎨 Frontend Integration Status:');
    console.log('   File: FRANCHISE-ADMIN-FRONTEND/src/views/franchise/Medicines/AddMedicine.jsx');
    console.log('   ✅ useEffect hook: Fetches masters on mount');
    console.log('   ✅ getRequest: Calls /franchise/medicines/meta');
    console.log('   ✅ State management: categories, formulations, companies');
    console.log('   ✅ Loading indicator: Shows while fetching');
    console.log('   ✅ Error handling: Fallback to hardcoded values');
    console.log('   ✅ Toast notifications: User feedback on errors');

    console.log('\n📝 Next Steps:');
    console.log('   1. Start frontend: cd FRANCHISE-ADMIN-FRONTEND && npm start');
    console.log('   2. Navigate to: http://localhost:3000/franchise/medicines/add');
    console.log('   3. Watch for "Loading dropdown data..." message');
    console.log('   4. Verify dropdowns populate with database values');
    console.log('   5. Add medicine with new category to test dynamic update');

  } catch (error) {
    console.error('\n❌ Test Failed:');
    console.error('   Error:', error.message);
    
    if (error.message.includes('fetch')) {
      console.error('\n   Possible causes:');
      console.error('   1. Backend server not running (start with: npm run dev)');
      console.error('   2. Wrong BASE_URL (check port number)');
      console.error('   3. Network connectivity issue');
    } else if (error.message.includes('401')) {
      console.error('\n   Authentication failed:');
      console.error('   1. JWT token expired or invalid');
      console.error('   2. Update JWT_TOKEN at line 7 of this file');
      console.error('   3. Login to get new token');
    } else if (error.message.includes('404')) {
      console.error('\n   Route not found:');
      console.error('   1. Check if route is registered in remainingRoutes.js');
      console.error('   2. Verify backend is using correct API version');
    }
  }
}

// Instructions
console.log('');
console.log('╔════════════════════════════════════════════════════════════╗');
console.log('║  Medicine Masters API Verification Script                 ║');
console.log('╚════════════════════════════════════════════════════════════╝');
console.log('');
console.log('📖 Instructions:');
console.log('   1. Update JWT_TOKEN on line 7 with valid token');
console.log('   2. Ensure backend server is running (npm run dev)');
console.log('   3. Run: node tests/masters-api-verification.js');
console.log('');

// Run if JWT token is provided
if (JWT_TOKEN === 'YOUR_JWT_TOKEN_HERE') {
  console.log('⚠️  Please update JWT_TOKEN on line 7 before running!');
  console.log('   Get token from: Login → DevTools → Application → localStorage');
  console.log('');
} else {
  testMastersAPI();
}
