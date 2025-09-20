const https = require('https');
const http = require('http');
const { URL } = require('url');

async function testBClientHttp() {
    try {
        console.log('🔍 Testing B-Client HTTP request logic...');

        const loginUrl = 'http://localhost:5000/login';
        const urlObj = new URL(loginUrl);
        const client = http; // localhost uses HTTP

        const options = {
            hostname: urlObj.hostname,
            port: urlObj.port || 80,
            path: urlObj.pathname + urlObj.search,
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            },
            timeout: 10000
        };

        const postData = new URLSearchParams({
            username: 'traveller1',
            password: 'Password1!'
        }).toString();

        console.log('Request options:', options);
        console.log('Post data:', postData);

        const response = await new Promise((resolve, reject) => {
            const req = client.request(options, (res) => {
                let data = '';

                res.on('data', (chunk) => {
                    data += chunk;
                });

                res.on('end', () => {
                    console.log('Response status:', res.statusCode);
                    console.log('Response headers:', res.headers);
                    console.log('Set-Cookie:', res.headers['set-cookie']);
                    console.log('Response data length:', data.length);

                    resolve({
                        status: res.statusCode,
                        headers: res.headers,
                        body: data
                    });
                });
            });

            req.on('error', (error) => {
                reject(error);
            });

            req.write(postData);
            req.end();
        });

        console.log('\n📋 Analysis:');
        console.log('Status:', response.status);
        console.log('Has Set-Cookie:', !!response.headers['set-cookie']);
        console.log('Is 302:', response.status === 302);
        console.log('Is 200:', response.status === 200);

        if (response.headers['set-cookie']) {
            const sessionCookie = response.headers['set-cookie'].join('; ');
            console.log('Session cookie:', sessionCookie);
            console.log('Has session cookie:', !!sessionCookie);
            console.log('Success condition (302 or 200+cookie):', response.status === 302 || (response.status === 200 && sessionCookie));
        }

    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

testBClientHttp();
