const axios = require('axios');

async function debugSessionCookie() {
    console.log('🔍 Debugging session cookie...\n');

    try {
        // First login to NSN to get session cookie
        console.log('1. Logging into NSN...');
        const loginResponse = await axios.post('http://localhost:5000/login',
            new URLSearchParams({
                username: 'traveller1',
                password: 'Password1!'
            }), {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            maxRedirects: 0,
            validateStatus: function (status) {
                return status >= 200 && status < 400; // Accept redirects
            }
        }
        );

        console.log('Login response status:', loginResponse.status);
        console.log('Login response headers:', loginResponse.headers);

        // Extract session cookie
        const setCookieHeader = loginResponse.headers['set-cookie'];
        if (setCookieHeader) {
            console.log('Set-Cookie header:', setCookieHeader);

            // Find session cookie
            const sessionCookie = setCookieHeader.find(cookie => cookie.startsWith('session='));
            if (sessionCookie) {
                console.log('Session cookie:', sessionCookie);

                // Extract session value
                const sessionMatch = sessionCookie.match(/session=([^;]+)/);
                if (sessionMatch) {
                    const sessionValue = sessionMatch[1];
                    console.log('Session value:', sessionValue);

                    // Try to decode
                    try {
                        const parts = sessionValue.split('.');
                        console.log('Session parts:', parts);

                        if (parts.length >= 1) {
                            const decoded = Buffer.from(parts[0], 'base64').toString('utf-8');
                            console.log('Decoded session data:', decoded);

                            try {
                                const sessionData = JSON.parse(decoded);
                                console.log('Parsed session data:', sessionData);
                                console.log('User ID in session:', sessionData.user_id);
                            } catch (parseError) {
                                console.log('Failed to parse as JSON:', parseError.message);
                            }
                        }
                    } catch (decodeError) {
                        console.log('Failed to decode session:', decodeError.message);
                    }
                }
            }
        }

        // Now access dashboard with the session cookie
        console.log('\n2. Accessing dashboard...');
        const dashboardResponse = await axios.get('http://localhost:5000/dashboard', {
            headers: {
                'Cookie': setCookieHeader ? setCookieHeader.join('; ') : ''
            }
        });

        console.log('Dashboard response status:', dashboardResponse.status);
        console.log('Dashboard response headers:', dashboardResponse.headers);

    } catch (error) {
        console.error('Error:', error.response?.data || error.message);
    }
}

debugSessionCookie();
