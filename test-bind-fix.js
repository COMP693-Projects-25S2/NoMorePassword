const axios = require('axios');

async function testBindFix() {
    console.log('🧪 Testing bind to nmp fix...\n');

    try {
        // Test B-Client bind API with correct request_type
        console.log('1. Testing B-Client bind API...');
        const bindResponse = await axios.post('http://localhost:3000/bind', {
            request_type: 1, // bind_existing_user
            user_id: 'test-user-bind-fix-123',
            user_name: 'testuser_bind_fix',
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

        // Check if user_id was extracted from session cookie
        if (bindResponse.data.data?.session_info?.complete_session_data?.nsn_user_id) {
            console.log('✅ SUCCESS: user_id was extracted from session cookie!');
        } else {
            console.log('❌ FAILED: user_id is still null');
        }

    } catch (error) {
        console.error('❌ Test failed:', error.response?.data || error.message);
    }
}

testBindFix();
