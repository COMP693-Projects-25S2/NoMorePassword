const axios = require('axios');

async function testBindWithLogs() {
    try {
        console.log('🧪 Testing B-Client bind with detailed logging...');

        // First, let's check if B-Client is responding
        console.log('\n📋 Step 1: Check B-Client health');
        try {
            const healthResponse = await axios.get('http://localhost:3000/api/stats');
            console.log('✅ B-Client is running, stats:', healthResponse.data);
        } catch (error) {
            console.log('❌ B-Client not responding:', error.message);
            return;
        }

        // Test bind request with detailed logging
        console.log('\n📋 Step 2: Send bind request');
        const bindRequest = {
            request_type: 1,
            user_id: 'test-user-with-logs-123',
            user_name: 'testuser_with_logs',
            domain_id: 'localhost:5000',
            node_id: 'nsn-node-001',
            auto_refresh: true,
            account: 'traveller1',
            password: 'Password1!'
        };

        console.log('Sending request:', JSON.stringify(bindRequest, null, 2));

        const bindResponse = await axios.post('http://localhost:3000/bind', bindRequest, {
            timeout: 10000,
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'Test-Script/1.0'
            }
        });

        console.log('\n📋 Step 3: B-Client response');
        console.log('Status:', bindResponse.status);
        console.log('Response:', JSON.stringify(bindResponse.data, null, 2));

        // Check if the response indicates success
        if (bindResponse.data.success) {
            console.log('✅ Bind request successful!');
        } else {
            console.log('❌ Bind request failed:', bindResponse.data.data?.error || 'Unknown error');
        }

    } catch (error) {
        console.error('❌ Test failed:', error.message);
        if (error.response) {
            console.error('Response status:', error.response.status);
            console.error('Response data:', error.response.data);
        }
    }
}

testBindWithLogs();
