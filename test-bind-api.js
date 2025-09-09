// Test script for B-Client bind API with new request_type=1 parameters
const API_BASE_URL = 'http://localhost:3000';

async function makeRequest(url, data) {
    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(data)
    });
    
    const result = await response.json();
    return { status: response.status, data: result };
}

async function testBindAPI() {
    console.log('🧪 Testing B-Client bind API with new request_type=1 parameters...\n');

    try {
        // Test 1: request_type=1 with account and password
        console.log('📝 Test 1: request_type=1 with account and password');
        const testData1 = {
            domain_id: 'comp639nsn.pythonanywhere.com',
            user_id: 'test-user-123',
            user_name: 'testuser',
            request_type: 1,
            account: 'testuser@example.com',
            password: 'testpassword123',
            auto_refresh: true
        };

        console.log('Request data:', JSON.stringify(testData1, null, 2));
        
        const response1 = await makeRequest(`${API_BASE_URL}/bind`, testData1);
        console.log('Response:', JSON.stringify(response1.data, null, 2));
        console.log('✅ Test 1 completed\n');

        // Test 2: request_type=1 without account/password (should fail)
        console.log('📝 Test 2: request_type=1 without account/password (should fail)');
        const testData2 = {
            domain_id: 'comp639nsn.pythonanywhere.com',
            user_id: 'test-user-456',
            user_name: 'testuser2',
            request_type: 1,
            auto_refresh: true
        };

        console.log('Request data:', JSON.stringify(testData2, null, 2));
        
        const response2 = await makeRequest(`${API_BASE_URL}/bind`, testData2);
        console.log('Response:', JSON.stringify(response2.data, null, 2));
        console.log('✅ Test 2 completed\n');

        // Test 3: request_type=0 (auto_register) - should still work
        console.log('📝 Test 3: request_type=0 (auto_register) - should still work');
        const testData3 = {
            domain_id: 'comp639nsn.pythonanywhere.com',
            user_id: 'test-user-789',
            user_name: 'testuser3',
            request_type: 0,
            auto_refresh: true
        };

        console.log('Request data:', JSON.stringify(testData3, null, 2));
        
        const response3 = await makeRequest(`${API_BASE_URL}/bind`, testData3);
        console.log('Response:', JSON.stringify(response3.data, null, 2));
        console.log('✅ Test 3 completed\n');

    } catch (error) {
        console.error('❌ Test failed:', error.message);
    }
}

// Run the test
testBindAPI();
