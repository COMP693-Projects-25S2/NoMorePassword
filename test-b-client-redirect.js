const https = require('https');
const http = require('http');
const { URL } = require('url');

async function testBClientRedirect() {
    try {
        console.log('🔍 Testing B-Client redirect handling...');

        const loginUrl = 'http://localhost:5000/login';
        const urlObj = new URL(loginUrl);
        const client = http;

        const makeRequest = (requestUrl, redirectCount = 0) => {
            const currentUrlObj = new URL(requestUrl);
            const isHttps = currentUrlObj.protocol === 'https:';
            const currentClient = isHttps ? https : http;

            const options = {
                hostname: currentUrlObj.hostname,
                port: currentUrlObj.port || (isHttps ? 443 : 80),
                path: currentUrlObj.pathname + currentUrlObj.search,
                method: redirectCount === 0 ? 'POST' : 'GET', // POST for initial, GET for redirects
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                },
                timeout: 10000
            };

            console.log(`\n📋 Request ${redirectCount + 1}:`);
            console.log('URL:', requestUrl);
            console.log('Method:', options.method);
            console.log('Headers:', options.headers);

            return new Promise((resolve, reject) => {
                const req = currentClient.request(options, (res) => {
                    let data = '';

                    res.on('data', (chunk) => {
                        data += chunk;
                    });

                    res.on('end', () => {
                        console.log('Response status:', res.statusCode);
                        console.log('Response headers:', res.headers);
                        console.log('Set-Cookie:', res.headers['set-cookie']);

                        // Handle redirects (302, 301, etc.)
                        if ((res.statusCode === 302 || res.statusCode === 301) && res.headers.location && redirectCount < 5) {
                            const redirectUrl = res.headers.location;
                            console.log(`Following redirect ${res.statusCode} to: ${redirectUrl}`);

                            // If it's a relative URL, make it absolute
                            const absoluteRedirectUrl = redirectUrl.startsWith('http') ?
                                redirectUrl :
                                `${currentUrlObj.protocol}//${currentUrlObj.host}${redirectUrl}`;

                            // Collect cookies from the response
                            let cookies = [];
                            if (res.headers['set-cookie']) {
                                cookies = res.headers['set-cookie'];
                                console.log('Received cookies during redirect:', cookies.join('; '));
                            }

                            // For POST requests that result in redirects, we should follow with GET
                            const redirectOptions = {
                                ...options,
                                method: 'GET', // Always use GET for redirects
                                headers: {
                                    ...options.headers,
                                    // Add cookies from the response to the next request
                                    'Cookie': cookies.length > 0 ? cookies.join('; ') : ''
                                }
                            };

                            makeRequest(absoluteRedirectUrl, redirectCount + 1)
                                .then(resolve)
                                .catch(reject);
                            return;
                        }

                        // Final response
                        const finalHeaders = { ...res.headers };
                        if (res.headers['set-cookie']) {
                            finalHeaders['set-cookie'] = res.headers['set-cookie'];
                            console.log('Final response with cookies:', res.headers['set-cookie']);
                        }

                        resolve({
                            status: res.statusCode,
                            headers: finalHeaders,
                            body: data
                        });
                    });
                });

                req.on('error', (error) => {
                    reject(error);
                });

                if (redirectCount === 0) {
                    // Only send POST data for initial request
                    const postData = new URLSearchParams({
                        username: 'traveller1',
                        password: 'Password1!'
                    }).toString();
                    console.log('Post data:', postData);
                    req.write(postData);
                }

                req.end();
            });
        };

        const response = await makeRequest(loginUrl);

        console.log('\n📋 Final Analysis:');
        console.log('Final status:', response.status);
        console.log('Final Set-Cookie:', response.headers['set-cookie']);

        const sessionCookie = response.headers['set-cookie'] ? response.headers['set-cookie'].join('; ') : null;
        const isSuccess = response.status === 302 || (response.status === 200 && sessionCookie);

        console.log('Has session cookie:', !!sessionCookie);
        console.log('Success condition (302 or 200+cookie):', isSuccess);

    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

testBClientRedirect();
