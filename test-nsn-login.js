const axios = require('axios');

async function testNSNLogin() {
    console.log('🧪 Testing NSN login directly...\n');

    try {
        // Test NSN login API directly
        const loginData = new URLSearchParams({
            username: 'traveller1',
            password: 'Password1!'
        });

        console.log('📤 Sending login request to NSN...');
        console.log('URL: http://localhost:5000/login');
        console.log('Data:', loginData.toString());

        const response = await axios.post('http://localhost:5000/login', loginData, {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            timeout: 10000,
            maxRedirects: 0, // Don't follow redirects
            validateStatus: function (status) {
                return status >= 200 && status < 400; // Accept 2xx and 3xx
            }
        });

        console.log('\n📥 NSN login response:');
        console.log('Status:', response.status);
        console.log('Headers:', response.headers);

        if (response.headers['set-cookie']) {
            console.log('Cookies:', response.headers['set-cookie']);

            // Check for session cookie
            const sessionCookie = response.headers['set-cookie'].find(cookie => cookie.includes('session='));
            if (sessionCookie) {
                console.log('✅ Session cookie found:', sessionCookie);

                // Try to parse the session cookie
                const sessionMatch = sessionCookie.match(/session=([^;]+)/);
                if (sessionMatch) {
                    const sessionValue = sessionMatch[1];
                    console.log('Session value:', sessionValue);

                    // Parse Flask session cookie
                    const parts = sessionValue.split('.');
                    if (parts.length >= 2) {
                        const dataPart = parts[1];
                        console.log('Data part:', dataPart);

                        try {
                            const decoded = Buffer.from(dataPart, 'base64').toString('utf-8');
                            console.log('Decoded data:', decoded);

                            const sessionData = JSON.parse(decoded);
                            console.log('Parsed session data:', sessionData);

                            if (sessionData.user_id) {
                                console.log('✅ SUCCESS: user_id found in session:', sessionData.user_id);
                            } else {
                                console.log('❌ FAILED: user_id not found in session');
                            }
                        } catch (error) {
                            console.log('❌ Failed to parse session data:', error.message);
                        }
                    }
                }
            } else {
                console.log('❌ No session cookie found');
            }
        } else {
            console.log('❌ No cookies in response');
        }

    } catch (error) {
        console.error('❌ Test failed:', error.message);
        if (error.response) {
            console.error('Response status:', error.response.status);
            console.error('Response headers:', error.response.headers);
        }
    }
}

// Run the test
testNSNLogin();
