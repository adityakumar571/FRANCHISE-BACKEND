/**
 * Quick test script to verify rack API is working
 */

const testRackAPI = async () => {
  try {
    console.log('🧪 Testing Rack API...\n');
    
    const testData = {
      name: 'TEST-RACK-001',
      warehouse: 'Main Pharmacy',
      shelf: 'Shelf 10',
      section: 'Testing',
      capacity: 50,
      status: 'Active'
    };
    
    console.log('📤 Sending POST request to: http://localhost:9001/api/franchise/rack-management');
    console.log('📦 Payload:', JSON.stringify(testData, null, 2));
    
    const response = await fetch('http://localhost:9001/api/franchise/rack-management', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Add auth token if needed
      },
      body: JSON.stringify(testData)
    });
    
    console.log('\n📊 Response Status:', response.status);
    console.log('📊 Response Status Text:', response.statusText);
    
    const data = await response.json();
    console.log('\n📥 Response Data:', JSON.stringify(data, null, 2));
    
    if (response.ok) {
      console.log('\n✅ SUCCESS: Rack API is working!');
    } else {
      console.log('\n❌ FAILED:', data.message || 'Unknown error');
    }
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error('💡 Make sure backend is running on port 9001');
  }
};

testRackAPI();
