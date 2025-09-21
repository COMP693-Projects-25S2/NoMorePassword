const express = require('express');
const cors = require('cors');

class CClientApiServer {
    constructor(port, mainWindow = null) {
        this.port = port;
        this.app = express();
        this.mainWindow = mainWindow;
        this.storedCookie = null;
        this.pendingReload = null; // Store pending reload requests
        this.setupMiddleware();
        this.setupRoutes();
    }

    setupMiddleware() {
        this.app.use(cors());
        this.app.use(express.json());
        this.app.use(express.urlencoded({ extended: true }));
    }

    setupRoutes() {
        // Health check endpoint
        this.app.get('/health', (req, res) => {
            res.json({
                status: 'healthy',
                service: 'C-Client API',
                port: this.port,
                timestamp: new Date().toISOString()
            });
        });

        // Get cookie for a specific user
        this.app.get('/api/cookie/:user_id', (req, res) => {
            const { user_id } = req.params;
            console.log(`[C-Client API] Getting stored cookie for user: ${user_id}`);

            try {
                // For now, return no cookie since we haven't implemented local storage yet
                // This endpoint is for NSN to query C-Client for stored cookies
                console.log(`[C-Client API] No stored cookie found for user ${user_id}`);
                res.json({
                    success: true,
                    has_cookie: false,
                    message: 'No stored cookie found for this user'
                });
            } catch (error) {
                console.error(`[C-Client API] Error getting stored cookie:`, error);
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // Receive cookie from B-Client
        this.app.post('/api/cookie', (req, res) => {
            const { user_id, username, cookie, complete_session_data, source } = req.body;
            console.log(`[C-Client API] ===== RECEIVING DATA FROM B-CLIENT =====`);
            console.log(`[C-Client API] Receiving cookie from ${source} for user: ${username} (${user_id})`);

            try {
                // Accept either cookie or complete_session_data
                if ((cookie && user_id) || (complete_session_data && user_id)) {
                    console.log(`[C-Client API] Successfully received data from ${source} for user ${username}`);

                    if (cookie) {
                        console.log(`[C-Client API] Cookie: ${cookie.substring(0, 50)}...`);
                    }

                    if (complete_session_data) {
                        console.log(`[C-Client API] ===== COMPLETE SESSION DATA RECEIVED =====`);
                        console.log(`[C-Client API] Complete session data received:`, {
                            has_nsn_data: !!complete_session_data.nsn_session_data,
                            nsn_user_id: complete_session_data.nsn_user_id,
                            nsn_username: complete_session_data.nsn_username,
                            nsn_role: complete_session_data.nsn_role
                        });
                        console.log(`[C-Client API] Full complete session data:`, complete_session_data);
                        console.log(`[C-Client API] NSN Session Data details:`, complete_session_data.nsn_session_data);
                    }

                    // Store the cookie for the user (this could be stored in a database or cache)
                    // For now, we'll just acknowledge receipt

                    // If this is from B-Client, trigger C-Client to reload with the cookie
                    if (source === 'b-client') {
                        console.log(`[C-Client API] ===== TRIGGERING C-CLIENT RELOAD =====`);
                        console.log(`[C-Client API] Triggering C-Client to reload with data for user ${username}`);
                        console.log(`[C-Client API] User ID: ${user_id}`);
                        console.log(`[C-Client API] Username: ${username}`);
                        console.log(`[C-Client API] Has cookie: ${!!cookie}`);
                        console.log(`[C-Client API] Has complete session data: ${!!complete_session_data}`);
                        // Trigger C-Client to reload the current tab with the cookie and complete session data
                        this.triggerCClientReloadWithCookie(user_id, username, cookie, complete_session_data);
                    }

                    res.json({
                        success: true,
                        message: `Data received successfully from ${source}`,
                        user_id: user_id,
                        username: username,
                        data_received: true
                    });
                } else {
                    console.log(`[C-Client API] Invalid data from ${source} for user ${username}`);
                    console.log(`[C-Client API] Expected either cookie or complete_session_data with user_id`);
                    res.status(400).json({
                        success: false,
                        error: 'Invalid data - need either cookie or complete_session_data with user_id'
                    });
                }
            } catch (error) {
                console.error(`[C-Client API] Error processing cookie from ${source}:`, error);
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // Receive registration result from B-Client and handle auto-login
        this.app.post('/api/register', async (req, res) => {
            const { user_id, username, session_cookie, complete_session_data, registration_session_data, registration_info, registration_success, login_success, account } = req.body;
            console.log(`[C-Client API] Receiving registration data from B-Client for user: ${username} (${user_id})`);
            console.log(`[C-Client API] Registration success: ${registration_success}, Login success: ${login_success}`);

            try {
                if (registration_success) {
                    if (login_success && (session_cookie || complete_session_data)) {
                        // Old flow: B-Client handled both registration and login
                        console.log(`[C-Client API] Successfully received registration and login data from B-Client for user ${username}`);

                        if (session_cookie) {
                            console.log(`[C-Client API] ===== ORIGINAL SESSION COOKIE RECEIVED =====`);
                            console.log(`[C-Client API] Session cookie: ${session_cookie.substring(0, 50)}...`);
                            console.log(`[C-Client API] Full session cookie: ${session_cookie}`);
                        }

                        if (complete_session_data) {
                            console.log(`[C-Client API] Complete session data received:`, {
                                has_nsn_data: !!complete_session_data.nsn_session_data,
                                nsn_user_id: complete_session_data.nsn_user_id,
                                nsn_username: complete_session_data.nsn_username,
                                nsn_role: complete_session_data.nsn_role
                            });
                        }

                        // Trigger C-Client to reload with the cookie and complete session data
                        this.triggerCClientReloadWithCookie(user_id, username, session_cookie, complete_session_data);

                        res.json({
                            success: true,
                            message: 'Cookie received successfully from B-Client',
                            user_id: user_id,
                            username: username,
                            cookie_received: true
                        });
                    } else if (registration_info && account) {
                        // New flow: B-Client only registered, C-Client will handle auto-login via URL injection
                        console.log(`[C-Client API] ===== NEW FLOW: REGISTRATION ONLY =====`);
                        console.log(`[C-Client API] Received registration info from B-Client for user ${username}`);
                        console.log(`[C-Client API] Registration info:`, {
                            nsn_username: registration_info.nsn_username,
                            nsn_email: registration_info.nsn_email
                        });
                        console.log(`[C-Client API] Account data:`, {
                            username: account.username,
                            email: account.email
                        });

                        // Navigate to NSN with NMP parameters for auto-login
                        console.log(`[C-Client API] ===== NAVIGATING TO NSN WITH NMP PARAMETERS =====`);
                        console.log(`[C-Client API] Registration successful, navigating to NSN for auto-login`);

                        // Create NMP parameters for navigation
                        const nmpParams = {
                            nmp_user_id: user_id,
                            nmp_username: username,
                            nmp_client_type: 'c-client',
                            nmp_timestamp: Date.now().toString(),
                            nmp_bind: 'true',
                            nmp_bind_type: 'signup',
                            nmp_auto_refresh: 'true',
                            nmp_injected: 'true'
                        };

                        // Trigger C-Client to navigate to NSN with NMP parameters
                        this.triggerCClientNavigateToNSN(user_id, username, nmpParams);

                        res.json({
                            success: true,
                            message: 'Registration successful, navigating to NSN for auto-login',
                            user_id: user_id,
                            username: username,
                            auto_login_success: true,
                            nmp_params: nmpParams
                        });
                    } else {
                        console.log(`[C-Client API] Invalid registration data from B-Client for user ${username}`);
                        console.log(`[C-Client API] Expected either login_success=true with session data OR registration_session_data with account`);
                        res.status(400).json({
                            success: false,
                            error: 'Invalid registration data format'
                        });
                    }
                } else {
                    console.log(`[C-Client API] Registration failed for user ${username}`);
                    res.status(400).json({
                        success: false,
                        error: 'Registration failed'
                    });
                }
            } catch (error) {
                console.error(`[C-Client API] Error processing registration data from B-Client:`, error);
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // Login existing user and get cookie
        this.app.post('/api/login', (req, res) => {
            const { user_id, username, password } = req.body;
            console.log(`[C-Client API] Logging in user: ${username} (${user_id})`);

            try {
                // Call B-Client bind API for bind_existing_user
                const axios = require('axios');
                const bClientUrl = 'http://localhost:3000';

                const bindData = {
                    request_type: 1, // bind to NMP
                    user_id: user_id,
                    user_name: username,
                    domain_id: 'localhost:5000',
                    node_id: 'nsn-node-001',
                    auto_refresh: true,
                    account: username,
                    password: password
                };

                axios.post(`${bClientUrl}/bind`, bindData, {
                    headers: { 'Content-Type': 'application/json' },
                    timeout: 10000
                }).then(response => {
                    if (response.data.success) {
                        console.log(`[C-Client API] Successfully logged in user ${username}`);

                        // Extract session cookie if available
                        const sessionCookie = response.data.data?.session_info?.session_cookie;
                        const loginSuccess = response.data.data?.login_success;

                        res.json({
                            success: true,
                            login_success: loginSuccess,
                            session_cookie: sessionCookie,
                            message: 'User logged in successfully',
                            user_id: user_id,
                            username: username
                        });
                    } else {
                        console.log(`[C-Client API] Login failed for user ${username}`);
                        res.status(400).json({
                            success: false,
                            error: response.data.error || 'Login failed'
                        });
                    }
                }).catch(error => {
                    console.error(`[C-Client API] Error calling B-Client bind API:`, error.message);
                    res.status(500).json({
                        success: false,
                        error: 'Failed to login user with B-Client'
                    });
                });
            } catch (error) {
                console.error(`[C-Client API] Error logging in user:`, error);
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // Get current user info
        this.app.get('/api/user/current', (req, res) => {
            // This would typically get the current user from session or token
            // For now, return a placeholder
            res.json({
                success: true,
                message: 'Current user endpoint - to be implemented'
            });
        });

        // Trigger reload endpoint (internal use)
        this.app.post('/api/trigger-reload', (req, res) => {
            const { user_id, username, cookie } = req.body;
            console.log(`[C-Client API] Received reload trigger for user: ${username}`);

            try {
                // This will be handled by the main process
                // For now, just acknowledge receipt
                res.json({
                    success: true,
                    message: 'Reload trigger received',
                    user_id: user_id,
                    username: username
                });

                // Store the reload request for the main process to handle
                this.pendingReload = {
                    user_id: user_id,
                    username: username,
                    cookie: cookie,
                    timestamp: Date.now()
                };

                console.log(`[C-Client API] Reload request stored for user: ${username}`);
            } catch (error) {
                console.error(`[C-Client API] Error handling reload trigger:`, error);
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // Logout endpoint
        this.app.post('/api/logout', (req, res) => {
            const { user_id, username, action } = req.body;
            console.log(`[C-Client API] ===== LOGOUT REQUEST RECEIVED =====`);
            console.log(`[C-Client API] Logout request for user: ${username} (${user_id})`);
            console.log(`[C-Client API] Action: ${action}`);

            try {
                // Clear stored cookie and session data
                this.storedCookie = null;
                this.pendingReload = null;

                // Notify main process to clear sessions
                if (this.mainWindow) {
                    console.log(`[C-Client API] Notifying main process to clear sessions for user: ${username}`);
                    this.mainWindow.webContents.send('clear-user-session', { user_id, username });
                }

                console.log(`[C-Client API] ===== LOGOUT SUCCESS =====`);
                res.json({
                    success: true,
                    message: `Successfully logged out user ${username}`,
                    user_id: user_id,
                    username: username
                });
            } catch (error) {
                console.error(`[C-Client API] Error during logout:`, error);
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });
    }

    // Trigger C-Client to reload with cookie
    triggerCClientReloadWithCookie(user_id, username, cookie, complete_session_data = null) {
        try {
            console.log(`[C-Client API] ===== TRIGGERING C-CLIENT RELOAD WITH COOKIE =====`);
            console.log(`[C-Client API] Triggering C-Client reload with cookie for user: ${username}`);

            // Store cookie and complete session data temporarily for the reload
            this.storedCookie = {
                user_id: user_id,
                username: username,
                cookie: cookie,
                complete_session_data: complete_session_data,
                timestamp: Date.now()
            };

            console.log(`[C-Client API] Cookie and session data stored for reload: ${username}`);
            console.log(`[C-Client API] Stored data:`, {
                user_id: this.storedCookie.user_id,
                username: this.storedCookie.username,
                has_cookie: !!this.storedCookie.cookie,
                has_complete_session_data: !!this.storedCookie.complete_session_data
            });

            // Call main process to handle cookie reload
            if (this.mainWindow && !this.mainWindow.isDestroyed()) {
                console.log(`[C-Client API] Sending cookie reload request to main process for user: ${username}`);

                const reloadData = {
                    user_id: user_id,
                    username: username,
                    cookie: cookie,
                    complete_session_data: complete_session_data
                };

                console.log(`[C-Client API] Reload data being sent:`, reloadData);

                // Use IPC to communicate with main process
                this.mainWindow.webContents.send('cookie-reload-request', reloadData);

                console.log(`[C-Client API] Cookie reload request sent to main process for user: ${username}`);
            } else {
                console.error(`[C-Client API] Main window not available for cookie reload`);
            }

            // Also try direct call to main process method as backup
            try {
                if (global.cClientMainProcess && typeof global.cClientMainProcess.handleCookieReload === 'function') {
                    console.log(`[C-Client API] Also calling main process handleCookieReload directly for user: ${username}`);
                    global.cClientMainProcess.handleCookieReload({
                        user_id: user_id,
                        username: username,
                        cookie: cookie,
                        complete_session_data: complete_session_data
                    });
                }
            } catch (error) {
                console.log(`[C-Client API] Direct method not available: ${error.message}`);
            }

        } catch (error) {
            console.error(`[C-Client API] Error triggering reload with cookie:`, error);
        }
    }

    triggerCClientNavigateToNSN(user_id, username, nmpParams) {
        console.log(`[C-Client API] ===== TRIGGERING C-CLIENT NAVIGATION TO NSN =====`);
        console.log(`[C-Client API] Navigation request for user: ${username} (${user_id})`);
        console.log(`[C-Client API] NMP parameters:`, nmpParams);

        try {
            // Build NSN URL with NMP parameters
            const nsnUrl = 'http://localhost:5000/';
            const queryParams = new URLSearchParams(nmpParams).toString();
            const fullUrl = `${nsnUrl}?${queryParams}`;

            console.log(`[C-Client API] Full NSN URL with NMP parameters: ${fullUrl}`);

            // Use IPC to communicate with main process
            if (this.mainWindow && this.mainWindow.webContents) {
                const navigationData = {
                    user_id: user_id,
                    username: username,
                    url: fullUrl,
                    nmp_params: nmpParams,
                    action: 'navigate_to_nsn_with_nmp',
                    timestamp: Date.now()
                };

                console.log(`[C-Client API] Sending navigation request to main process:`, {
                    user_id: navigationData.user_id,
                    username: navigationData.username,
                    url: navigationData.url
                });

                // Use IPC to communicate with main process
                this.mainWindow.webContents.send('navigate-to-nsn-request', navigationData);

                console.log(`[C-Client API] Navigation request sent to main process for user: ${username}`);
            } else {
                console.error(`[C-Client API] Main window not available for navigation`);
            }

            // Also try direct call to main process method as backup
            try {
                if (global.cClientMainProcess && typeof global.cClientMainProcess.handleNavigateToNSN === 'function') {
                    console.log(`[C-Client API] Also calling main process handleNavigateToNSN directly for user: ${username}`);
                    global.cClientMainProcess.handleNavigateToNSN({
                        user_id: user_id,
                        username: username,
                        url: fullUrl,
                        nmp_params: nmpParams
                    });
                }
            } catch (error) {
                console.log(`[C-Client API] Direct method not available: ${error.message}`);
            }

        } catch (error) {
            console.error(`[C-Client API] Error triggering navigation to NSN:`, error);
        }
    }

    start() {
        this.server = this.app.listen(this.port, () => {
            console.log(`[C-Client API] Server started on port ${this.port}`);
            console.log(`[C-Client API] Health check: http://localhost:${this.port}/health`);
            console.log(`[C-Client API] Cookie endpoint: http://localhost:${this.port}/api/cookie/:user_id`);
            console.log(`[C-Client API] Register endpoint: http://localhost:${this.port}/api/register`);
            console.log(`[C-Client API] Login endpoint: http://localhost:${this.port}/api/login`);
        }).on('error', (error) => {
            if (error.code === 'EADDRINUSE') {
                console.error(`[C-Client API] Port ${this.port} is already in use, trying next port...`);
                // Try next port
                this.port += 1;
                this.start();
            } else {
                console.error(`[C-Client API] Failed to start server:`, error);
            }
        });
    }


    stop() {
        if (this.server) {
            this.server.close();
            console.log('[C-Client API] Server stopped');
        }
    }
}

module.exports = CClientApiServer;
