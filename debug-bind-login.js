const axios = require('axios');

async function debugBindLogin() {
    try {
        console.log('🔍 Debugging B-Client bind login process...');

        // Test 1: Direct NSN login
        console.log('\n📋 Test 1: Direct NSN login');
        const nsnResponse = await axios.post('http://localhost:5000/login',
            new URLSearchParams({
                username: 'traveller1',
                password: 'Password1!'
            }), {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            },
            maxRedirects: 0,
            validateStatus: function (status) {
                return status >= 200 && status < 400;
            }
        }
        );

        console.log('NSN Response Status:', nsnResponse.status);
        console.log('NSN Set-Cookie:', nsnResponse.headers['set-cookie']);

        // Test 2: B-Client bind request
        console.log('\n📋 Test 2: B-Client bind request');
        const bindResponse = await axios.post('http://localhost:3000/bind', {
            request_type: 1,
            user_id: 'debug-user-123',
            user_name: 'debuguser',
            domain_id: 'localhost:5000',
            node_id: 'nsn-node-001',
            auto_refresh: true,
            account: 'traveller1',
            password: 'Password1!'
        });

        console.log('B-Client Response Status:', bindResponse.status);
        console.log('B-Client Response Data:', JSON.stringify(bindResponse.data, null, 2));

        // Test 3: Check if NSN is accessible
        console.log('\n📋 Test 3: NSN accessibility check');
        try {
            const nsnCheck = await axios.get('http://localhost:5000/', {
                timeout: 5000
            });
            console.log('NSN accessible, status:', nsnCheck.status);
        } catch (error) {
            console.log('NSN not accessible:', error.message);
        }

    } catch (error) {
        console.error('❌ Error:', error.message);
        if (error.response) {
            console.error('Response status:', error.response.status);
            console.error('Response data:', error.response.data);
        }
    }
}

debugBindLogin();
