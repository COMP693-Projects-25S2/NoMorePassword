// B-Client HTTP RESTful API Servere
const express = require('express');
const cors = require('cors');
const path = require('path');
const axios = require('axios');
const apiConfig = require('../config/apiConfig');

class ApiServer {
    constructor(port = null) {
        this.app = express();
        this.port = port || apiConfig.server.port;
        this.server = null;
        this.isRunning = false;
        this.autoRefreshInterval = null;
        this.websiteTitleCache = new Map(); // Cache for website titles
        this.websiteImageCache = new Map(); // Cache for website images
        this.titleCacheExpiry = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
        this.imageCacheExpiry = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds

        // CRITICAL FIX: Store C-Client IP/Port from query-cookie requests
        this.cClientInfoCache = new Map(); // Store user_id -> {ip, port, timestamp}

        this.config = this.loadConfig();

        this.setupMiddleware();
        this.setupRoutes();
    }

    // Load configuration from config.json
    loadConfig() {
        try {
            const fs = require('fs');
            const configPath = path.join(__dirname, '..', 'config.json');
            const configData = fs.readFileSync(configPath, 'utf8');
            return JSON.parse(configData);
        } catch (error) {
            console.log('🔧 B-Client ApiServer: Using default config (config.json not found)');
            return {
                network: {
                    use_public_ip: false,
                    public_ip: '121.74.37.6',
                    local_ip: '127.0.0.1'
                }
            };
        }
    }

    // Get the appropriate IP address based on configuration
    getConfiguredIpAddress() {
        if (this.config.network.use_public_ip) {
            console.log('🌐 B-Client ApiServer: Using public IP mode');
            return this.config.network.public_ip;
        } else {
            console.log('🏠 B-Client ApiServer: Using local IP mode');
            return this.config.network.local_ip;
        }
    }

    setupMiddleware() {
        // Enable CORS for all routes
        this.app.use(cors(apiConfig.server.cors));

        // Parse JSON bodies
        this.app.use(express.json());

        // Parse URL-encoded bodies
        this.app.use(express.urlencoded({ extended: true }));

        // Logging middleware
        this.app.use((req, res, next) => {
            console.log(`[API] ${req.method} ${req.path} - ${new Date().toISOString()}`);
            next();
        });
    }

    setupRoutes() {
        // Health check endpoint
        this.app.get('/health', (req, res) => {
            res.json({
                status: 'ok',
                timestamp: new Date().toISOString(),
                service: 'B-Client API Server'
            });
        });

        // Dashboard stats endpoint
        this.app.get('/api/stats', (req, res) => {
            try {
                const stats = this.getDashboardStats();
                res.json(stats);
            } catch (error) {
                console.error('[API] Error getting dashboard stats:', error);
                res.status(500).json({
                    error: 'Failed to get dashboard stats',
                    message: error.message
                });
            }
        });

        // Dashboard config endpoint
        this.app.get('/api/config', async (req, res) => {
            try {
                // Get real website titles only for current environment websites
                const configWithTitles = { ...apiConfig };
                const currentEnvironmentDomain = this.getCurrentEnvironmentDomain();

                // Only fetch titles/images for current environment and local alternatives
                const configuredIp = this.getConfiguredIpAddress();
                const configuredDomain = `${configuredIp}:${this.config.api.nsn_port || 5000}`;
                const domainsToFetch = [currentEnvironmentDomain, configuredDomain];

                for (const domain of domainsToFetch) {
                    const websiteConfig = apiConfig.targetWebsites[domain];
                    if (websiteConfig) {
                        try {
                            const [realTitle, images] = await Promise.all([
                                this.getWebsiteTitle(domain),
                                this.getWebsiteImages(domain)
                            ]);

                            configWithTitles.targetWebsites[domain] = {
                                ...websiteConfig,
                                realTitle: realTitle,
                                images: images
                            };
                        } catch (error) {
                            console.error(`[API] Error getting title/images for ${domain}:`, error);
                            // Keep original config if fetch fails
                            configWithTitles.targetWebsites[domain] = {
                                ...websiteConfig,
                                realTitle: websiteConfig.name,
                                images: {
                                    favicon: null,
                                    ogImage: null,
                                    logo: null
                                }
                            };
                        }
                    }
                }

                res.json(configWithTitles);
            } catch (error) {
                console.error('[API] Error getting config:', error);
                res.status(500).json({
                    error: 'Failed to get config',
                    message: error.message
                });
            }
        });

        // Main bind endpoint
        this.app.post('/bind', async (req, res) => {
            try {
                console.log(`[API] ===== BIND REQUEST RECEIVED =====`);
                console.log(`[API] Request headers:`, req.headers);
                console.log(`[API] Request body:`, req.body);

                const { domain_id, user_id, user_name, node_id, request_type, auto_refresh, cookie, account, password, ip_address, port } = req.body;

                console.log(`[API] ===== RECEIVED BIND REQUEST FROM NSN =====`);
                console.log(`[API] Received from NSN: C-Client IP='${ip_address}' (type: ${typeof ip_address}), C-Client Port='${port}' (type: ${typeof port})`);
                console.log(`[API] Bind request: user_id=${user_id}, user_name=${user_name}, request_type=${request_type}`);
                console.log(`[API] Raw request body:`, req.body);
                console.log(`[API] ===== END RECEIVED FROM NSN =====`);

                // Validate required parameters
                if (!domain_id || !user_id || !user_name || (request_type === undefined || request_type === null)) {
                    console.log(`[API] ❌ Missing required parameters`);
                    return res.status(400).json({
                        success: false,
                        error: 'Missing required parameters: domain_id, user_id, user_name, request_type'
                    });
                }

                console.log(`[API] ✅ Valid bind request received:`, {
                    domain_id,
                    user_id,
                    user_name,
                    node_id,
                    request_type,
                    auto_refresh,
                    cookie: cookie ? 'provided' : 'not provided',
                    account: account ? 'provided' : 'not provided',
                    password: password ? 'provided' : 'not provided',
                    ip_address: ip_address || 'not provided',
                    port: port || 'not provided'
                });

                // Process request based on request_type
                console.log(`[API] 🔄 Processing request type: ${request_type}`);
                const result = await this.processRequest(request_type, {
                    domain_id,
                    user_id,
                    user_name,
                    node_id,
                    auto_refresh,
                    cookie,
                    account,
                    password,
                    ip_address,
                    port
                });

                console.log(`[API] 📋 Process result:`, result);

                const response = {
                    success: result.success,
                    data: result
                };

                console.log(`[API] 📤 Sending response:`, response);
                res.json(response);

            } catch (error) {
                console.error('[API] Error processing bind request:', error);
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // Get user cookies endpoint
        this.app.get('/cookies/:user_id', async (req, res) => {
            try {
                const { user_id } = req.params;
                const { username } = req.query;

                if (!user_id) {
                    return res.status(400).json({
                        success: false,
                        error: 'user_id is required'
                    });
                }

                const BClientUserManager = require('../userManager/bClientUserManager');
                const userManager = new BClientUserManager();

                let cookies;
                if (username) {
                    const cookie = userManager.getUserCookie(user_id, username);
                    cookies = cookie ? [cookie] : [];
                } else {
                    cookies = userManager.getAllUserCookies(user_id);
                }

                res.json({
                    success: true,
                    user_id,
                    cookies
                });

            } catch (error) {
                console.error('[API] Error getting user cookies:', error);
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // Debug endpoint to get all cookies in database
        this.app.get('/api/debug/all-cookies', (req, res) => {
            try {
                const BClientUserManager = require('../userManager/bClientUserManager');
                const userManager = new BClientUserManager();

                // Get all cookies without filtering
                const allCookies = userManager.getAllUserCookies();

                console.log(`[API] Debug - All cookies in database: ${allCookies.length}`);
                allCookies.forEach((cookie, index) => {
                    console.log(`[API]   Cookie ${index + 1}: user_id="${cookie.user_id}", username=${cookie.username}, domain_id=${cookie.domain_id}`);
                });

                res.json({
                    success: true,
                    total_cookies: allCookies.length,
                    cookies: allCookies
                });

            } catch (error) {
                console.error('[API] Error getting all cookies:', error);
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // Get user accounts endpoint
        this.app.get('/accounts/:user_id', async (req, res) => {
            try {
                const { user_id } = req.params;
                const { username, website } = req.query;

                if (!user_id) {
                    return res.status(400).json({
                        success: false,
                        error: 'user_id is required'
                    });
                }

                const BClientUserManager = require('../userManager/bClientUserManager');
                const userManager = new BClientUserManager();

                let accounts;
                if (username && website) {
                    accounts = userManager.getUserAccountsByWebsite(user_id, username, website);
                } else {
                    accounts = userManager.getAllUserAccounts(user_id);
                }

                res.json({
                    success: true,
                    user_id,
                    accounts
                });

            } catch (error) {
                console.error('[API] Error getting user accounts:', error);
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // Auto-login endpoint for C-Client
        this.app.get('/api/auto-login/:user_id', async (req, res) => {
            try {
                const { user_id } = req.params;
                const { username } = req.query;

                console.log(`[API] Auto-login request for user_id: ${user_id}, username: ${username}`);

                if (!user_id) {
                    return res.status(400).json({
                        success: false,
                        error: 'user_id is required'
                    });
                }

                const BClientUserManager = require('../userManager/bClientUserManager');
                const userManager = new BClientUserManager();

                let cookie = null;
                if (username) {
                    // Query specific user cookie
                    cookie = userManager.getUserCookie(user_id, username);
                } else {
                    // Query all cookies for user_id and get the most recent one
                    const allCookies = userManager.getAllUserCookies(user_id);
                    if (allCookies && allCookies.length > 0) {
                        // Sort by create_time descending and get the most recent
                        cookie = allCookies.sort((a, b) => new Date(b.create_time) - new Date(a.create_time))[0];
                    }
                }

                if (cookie) {
                    console.log(`[API] Found cookie for user_id: ${user_id}, username: ${cookie.username}`);
                    res.json({
                        success: true,
                        user_id,
                        username: cookie.username,
                        cookie: cookie.cookie,
                        auto_refresh: cookie.auto_refresh,
                        refresh_time: cookie.refresh_time,
                        create_time: cookie.create_time,
                        message: 'User has valid cookie'
                    });
                } else {
                    console.log(`[API] No cookie found for user_id: ${user_id}`);
                    res.json({
                        success: false,
                        user_id,
                        message: 'No cookie found for user'
                    });
                }

            } catch (error) {
                console.error('[API] Error in auto-login:', error);
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // Query user cookie by user_id for NSN auto-login
        this.app.post('/api/query-cookie', async (req, res) => {
            try {
                const { user_id, c_client_api_port, c_client_ip_address } = req.body;

                console.log(`[API] ===== RECEIVED C-CLIENT INFO FROM NSN =====`);
                console.log(`[API] Received from NSN: C-Client IP='${c_client_ip_address}' (type: ${typeof c_client_ip_address}), C-Client Port='${c_client_api_port}' (type: ${typeof c_client_api_port})`);
                console.log(`[API] Querying for user_id=${user_id}`);
                console.log(`[API] Raw request body:`, req.body);

                // CRITICAL FIX: Store C-Client IP/Port info for later use in auto-registration
                if (c_client_ip_address && c_client_api_port) {
                    this.cClientInfoCache.set(user_id, {
                        ip: c_client_ip_address,
                        port: c_client_api_port,
                        timestamp: Date.now()
                    });
                    console.log(`[API] ===== STORED C-CLIENT INFO FOR LATER USE =====`);
                    console.log(`[API] Stored for user ${user_id}: IP=${c_client_ip_address}, Port=${c_client_api_port}`);
                    console.log(`[API] Cache size after storing: ${this.cClientInfoCache.size}`);
                    console.log(`[API] Cache keys after storing:`, Array.from(this.cClientInfoCache.keys()));
                    console.log(`[API] ===== END STORED C-CLIENT INFO =====`);
                } else {
                    console.log(`[API] ===== NOT STORING C-CLIENT INFO =====`);
                    console.log(`[API] c_client_ip_address: '${c_client_ip_address}' (${typeof c_client_ip_address})`);
                    console.log(`[API] c_client_api_port: '${c_client_api_port}' (${typeof c_client_api_port})`);
                    console.log(`[API] ===== END NOT STORING =====`);
                }

                console.log(`[API] ===== END RECEIVED FROM NSN =====`);

                console.log(`[API] Query cookie request: user_id=${user_id}, c_client_api_port=${c_client_api_port}`);

                if (!user_id) {
                    return res.status(400).json({
                        success: false,
                        error: 'Missing required parameter: user_id'
                    });
                }

                const BClientUserManager = require('../userManager/bClientUserManager');
                const userManager = new BClientUserManager();

                // Query user cookies - get the most recent one for this user
                console.log(`[API] Debug - Querying cookies for user_id: "${user_id}" (type: ${typeof user_id})`);
                const cookies = userManager.getAllUserCookies(user_id);
                console.log(`[API] Found ${cookies.length} cookies for user ${user_id}`);

                // Debug: Log all cookies found for this user
                if (cookies.length > 0) {
                    console.log(`[API] Debug - All cookies for user ${user_id}:`);
                    cookies.forEach((cookie, index) => {
                        console.log(`[API]   Cookie ${index + 1}: user_id="${cookie.user_id}" (type: ${typeof cookie.user_id}), username=${cookie.username}`);
                    });
                } else {
                    console.log(`[API] Debug - No cookies found for user_id: "${user_id}"`);
                }

                if (cookies.length > 0) {
                    // Find the most recent cookie that matches the requested user_id
                    const matchingCookies = cookies.filter(cookie => cookie.user_id === user_id);

                    if (matchingCookies.length === 0) {
                        console.log(`[API] ❌ No matching cookies found for user_id: "${user_id}"`);
                        console.log(`[API] Available cookies:`);
                        cookies.forEach((cookie, index) => {
                            console.log(`[API]   Cookie ${index + 1}: user_id="${cookie.user_id}", username=${cookie.username}`);
                        });
                        return res.json({
                            success: true,
                            has_cookie: false,
                            message: 'No cookie found for this user'
                        });
                    }

                    // Get the most recent matching cookie
                    const targetCookie = matchingCookies.sort((a, b) =>
                        new Date(b.create_time) - new Date(a.create_time)
                    )[0];

                    console.log(`[API] ✅ Found matching cookie for user ${user_id}: username=${targetCookie.username}, cookie=${targetCookie.cookie.substring(0, 50)}...`);

                    // Check if cookie is in old format and needs to be updated
                    let cookieToSend = targetCookie.cookie;
                    let sessionData = null;

                    try {
                        // Try to parse as JSON to check if it's already in new format
                        const parsedCookie = JSON.parse(targetCookie.cookie);
                        if (parsedCookie.nsn_session_data) {
                            console.log(`[API] Cookie is already in new JSON format`);
                            sessionData = parsedCookie;
                        } else {
                            console.log(`[API] Cookie is JSON but not in expected format`);
                        }
                    } catch (error) {
                        console.log(`[API] Cookie is in old format, need to update to new format`);

                        // This is an old format cookie, we can't update it without NSN session info
                        // Just use the original cookie as-is
                        console.log(`[API] Old format cookie found, using as-is: ${targetCookie.username}`);
                    }

                    // Send cookie directly to C-Client API instead of returning to NSN
                    console.log(`[API] ===== SENDING SESSION TO C-CLIENT =====`);
                    console.log(`[API] Sending to C-Client: IP=${c_client_ip_address}, Port=${c_client_api_port}`);
                    console.log(`[API] For user: ${targetCookie.username} (ID: ${user_id})`);
                    console.log(`[API] ===== END SENDING TO C-CLIENT =====`);

                    console.log(`[API] Sending cookie directly to C-Client for user: ${targetCookie.username} (${user_id})`);
                    const sendResult = await this.sendCookieToCClient(user_id, targetCookie.username, cookieToSend, c_client_api_port, sessionData, c_client_ip_address);

                    if (sendResult) {
                        console.log(`[API] Successfully sent cookie to C-Client, C-Client will handle login`);
                        return res.json({
                            success: true,
                            has_cookie: true,
                            message: 'Cookie sent to C-Client, C-Client will handle login',
                            username: targetCookie.username
                        });
                    } else {
                        console.log(`[API] Failed to send cookie to C-Client, returning updated session data to NSN as fallback`);
                        // Even in fallback, return the updated session data instead of old cookie
                        return res.json({
                            success: true,
                            has_cookie: true,
                            cookie: cookieToSend, // Use the updated cookie format
                            domain_id: targetCookie.domain_id,
                            username: targetCookie.username,
                            auto_refresh: targetCookie.auto_refresh
                        });
                    }
                }

                console.log(`[API] No cookie found for user ${user_id}, checking user_accounts for login credentials...`);

                // Try to get account credentials from user_accounts table
                const userAccounts = userManager.getAllUserAccounts(user_id);
                console.log(`[API] Found ${userAccounts.length} user accounts for user ${user_id}`);

                if (userAccounts.length > 0) {
                    // Use the most recent account for login
                    const latestAccount = userAccounts.sort((a, b) =>
                        new Date(b.create_time) - new Date(a.create_time)
                    )[0];

                    console.log(`[API] Attempting login with account: ${latestAccount.username} on domain: ${latestAccount.website}`);

                    try {
                        // Attempt to login with the account credentials
                        const loginResult = await this.performNSNLogin(
                            latestAccount.username,
                            latestAccount.password,
                            latestAccount.website,
                            user_id,
                            c_client_api_port,
                            c_client_ip_address
                        );

                        if (loginResult.success) {
                            console.log(`[API] Successfully logged in and obtained new session for user: ${latestAccount.username}`);

                            // Send the new session to C-Client
                            const sendResult = await this.sendCookieToCClient(
                                user_id,
                                latestAccount.username,
                                loginResult.cookie,
                                c_client_api_port,
                                loginResult.sessionData,
                                c_client_ip_address
                            );

                            if (sendResult) {
                                console.log(`[API] Successfully sent new session to C-Client`);
                                return res.json({
                                    success: true,
                                    has_cookie: true,
                                    message: 'Cookie sent to C-Client, C-Client will handle login',
                                    username: latestAccount.username
                                });
                            } else {
                                console.log(`[API] Failed to send new session to C-Client, returning session data to NSN as fallback`);
                                return res.json({
                                    success: true,
                                    has_cookie: true,
                                    cookie: loginResult.cookie,
                                    domain_id: latestAccount.website,
                                    username: latestAccount.username,
                                    auto_refresh: true
                                });
                            }
                        } else {
                            console.log(`[API] Login failed for account: ${latestAccount.username}, error: ${loginResult.error}`);
                        }
                    } catch (error) {
                        console.error(`[API] Error during login attempt:`, error);
                    }
                }

                console.log(`[API] No valid account credentials found for user ${user_id}`);
                return res.json({
                    success: true,
                    has_cookie: false,
                    message: 'No cookie found for this user'
                });

            } catch (error) {
                console.error('[API] Error querying cookie:', error);
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // B-Client only handles cookie management and website interactions
        // No node management or domain forwarding functionality

        // 404 handler
        this.app.use('*', (req, res) => {
            res.status(404).json({
                success: false,
                error: 'Endpoint not found'
            });
        });

        // Error handler
        this.app.use((error, req, res, next) => {
            console.error('[API] Unhandled error:', error);
            res.status(500).json({
                success: false,
                error: 'Internal server error'
            });
        });
    }

    /**
     * Query NSN for user information by username
     */
    async queryNSNUserInfo(domain_id, username) {
        try {
            const websiteDomain = this.getCurrentEnvironmentDomain();
            const nsnUrl = `http://${websiteDomain}/api/user-info`;

            console.log(`[API] Querying NSN for user info: ${username} at ${nsnUrl}`);

            const response = await axios.post(nsnUrl, {
                username: username
            }, {
                timeout: 10000,
                headers: {
                    'Content-Type': 'application/json',
                    'User-Agent': 'B-Client/1.0'
                }
            });

            if (response.status === 200 && response.data.success) {
                console.log(`[API] Successfully queried NSN user info for ${username}:`, response.data);
                return {
                    user_id: response.data.user_id,
                    role: response.data.role,
                    username: response.data.username
                };
            } else {
                console.log(`[API] NSN query failed for ${username}:`, response.data);
                return { user_id: null, role: null, username: username };
            }
        } catch (error) {
            console.error(`[API] Error querying NSN for user ${username}:`, error.message);
            return { user_id: null, role: null, username: username };
        }
    }


    async notifyCClientLogout(user_id, username, cClientIpAddress = null, cClientPort = null) {
        try {
            console.log(`[API] Notifying C-Client logout for user: ${username} (${user_id})`);

            if (!cClientIpAddress || !cClientPort) {
                console.log(`[API] No C-Client IP address and port provided, cannot notify logout`);
                return false;
            }

            const axios = require('axios');
            const url = `http://${cClientIpAddress}:${cClientPort}/api/logout`;
            console.log(`[API] Notifying C-Client logout at: ${url}`);

            try {
                const response = await axios.post(url, {
                    user_id: user_id,
                    username: username,
                    action: 'logout'
                }, {
                    timeout: 5000,
                    headers: {
                        'Content-Type': 'application/json',
                        'User-Agent': 'B-Client/1.0'
                    }
                });

                if (response.status === 200 && response.data.success) {
                    console.log(`[API] Successfully notified C-Client logout`);
                    return true;
                } else {
                    console.log(`[API] C-Client logout notification failed: ${response.data.error}`);
                    return false;
                }
            } catch (error) {
                console.error(`[API] Failed to notify C-Client logout:`, error.message);
                return false;
            }
        } catch (error) {
            console.error(`[API] Error notifying C-Client logout:`, error);
            return false;
        }
    }

    async sendCookieToCClient(user_id, username, cookie, cClientApiPort = null, sessionData = null, cClientIpAddress = null) {
        try {
            console.log(`[API] ===== SENDCOOKIETOCLIENT METHOD START =====`);
            console.log(`[API] Target C-Client: IP='${cClientIpAddress}' (type: ${typeof cClientIpAddress}), Port='${cClientApiPort}' (type: ${typeof cClientApiPort})`);
            console.log(`[API] For user: ${username} (ID: ${user_id})`);
            console.log(`[API] Parameters: user_id='${user_id}', username='${username}', cClientApiPort='${cClientApiPort}', cClientIpAddress='${cClientIpAddress}'`);
            console.log(`[API] ===== END SENDCOOKIETOCLIENT START =====`);

            console.log(`[API] Sending cookie to C-Client API for user: ${username} (${user_id})`);
            const axios = require('axios');

            // Parse the stored session data
            let parsedSessionData = sessionData;
            if (!parsedSessionData) {
                try {
                    parsedSessionData = JSON.parse(cookie);
                    console.log(`[API] Parsed complete session data for user ${username}:`, {
                        has_nsn_data: !!parsedSessionData.nsn_session_data,
                        nsn_user_id: parsedSessionData.nsn_user_id,
                        nsn_username: parsedSessionData.nsn_username,
                        nsn_role: parsedSessionData.nsn_role
                    });
                } catch (error) {
                    console.log(`[API] Cookie is not JSON format, treating as raw cookie: ${cookie.substring(0, 50)}...`);
                    // CRITICAL FIX: If we have a cookie, assume user is logged in
                    // The cookie exists means the user was previously authenticated
                    parsedSessionData = { nsn_session_data: { loggedin: true } };
                    console.log(`[API] CRITICAL FIX: Setting loggedin=true for old format cookie (user was previously authenticated)`);
                }
            } else {
                console.log(`[API] Using provided session data for user ${username}:`, {
                    has_nsn_data: !!parsedSessionData.nsn_session_data,
                    nsn_user_id: parsedSessionData.nsn_user_id,
                    nsn_username: parsedSessionData.nsn_username,
                    nsn_role: parsedSessionData.nsn_role,
                    timestamp: parsedSessionData.timestamp
                });
            }

            // Use the complete session data for C-Client
            const sessionDataToSend = parsedSessionData;
            console.log(`[API] Using session data for C-Client (includes NSN user info for session):`, {
                has_nsn_data: !!sessionDataToSend.nsn_session_data,
                nsn_user_id: sessionDataToSend.nsn_user_id,
                nsn_username: sessionDataToSend.nsn_username,
                nsn_role: sessionDataToSend.nsn_role,
                timestamp: sessionDataToSend.timestamp
            });

            // Determine C-Client API endpoint
            let cClientApiUrl = null;

            if (cClientIpAddress && cClientApiPort) {
                // Use provided IP address and port from NSN
                cClientApiUrl = `http://${cClientIpAddress}:${cClientApiPort}`;
                console.log(`[API] Using C-Client API from NSN parameters: ${cClientApiUrl}`);
            } else if (cClientApiPort) {
                // Use localhost with specified port (fallback for local testing)
                cClientApiUrl = `http://localhost:${cClientApiPort}`;
                console.log(`[API] Using C-Client API with specified port (localhost): ${cClientApiUrl}`);
            } else {
                // No C-Client address/port provided, cannot proceed
                console.log(`[API] Error: No C-Client address/port provided, cannot send session data`);
                return false;
            }

            // Get NSN URL and port from configuration
            const apiConfig = require('../config/apiConfig');
            const currentDomain = apiConfig.getCurrentEnvironmentDomain();
            const nsnConfig = apiConfig.targetWebsites[currentDomain];

            // Extract NSN URL and port information
            let nsnUrl = null;
            let nsnPort = null;
            if (nsnConfig) {
                // Extract port from domain (e.g., "localhost:5000" -> 5000)
                const domainParts = nsnConfig.domain.split(':');
                nsnPort = domainParts.length > 1 ? parseInt(domainParts[1]) : null;

                // Use homeUrl as the base URL, or construct from domain
                nsnUrl = nsnConfig.homeUrl || `${nsnConfig.domain.includes('localhost') || nsnConfig.domain.includes('127.0.0.1') ? 'http' : 'https'}://${nsnConfig.domain}`;
            }

            console.log(`[API] ===== NSN CONFIGURATION FOR C-CLIENT =====`);
            console.log(`[API] NSN configuration:`, {
                domain: currentDomain,
                nsnUrl: nsnUrl,
                nsnPort: nsnPort
            });
            console.log(`[API] Will send NSN info to C-Client: NSN URL=${nsnUrl}, NSN Port=${nsnPort}`);
            console.log(`[API] ===== END NSN CONFIGURATION =====`);

            // Send to specific C-Client endpoint
            try {
                console.log(`[API] Sending session to C-Client at: ${cClientApiUrl}`);
                console.log(`[API] ===== SENDING PAYLOAD TO C-CLIENT =====`);
                console.log(`[API] Payload includes: NSN URL=${nsnUrl}, NSN Port=${nsnPort}, NSN Domain=${currentDomain}`);

                const response = await axios.post(`${cClientApiUrl}/api/cookie`, {
                    user_id: user_id,
                    username: username,
                    complete_session_data: sessionDataToSend,
                    source: 'b-client',
                    nsn_url: nsnUrl,        // Add NSN URL
                    nsn_port: nsnPort,      // Add NSN port
                    nsn_domain: currentDomain  // Add NSN domain for reference
                }, {
                    headers: { 'Content-Type': 'application/json' },
                    timeout: 10000 // Increased timeout for network requests
                });

                if (response.data.success) {
                    console.log(`[API] ===== SUCCESSFULLY SENT TO C-CLIENT =====`);
                    console.log(`[API] Successfully sent cookie to C-Client API at ${cClientApiUrl}`);
                    console.log(`[API] Sent NSN info: URL=${nsnUrl}, Port=${nsnPort}, Domain=${currentDomain}`);
                    console.log(`[API] ===== END SUCCESS SEND =====`);
                    return true;
                } else {
                    console.log(`[API] C-Client API returned error: ${response.data.error}`);
                    return false;
                }
            } catch (error) {
                console.error(`[API] Failed to send cookie to C-Client API at ${cClientApiUrl}:`, error.message);
                return false;
            }

        } catch (error) {
            console.error(`[API] Error sending cookie to C-Client API:`, error.message);
            return false;
        }
    }

    async processRequest(request_type, params) {
        const { domain_id, user_id, user_name, node_id, auto_refresh, cookie, account, password, ip_address, port } = params;
        const BClientUserManager = require('../userManager/bClientUserManager');
        const userManager = new BClientUserManager();

        switch (request_type) {
            case 0:
            case 'auto_register':
                return await this.handleAutoRegister(userManager, user_id, user_name, domain_id, node_id, params);

            case 1:
            case 'bind_existing_user':
                return await this.handleBindExistingUser(userManager, user_id, user_name, domain_id, node_id, params, ip_address, port);

            case 2:
            case 'clear_user_cookies':
                return await this.handleClearUserCookies(userManager, user_id, user_name, ip_address, port);

            default:
                throw new Error(`Unknown request_type: ${request_type}. Supported types: 0 (auto_register), 1 (bind_existing_user), 2 (clear_user_cookies)`);
        }
    }

    async handleBindExistingUser(userManager, user_id, user_name, domain_id, node_id, params, ip_address, port) {
        try {
            console.log(`[API] ===== HANDLE BIND EXISTING USER - LOGIN WITH NMP =====`);
            console.log(`[API] Handling bind request for existing user: ${user_name} on domain: ${domain_id}`);
            console.log(`[API] ===== NMP PARAMETERS RECEIVED =====`);
            console.log(`[API] user_id: ${user_id}`);
            console.log(`[API] user_name: ${user_name}`);
            console.log(`[API] domain_id: ${domain_id}`);
            console.log(`[API] node_id: ${node_id}`);
            console.log(`[API] ip_address: '${ip_address}' (type: ${typeof ip_address})`);
            console.log(`[API] port: '${port}' (type: ${typeof port})`);
            console.log(`[API] ===== END NMP PARAMETERS RECEIVED =====`);

            const { account, password, auto_refresh } = params;
            console.log(`[API] auto_refresh: ${auto_refresh}`);
            console.log(`[API] account: '${account}' (type: ${typeof account})`);
            console.log(`[API] password: '${'*' * (password ? password.length : 0)}' (type: ${typeof password})`);

            // Check if login credentials are provided (empty string or null/undefined)
            if (!account || !password || account.trim() === '' || password.trim() === '') {
                console.log(`[API] No login credentials provided, checking user_accounts for existing data...`);

                // Query user_accounts table for existing account data
                const existingAccounts = userManager.getUserAccountsByWebsite(user_id, user_name, domain_id);
                console.log(`[API] Found ${existingAccounts.length} existing accounts for user ${user_id} on domain ${domain_id}`);

                if (existingAccounts.length > 0) {
                    // Use the most recent account data
                    const latestAccount = existingAccounts[0];
                    console.log(`[API] Using existing account data: ${latestAccount.account} for user ${user_name}`);

                    // Use existing credentials to login
                    const loginResult = await this.loginToTargetWebsite(domain_id, latestAccount.account, latestAccount.password, user_id, user_name, 'bind');

                    if (loginResult.success) {
                        // Use login result data directly
                        const sessionData = {
                            loggedin: true,
                            user_id: loginResult.userId,
                            username: latestAccount.account,
                            role: loginResult.userRole || 'traveller'
                        };

                        // Store the session data
                        let finalCookie = loginResult.sessionCookie || `existing_user_${user_name}_${Date.now()}`;
                        let refreshResult = null;

                        // If auto_refresh is enabled, try to refresh the newly obtained cookie
                        if (auto_refresh) {
                            console.log(`[API] Auto-refresh enabled, attempting to refresh newly obtained cookie for user: ${user_name}`);
                            refreshResult = await this.refreshCookieOnTargetWebsite(domain_id, finalCookie);

                            if (refreshResult.success) {
                                finalCookie = refreshResult.sessionCookie;
                                console.log(`[API] Newly obtained cookie refreshed successfully for user: ${user_name}`);
                            } else {
                                console.log(`[API] Newly obtained cookie refresh failed for user: ${user_name}, using original cookie`);
                            }
                        }

                        // Create session data object for storage
                        const completeSessionData = {
                            nsn_session_data: sessionData,
                            nsn_user_id: loginResult.userId,
                            nsn_username: latestAccount.account,
                            nsn_role: loginResult.userRole || 'traveller',
                            timestamp: Date.now()
                        };

                        console.log(`[API] ===== SESSION DATA CREATION ANALYSIS =====`);
                        console.log(`[API] Created session data for storage using existing account:`);
                        console.log(`[API]   completeSessionData structure:`, JSON.stringify(completeSessionData, null, 2));
                        console.log(`[API]   nsn_session_data:`, JSON.stringify(completeSessionData.nsn_session_data, null, 2));
                        console.log(`[API]   nsn_user_id: ${completeSessionData.nsn_user_id} (type: ${typeof completeSessionData.nsn_user_id})`);
                        console.log(`[API]   nsn_username: ${completeSessionData.nsn_username} (type: ${typeof completeSessionData.nsn_username})`);
                        console.log(`[API]   nsn_role: ${completeSessionData.nsn_role} (type: ${typeof completeSessionData.nsn_role})`);
                        console.log(`[API] ===== END SESSION DATA CREATION ANALYSIS =====`);

                        const refreshTime = new Date(Date.now() + apiConfig.default.cookieExpiryHours * 60 * 60 * 1000);
                        const jsonCookieData = JSON.stringify(completeSessionData);
                        console.log(`[API] Storing JSON cookie data (first 100 chars): ${jsonCookieData.substring(0, 100)}...`);

                        const cookieResult = userManager.addUserCookieWithTargetUsername(
                            user_id,
                            user_name,
                            latestAccount.account,
                            node_id,
                            jsonCookieData,
                            auto_refresh || false,
                            refreshTime.toISOString()
                        );

                        console.log(`[API] Cookie storage result:`, cookieResult ? 'success' : 'failed');

                        // Send complete session data to C-Client
                        console.log(`[API] ===== SENDING BIND RESULT TO C-CLIENT =====`);
                        console.log(`[API] Sending complete session data to C-Client for user: ${user_name}`);
                        console.log(`[API] ===== SESSION DATA TO SEND =====`);
                        console.log(`[API] Target C-Client: IP='${ip_address}' (type: ${typeof ip_address}), Port='${port}' (type: ${typeof port})`);
                        console.log(`[API] Session data structure:`, JSON.stringify(completeSessionData, null, 2));
                        console.log(`[API] nsn_session_data:`, JSON.stringify(completeSessionData.nsn_session_data, null, 2));
                        console.log(`[API] nsn_user_id: ${completeSessionData.nsn_user_id} (type: ${typeof completeSessionData.nsn_user_id})`);
                        console.log(`[API] nsn_username: ${completeSessionData.nsn_username} (type: ${typeof completeSessionData.nsn_username})`);
                        console.log(`[API] ===== END SESSION DATA TO SEND =====`);

                        const sendResult = await this.sendCookieToCClient(user_id, user_name, JSON.stringify(completeSessionData), port, completeSessionData, ip_address);

                        if (sendResult) {
                            console.log(`[API] Successfully sent complete session data to C-Client for user: ${user_name}`);
                            return {
                                action: 'bind_existing_user',
                                user_id,
                                user_name,
                                domain_id,
                                success: true,
                                method: 'login_with_existing_credentials',
                                login_success: true,
                                auto_refresh_enabled: auto_refresh || false,
                                refresh_attempted: auto_refresh || false,
                                refresh_success: refreshResult ? refreshResult.success : null,
                                refresh_error: refreshResult && !refreshResult.success ? refreshResult.error : null,
                                session_info: {
                                    complete_session_data: completeSessionData
                                },
                                stored_cookie: cookieResult ? 'success' : 'failed',
                                message: 'Successfully logged in using existing account data and sent complete session data to C-Client',
                                c_client_notified: true
                            };
                        } else {
                            console.log(`[API] Failed to send complete session data to C-Client for user: ${user_name}, returning session data to NSN as fallback`);
                            return {
                                action: 'bind_existing_user',
                                user_id,
                                user_name,
                                domain_id,
                                success: true,
                                method: 'login_with_existing_credentials',
                                login_success: true,
                                auto_refresh_enabled: auto_refresh || false,
                                refresh_attempted: auto_refresh || false,
                                refresh_success: refreshResult ? refreshResult.success : null,
                                refresh_error: refreshResult && !refreshResult.success ? refreshResult.error : null,
                                session_info: {
                                    complete_session_data: completeSessionData
                                },
                                stored_cookie: cookieResult ? 'success' : 'failed',
                                message: 'Successfully logged in using existing account data and stored session data (C-Client notification failed)',
                                c_client_notified: false
                            };
                        }
                    } else {
                        return {
                            action: 'bind_existing_user',
                            user_id,
                            user_name,
                            domain_id,
                            success: false,
                            method: 'login_with_existing_credentials',
                            login_success: false,
                            error: 'Invalid existing credentials',
                            message: 'The stored account credentials are no longer valid. Please enter your current NSN username and password.',
                            suggestion: 'Enter your current NSN account credentials in the login form and try again',
                            error_type: 'invalid_stored_credentials',
                            user_friendly: true,
                            details: loginResult.error
                        };
                    }
                } else {
                    // No existing account data found
                    return {
                        action: 'bind_existing_user',
                        user_id,
                        user_name,
                        domain_id,
                        success: false,
                        error: 'No account data found',
                        message: 'Please input your account or sign up with No More Password',
                        suggestion: 'Enter your NSN account credentials in the login form, or use the signup option to create a new account',
                        error_type: 'no_account_data',
                        user_friendly: true
                    };
                }
            }

            console.log(`[API] Attempting to login with provided credentials for user: ${user_name}`);

            // Use provided credentials to login and get fresh session cookie
            // Pass C-Client NMP parameters to ensure NSN session stores them correctly
            const loginResult = await this.loginToTargetWebsite(domain_id, account, password, user_id, user_name, 'bind');

            if (loginResult.success) {
                // Use login result data directly
                const sessionData = {
                    loggedin: true,
                    user_id: loginResult.userId,
                    username: account,
                    role: loginResult.userRole || 'traveller'
                };

                // Store the session data (no need to generate Flask cookie, C-Client will handle it)
                let finalCookie = loginResult.sessionCookie || `existing_user_${user_name}_${Date.now()}`;
                let refreshResult = null;

                // If auto_refresh is enabled, try to refresh the newly obtained cookie
                if (auto_refresh) {
                    console.log(`[API] Auto-refresh enabled, attempting to refresh newly obtained cookie for user: ${user_name}`);
                    refreshResult = await this.refreshCookieOnTargetWebsite(domain_id, finalCookie);

                    if (refreshResult.success) {
                        finalCookie = refreshResult.sessionCookie;
                        console.log(`[API] Newly obtained cookie refreshed successfully for user: ${user_name}`);
                    } else {
                        console.log(`[API] Newly obtained cookie refresh failed for user: ${user_name}, using original cookie`);
                    }
                }

                // Create session data object for storage (include NSN user info needed for session)
                const completeSessionData = {
                    nsn_session_data: sessionData,  // Session data
                    nsn_user_id: loginResult.userId,      // NSN user ID (needed for session)
                    nsn_username: account,                // NSN username (needed for session)
                    nsn_role: loginResult.userRole || 'traveller',  // NSN role (needed for session)
                    timestamp: Date.now()
                };

                console.log(`[API] Created session data for storage (includes NSN user info for session):`, {
                    has_nsn_data: !!completeSessionData.nsn_session_data,
                    nsn_user_id: completeSessionData.nsn_user_id,
                    nsn_username: completeSessionData.nsn_username,
                    nsn_role: completeSessionData.nsn_role,
                    timestamp: completeSessionData.timestamp
                });

                const refreshTime = new Date(Date.now() + apiConfig.default.cookieExpiryHours * 60 * 60 * 1000);
                const jsonCookieData = JSON.stringify(completeSessionData);
                console.log(`[API] Storing JSON cookie data (first 100 chars): ${jsonCookieData.substring(0, 100)}...`);

                const cookieResult = userManager.addUserCookieWithTargetUsername(
                    user_id,
                    user_name,
                    account, // Use the target website username
                    node_id, // node_id
                    jsonCookieData, // Store complete session data as JSON
                    auto_refresh || false, // auto_refresh
                    refreshTime.toISOString() // Convert Date to ISO string for SQLite
                );

                console.log(`[API] Cookie storage result:`, cookieResult ? 'success' : 'failed');

                // Send complete session data to C-Client (same as auto-register flow)
                console.log(`[API] Sending complete session data to C-Client for user: ${user_name}`);
                console.log(`[API] ===== SENDING SIGNUP RESULT TO C-CLIENT =====`);
                console.log(`[API] Sending to C-Client: IP=${ip_address}, Port=${port}`);
                console.log(`[API] Signup result for user: ${user_name} (ID: ${user_id})`);
                console.log(`[API] ===== END SENDING SIGNUP RESULT =====`);

                const sendResult = await this.sendCookieToCClient(user_id, user_name, JSON.stringify(completeSessionData), port, completeSessionData, ip_address);

                if (sendResult) {
                    console.log(`[API] Successfully sent complete session data to C-Client for user: ${user_name}`);
                    return {
                        action: 'bind_existing_user',
                        user_id,
                        user_name,
                        domain_id,
                        success: true,
                        method: 'login_with_credentials',
                        login_success: true,
                        auto_refresh_enabled: auto_refresh || false,
                        refresh_attempted: auto_refresh || false,
                        refresh_success: refreshResult ? refreshResult.success : null,
                        refresh_error: refreshResult && !refreshResult.success ? refreshResult.error : null,
                        session_info: {
                            complete_session_data: completeSessionData
                        },
                        stored_cookie: cookieResult ? 'success' : 'failed',
                        message: 'Successfully logged in and sent complete session data to C-Client',
                        c_client_notified: true
                    };
                } else {
                    console.log(`[API] Failed to send complete session data to C-Client for user: ${user_name}, returning session data to NSN as fallback`);
                    return {
                        action: 'bind_existing_user',
                        user_id,
                        user_name,
                        domain_id,
                        success: true,
                        method: 'login_with_credentials',
                        login_success: true,
                        auto_refresh_enabled: auto_refresh || false,
                        refresh_attempted: auto_refresh || false,
                        refresh_success: refreshResult ? refreshResult.success : null,
                        refresh_error: refreshResult && !refreshResult.success ? refreshResult.error : null,
                        session_info: {
                            complete_session_data: completeSessionData
                        },
                        stored_cookie: cookieResult ? 'success' : 'failed',
                        message: 'Successfully logged in and stored session data (C-Client notification failed)',
                        c_client_notified: false
                    };
                }
            } else {
                return {
                    action: 'bind_existing_user',
                    user_id,
                    user_name,
                    domain_id,
                    success: false,
                    method: 'login_with_credentials',
                    login_success: false,
                    error: 'Invalid login credentials',
                    message: 'The username or password you entered is incorrect. Please check your credentials and try again.',
                    suggestion: 'Make sure you are using the correct NSN account username and password',
                    error_type: 'invalid_credentials',
                    user_friendly: true,
                    details: loginResult.error
                };
            }

        } catch (error) {
            console.error(`[API] Error handling bind existing user:`, error);
            return {
                action: 'bind_existing_user',
                user_id,
                user_name,
                domain_id,
                success: false,
                error: 'Bind request failed',
                message: 'An unexpected error occurred while trying to bind your account. Please try again.',
                suggestion: 'If the problem persists, please contact support',
                error_type: 'system_error',
                user_friendly: true,
                details: error.message
            };
        }
    }

    async handleClearUserCookies(userManager, user_id, user_name, ip_address, port) {
        try {
            console.log(`[API] Clearing cookies for user: ${user_name} (ID: ${user_id})`);
            console.log(`[API] C-Client IP: ${ip_address}, Port: ${port}`);

            // Get all cookies for this user before clearing
            const existingCookies = userManager.getAllUserCookies(user_id);
            const cookieCount = existingCookies ? existingCookies.length : 0;

            // Clear all cookies for this user
            const clearResult = userManager.deleteAllUserCookies(user_id);

            // Notify C-Client to clear session
            let cClientNotified = false;
            try {
                console.log(`[API] Notifying C-Client to clear session for user: ${user_name}`);
                const cClientResult = await this.notifyCClientLogout(user_id, user_name, ip_address, port);
                cClientNotified = cClientResult;
                console.log(`[API] C-Client logout notification result: ${cClientNotified}`);
            } catch (error) {
                console.error(`[API] Failed to notify C-Client logout: ${error.message}`);
            }

            if (clearResult) {
                return {
                    action: 'clear_user_cookies',
                    user_id,
                    user_name,
                    success: true,
                    cleared_count: cookieCount,
                    c_client_notified: cClientNotified,
                    message: `Successfully cleared ${cookieCount} cookies for user ${user_name}`
                };
            } else {
                return {
                    action: 'clear_user_cookies',
                    user_id,
                    user_name,
                    success: false,
                    error: 'Failed to clear cookies for user',
                    cleared_count: 0,
                    c_client_notified: cClientNotified
                };
            }

        } catch (error) {
            console.error(`[API] Error clearing user cookies:`, error);
            return {
                action: 'clear_user_cookies',
                user_id,
                user_name,
                success: false,
                error: error.message,
                cleared_count: 0
            };
        }
    }

    async handleAutoRegister(userManager, user_id, user_name, domain_id, node_id, params) {
        try {
            console.log(`[API] Starting auto-registration for C-Client user: ${user_name} on domain: ${domain_id}`);

            // Store C-Client IP and Port for later use (don't pass to NSN)
            // CRITICAL FIX: Get IP and Port from the most recent query-cookie request
            // If not available in params, try to get from recent query-cookie data
            let cClientIpAddress = params.ip_address;
            let cClientPort = params.port;

            // If IP/Port are empty/undefined, try to get from recent query-cookie data
            if (!cClientIpAddress || !cClientPort) {
                console.log(`[API] ===== ATTEMPTING TO GET IP/PORT FROM QUERY-COOKIE DATA =====`);
                console.log(`[API] Original values: cClientIpAddress='${cClientIpAddress}' (${typeof cClientIpAddress}), cClientPort='${cClientPort}' (${typeof cClientPort})`);
                console.log(`[API] Cache size: ${this.cClientInfoCache.size}`);
                console.log(`[API] Cache keys:`, Array.from(this.cClientInfoCache.keys()));
                console.log(`[API] Looking for user_id: '${user_id}'`);

                // Try to get from the most recent query-cookie request for this user
                const cachedInfo = this.cClientInfoCache.get(user_id);
                console.log(`[API] Cached info for user ${user_id}:`, cachedInfo);

                if (cachedInfo) {
                    const ageMinutes = (Date.now() - cachedInfo.timestamp) / (1000 * 60);
                    console.log(`[API] Cache age: ${ageMinutes.toFixed(1)} minutes`);
                    if (ageMinutes < 5) { // Use cached info if less than 5 minutes old
                        cClientIpAddress = cClientIpAddress || cachedInfo.ip;
                        cClientPort = cClientPort || cachedInfo.port;
                        console.log(`[API] Retrieved C-Client info from cache: IP=${cClientIpAddress}, Port=${cClientPort} (age: ${ageMinutes.toFixed(1)} minutes)`);
                    } else {
                        console.log(`[API] Cached C-Client info is too old (${ageMinutes.toFixed(1)} minutes), ignoring`);
                        this.cClientInfoCache.delete(user_id); // Clean up old cache
                    }
                } else {
                    console.log(`[API] No cached C-Client info found for user ${user_id}`);
                }
                console.log(`[API] ===== END ATTEMPTING TO GET IP/PORT =====`);
            }

            console.log(`[API] ===== STORING C-CLIENT INFO FOR LATER USE =====`);
            console.log(`[API] C-Client IP: '${cClientIpAddress}' (type: ${typeof cClientIpAddress}, length: ${cClientIpAddress ? cClientIpAddress.length : 0})`);
            console.log(`[API] C-Client Port: '${cClientPort}' (type: ${typeof cClientPort}, length: ${cClientPort ? cClientPort.length : 0})`);
            console.log(`[API] Full params object:`, params);
            console.log(`[API] Will use this info to send session data after registration`);
            console.log(`[API] ===== END STORING C-CLIENT INFO =====`);

            // Check if user already has an account for this domain
            const existingAccounts = userManager.getUserAccountsByWebsite(user_id, user_name, domain_id);
            if (existingAccounts && existingAccounts.length > 0) {
                const existingAccount = existingAccounts[0]; // Use the most recent account
                console.log(`[API] C-Client user ${user_name} already has an account for domain ${domain_id}, attempting login...`);

                // Try to login with existing credentials to get fresh cookie
                // Pass C-Client NMP parameters to ensure NSN session stores them correctly
                const loginResult = await this.loginToTargetWebsite(domain_id, existingAccount.username, existingAccount.password, user_id, user_name, 'signup');

                // Query NSN to get complete session information
                console.log(`[API] Querying NSN for session info: ${existingAccount.username}`);
                const nsnSessionInfo = await this.queryNSNSessionInfo(domain_id, existingAccount.username);

                // Use NSN's session data if available, otherwise fallback to login result
                const sessionData = nsnSessionInfo.session_data || {
                    loggedin: true,
                    user_id: loginResult.userId,
                    username: existingAccount.username,
                    role: loginResult.userRole || 'traveller'
                };

                // Create complete session data for storage
                const completeSessionData = {
                    nsn_session_data: sessionData,
                    nsn_user_id: nsnSessionInfo.user_id || loginResult.userId,
                    nsn_username: nsnSessionInfo.username || existingAccount.username,
                    nsn_role: nsnSessionInfo.role || loginResult.userRole || 'traveller',
                    timestamp: Date.now()
                };

                // Store the complete session data in database
                let cookieResult = null;
                if (loginResult.success) {
                    console.log(`[API] Login successful with existing account, updating cookie for C-Client user: ${user_name}`);
                    const refreshTime = new Date(Date.now() + apiConfig.default.cookieExpiryHours * 60 * 60 * 1000);
                    cookieResult = userManager.addUserCookieWithTargetUsername(
                        user_id, // Use C-Client user_id as key
                        user_name, // C-Client username
                        existingAccount.username, // Store NSN username for later lookup
                        node_id,
                        JSON.stringify(completeSessionData), // Store complete session data as JSON
                        true, // auto_refresh
                        refreshTime.toISOString()
                    );
                } else {
                    console.log(`[API] Login failed with existing account for user: ${user_name}`);
                }

                return {
                    registration_success: true,
                    login_success: loginResult.success,
                    session_info: {
                        complete_session_data: completeSessionData
                    },
                    account: existingAccount,
                    message: loginResult.success ? 'Account exists and login successful' : 'Account exists but login failed',
                    // Keep original fields for debugging
                    action: 'auto_register',
                    user_id,
                    user_name,
                    domain_id,
                    success: true,
                    cookie_stored: cookieResult !== null
                };
            }

            // Generate registration data based on user information
            const registrationData = this.generateRegistrationData(user_name, params);

            // Attempt to register on the target website (with C-Client IP/Port for NSN to pass back to B-Client)
            const nmp_params = {
                nmp_user_id: user_id,
                nmp_username: user_name,
                nmp_client_type: 'c-client',
                nmp_timestamp: Date.now().toString(),
                nmp_ip_address: cClientIpAddress || '',  // Pass C-Client IP to NSN
                nmp_port: cClientPort || ''              // Pass C-Client Port to NSN
            };
            console.log(`[API] ===== REGISTRATION WITH C-CLIENT IP/PORT =====`);
            console.log(`[API] Registering on NSN with C-Client IP/Port for NSN to pass back to B-Client`);
            console.log(`[API] NMP params for NSN:`, nmp_params);
            console.log(`[API] C-Client info stored separately: IP=${cClientIpAddress}, Port=${cClientPort}`);
            console.log(`[API] ===== END REGISTRATION DEBUG =====`);
            const registrationResult = await this.registerOnTargetWebsite(domain_id, registrationData, nmp_params);

            if (registrationResult.success) {
                console.log(`[API] Registration successful, storing account info for user: ${registrationData.username}`);

                // Store the account information in our database with all fields
                const accountResult = userManager.addUserAccountWithDetails(
                    user_id,
                    user_name,
                    node_id, // node_id
                    domain_id,
                    registrationData.username,
                    registrationData.password,
                    registrationData.email,
                    registrationData.first_name,
                    registrationData.last_name,
                    registrationData.location,
                    'auto',
                    true
                );

                console.log(`[API] Account stored successfully for C-Client user: ${user_name}`);

                // Wait for database transaction to commit before attempting login
                console.log(`[API] Waiting 5 seconds for database transaction to commit...`);
                await new Promise(resolve => setTimeout(resolve, 3000));

                // After successful registration, store cookie and send registration info to C-Client for auto-login
                console.log(`[API] Registration successful, storing cookie and sending registration info to C-Client for auto-login`);

                // Store cookie for auto-login using NEW FORMAT (complete session data)
                // Store with C-Client UUID as user_id for querying (avoiding NSN int user_id)
                const refreshTime = new Date(Date.now() + apiConfig.default.cookieExpiryHours * 60 * 60 * 1000);
                const jsonCookieData = JSON.stringify(sessionData);
                console.log(`[API] CRITICAL FIX: Storing NEW FORMAT cookie data (complete session data): ${jsonCookieData.substring(0, 100)}...`);

                const cookieResult = userManager.addUserCookieWithTargetUsername(
                    user_id,           // C-Client UUID (use this for querying, not NSN int user_id)
                    user_name,         // C-Client username
                    registrationData.username,  // NSN username (target username)
                    node_id,           // node ID
                    jsonCookieData,    // Store complete session data as JSON (NEW FORMAT)
                    true,              // auto_refresh
                    refreshTime.toISOString() // refresh time
                );
                console.log(`[API] Cookie storage result:`, {
                    success: cookieResult !== null,
                    cookie_id: cookieResult ? cookieResult.id : null
                });

                // Create registration info for C-Client
                const registrationInfo = {
                    registration_success: true,
                    nsn_username: registrationData.username,
                    nsn_password: registrationData.password,
                    nsn_email: registrationData.email,
                    nsn_first_name: registrationData.first_name,
                    nsn_last_name: registrationData.last_name,
                    nsn_location: registrationData.location,
                    timestamp: Date.now()
                };

                // Send registration info to C-Client API
                try {
                    console.log(`[API] Sending registration info to C-Client API for user: ${user_name}`);
                    const axios = require('axios');

                    console.log(`[API] ===== B-CLIENT SENDING REGISTRATION INFO =====`);
                    console.log(`[API] Created registration info for C-Client:`, {
                        registration_success: registrationInfo.registration_success,
                        nsn_username: registrationInfo.nsn_username,
                        nsn_email: registrationInfo.nsn_email
                    });

                    // Send registration info directly to C-Client API
                    console.log(`[API] Attempting to send registration info to C-Client API...`);

                    // Use stored C-Client IP and port (from bind request, not from NSN)
                    if (cClientIpAddress && cClientPort) {
                        console.log(`[API] ===== SENDING SESSION DATA TO C-CLIENT =====`);
                        console.log(`[API] Using stored C-Client info: IP='${cClientIpAddress}' (type: ${typeof cClientIpAddress}), Port='${cClientPort}' (type: ${typeof cClientPort})`);
                        console.log(`[API] C-Client API URL will be: http://${cClientIpAddress}:${cClientPort}/api/cookie`);
                        console.log(`[API] ===== END SENDING SESSION DATA =====`);

                        // Use the extracted NSN user_id from registration response
                        const nsn_user_id = registrationResult.nsn_user_id;
                        if (!nsn_user_id) {
                            console.log(`[API] ❌ CRITICAL ERROR: No NSN user_id extracted from registration response`);
                            console.log(`[API] ❌ B-Client cannot proceed without valid NSN user_id`);
                        } else {
                            console.log(`[API] ✅ Successfully extracted NSN user_id: ${nsn_user_id} (type: ${typeof nsn_user_id})`);
                        }

                        // Create session data for C-Client (proper nested structure)
                        // CRITICAL: Only use the real NSN user_id (integer), never fallback to username
                        if (!nsn_user_id) {
                            console.log(`[API] ❌ ERROR: No NSN user_id available, cannot create session data`);
                            console.log(`[API] ❌ B-Client should never use username as user_id - this is invalid`);
                            throw new Error(`No NSN user_id available for session creation`);
                        }

                        const nsnSessionData = {
                            loggedin: true,
                            user_id: nsn_user_id, // Use ONLY the real NSN user_id (integer)
                            username: registrationData.username,
                            role: 'traveller' // Default role
                        };

                        const sessionData = {
                            nsn_session_data: nsnSessionData,
                            nsn_user_id: nsn_user_id,        // Add NSN user_id for C-Client
                            nsn_username: registrationData.username,  // Add NSN username for C-Client
                            nsn_role: 'traveller',           // Add NSN role for C-Client
                            nmp_user_id: user_id,
                            nmp_username: user_name,
                            nmp_client_type: 'c-client',
                            nmp_timestamp: Date.now().toString(),
                            nmp_node_id: node_id,
                            nmp_domain_id: domain_id,
                            nmp_cluster_id: null,
                            nmp_channel_id: null,
                            nmp_ip_address: cClientIpAddress,  // Use stored C-Client IP
                            nmp_port: cClientPort,             // Use stored C-Client Port
                            timestamp: Date.now()              // Add timestamp for C-Client
                        };

                        // Log session data before sending to C-Client
                        console.log(`[API] ===== B-CLIENT SENDING SESSION DATA TO C-CLIENT =====`);
                        console.log(`[API] B-Client constructed session data for C-Client:`);
                        console.log(`[API]   sessionData structure:`, JSON.stringify(sessionData, null, 2));
                        console.log(`[API]   sessionData.nsn_session_data:`, JSON.stringify(sessionData.nsn_session_data, null, 2));
                        console.log(`[API]   sessionData.nsn_session_data.loggedin:`, sessionData.nsn_session_data.loggedin);
                        console.log(`[API]   sessionData.nsn_session_data.user_id:`, sessionData.nsn_session_data.user_id);
                        console.log(`[API]   sessionData.nsn_session_data.username:`, sessionData.nsn_session_data.username);
                        console.log(`[API]   sessionData.nsn_session_data.role:`, sessionData.nsn_session_data.role);
                        console.log(`[API]   sessionData.nmp_user_id:`, sessionData.nmp_user_id);
                        console.log(`[API]   sessionData.nmp_username:`, sessionData.nmp_username);

                        console.log(`[API] ===== B-CLIENT SESSION DATA FORMAT ANALYSIS =====`);
                        console.log(`[API] B-Client is sending to C-Client:`);
                        console.log(`[API]   Format: Complete session data object`);
                        console.log(`[API]   Structure: { nsn_session_data: {...}, nmp_*: ... }`);
                        console.log(`[API]   NSN Session Data:`);
                        console.log(`[API]     - loggedin: ${sessionData.nsn_session_data.loggedin} (type: ${typeof sessionData.nsn_session_data.loggedin})`);
                        console.log(`[API]     - user_id: ${sessionData.nsn_session_data.user_id} (type: ${typeof sessionData.nsn_session_data.user_id})`);
                        console.log(`[API]     - username: ${sessionData.nsn_session_data.username} (type: ${typeof sessionData.nsn_session_data.username})`);
                        console.log(`[API]     - role: ${sessionData.nsn_session_data.role} (type: ${typeof sessionData.nsn_session_data.role})`);
                        console.log(`[API]   NMP Session Data:`);
                        console.log(`[API]     - nmp_user_id: ${sessionData.nmp_user_id} (type: ${typeof sessionData.nmp_user_id})`);
                        console.log(`[API]     - nmp_username: ${sessionData.nmp_username} (type: ${typeof sessionData.nmp_username})`);
                        console.log(`[API]     - nmp_ip_address: ${sessionData.nmp_ip_address} (type: ${typeof sessionData.nmp_ip_address})`);
                        console.log(`[API]     - nmp_port: ${sessionData.nmp_port} (type: ${typeof sessionData.nmp_port})`);
                        console.log(`[API] ===== END B-CLIENT SESSION DATA FORMAT ANALYSIS =====`);

                        console.log(`[API] ===== END B-CLIENT SESSION DATA =====`);

                        // Send session data to C-Client using stored IP and Port
                        const sendResult = await this.sendCookieToCClient(
                            user_id,
                            user_name,
                            JSON.stringify(sessionData),
                            cClientPort,      // Use stored C-Client Port
                            sessionData,
                            cClientIpAddress  // Use stored C-Client IP
                        );

                        if (sendResult) {
                            console.log(`[API] Successfully sent registration info to C-Client for user: ${user_name}`);
                        } else {
                            console.log(`[API] Failed to send registration info to C-Client for user: ${user_name}`);
                        }
                    } else {
                        console.log(`[API] No C-Client IP/Port available, registration info will be sent via URL injection when C-Client accesses NSN`);
                    }
                } catch (error) {
                    console.error(`[API] Error sending registration info to C-Client API:`, error.message);
                    // Don't fail the registration if C-Client API is not available
                }

                return {
                    registration_success: true,
                    login_success: false, // C-Client will handle login via URL injection
                    session_info: {
                        registration_info: registrationInfo
                    },
                    account: {
                        username: registrationData.username,
                        password: registrationData.password,
                        email: registrationData.email,
                        first_name: registrationData.first_name,
                        last_name: registrationData.last_name,
                        location: registrationData.location
                    },
                    message: 'Registration successful, C-Client will handle auto-login via URL injection',
                    // Keep original fields for debugging
                    action: 'auto_register',
                    user_id,
                    user_name,
                    domain_id,
                    success: true,
                    account_stored: accountResult !== null,
                    cookie_stored: cookieResult !== null, // Cookie stored for auto-login
                    target_website_response: registrationResult.response ?
                        (registrationResult.response.length > 50 ?
                            registrationResult.response.substring(0, 50) + '...' :
                            registrationResult.response) : 'No response',
                    login_response: 'C-Client will handle login via URL injection'
                };
            } else {
                console.log(`[API] Registration failed for C-Client user: ${user_name}`);
                return {
                    registration_success: false,
                    login_success: false,
                    session_info: {
                        complete_session_data: null
                    },
                    error: registrationResult.error,
                    message: 'Registration failed',
                    // Keep original fields for debugging
                    action: 'auto_register',
                    user_id,
                    user_name,
                    domain_id,
                    success: false,
                    account: null,
                    target_website_response: registrationResult.response
                };
            }

        } catch (error) {
            console.error(`[API] Auto-registration failed for user ${user_name}:`, error);
            return {
                registration_success: false,
                login_success: false,
                session_info: {
                    complete_session_data: null
                },
                error: error.message,
                message: 'Auto-registration failed',
                // Keep original fields for debugging
                action: 'auto_register',
                user_id,
                user_name,
                domain_id
            };
        }
    }

    generateRegistrationData(user_name, params) {
        // Generate registration data based on user_name and additional params
        const timestamp = Date.now();

        // Clean user_name to meet NSN requirements (only letters and numbers, max 20 chars)
        let cleanUserName = user_name.replace(/[^A-Za-z0-9]/g, '');

        // Ensure username is not too long (NSN limit is 20 characters)
        if (cleanUserName.length > 15) { // Leave room for timestamp
            cleanUserName = cleanUserName.substring(0, 15);
        }

        // Generate unique username with timestamp and random suffix (ensure it's under 20 chars)
        const timestampStr = timestamp.toString().slice(-6); // Use last 6 digits of timestamp for more uniqueness
        const randomSuffix = Math.random().toString(36).substr(2, 4); // 4 random chars for more uniqueness
        const username = `${cleanUserName}${timestampStr}${randomSuffix}`;

        // Ensure username doesn't exceed 20 characters
        const finalUsername = username.length > 20 ? username.substring(0, 20) : username;

        // Generate email (NSN allows up to 320 chars)
        const email = `${user_name}@nomorepassword.local`;

        // Generate password that meets NSN requirements
        const password = this.generateSecurePassword();

        // Extract additional parameters if provided
        const first_name = params.first_name || user_name.split('-')[0] || 'User';
        const last_name = params.last_name || user_name.split('-')[1] || 'Name';
        const location = params.location || 'Unknown';

        console.log(`[API] Generated registration data: username=${finalUsername} (${finalUsername.length} chars), email=${email}, first_name=${first_name}, last_name=${last_name}`);
        console.log(`[API] Password preview: ${password.substring(0, 3)}*** (${password.length} chars)`);

        return {
            username: finalUsername,
            email,
            password,
            confirm_password: password,
            first_name,
            last_name,
            location
        };
    }

    generateSecurePassword() {
        // Generate a secure password that meets the website's requirements:
        // At least 8 characters, including uppercase, lowercase, number, and special character
        const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
        const lowercase = 'abcdefghijklmnopqrstuvwxyz';
        const numbers = '0123456789';
        const special = '@#$%^&+=!';

        let password = '';

        // Ensure at least one character from each required set
        password += uppercase[Math.floor(Math.random() * uppercase.length)];
        password += lowercase[Math.floor(Math.random() * lowercase.length)];
        password += numbers[Math.floor(Math.random() * numbers.length)];
        password += special[Math.floor(Math.random() * special.length)];

        // Fill the rest with random characters
        const allChars = uppercase + lowercase + numbers + special;
        for (let i = 4; i < 12; i++) {
            password += allChars[Math.floor(Math.random() * allChars.length)];
        }

        // Shuffle the password
        return password.split('').sort(() => Math.random() - 0.5).join('');
    }

    async registerOnTargetWebsite(domain_id, registrationData, nmp_params = {}) {
        try {
            // Get target website configuration
            const websiteConfig = this.getWebsiteConfig(domain_id);
            if (!websiteConfig) {
                throw new Error(`Unsupported domain for auto-registration: ${domain_id}`);
            }

            const targetUrl = websiteConfig.signupUrl;

            console.log(`[API] Attempting registration on: ${targetUrl}`);

            // Prepare form data
            const formData = {
                username: registrationData.username,
                email: registrationData.email,
                password: registrationData.password,
                confirm_password: registrationData.confirm_password,
                first_name: registrationData.first_name,
                last_name: registrationData.last_name,
                location: registrationData.location
            };

            // Add NMP parameters if available
            if (nmp_params.nmp_user_id && nmp_params.nmp_username) {
                formData.nmp_user_id = nmp_params.nmp_user_id;
                formData.nmp_username = nmp_params.nmp_username;
                formData.nmp_client_type = nmp_params.nmp_client_type || 'c-client';
                formData.nmp_timestamp = nmp_params.nmp_timestamp || Date.now().toString();
                formData.nmp_ip_address = nmp_params.nmp_ip_address || '';
                formData.nmp_port = nmp_params.nmp_port || '';
                console.log(`[API] ===== NMP PARAMETERS DEBUG =====`);
                console.log(`[API] Adding NMP parameters to registration form:`);
                console.log(`[API]   user_id=${nmp_params.nmp_user_id}`);
                console.log(`[API]   username=${nmp_params.nmp_username}`);
                console.log(`[API]   ip_address=${nmp_params.nmp_ip_address} (type: ${typeof nmp_params.nmp_ip_address})`);
                console.log(`[API]   port=${nmp_params.nmp_port} (type: ${typeof nmp_params.nmp_port})`);
                console.log(`[API] ===== END NMP PARAMETERS DEBUG =====`);
            }

            console.log(`[API] Registration form data:`, {
                username: formData.username,
                email: formData.email,
                password: `${formData.password.substring(0, 3)}***`,
                confirm_password: `${formData.confirm_password.substring(0, 3)}***`,
                first_name: formData.first_name,
                last_name: formData.last_name,
                location: formData.location
            });

            // Make HTTP POST request to the target website
            // For NSN, we need to include NMP parameters in the URL as well as form data
            let requestUrl = targetUrl;
            if (nmp_params.nmp_user_id && nmp_params.nmp_username) {
                // Add NMP parameters to URL for NSN to access via request.args
                const urlParams = new URLSearchParams({
                    nmp_user_id: nmp_params.nmp_user_id,
                    nmp_username: nmp_params.nmp_username,
                    nmp_client_type: nmp_params.nmp_client_type || 'c-client',
                    nmp_timestamp: nmp_params.nmp_timestamp || Date.now().toString(),
                    nmp_ip_address: nmp_params.nmp_ip_address || '',
                    nmp_port: nmp_params.nmp_port || ''
                });
                requestUrl = `${targetUrl}?${urlParams.toString()}`;
                console.log(`[API] ===== URL PARAMETERS DEBUG =====`);
                console.log(`[API] Adding NMP parameters to URL for NSN access:`);
                console.log(`[API]   Base URL: ${targetUrl}`);
                console.log(`[API]   URL params: ${urlParams.toString()}`);
                console.log(`[API]   Final URL: ${requestUrl}`);
                console.log(`[API]   nmp_params object:`, nmp_params);
                console.log(`[API]   formData object:`, formData);
                console.log(`[API] ===== END URL PARAMETERS DEBUG =====`);
            }

            const response = await this.makeHttpRequest(requestUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'User-Agent': apiConfig.default.userAgent
                },
                body: new URLSearchParams(formData)
            });

            // Check if this is a JSON response (from B-Client auto-registration)
            let nsn_user_id = null;
            let isSuccess = false;

            console.log(`[API] ===== RESPONSE ANALYSIS =====`);
            console.log(`[API] Response status: ${response.status}`);
            console.log(`[API] Response body length: ${response.body.length}`);
            console.log(`[API] Response body preview: ${response.body.substring(0, 200)}...`);
            console.log(`[API] Response headers:`, response.headers);
            console.log(`[API] ===== END RESPONSE ANALYSIS =====`);

            try {
                const jsonResponse = JSON.parse(response.body);
                console.log(`[API] ✅ Successfully parsed JSON response:`, jsonResponse);
                if (jsonResponse.success && jsonResponse.user_id) {
                    isSuccess = true;
                    nsn_user_id = parseInt(jsonResponse.user_id);
                    console.log(`[API] ✅ Received JSON response from NSN: user_id=${nsn_user_id}, username=${jsonResponse.username}`);
                } else {
                    console.log(`[API] ❌ JSON response indicates failure:`, jsonResponse);
                }
            } catch (e) {
                // Not JSON response, fall back to HTML parsing
                console.log(`[API] Response is not JSON, parsing as HTML...`);

                // Check if registration was successful based on HTTP status code
                // NSN registration success is indicated by:
                // 1. 200 status code (successful HTTP response)
                // 2. Look for success indicators in response body
                const hasSuccessIndicator = response.body.includes('signup_successful') ||
                    response.body.includes('Registration Successful') ||
                    response.body.includes('Your account has been created successfully') ||
                    response.body.includes('User ID:') ||
                    response.body.includes('new_user_id');

                // Use HTTP status code as primary indicator, with success content as secondary
                isSuccess = response.status === 200 && hasSuccessIndicator;

                console.log(`[API] Registration check: status=${response.status}, isSuccess=${isSuccess}, hasSuccessIndicator=${hasSuccessIndicator}`);

                // Extract NSN user_id from HTML response if registration was successful
                if (isSuccess) {
                    // Try to extract new_user_id from response body
                    // Look for patterns like: User ID: 123 or "new_user_id": 123
                    const user_id_match = response.body.match(/User ID:\s*(\d+)|new_user_id['":\s]*(\d+)/);
                    if (user_id_match) {
                        nsn_user_id = parseInt(user_id_match[1] || user_id_match[2]);
                        console.log(`[API] ✅ Extracted NSN user_id from HTML response: ${nsn_user_id}`);
                    } else {
                        console.log(`[API] ⚠️ Could not extract NSN user_id from HTML response`);
                        console.log(`[API] Response body preview: ${response.body.substring(0, 500)}...`);

                        // Debug: Show more context around potential user_id patterns
                        const user_id_context = response.body.match(/User ID[^<]*<[^>]*>([^<]+)<|new_user_id[^>]*>([^<]+)</i);
                        if (user_id_context) {
                            console.log(`[API] Found potential user_id context: ${user_id_context[0]}`);
                        }
                    }
                }
            }

            // Debug: Check which specific success indicators are found
            if (!isSuccess) {
                console.log(`[API] Debug success detection:`);
                console.log(`[API] - signup_successful: ${response.body.includes('signup_successful')}`);
                console.log(`[API] - Registration Successful: ${response.body.includes('Registration Successful')}`);
                console.log(`[API] - Your account has been created successfully: ${response.body.includes('Your account has been created successfully')}`);
                console.log(`[API] - User ID:: ${response.body.includes('User ID:')}`);
                console.log(`[API] - new_user_id: ${response.body.includes('new_user_id')}`);

                // Debug: Show response body preview for troubleshooting
                console.log(`[API] Registration failed - response body preview:`);
                const bodyPreview = response.body.substring(0, 500);
                console.log(`[API] ${bodyPreview}${response.body.length > 500 ? '...' : ''}`);
            }

            return {
                success: isSuccess,
                status: response.status,
                response: isSuccess ? 'Registration successful' : 'Registration failed - see logs for details',
                error: isSuccess ? null : 'Registration failed on target website',
                nsn_user_id: nsn_user_id // Include extracted NSN user_id
            };

        } catch (error) {
            console.error(`[API] HTTP request failed:`, error);
            return {
                success: false,
                error: error.message,
                response: null
            };
        }
    }

    async loginToTargetWebsite(domain_id, username, password, c_client_user_id = null, c_client_username = null, bind_type = 'signup') {
        try {
            // Get target website configuration
            const websiteConfig = this.getWebsiteConfig(domain_id);
            if (!websiteConfig) {
                throw new Error(`Unsupported domain for auto-login: ${domain_id}`);
            }

            console.log(`[API] Attempting login via NSN login API for user: ${username}`);
            if (c_client_user_id) {
                console.log(`[API] C-Client context: user_id=${c_client_user_id}, username=${c_client_username}`);
            }

            // Use NSN's login API to authenticate and get session cookie
            const loginUrl = websiteConfig.loginUrl;

            // Prepare login data
            const loginData = {
                username: username,
                password: password
            };

            // Add C-Client parameters if available
            if (c_client_user_id && c_client_username) {
                loginData.nmp_bind = 'true';
                loginData.nmp_bind_type = bind_type; // Use provided bind_type (signup or bind)
                loginData.nmp_auto_refresh = 'true';
                loginData.nmp_user_id = c_client_user_id;
                loginData.nmp_username = c_client_username;
                loginData.nmp_client_type = 'c-client';
                loginData.nmp_timestamp = Date.now().toString();
                console.log(`[API] Adding C-Client parameters to login request with bind_type: ${bind_type}`);
            }

            const response = await this.makeHttpRequest(loginUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'User-Agent': apiConfig.default.userAgent
                },
                body: new URLSearchParams(loginData)
            });

            console.log(`[API] NSN login response status: ${response.status}`);

            // Extract session cookie from response headers first
            let sessionCookie = null;
            if (response.headers['set-cookie']) {
                const cookies = response.headers['set-cookie'];
                sessionCookie = cookies.join('; ');
                console.log(`[API] Session cookie extracted: ${sessionCookie}`);
            }

            // NSN login success is indicated by 302 redirect to dashboard or 200 with session cookie
            const isSuccess = response.status === 302 || (response.status === 200 && sessionCookie);

            if (isSuccess) {
                console.log(`[API] Login successful, processing session cookie...`);

                // Parse Flask session cookie to extract user information
                let userRole = null;
                let userId = null;

                if (sessionCookie) {
                    try {
                        console.log(`[API] Parsing Flask session cookie to extract user data...`);

                        // Extract session value from cookie
                        const sessionMatch = sessionCookie.match(/session=([^;]+)/);
                        if (sessionMatch) {
                            const sessionValue = sessionMatch[1];
                            console.log(`[API] Session cookie value: ${sessionValue}`);

                            // Flask session cookie format: .data.timestamp.signature
                            const parts = sessionValue.split('.');
                            console.log(`[API] Session parts: ${parts.length}`);

                            if (parts.length >= 2) {
                                // The data part is the second part (index 1)
                                const dataPart = parts[1];
                                console.log(`[API] Data part: ${dataPart}`);

                                // For Flask compressed sessions, we need to use a different approach
                                // Since we can't easily decompress Python pickle data in Node.js,
                                // we'll call NSN's current-user API to get the user info
                                console.log(`[API] Calling NSN current-user API to get user info...`);

                                const currentUserUrl = `${websiteConfig.homeUrl}api/current-user`;
                                const currentUserResponse = await this.makeHttpRequest(currentUserUrl, {
                                    method: 'GET',
                                    headers: {
                                        'Cookie': sessionCookie,
                                        'User-Agent': apiConfig.default.userAgent
                                    }
                                });

                                if (currentUserResponse.status === 200) {
                                    const userData = JSON.parse(currentUserResponse.body);
                                    console.log(`[API] Current user response:`, userData);

                                    if (userData.success) {
                                        userId = userData.user_id;
                                        userRole = userData.role;
                                        console.log(`[API] Extracted from current-user API - user_id: ${userId}, role: ${userRole}`);
                                    } else {
                                        console.log(`[API] Current-user API failed: ${userData.error}`);
                                    }
                                } else {
                                    console.log(`[API] Current-user API returned status: ${currentUserResponse.status}`);
                                }
                            }
                        }
                    } catch (error) {
                        console.log(`[API] Failed to parse Flask session cookie: ${error.message}`);
                    }
                }

                return {
                    success: true,
                    status: response.status,
                    response: response.body,
                    sessionCookie: sessionCookie,
                    userRole: userRole,
                    userId: userId,
                    error: null
                };
            } else {
                console.log(`[API] Login failed with status: ${response.status}`);
                return {
                    success: false,
                    status: response.status,
                    response: response.body,
                    error: 'Login failed on target website'
                };
            }

        } catch (error) {
            console.error(`[API] HTTP login request failed:`, error);
            return {
                success: false,
                error: error.message,
                response: null,
                sessionCookie: null,
                userRole: null,
                userId: null
            };
        }
    }

    getWebsiteConfig(domain_id) {
        // Try exact match first
        if (apiConfig.targetWebsites[domain_id]) {
            return apiConfig.targetWebsites[domain_id];
        }

        // Try partial match for domains that might have subdomains
        for (const [key, config] of Object.entries(apiConfig.targetWebsites)) {
            if (domain_id.includes(key) || key.includes(domain_id)) {
                return config;
            }
        }

        return null;
    }

    getCurrentEnvironmentDomain() {
        // Use the environment configuration from apiConfig
        const domain = apiConfig.getCurrentEnvironmentDomain();
        console.log(`[API] Using environment: ${apiConfig.currentEnvironment}, domain: ${domain}`);
        return domain;
    }

    async refreshCookieOnTargetWebsite(domain_id, sessionCookie) {
        try {
            // B-Client should only handle complete session data from NSN
            // No need to refresh Flask cookies - just query NSN for updated session info
            let sessionData = null;

            try {
                const parsedCookie = JSON.parse(sessionCookie);
                if (parsedCookie.nsn_session_data) {
                    sessionData = parsedCookie;
                    console.log(`[API] Extracted complete session data from JSON format`);
                } else {
                    console.log(`[API] Cookie is JSON but not in expected complete session format`);
                    return {
                        success: false,
                        method: 'invalid_format',
                        error: 'Cookie is not in complete session data format',
                        response: null,
                        sessionCookie: sessionCookie
                    };
                }
            } catch (error) {
                console.log(`[API] Cookie is not JSON format, cannot refresh`);
                return {
                    success: false,
                    method: 'invalid_format',
                    error: 'Cookie is not in JSON format',
                    response: null,
                    sessionCookie: sessionCookie
                };
            }

            // For auto-refresh, we don't need to query NSN since we already have the session data
            // Just return the existing session data as it's still valid
            console.log(`[API] B-Client auto-refresh: Using existing session data`);

            return {
                success: true,
                method: 'existing_session',
                status: 200,
                response: 'Using existing session data',
                sessionCookie: sessionCookie,
                error: null
            };

        } catch (error) {
            console.error(`[API] Cookie refresh process failed:`, error);
            return {
                success: false,
                method: 'error',
                error: error.message,
                response: null,
                sessionCookie: sessionCookie // Return original cookie
            };
        }
    }

    // Auto-refresh scheduler - runs every 30 minutes
    startAutoRefreshScheduler() {
        if (this.autoRefreshInterval) {
            console.log('[API] Auto-refresh scheduler is already running');
            return;
        }

        const intervalMinutes = apiConfig.default.autoRefreshIntervalMinutes;
        console.log(`[API] Starting auto-refresh scheduler (every ${intervalMinutes} minutes)`);

        // Run immediately on start
        this.performAutoRefresh();

        // Then run every configured interval (minutes * 60 * 1000 milliseconds)
        this.autoRefreshInterval = setInterval(() => {
            this.performAutoRefresh();
        }, intervalMinutes * 60 * 1000);
    }

    stopAutoRefreshScheduler() {
        if (this.autoRefreshInterval) {
            console.log('[API] Stopping auto-refresh scheduler');
            clearInterval(this.autoRefreshInterval);
            this.autoRefreshInterval = null;
        }
    }

    async performAutoRefresh() {
        try {
            console.log('[API] Starting auto-refresh process...');

            const BClientUserManager = require('../userManager/bClientUserManager');
            const userManager = new BClientUserManager();

            // Get all user cookies that need auto-refresh
            const autoRefreshCookies = userManager.getAutoRefreshCookies();

            if (autoRefreshCookies.length === 0) {
                console.log('[API] No cookies found that need auto-refresh');
                return;
            }

            console.log(`[API] Found ${autoRefreshCookies.length} cookies that need auto-refresh`);

            let successCount = 0;
            let failCount = 0;

            for (const cookieRecord of autoRefreshCookies) {
                try {
                    console.log(`[API] Auto-refreshing cookie for user: ${cookieRecord.username}`);

                    if (!cookieRecord.cookie) {
                        console.log(`[API] No cookie found for user: ${cookieRecord.username}, skipping`);
                        failCount++;
                        continue;
                    }

                    // Attempt to refresh the cookie by accessing NSN website
                    // Use the same environment logic as the dashboard
                    const websiteDomain = this.getCurrentEnvironmentDomain();
                    const refreshResult = await this.refreshCookieOnTargetWebsite(websiteDomain, cookieRecord.cookie);

                    if (refreshResult.success) {
                        // For auto-refresh, we don't need to query NSN since we already have the session data
                        // Just use the existing session data
                        console.log(`[API] Using existing session data for auto-refresh: ${cookieRecord.username}`);

                        // Parse existing session data
                        let existingSessionData = null;
                        try {
                            existingSessionData = JSON.parse(cookieRecord.cookie);
                        } catch (error) {
                            console.log(`[API] Cookie is not JSON format, cannot refresh`);
                            continue;
                        }

                        // Create updated complete session data with new timestamp
                        const completeSessionData = {
                            ...existingSessionData,
                            timestamp: Date.now()
                        };

                        console.log(`[API] Created updated session data for auto-refresh:`, {
                            has_nsn_data: !!completeSessionData.nsn_session_data,
                            nsn_user_id: completeSessionData.nsn_user_id,
                            nsn_username: completeSessionData.nsn_username,
                            nsn_role: completeSessionData.nsn_role
                        });

                        // Update the cookie in database with complete session data
                        const refreshTime = new Date(Date.now() + apiConfig.default.cookieExpiryHours * 60 * 60 * 1000);
                        const updateResult = userManager.updateUserCookie(
                            cookieRecord.user_id,
                            cookieRecord.username,
                            cookieRecord.node_id,
                            JSON.stringify(completeSessionData), // Store complete session data as JSON
                            true, // auto_refresh
                            refreshTime.toISOString() // Convert Date to ISO string for SQLite
                        );

                        if (updateResult) {
                            console.log(`[API] Successfully refreshed cookie and session data for user: ${cookieRecord.username}`);
                            successCount++;
                        } else {
                            console.log(`[API] Failed to update cookie in database for user: ${cookieRecord.username}`);
                            failCount++;
                        }
                    } else {
                        console.log(`[API] Failed to refresh cookie for user: ${cookieRecord.username}: ${refreshResult.error}`);
                        console.log(`[API] Refresh details: method=${refreshResult.method}, status=${refreshResult.status}`);
                        failCount++;
                    }

                } catch (error) {
                    console.error(`[API] Error auto-refreshing cookie for user: ${cookieRecord.username}:`, error);
                    failCount++;
                }
            }

            console.log(`[API] Auto-refresh completed: ${successCount} successful, ${failCount} failed`);

        } catch (error) {
            console.error('[API] Auto-refresh process failed:', error);
        }
    }

    getDashboardStats() {
        try {
            const BClientUserManager = require('../userManager/bClientUserManager');
            const userManager = new BClientUserManager();

            // Get auto-refresh users count
            const autoRefreshCookies = userManager.getAutoRefreshCookies();
            const autoRefreshUsers = autoRefreshCookies.length;

            // Get auto-registered users count (users with auto_generated = 1)
            const allAccounts = userManager.getAllUserAccountsForStats();
            const autoRegisteredUsers = allAccounts.filter(account => account.auto_generated === 1).length;

            // Get total cookies count
            const allCookies = userManager.getAllUserCookies();
            const totalCookies = allCookies.length;

            return {
                autoRefreshUsers,
                autoRegisteredUsers,
                totalCookies,
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            console.error('[API] Error calculating dashboard stats:', error);
            throw error;
        }
    }

    async getWebsiteTitle(domain) {
        try {
            // Check cache first
            const cacheKey = domain;
            const cached = this.websiteTitleCache.get(cacheKey);
            if (cached && (Date.now() - cached.timestamp) < this.titleCacheExpiry) {
                console.log(`[API] Using cached website title for ${domain}: "${cached.title}"`);
                return cached.title;
            }

            const websiteConfig = this.getWebsiteConfig(domain);
            if (!websiteConfig) {
                throw new Error(`Website configuration not found for domain: ${domain}`);
            }

            console.log(`[API] Fetching website title from: ${websiteConfig.homeUrl}`);

            // Fetch the website homepage to get the title
            const response = await this.makeHttpRequest(websiteConfig.homeUrl, {
                method: 'GET',
                headers: {
                    'User-Agent': apiConfig.default.userAgent
                }
            });

            let title = websiteConfig.name; // Default fallback

            if (response.status === 200 && response.body) {
                // Extract title from HTML
                const titleMatch = response.body.match(/<title[^>]*>([^<]+)<\/title>/i);
                if (titleMatch && titleMatch[1]) {
                    title = titleMatch[1].trim();
                    console.log(`[API] Successfully fetched website title: "${title}"`);
                } else {
                    console.log(`[API] Failed to extract title, using configured name: "${title}"`);
                }
            } else {
                console.log(`[API] Failed to fetch page, using configured name: "${title}"`);
            }

            // Cache the result
            this.websiteTitleCache.set(cacheKey, {
                title: title,
                timestamp: Date.now()
            });

            return title;

        } catch (error) {
            console.error(`[API] Error fetching website title for ${domain}:`, error);
            // Fallback to configured name
            const websiteConfig = this.getWebsiteConfig(domain);
            const fallbackTitle = websiteConfig ? websiteConfig.name : 'Unknown Website';

            // Cache the fallback result
            this.websiteTitleCache.set(domain, {
                title: fallbackTitle,
                timestamp: Date.now()
            });

            return fallbackTitle;
        }
    }

    async getWebsiteImages(domain) {
        try {
            // Check cache first
            const cacheKey = domain;
            const cached = this.websiteImageCache.get(cacheKey);
            if (cached && (Date.now() - cached.timestamp) < this.imageCacheExpiry) {
                console.log(`[API] Using cached website images for ${domain}`);
                return cached.images;
            }

            const websiteConfig = this.getWebsiteConfig(domain);
            if (!websiteConfig) {
                throw new Error(`Website configuration not found for domain: ${domain}`);
            }

            console.log(`[API] Fetching website images from: ${websiteConfig.homeUrl}`);

            // Fetch the website homepage to get images
            const response = await this.makeHttpRequest(websiteConfig.homeUrl, {
                method: 'GET',
                headers: {
                    'User-Agent': apiConfig.default.userAgent
                }
            });

            const images = {
                favicon: null,
                ogImage: null,
                logo: null
            };

            if (response.status === 200 && response.body) {
                // Extract favicon
                const faviconMatch = response.body.match(/<link[^>]*rel=["'](?:icon|shortcut icon)["'][^>]*href=["']([^"']+)["']/i);
                if (faviconMatch && faviconMatch[1]) {
                    images.favicon = this.resolveUrl(websiteConfig.homeUrl, faviconMatch[1]);
                }

                // Extract Open Graph image
                const ogImageMatch = response.body.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i);
                if (ogImageMatch && ogImageMatch[1]) {
                    images.ogImage = this.resolveUrl(websiteConfig.homeUrl, ogImageMatch[1]);
                }

                // Extract logo (common patterns)
                const logoMatch = response.body.match(/<img[^>]*(?:class|id)=["'][^"']*(?:logo|brand)[^"']*["'][^>]*src=["']([^"']+)["']/i);
                if (logoMatch && logoMatch[1]) {
                    images.logo = this.resolveUrl(websiteConfig.homeUrl, logoMatch[1]);
                }

                console.log(`[API] Successfully extracted website images:`, images);
            }

            // Cache the result
            this.websiteImageCache.set(cacheKey, {
                images: images,
                timestamp: Date.now()
            });

            return images;

        } catch (error) {
            console.error(`[API] Error fetching website images for ${domain}:`, error);
            // Return empty images object
            return {
                favicon: null,
                ogImage: null,
                logo: null
            };
        }
    }

    resolveUrl(baseUrl, relativeUrl) {
        try {
            if (relativeUrl.startsWith('http://') || relativeUrl.startsWith('https://')) {
                return relativeUrl;
            }

            const base = new URL(baseUrl);
            if (relativeUrl.startsWith('//')) {
                return base.protocol + relativeUrl;
            }

            if (relativeUrl.startsWith('/')) {
                return base.origin + relativeUrl;
            }

            return base.origin + '/' + relativeUrl;
        } catch (error) {
            console.error('[API] Error resolving URL:', error);
            return relativeUrl;
        }
    }

    async makeHttpRequest(url, options) {
        // Use Node.js built-in https module for HTTP requests
        const https = require('https');
        const http = require('http');
        const { URL } = require('url');

        return new Promise((resolve, reject) => {
            const makeRequest = (requestUrl, redirectCount = 0, requestOptions = options) => {
                const urlObj = new URL(requestUrl);
                const isHttps = urlObj.protocol === 'https:';
                const client = isHttps ? https : http;

                const httpOptions = {
                    hostname: urlObj.hostname,
                    port: urlObj.port || (isHttps ? 443 : 80),
                    path: urlObj.pathname + urlObj.search,
                    method: requestOptions.method || 'GET',
                    headers: requestOptions.headers || {},
                    timeout: apiConfig.default.requestTimeout
                };

                const req = client.request(httpOptions, (res) => {
                    let data = '';

                    res.on('data', (chunk) => {
                        data += chunk;
                    });

                    res.on('end', () => {
                        // Handle redirects (302, 301, etc.)
                        if ((res.statusCode === 302 || res.statusCode === 301) && res.headers.location && redirectCount < 5) {
                            const redirectUrl = res.headers.location;
                            console.log(`[API] Following redirect ${res.statusCode} to: ${redirectUrl}`);

                            // If it's a relative URL, make it absolute
                            const absoluteRedirectUrl = redirectUrl.startsWith('http') ?
                                redirectUrl :
                                `${urlObj.protocol}//${urlObj.host}${redirectUrl}`;

                            // Collect cookies from the response
                            let cookies = [];
                            if (res.headers['set-cookie']) {
                                cookies = res.headers['set-cookie'];
                                console.log(`[API] Received cookies during redirect: ${cookies.join('; ')}`);
                            }

                            // Store cookies for later retrieval
                            if (!requestOptions.collectedCookies) {
                                requestOptions.collectedCookies = [];
                            }
                            requestOptions.collectedCookies = requestOptions.collectedCookies.concat(cookies);

                            // For POST requests that result in redirects, we should follow with GET
                            // This is standard HTTP behavior - POST redirects are followed with GET
                            const redirectOptions = {
                                ...options,
                                method: 'GET', // Always use GET for redirects
                                body: null, // Remove body for GET requests
                                collectedCookies: requestOptions.collectedCookies, // Pass accumulated cookies
                                headers: {
                                    ...options.headers,
                                    // Add all accumulated cookies to the next request
                                    'Cookie': requestOptions.collectedCookies.length > 0 ? requestOptions.collectedCookies.join('; ') : (options.headers['Cookie'] || '')
                                }
                            };

                            makeRequest(absoluteRedirectUrl, redirectCount + 1, redirectOptions);
                            return;
                        }

                        // Add collected cookies to response headers
                        const finalHeaders = { ...res.headers };
                        if (requestOptions.collectedCookies && requestOptions.collectedCookies.length > 0) {
                            finalHeaders['set-cookie'] = requestOptions.collectedCookies;
                            console.log(`[API] Final response with all collected cookies:`, requestOptions.collectedCookies);
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

                if (requestOptions.body) {
                    // Convert URLSearchParams to string if needed
                    const bodyString = requestOptions.body instanceof URLSearchParams ?
                        requestOptions.body.toString() :
                        (typeof requestOptions.body === 'string' ? requestOptions.body : JSON.stringify(requestOptions.body));
                    req.write(bodyString);
                }

                req.end();
            };

            makeRequest(url);
        });
    }






    start() {
        // Re-read environment configuration on startup
        const apiConfig = require('../config/apiConfig');
        const currentEnv = process.env.B_CLIENT_ENVIRONMENT || 'production';
        apiConfig.setCurrentEnvironment(currentEnv);
        console.log(`[API] B-Client API Server starting with environment: ${currentEnv}`);

        return new Promise((resolve, reject) => {
            try {
                this.server = this.app.listen(this.port, () => {
                    this.isRunning = true;
                    console.log(`[API] B-Client API Server started on port ${this.port}`);
                    console.log(`[API] Health check: http://localhost:${this.port}/health`);
                    console.log(`[API] Bind endpoint: http://localhost:${this.port}/bind`);
                    console.log(`[API] Query cookie endpoint: http://localhost:${this.port}/api/query-cookie`);

                    // Start auto-refresh scheduler
                    this.startAutoRefreshScheduler();

                    resolve();
                });

                this.server.on('error', (error) => {
                    if (error.code === 'EADDRINUSE') {
                        console.error(`[API] ❌ Port ${this.port} is in use! B-Client requires fixed port ${this.port}`);
                        console.error(`[API] ❌ Please stop other B-Client instances or free up port ${this.port}`);
                        console.error(`[API] ❌ B-Client cannot start with dynamic port assignment`);
                        reject(new Error(`Port ${this.port} is in use. B-Client requires fixed port ${this.port}`));
                    } else {
                        console.error('[API] Server error:', error);
                        reject(error);
                    }
                });

            } catch (error) {
                console.error('[API] Failed to start server:', error);
                reject(error);
            }
        });
    }

    stop() {
        return new Promise((resolve) => {
            if (this.server && this.isRunning) {
                this.server.close(() => {
                    this.isRunning = false;
                    console.log('[API] B-Client API Server stopped');

                    // Stop auto-refresh scheduler
                    this.stopAutoRefreshScheduler();

                    resolve();
                });
            } else {
                // Stop auto-refresh scheduler even if server wasn't running
                this.stopAutoRefreshScheduler();
                resolve();
            }
        });
    }

    getStatus() {
        return {
            isRunning: this.isRunning,
            port: this.port,
            endpoints: [
                'GET /health',
                'POST /bind (request_type: 0=auto_register, 1=bind_existing_user with account/password, 2=clear_user_cookies)',
                'GET /api/stats (dashboard statistics)',
                'GET /api/config (configuration)',
                'GET /cookies/:user_id',
                'GET /accounts/:user_id'
            ]
        };
    }

    /**
     * Perform NSN login using account credentials from user_accounts table
     */
    async performNSNLogin(username, password, website, user_id, c_client_api_port, c_client_ip_address = null) {
        try {
            console.log(`[API] Performing NSN login for user: ${username} on website: ${website}`);

            // Use the existing loginToTargetWebsite method
            const loginResult = await this.loginToTargetWebsite(website, username, password, user_id, username, 'bind');

            if (loginResult.success) {
                console.log(`[API] NSN login successful for user: ${username}`);

                // Create session data object
                const sessionData = {
                    loggedin: true,
                    user_id: loginResult.userId,
                    username: username,
                    role: loginResult.userRole || 'traveller'
                };

                // Create complete session data for storage
                const completeSessionData = {
                    nsn_session_data: sessionData,
                    nsn_user_id: loginResult.userId,
                    nsn_username: username,
                    nsn_role: loginResult.userRole || 'traveller',
                    timestamp: Date.now()
                };

                // Store the session in user_cookies table
                const BClientUserManager = require('../userManager/bClientUserManager');
                const userManager = new BClientUserManager();

                const cookieResult = await userManager.addUserCookieWithTargetUsername(
                    user_id,
                    username,
                    JSON.stringify(completeSessionData),
                    website,
                    true // auto_refresh
                );

                if (cookieResult) {
                    console.log(`[API] Successfully stored new session in user_cookies for user: ${username}`);
                } else {
                    console.log(`[API] Failed to store session in user_cookies for user: ${username}`);
                }

                return {
                    success: true,
                    cookie: JSON.stringify(completeSessionData),
                    sessionData: completeSessionData,
                    userId: loginResult.userId,
                    userRole: loginResult.userRole || 'traveller'
                };
            } else {
                console.log(`[API] NSN login failed for user: ${username}, error: ${loginResult.error}`);
                return {
                    success: false,
                    error: loginResult.error || 'Login failed'
                };
            }
        } catch (error) {
            console.error(`[API] Error during NSN login for user ${username}:`, error);
            return {
                success: false,
                error: error.message || 'Login error'
            };
        }
    }

}

module.exports = ApiServer;

