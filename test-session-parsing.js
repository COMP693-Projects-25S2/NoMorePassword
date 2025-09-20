const axios = require('axios');

async function testSessionParsing() {
    console.log('🔍 Testing session cookie parsing...\n');

    try {
        // Test B-Client bind API and check logs
        console.log('1. Testing B-Client bind API...');
        const bindResponse = await axios.post('http://localhost:3000/bind', {
            request_type: 1, // bind_existing_user
            user_id: 'test-user-session-123',
            user_name: 'testuser_session',
            domain_id: 'localhost:5000',
            node_id: 'nsn-node-001',
            auto_refresh: true,
            account: 'traveller1',
            password: 'Password1!'
        });

        console.log('✅ B-Client bind response:', {
            success: bindResponse.data.success,
            action: bindResponse.data.data?.action,
            login_success: bindResponse.data.data?.login_success,
            nsn_user_id: bindResponse.data.data?.session_info?.complete_session_data?.nsn_user_id,
            nsn_username: bindResponse.data.data?.session_info?.complete_session_data?.nsn_username,
            c_client_notified: bindResponse.data.data?.c_client_notified
        });

        // Check if user_id was extracted
        if (bindResponse.data.data?.session_info?.complete_session_data?.nsn_user_id) {
            console.log('✅ SUCCESS: user_id was extracted from session cookie!');
            console.log('   User ID:', bindResponse.data.data.session_info.complete_session_data.nsn_user_id);
        } else {
            console.log('❌ FAILED: user_id is still null');
            console.log('   Session data:', bindResponse.data.data?.session_info?.complete_session_data);
        }

    } catch (error) {
        console.error('❌ Test failed:', error.response?.data || error.message);
    }
}

testSessionParsing();
