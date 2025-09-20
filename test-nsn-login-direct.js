const axios = require('axios');

async function testNSNLogin() {
    try {
        console.log('🧪 Testing NSN login API directly...');

        const response = await axios.post('http://localhost:5000/login',
            new URLSearchParams({
                username: 'traveller1',
                password: 'Password1!'
            }), {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            },
            maxRedirects: 0, // Don't follow redirects
            validateStatus: function (status) {
                return status >= 200 && status < 400; // Accept 2xx and 3xx
            }
        }
        );

        console.log('📥 NSN Login Response:');
        console.log('Status:', response.status);
        console.log('Headers:', response.headers);
        console.log('Set-Cookie:', response.headers['set-cookie']);
        console.log('Data:', response.data);

    } catch (error) {
        if (error.response) {
            console.log('📥 NSN Login Response (Error):');
            console.log('Status:', error.response.status);
            console.log('Headers:', error.response.headers);
            console.log('Set-Cookie:', error.response.headers['set-cookie']);
            console.log('Data:', error.response.data);
        } else {
            console.error('❌ Error:', error.message);
        }
    }
}

testNSNLogin();
