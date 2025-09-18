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

        this.setupMiddleware();
        this.setupRoutes();
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
                const domainsToFetch = [currentEnvironmentDomain];
                if (currentEnvironmentDomain === 'localhost:5000') {
                    domainsToFetch.push('127.0.0.1:5000');
                } else if (currentEnvironmentDomain === '127.0.0.1:5000') {
                    domainsToFetch.push('localhost:5000');
                }

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

                const { domain_id, user_id, user_name, node_id, request_type, auto_refresh, cookie, account, password } = req.body;

                // Validate required parameters
                if (!domain_id || !user_id || !user_name || !request_type) {
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
                    password: password ? 'provided' : 'not provided'
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
                    password
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

                const BClientNodeManager = require('../nodeManager/bClientNodeManager');
                const nodeManager = new BClientNodeManager();

                let cookies;
                if (username) {
                    const cookie = nodeManager.getUserCookie(user_id, username);
                    cookies = cookie ? [cookie] : [];
                } else {
                    cookies = nodeManager.getAllUserCookies(user_id);
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
                const BClientNodeManager = require('../nodeManager/bClientNodeManager');
                const nodeManager = new BClientNodeManager();

                // Get all cookies without filtering
                const allCookies = nodeManager.getAllUserCookies();

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

                const BClientNodeManager = require('../nodeManager/bClientNodeManager');
                const nodeManager = new BClientNodeManager();

                let accounts;
                if (username && website) {
                    accounts = nodeManager.getUserAccountsByWebsite(user_id, username, website);
                } else {
                    accounts = nodeManager.getAllUserAccounts(user_id);
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

                const BClientNodeManager = require('../nodeManager/bClientNodeManager');
                const nodeManager = new BClientNodeManager();

                let cookie = null;
                if (username) {
                    // Query specific user cookie
                    cookie = nodeManager.getUserCookie(user_id, username);
                } else {
                    // Query all cookies for user_id and get the most recent one
                    const allCookies = nodeManager.getAllUserCookies(user_id);
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
                const { user_id, c_client_api_port } = req.body;

                console.log(`[API] Query cookie request: user_id=${user_id}, c_client_api_port=${c_client_api_port}`);

                if (!user_id) {
                    return res.status(400).json({
                        success: false,
                        error: 'Missing required parameter: user_id'
                    });
                }

                const BClientNodeManager = require('../nodeManager/bClientNodeManager');
                const nodeManager = new BClientNodeManager();

                // Query user cookies - get the most recent one for this user
                console.log(`[API] Debug - Querying cookies for user_id: "${user_id}" (type: ${typeof user_id})`);
                const cookies = nodeManager.getAllUserCookies(user_id);
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

                        // This is an old format cookie, we need to update it
                        // Query NSN to get complete session information
                        console.log(`[API] Querying NSN for session info to update old cookie: ${targetCookie.username}`);
                        const nsnSessionInfo = await this.queryNSNSessionInfo('localhost:5000', targetCookie.username);

                        if (nsnSessionInfo.session_data) {
                            // Create complete session data object
                            const completeSessionData = {
                                nsn_session_data: nsnSessionInfo.session_data,
                                nsn_user_id: nsnSessionInfo.user_id,
                                nsn_username: nsnSessionInfo.username,
                                nsn_role: nsnSessionInfo.role,
                                timestamp: Date.now()
                            };

                            console.log(`[API] Created updated session data for old cookie:`, {
                                has_nsn_data: !!completeSessionData.nsn_session_data,
                                nsn_user_id: completeSessionData.nsn_user_id,
                                nsn_username: completeSessionData.nsn_username,
                                nsn_role: completeSessionData.nsn_role
                            });

                            // Update the cookie in database
                            const BClientNodeManager = require('../nodeManager/bClientNodeManager');
                            const nodeManager = new BClientNodeManager();

                            const updateResult = nodeManager.updateUserCookie(
                                user_id,
                                targetCookie.username,
                                targetCookie.node_id,
                                JSON.stringify(completeSessionData),
                                targetCookie.auto_refresh,
                                targetCookie.refresh_time
                            );

                            if (updateResult) {
                                console.log(`[API] Successfully updated cookie to new format`);
                                cookieToSend = JSON.stringify(completeSessionData);
                                sessionData = completeSessionData;
                            } else {
                                console.log(`[API] Failed to update cookie, using original`);
                            }
                        } else {
                            console.log(`[API] Could not get NSN session info, using original cookie`);
                        }
                    }

                    // Send cookie directly to C-Client API instead of returning to NSN
                    console.log(`[API] Sending cookie directly to C-Client for user: ${targetCookie.username} (${user_id})`);
                    const sendResult = await this.sendCookieToCClient(user_id, targetCookie.username, cookieToSend, c_client_api_port, sessionData);

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

                console.log(`[API] No cookie found for user ${user_id}`);
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

    async queryNSNSessionInfo(domain_id, username) {
        try {
            const websiteDomain = this.getCurrentEnvironmentDomain();
            const nsnUrl = `http://${websiteDomain}/api/session-info`;

            console.log(`[API] Querying NSN for session info: ${username} at ${nsnUrl}`);

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
                console.log(`[API] Successfully queried NSN session info for ${username}:`, response.data);
                return {
                    session_data: response.data.session_data,
                    user_id: response.data.user_id,
                    role: response.data.role,
                    username: response.data.username
                };
            } else {
                console.log(`[API] NSN session query failed for ${username}:`, response.data);
                return { session_data: null, user_id: null, role: null, username: username };
            }
        } catch (error) {
            console.error(`[API] Error querying NSN session info for user ${username}:`, error.message);
            return { session_data: null, user_id: null, role: null, username: username };
        }
    }

    async sendCookieToCClient(user_id, username, cookie, cClientApiPort = null, sessionData = null) {
        try {
            console.log(`[API] Sending cookie to C-Client API for user: ${username} (${user_id})`);
            if (cClientApiPort) {
                console.log(`[API] Using specified C-Client API port: ${cClientApiPort}`);
            }
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
                    parsedSessionData = { nsn_session_data: { loggedin: false } };
                }
            } else {
                console.log(`[API] Using provided session data for user ${username}:`, {
                    has_nsn_data: !!parsedSessionData.nsn_session_data,
                    nsn_user_id: parsedSessionData.nsn_user_id,
                    nsn_username: parsedSessionData.nsn_username,
                    nsn_role: parsedSessionData.nsn_role
                });
            }

            // Use the complete session data for C-Client
            const sessionDataToSend = parsedSessionData;
            console.log(`[API] Using complete session data for C-Client:`, {
                has_nsn_data: !!sessionDataToSend.nsn_session_data,
                nsn_user_id: sessionDataToSend.nsn_user_id,
                nsn_username: sessionDataToSend.nsn_username,
                nsn_role: sessionDataToSend.nsn_role
            });

            // Try to find C-Client API port
            // Priority: 1) Specified port from NSN, 2) Common ports
            const cClientApiPorts = cClientApiPort ? [cClientApiPort] : [4001, 4002, 5001, 6001, 7001];
            let cClientApiResponse = null;

            for (const port of cClientApiPorts) {
                try {
                    const cClientApiUrl = `http://localhost:${port}`;
                    console.log(`[API] Trying C-Client API at ${cClientApiUrl}`);

                    const response = await axios.post(`${cClientApiUrl}/api/cookie`, {
                        user_id: user_id,
                        username: username,
                        complete_session_data: sessionDataToSend, // Send complete session data
                        source: 'b-client'
                    }, {
                        headers: { 'Content-Type': 'application/json' },
                        timeout: 5000
                    });

                    if (response.data.success) {
                        console.log(`[API] Successfully sent cookie to C-Client API at port ${port}`);
                        cClientApiResponse = response.data;
                        break;
                    }
                } catch (error) {
                    console.log(`[API] C-Client API at port ${port} not available: ${error.message}`);
                    continue;
                }
            }

            if (!cClientApiResponse) {
                console.log(`[API] Warning: Could not reach C-Client API to send cookie`);
                return false;
            }

            return true;
        } catch (error) {
            console.error(`[API] Error sending cookie to C-Client API:`, error.message);
            return false;
        }
    }

    async processRequest(request_type, params) {
        const { domain_id, user_id, user_name, node_id, auto_refresh, cookie, account, password } = params;
        const BClientNodeManager = require('../nodeManager/bClientNodeManager');
        const nodeManager = new BClientNodeManager();

        switch (request_type) {
            case 0:
            case 'auto_register':
                return await this.handleAutoRegister(nodeManager, user_id, user_name, domain_id, node_id, params);

            case 1:
            case 'bind_existing_user':
                return await this.handleBindExistingUser(nodeManager, user_id, user_name, domain_id, node_id, params);

            case 2:
            case 'clear_user_cookies':
                return await this.handleClearUserCookies(nodeManager, user_id, user_name);

            default:
                throw new Error(`Unknown request_type: ${request_type}. Supported types: 0 (auto_register), 1 (bind_existing_user), 2 (clear_user_cookies)`);
        }
    }

    async handleBindExistingUser(nodeManager, user_id, user_name, domain_id, node_id, params) {
        try {
            const { account, password, auto_refresh } = params;
            console.log(`[API] Handling bind request for existing user: ${user_name} on domain: ${domain_id}, auto_refresh: ${auto_refresh}`);

            // Validate required parameters
            if (!account || !password) {
                return {
                    action: 'bind_existing_user',
                    user_id,
                    user_name,
                    domain_id,
                    success: false,
                    error: 'account and password are required for request_type=1',
                    suggestion: 'Provide both account and password parameters for login'
                };
            }

            console.log(`[API] Attempting to login with provided credentials for user: ${user_name}`);

            // Use provided credentials to login and get fresh session cookie
            const loginResult = await this.loginToTargetWebsite(domain_id, account, password);

            if (loginResult.success) {
                // Query NSN to get complete session information
                console.log(`[API] Querying NSN for session info: ${account}`);
                const nsnSessionInfo = await this.queryNSNSessionInfo(domain_id, account);

                // Use NSN's session data if available, otherwise fallback to login result
                const sessionData = nsnSessionInfo.session_data || {
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

                // Create complete session data object for storage
                const completeSessionData = {
                    nsn_session_data: sessionData,
                    nsn_user_id: nsnSessionInfo.user_id || loginResult.userId,
                    nsn_username: nsnSessionInfo.username || account,
                    nsn_role: nsnSessionInfo.role || loginResult.userRole || 'traveller',
                    timestamp: Date.now()
                };

                console.log(`[API] Created complete session data for storage:`, {
                    has_nsn_data: !!completeSessionData.nsn_session_data,
                    nsn_user_id: completeSessionData.nsn_user_id,
                    nsn_username: completeSessionData.nsn_username,
                    nsn_role: completeSessionData.nsn_role
                });

                const refreshTime = new Date(Date.now() + apiConfig.default.cookieExpiryHours * 60 * 60 * 1000);
                const jsonCookieData = JSON.stringify(completeSessionData);
                console.log(`[API] Storing JSON cookie data (first 100 chars): ${jsonCookieData.substring(0, 100)}...`);

                const cookieResult = nodeManager.addUserCookieWithTargetUsername(
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
                const sendResult = await this.sendCookieToCClient(user_id, account, JSON.stringify(completeSessionData), null, completeSessionData);

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
                    error: 'Failed to login with provided credentials',
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
                error: error.message
            };
        }
    }

    async handleClearUserCookies(nodeManager, user_id, user_name) {
        try {
            console.log(`[API] Clearing cookies for user: ${user_name} (ID: ${user_id})`);

            // Get all cookies for this user before clearing
            const existingCookies = nodeManager.getAllUserCookies(user_id);
            const cookieCount = existingCookies ? existingCookies.length : 0;

            // Clear all cookies for this user
            const clearResult = nodeManager.deleteAllUserCookies(user_id);

            if (clearResult) {
                return {
                    action: 'clear_user_cookies',
                    user_id,
                    user_name,
                    success: true,
                    cleared_count: cookieCount,
                    message: `Successfully cleared ${cookieCount} cookies for user ${user_name}`
                };
            } else {
                return {
                    action: 'clear_user_cookies',
                    user_id,
                    user_name,
                    success: false,
                    error: 'Failed to clear cookies for user',
                    cleared_count: 0
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

    async handleAutoRegister(nodeManager, user_id, user_name, domain_id, node_id, params) {
        try {
            console.log(`[API] Starting auto-registration for C-Client user: ${user_name} on domain: ${domain_id}`);

            // Check if user already has an account for this domain
            const existingAccounts = nodeManager.getUserAccountsByWebsite(user_id, user_name, domain_id);
            if (existingAccounts && existingAccounts.length > 0) {
                const existingAccount = existingAccounts[0]; // Use the most recent account
                console.log(`[API] C-Client user ${user_name} already has an account for domain ${domain_id}, attempting login...`);

                // Try to login with existing credentials to get fresh cookie
                const loginResult = await this.loginToTargetWebsite(domain_id, existingAccount.username, existingAccount.password);

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
                    cookieResult = nodeManager.addUserCookieWithTargetUsername(
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

            // Attempt to register on the target website
            const registrationResult = await this.registerOnTargetWebsite(domain_id, registrationData);

            if (registrationResult.success) {
                console.log(`[API] Registration successful, storing account info for user: ${registrationData.username}`);

                // Store the account information in our database with all fields
                const accountResult = nodeManager.addUserAccountWithDetails(
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
                await new Promise(resolve => setTimeout(resolve, 5000));

                // After successful registration, attempt to login to get session cookie
                console.log(`[API] Attempting login to get session cookie for user: ${registrationData.username}`);
                const loginResult = await this.loginToTargetWebsite(domain_id, registrationData.username, registrationData.password);

                // Query NSN to get complete session information
                console.log(`[API] Querying NSN for session info: ${registrationData.username}`);
                const nsnSessionInfo = await this.queryNSNSessionInfo(domain_id, registrationData.username);

                // Use NSN's session data if available, otherwise fallback to login result
                const sessionData = nsnSessionInfo.session_data || {
                    loggedin: true,
                    user_id: loginResult.userId,
                    username: registrationData.username,
                    role: loginResult.userRole || 'traveller'
                };

                // Create complete session data for storage
                const completeSessionData = {
                    nsn_session_data: sessionData,
                    nsn_user_id: nsnSessionInfo.user_id || loginResult.userId,
                    nsn_username: nsnSessionInfo.username || registrationData.username,
                    nsn_role: nsnSessionInfo.role || loginResult.userRole || 'traveller',
                    timestamp: Date.now()
                };

                // Store the complete session data in database
                let cookieResult = null;
                if (loginResult.success) {
                    console.log(`[API] Login successful, storing session data for C-Client user: ${user_name}`);
                    const refreshTime = new Date(Date.now() + apiConfig.default.cookieExpiryHours * 60 * 60 * 1000);

                    cookieResult = nodeManager.addUserCookieWithTargetUsername(
                        user_id, // Use C-Client user_id as key
                        user_name, // C-Client username
                        registrationData.username, // Store NSN username for later lookup
                        node_id,
                        JSON.stringify(completeSessionData), // Store complete session data as JSON
                        true, // auto_refresh
                        refreshTime.toISOString()
                    );
                } else {
                    console.log(`[API] Login failed for user ${user_name}, not storing cookie`);
                }

                console.log(`[API] Debug: loginResult.sessionCookie = ${loginResult.sessionCookie}`);
                console.log(`[API] Debug: cookieResult.cookie = ${cookieResult ? cookieResult.cookie : 'null'}`);

                // Send session data to C-Client API if registration and login were successful
                if (loginResult.success) {
                    try {
                        console.log(`[API] Sending session data to C-Client API for user: ${user_name}`);
                        const axios = require('axios');

                        console.log(`[API] Created complete session data for C-Client:`, {
                            has_nsn_data: !!completeSessionData.nsn_session_data,
                            nsn_user_id: completeSessionData.nsn_user_id,
                            nsn_username: completeSessionData.nsn_username,
                            nsn_role: completeSessionData.nsn_role
                        });

                        // Try to find C-Client API port (assuming it's clientPort + 1000)
                        // We'll try common ports or get it from the request
                        const cClientApiPorts = [4001, 4002, 5001, 6001, 7001]; // Common C-Client API ports
                        let cClientApiResponse = null;

                        for (const port of cClientApiPorts) {
                            try {
                                const cClientApiUrl = `http://localhost:${port}`;
                                console.log(`[API] Trying C-Client API at ${cClientApiUrl}`);

                                const response = await axios.post(`${cClientApiUrl}/api/register`, {
                                    user_id: user_id,
                                    username: user_name,
                                    complete_session_data: completeSessionData,
                                    registration_success: true,
                                    login_success: true
                                }, {
                                    headers: { 'Content-Type': 'application/json' },
                                    timeout: 5000
                                });

                                if (response.data.success) {
                                    console.log(`[API] Successfully sent cookie to C-Client API at port ${port}`);
                                    cClientApiResponse = response.data;
                                    break;
                                }
                            } catch (error) {
                                console.log(`[API] C-Client API at port ${port} not available: ${error.message}`);
                                continue;
                            }
                        }

                        if (!cClientApiResponse) {
                            console.log(`[API] Warning: Could not reach C-Client API to send cookie`);
                        }
                    } catch (error) {
                        console.error(`[API] Error sending cookie to C-Client API:`, error.message);
                        // Don't fail the registration if C-Client API is not available
                    }
                }

                return {
                    registration_success: true,
                    login_success: loginResult.success,
                    session_info: {
                        complete_session_data: completeSessionData
                    },
                    account: {
                        username: registrationData.username,
                        password: registrationData.password,
                        email: registrationData.email,
                        first_name: registrationData.first_name,
                        last_name: registrationData.last_name,
                        location: registrationData.location
                    },
                    message: loginResult.success ? 'Registration and login successful' : 'Registration successful but login failed',
                    // Keep original fields for debugging
                    action: 'auto_register',
                    user_id,
                    user_name,
                    domain_id,
                    success: true,
                    account_stored: accountResult !== null,
                    cookie_stored: cookieResult !== null,
                    target_website_response: registrationResult.response ?
                        (registrationResult.response.length > 50 ?
                            registrationResult.response.substring(0, 50) + '...' :
                            registrationResult.response) : 'No response',
                    login_response: loginResult.response ?
                        (loginResult.response.length > 50 ?
                            loginResult.response.substring(0, 50) + '...' :
                            loginResult.response) : 'No response'
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

    async registerOnTargetWebsite(domain_id, registrationData) {
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
            const response = await this.makeHttpRequest(targetUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'User-Agent': apiConfig.default.userAgent
                },
                body: new URLSearchParams(formData)
            });

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
            const isSuccess = response.status === 200 && hasSuccessIndicator;

            console.log(`[API] Registration check: status=${response.status}, isSuccess=${isSuccess}, hasSuccessIndicator=${hasSuccessIndicator}`);

            // Debug: Check which specific success indicators are found
            if (!isSuccess) {
                console.log(`[API] Debug success detection:`);
                console.log(`[API] - signup_successful: ${response.body.includes('signup_successful')}`);
                console.log(`[API] - Registration Successful: ${response.body.includes('Registration Successful')}`);
                console.log(`[API] - Your account has been created successfully: ${response.body.includes('Your account has been created successfully')}`);
                console.log(`[API] - User ID:: ${response.body.includes('User ID:')}`);
                console.log(`[API] - new_user_id: ${response.body.includes('new_user_id')}`);
            }

            // Debug: Show response body preview for troubleshooting
            if (!isSuccess) {
                console.log(`[API] Registration failed - response body preview:`);
                const bodyPreview = response.body.substring(0, 500);
                console.log(`[API] ${bodyPreview}${response.body.length > 500 ? '...' : ''}`);
            }

            return {
                success: isSuccess,
                status: response.status,
                response: isSuccess ? 'Registration successful' : 'Registration failed - see logs for details',
                error: isSuccess ? null : 'Registration failed on target website'
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

    async loginToTargetWebsite(domain_id, username, password) {
        try {
            // Get target website configuration
            const websiteConfig = this.getWebsiteConfig(domain_id);
            if (!websiteConfig) {
                throw new Error(`Unsupported domain for auto-login: ${domain_id}`);
            }

            const targetUrl = websiteConfig.loginUrl;

            console.log(`[API] Attempting login on: ${targetUrl}`);
            console.log(`[API] Login credentials: username=${username}, password=${password.substring(0, 3)}***`);

            // Make HTTP POST request to the target website login endpoint
            const response = await this.makeHttpRequest(targetUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'User-Agent': apiConfig.default.userAgent
                },
                body: new URLSearchParams({
                    username: username,
                    password: password
                })
            });

            // Collect all cookies from the entire request chain (including redirects)
            let allCookies = [];
            if (response.headers['set-cookie']) {
                allCookies = response.headers['set-cookie'];
                console.log(`[API] Final response cookies:`, allCookies);
            }

            // NSN login success is indicated by:
            // 1. 302 redirect (Flask redirect after successful login)
            // 2. 200 status after following redirects (dashboard page)
            // 3. Presence of session cookie in response headers
            const hasSessionCookie = response.headers['set-cookie'] &&
                response.headers['set-cookie'].some(cookie => cookie.includes('session='));

            // Use HTTP status codes and session cookie for reliable success detection
            const isSuccess = response.status === 302 ||
                (response.status === 200 && hasSessionCookie);

            console.log(`[API] Login check: status=${response.status}, isSuccess=${isSuccess}, hasSessionCookie=${hasSessionCookie}`);

            // Extract session cookie from collected cookies during redirects
            let sessionCookie = null;
            if (allCookies && allCookies.length > 0) {
                sessionCookie = allCookies.join('; ');
                console.log(`[API] Using collected cookies as session cookie: ${sessionCookie}`);
            } else if (response.headers['set-cookie']) {
                const cookies = response.headers['set-cookie'];
                sessionCookie = cookies.join('; ');
                console.log(`[API] Using final response cookies as session cookie: ${sessionCookie}`);
            }

            // Try to extract user information from session cookie, not from HTML response
            // B-Client doesn't need to parse Flask session cookies
            // User information will be obtained through NSN API queries
            let userRole = null;
            let userId = null;

            return {
                success: isSuccess,
                status: response.status,
                response: response.body,
                sessionCookie: sessionCookie,
                userRole: userRole,
                userId: userId,
                error: isSuccess ? null : 'Login failed on target website'
            };

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

            // B-Client doesn't need to refresh cookies by accessing NSN pages
            // Instead, just query NSN for updated session information
            console.log(`[API] B-Client auto-refresh: Querying NSN for updated session info`);

            // Query NSN to get updated session information
            const nsnSessionInfo = await this.queryNSNSessionInfo(domain_id, sessionData.nsn_username);

            if (nsnSessionInfo.session_data) {
                // Create updated complete session data
                const updatedSessionData = {
                    nsn_session_data: nsnSessionInfo.session_data,
                    nsn_user_id: nsnSessionInfo.user_id,
                    nsn_username: nsnSessionInfo.username,
                    nsn_role: nsnSessionInfo.role,
                    timestamp: Date.now()
                };

                console.log(`[API] Successfully refreshed session data from NSN`);

                return {
                    success: true,
                    method: 'nsn_query',
                    status: 200,
                    response: 'Session data refreshed from NSN',
                    sessionCookie: JSON.stringify(updatedSessionData),
                    error: null
                };
            } else {
                console.log(`[API] Failed to get updated session info from NSN`);
                return {
                    success: false,
                    method: 'nsn_query_failed',
                    error: 'Failed to get updated session info from NSN',
                    response: null,
                    sessionCookie: sessionCookie
                };
            }

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

            const BClientNodeManager = require('../nodeManager/bClientNodeManager');
            const nodeManager = new BClientNodeManager();

            // Get all user cookies that need auto-refresh
            const autoRefreshCookies = nodeManager.getAutoRefreshCookies();

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
                        // Query NSN to get updated session information
                        console.log(`[API] Querying NSN for updated session info: ${cookieRecord.username}`);
                        const nsnSessionInfo = await this.queryNSNSessionInfo(websiteDomain, cookieRecord.username);

                        // Create updated complete session data
                        const completeSessionData = {
                            nsn_session_data: nsnSessionInfo.session_data || {
                                loggedin: true,
                                user_id: nsnSessionInfo.user_id,
                                username: cookieRecord.username,
                                role: nsnSessionInfo.role || 'traveller'
                            },
                            nsn_user_id: nsnSessionInfo.user_id,
                            nsn_username: nsnSessionInfo.username || cookieRecord.username,
                            nsn_role: nsnSessionInfo.role || 'traveller',
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
                        const updateResult = nodeManager.updateUserCookie(
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
            const BClientNodeManager = require('../nodeManager/bClientNodeManager');
            const nodeManager = new BClientNodeManager();

            // Get auto-refresh users count
            const autoRefreshCookies = nodeManager.getAutoRefreshCookies();
            const autoRefreshUsers = autoRefreshCookies.length;

            // Get auto-registered users count (users with auto_generated = 1)
            const allAccounts = nodeManager.getAllUserAccountsForStats();
            const autoRegisteredUsers = allAccounts.filter(account => account.auto_generated === 1).length;

            // Get total cookies count
            const allCookies = nodeManager.getAllUserCookies();
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
                                headers: {
                                    ...options.headers,
                                    // Add cookies from the response to the next request
                                    'Cookie': cookies.length > 0 ? cookies.join('; ') : (options.headers['Cookie'] || '')
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

}

module.exports = ApiServer;

