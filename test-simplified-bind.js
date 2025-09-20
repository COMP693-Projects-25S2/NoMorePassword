const axios = require('axios');

async function testSimplifiedBind() {
    console.log('🧪 Testing simplified bind to nmp functionality...\n');

    try {
        // Test B-Client bind API with simplified logic
        const bindRequest = {
            request_type: 1, // bind_existing_user
            user_id: 'test-user-simplified-123',
            user_name: 'testuser_simplified',
            domain_id: 'localhost:5000',
            node_id: 'nsn-node-001',
            auto_refresh: true,
            account: 'traveller1',
            password: 'Password1!'
        };

        console.log('📤 Sending bind request to B-Client...');
        console.log('Request:', JSON.stringify(bindRequest, null, 2));

        const response = await axios.post('http://localhost:3000/bind', bindRequest, {
            headers: {
                'Content-Type': 'application/json'
            },
            timeout: 10000
        });

        console.log('\n📥 B-Client response:');
        console.log('Status:', response.status);
        console.log('Data:', JSON.stringify(response.data, null, 2));

        // Check if the response contains the expected user_id
        if (response.data.success && response.data.data) {
            const sessionData = response.data.data.session_info?.complete_session_data;
            if (sessionData) {
                console.log('\n🔍 Session data analysis:');
                console.log('nsn_user_id:', sessionData.nsn_user_id);
                console.log('nsn_username:', sessionData.nsn_username);
                console.log('nsn_role:', sessionData.nsn_role);

                if (sessionData.nsn_user_id !== null) {
                    console.log('✅ SUCCESS: nsn_user_id is correctly extracted!');
                } else {
                    console.log('❌ FAILED: nsn_user_id is still null');
                }
            } else {
                console.log('❌ FAILED: No session data found in response');
            }
        } else {
            console.log('❌ FAILED: Bind request was not successful');
        }

    } catch (error) {
        console.error('❌ Test failed:', error.message);
        if (error.response) {
            console.error('Response status:', error.response.status);
            console.error('Response data:', error.response.data);
        }
    }
}

// Run the test
testSimplifiedBind();
