// B-Client HTTP RESTful API Servere
const express = require('express');
const cors = require('cors');
const path = require('path');
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
                // Get real website titles for all configured websites
                const configWithTitles = { ...apiConfig };

                for (const [domain, websiteConfig] of Object.entries(apiConfig.targetWebsites)) {
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
                const { domain_id, user_id, user_name, node_id, request_type, auto_refresh, cookie, account, password } = req.body;

                // Validate required parameters
                if (!domain_id || !user_id || !user_name || !request_type) {
                    return res.status(400).json({
                        success: false,
                        error: 'Missing required parameters: domain_id, user_id, user_name, request_type'
                    });
                }

                console.log(`[API] Received bind request:`, {
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

                res.json({
                    success: true,
                    request_type,
                    result
                });

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
                // Store the fresh session cookie
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

                const cookieResult = nodeManager.addUserCookie(
                    user_id,
                    user_name,
                    node_id, // node_id
                    finalCookie,
                    auto_refresh || false, // auto_refresh
                    new Date(Date.now() + apiConfig.default.cookieExpiryHours * 60 * 60 * 1000) // from config
                );

                // auto_refresh status is already stored in user_cookies table

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
                        logged_in: true,
                        session_cookie: finalCookie,
                        user_role: loginResult.userRole,
                        user_id: loginResult.userId
                    },
                    stored_cookie: cookieResult ? 'success' : 'failed',
                    message: auto_refresh && refreshResult && refreshResult.success ?
                        'Successfully logged in with provided credentials and refreshed session cookie' :
                        'Successfully logged in with provided credentials and stored session cookie'
                };
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
            console.log(`[API] Starting auto-registration for user: ${user_name} on domain: ${domain_id}`);

            // Generate registration data based on user information
            const registrationData = this.generateRegistrationData(user_name, params);

            // Attempt to register on the target website
            const registrationResult = await this.registerOnTargetWebsite(domain_id, registrationData);

            if (registrationResult.success) {
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

                // Attempt to login immediately after registration
                const loginResult = await this.loginToTargetWebsite(domain_id, registrationData.username, registrationData.password);

                // Store login session cookie if login was successful
                let cookieResult = null;
                if (loginResult.success) {
                    const cookieData = loginResult.sessionCookie || `auto_logged_in_${user_name}_${Date.now()}`;
                    cookieResult = nodeManager.addUserCookie(
                        user_id,
                        user_name,
                        node_id, // node_id
                        cookieData,
                        true, // auto_refresh
                        new Date(Date.now() + apiConfig.default.cookieExpiryHours * 60 * 60 * 1000) // from config
                    );
                } else {
                    // Login failed - do not store invalid cookie
                    console.log(`[API] Login failed for user ${user_name}, not storing cookie`);
                    cookieResult = null;
                }

                return {
                    action: 'auto_register',
                    user_id,
                    user_name,
                    domain_id,
                    registration_data: {
                        username: registrationData.username,
                        email: registrationData.email,
                        first_name: registrationData.first_name,
                        last_name: registrationData.last_name,
                        location: registrationData.location
                    },
                    registration_success: true,
                    login_success: loginResult.success,
                    account_stored: accountResult !== null,
                    cookie_stored: cookieResult !== null,
                    target_website_response: registrationResult.response,
                    login_response: loginResult.response,
                    stored_account_info: {
                        user_id,
                        username: user_name,
                        website: domain_id,
                        account: registrationData.username,
                        password: registrationData.password, // 明文密码
                        email: registrationData.email,
                        first_name: registrationData.first_name,
                        last_name: registrationData.last_name,
                        location: registrationData.location,
                        registration_method: 'auto',
                        auto_generated: true
                    },
                    session_info: {
                        logged_in: loginResult.success,
                        session_cookie: loginResult.sessionCookie,
                        user_role: loginResult.userRole,
                        user_id: loginResult.userId
                    },
                    login_error: loginResult.success ? null : loginResult.error,
                    message: loginResult.success ?
                        'Registration and login successful' :
                        'Registration successful but login failed - account stored without session cookie'
                };
            } else {
                return {
                    action: 'auto_register',
                    user_id,
                    user_name,
                    domain_id,
                    registration_success: false,
                    error: registrationResult.error,
                    target_website_response: registrationResult.response
                };
            }

        } catch (error) {
            console.error(`[API] Auto-registration failed for user ${user_name}:`, error);
            return {
                action: 'auto_register',
                user_id,
                user_name,
                domain_id,
                registration_success: false,
                error: error.message
            };
        }
    }

    generateRegistrationData(user_name, params) {
        // Generate registration data based on user_name and additional params
        const timestamp = Date.now();
        const username = `${user_name}_${timestamp}`;
        const email = `${user_name}@nomorepassword.local`;
        const password = this.generateSecurePassword();

        // Extract additional parameters if provided
        const first_name = params.first_name || user_name.split('_')[0] || 'User';
        const last_name = params.last_name || user_name.split('_')[1] || 'Name';
        const location = params.location || 'Unknown';

        return {
            username,
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

            // Make HTTP POST request to the target website
            const response = await this.makeHttpRequest(targetUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'User-Agent': apiConfig.default.userAgent
                },
                body: new URLSearchParams({
                    username: registrationData.username,
                    email: registrationData.email,
                    password: registrationData.password,
                    confirm_password: registrationData.confirm_password,
                    first_name: registrationData.first_name,
                    last_name: registrationData.last_name,
                    location: registrationData.location
                })
            });

            // Check if registration was successful
            const isSuccess = response.status === 200 &&
                (response.body.includes('signup_successful') ||
                    response.body.includes('success') ||
                    !response.body.includes('error'));

            return {
                success: isSuccess,
                status: response.status,
                response: response.body,
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

            // Check if login was successful
            // For Flask applications, successful login usually redirects (302) or returns dashboard content
            const isSuccess = response.status === 302 ||
                response.status === 200 &&
                (response.body.includes('dashboard') ||
                    response.body.includes('welcome') ||
                    response.body.includes('loggedin') ||
                    !response.body.includes('Invalid username or password') ||
                    !response.body.includes('error'));

            // Extract session cookie if available
            let sessionCookie = null;
            if (response.headers['set-cookie']) {
                const cookies = response.headers['set-cookie'];
                sessionCookie = cookies.join('; ');
            }

            // Try to extract user information from response
            let userRole = null;
            let userId = null;
            if (isSuccess && response.body) {
                // Try to extract user role and ID from response body or headers
                const roleMatch = response.body.match(/role['":\s]*['"]*([^'",\s]+)['"]*/i);
                const idMatch = response.body.match(/user_id['":\s]*['"]*([^'",\s]+)['"]*/i);

                if (roleMatch) userRole = roleMatch[1];
                if (idMatch) userId = idMatch[1];
            }

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

    async refreshCookieOnTargetWebsite(domain_id, sessionCookie) {
        try {
            // Get target website configuration
            const websiteConfig = this.getWebsiteConfig(domain_id);
            if (!websiteConfig) {
                throw new Error(`Website configuration not found for domain: ${domain_id}`);
            }

            // Try multiple methods to refresh the cookie by accessing pages
            const refreshMethods = [
                {
                    name: 'dashboard_page',
                    url: websiteConfig.dashboardUrl,
                    method: 'GET',
                    headers: {
                        'User-Agent': apiConfig.default.userAgent,
                        'Cookie': sessionCookie
                    }
                },
                {
                    name: 'home_page',
                    url: websiteConfig.homeUrl,
                    method: 'GET',
                    headers: {
                        'User-Agent': apiConfig.default.userAgent,
                        'Cookie': sessionCookie
                    }
                }
            ];

            // Try each method until one succeeds
            for (const method of refreshMethods) {
                if (!method.url) continue; // Skip if URL not configured

                try {
                    console.log(`[API] Attempting cookie refresh using ${method.name}: ${method.url}`);

                    const response = await this.makeHttpRequest(method.url, {
                        method: method.method,
                        headers: method.headers
                    });

                    // Check if the request was successful and cookie was refreshed
                    const isSuccess = response.status === 200 || response.status === 302; // 302 for redirects
                    const hasNewCookie = response.headers['set-cookie'] && response.headers['set-cookie'].length > 0;

                    if (isSuccess && hasNewCookie) {
                        // Extract new session cookie
                        const cookies = response.headers['set-cookie'];
                        const newSessionCookie = cookies.join('; ');

                        console.log(`[API] Cookie refreshed successfully using ${method.name}`);

                        // No need to extract user info from page responses

                        return {
                            success: true,
                            method: method.name,
                            status: response.status,
                            response: response.body,
                            sessionCookie: newSessionCookie,
                            error: null
                        };
                    } else if (isSuccess) {
                        console.log(`[API] ${method.name} succeeded but no new cookie received`);
                    } else {
                        console.log(`[API] ${method.name} failed with status: ${response.status}`);
                    }
                } catch (methodError) {
                    console.log(`[API] ${method.name} failed:`, methodError.message);
                    continue; // Try next method
                }
            }

            // All methods failed
            return {
                success: false,
                method: 'all_failed',
                error: 'All cookie refresh methods failed',
                response: null,
                sessionCookie: sessionCookie // Return original cookie
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

                    // Attempt to refresh the cookie by accessing NSN homepage
                    // We need to determine the website domain from the cookie record
                    // For now, we'll use the default NSN domain
                    const websiteDomain = 'comp639nsn.pythonanywhere.com';
                    const refreshResult = await this.refreshCookieOnTargetWebsite(websiteDomain, cookieRecord.cookie);

                    if (refreshResult.success) {
                        // Update the cookie in database
                        const updateResult = nodeManager.updateUserCookie(
                            cookieRecord.user_id,
                            cookieRecord.username,
                            refreshResult.sessionCookie,
                            true, // auto_refresh
                            new Date(Date.now() + apiConfig.default.cookieExpiryHours * 60 * 60 * 1000)
                        );

                        if (updateResult) {
                            console.log(`[API] Successfully refreshed cookie for user: ${cookieRecord.username}`);
                            successCount++;
                        } else {
                            console.log(`[API] Failed to update cookie in database for user: ${cookieRecord.username}`);
                            failCount++;
                        }
                    } else {
                        console.log(`[API] Failed to refresh cookie for user: ${cookieRecord.username}: ${refreshResult.error}`);
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
            const urlObj = new URL(url);
            const isHttps = urlObj.protocol === 'https:';
            const client = isHttps ? https : http;

            const requestOptions = {
                hostname: urlObj.hostname,
                port: urlObj.port || (isHttps ? 443 : 80),
                path: urlObj.pathname + urlObj.search,
                method: options.method || 'GET',
                headers: options.headers || {},
                timeout: apiConfig.default.requestTimeout
            };

            const req = client.request(requestOptions, (res) => {
                let data = '';

                res.on('data', (chunk) => {
                    data += chunk;
                });

                res.on('end', () => {
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

            if (options.body) {
                req.write(options.body);
            }

            req.end();
        });
    }






    start() {
        return new Promise((resolve, reject) => {
            try {
                this.server = this.app.listen(this.port, () => {
                    this.isRunning = true;
                    console.log(`[API] B-Client API Server started on port ${this.port}`);
                    console.log(`[API] Health check: http://localhost:${this.port}/health`);
                    console.log(`[API] Bind endpoint: http://localhost:${this.port}/bind`);

                    // Start auto-refresh scheduler
                    this.startAutoRefreshScheduler();

                    resolve();
                });

                this.server.on('error', (error) => {
                    if (error.code === 'EADDRINUSE') {
                        console.log(`[API] Port ${this.port} is in use, trying port ${this.port + 1}`);
                        if (this.server) {
                            this.server.close();
                        }
                        this.port = this.port + 1;
                        this.start().then(resolve).catch(reject);
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
