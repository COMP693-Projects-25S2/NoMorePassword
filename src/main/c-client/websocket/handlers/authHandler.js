/**
 * AuthHandler
 * Authentication and user management
 */

// Import configuration
const apiConfig = require('../../config/apiConfig');

class AuthHandler {
    constructor(client) {
        this.client = client;
        this.logger = client.logger;
    }

    /**
     * Register current user with B-Client
     */
    registerCurrentUser() {
        if (!this.client.isConnected || !this.client.websocket) {
            this.logger.warn('[WebSocket Client] Cannot register user - not connected');
            return false;
        }

        try {
            // Get current user info for registration
            this.logger.debug(`Getting current user info...`);
            const currentUser = this.getCurrentUserInfo();
            this.logger.debug(`Current user info:`, currentUser);

            // Get main node IDs from NodeManager
            let mainNodeIds = {
                domain_main_node_id: null,
                cluster_main_node_id: null,
                channel_main_node_id: null
            };

            if (this.client.electronApp && this.client.electronApp.nodeManager) {
                this.logger.debug(`Getting main node IDs from NodeManager...`);
                mainNodeIds = this.client.electronApp.nodeManager.getMainNodeIds();
                this.logger.debug(`Main node IDs:`, mainNodeIds);
            } else {
                this.logger.warn(`[WebSocket Client] NodeManager not available, using null for main node IDs`);
            }

            // Register as C-Client with user_id and additional parameters
            const registerMessage = {
                type: 'c_client_register',
                client_id: this.client.clientId || `c-client-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                user_id: currentUser ? currentUser.user_id : null,
                username: currentUser ? currentUser.username : null,
                node_id: currentUser ? currentUser.node_id : null,
                domain_id: currentUser ? currentUser.domain_id : null,
                cluster_id: currentUser ? currentUser.cluster_id : null,
                channel_id: currentUser ? currentUser.channel_id : null,
                // Add main node IDs for node type determination
                domain_main_node_id: mainNodeIds.domain_main_node_id,
                cluster_main_node_id: mainNodeIds.cluster_main_node_id,
                channel_main_node_id: mainNodeIds.channel_main_node_id
            };
            this.logger.info(`Sending registration message with main node IDs:`, registerMessage);
            this.client.sendMessage(registerMessage);
            return true;
        } catch (error) {
            this.logger.error(`[WebSocket Client] Error registering current user:`, error);
            return false;
        }
    }

    /**
     * Re-register user after switch
     */
    async reRegisterUser() {
        this.logger.info(`Re-registering user after switch...`);

        if (!this.client.isConnected || !this.client.websocket) {
            this.logger.warn('[WebSocket Client] Cannot re-register user - not connected');
            return false;
        }

        try {
            // Get updated user info
            const currentUser = this.getCurrentUserInfo();
            this.logger.debug(`Updated user info:`, currentUser);

            // Send re-registration message
            const reRegisterMessage = {
                type: 'c_client_register',
                client_id: this.client.clientId,
                user_id: currentUser ? currentUser.user_id : null,
                username: currentUser ? currentUser.username : null,
                node_id: currentUser ? currentUser.node_id : null,
                domain_id: currentUser ? currentUser.domain_id : null,
                cluster_id: currentUser ? currentUser.cluster_id : null,
                channel_id: currentUser ? currentUser.channel_id : null,
            };

            this.logger.info(`Sending re-registration message:`, reRegisterMessage);
            this.logger.debug(`Re-registration details:`);
            this.logger.info(`   Client ID: ${this.client.clientId}`);
            this.logger.info(`   User ID: ${currentUser ? currentUser.user_id : 'null'}`);
            this.logger.info(`   Username: ${currentUser ? currentUser.username : 'null'}`);
            this.logger.info(`   Node ID: ${currentUser ? currentUser.node_id : 'null'}`);
            this.logger.info(`   WebSocket connected: ${this.client.isConnected}`);
            this.logger.info(`   WebSocket ready state: ${this.client.websocket ? this.client.websocket.readyState : 'null'}`);

            this.client.sendMessage(reRegisterMessage);
            return true;
        } catch (error) {
            this.logger.error(`[WebSocket Client] Error re-registering user:`, error);
            return false;
        }
    }

    /**
     * Get current user information from database
     */
    getCurrentUserInfo() {
        // Get current user information from local database for this specific client
        try {
            const DatabaseManager = require('../../sqlite/databaseManager');
            const currentUser = DatabaseManager.getCurrentUserFieldsForClient(
                ['user_id', 'username', 'node_id', 'domain_id', 'cluster_id', 'channel_id'],
                this.client.clientId
            );

            if (currentUser) {
                return {
                    user_id: currentUser.user_id,
                    username: currentUser.username,
                    node_id: currentUser.node_id || 'unknown',
                    domain_id: currentUser.domain_id || null,
                    cluster_id: currentUser.cluster_id || null,
                    channel_id: currentUser.channel_id || null
                };
            }
            return null;
        } catch (error) {
            this.logger.error(`[WebSocket Client] Error getting current user info:`, error);
            return null;
        }
    }

    /**
     * Check if sync_data table has any data
     */
    async checkSyncDataExists() {
        try {
            const DatabaseManager = require('../../sqlite/databaseManager');
            const syncData = DatabaseManager.getSyncData();
            const hasData = syncData && syncData.length > 0;
            this.logger.info(`🔍 [WebSocket Client] Sync data check: ${hasData ? 'Found' : 'No data'} (${syncData ? syncData.length : 0} records)`);
            return hasData;
        } catch (error) {
            this.logger.error('❌ [WebSocket Client] Error checking sync data:', error);
            return false;
        }
    }

    /**
     * Log validation message to cluster verification log file
     */
    logToClusterVerification(message) {
        try {
            // Get cluster verification logger
            const { getCClientLogger } = require('../../utils/logger');
            const clusterVerificationLogger = getCClientLogger('cluster_verification');

            // Get current timestamp
            const timestamp = new Date().toISOString();

            // Get current user info for context
            const DatabaseManager = require('../../sqlite/databaseManager');
            const clientId = this.client.clientId || process.env.C_CLIENT_ID || `c-client-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            const currentUser = DatabaseManager.getCurrentUserFieldsForClient(['username'], clientId);
            const username = currentUser ? currentUser.username : 'Unknown';

            // Log validation message to cluster verification file
            clusterVerificationLogger.info('🔍 [Cluster Verification] ===== VALIDATION DIALOG TRIGGERED =====');
            clusterVerificationLogger.info(`🔍 [Cluster Verification] Timestamp: ${timestamp}`);
            clusterVerificationLogger.info(`🔍 [Cluster Verification] User: ${username} (${clientId})`);
            clusterVerificationLogger.info(`🔍 [Cluster Verification] Message: ${message}`);
            clusterVerificationLogger.info(`🔍 [Cluster Verification] Trigger: B-Client session with validation message`);
            clusterVerificationLogger.info(`🔍 [Cluster Verification] Condition: sync_data table has data`);
            clusterVerificationLogger.info('🔍 [Cluster Verification] ===== END VALIDATION DIALOG LOG =====');

            this.logger.info('✅ [WebSocket Client] Validation message logged to cluster verification file');
        } catch (error) {
            this.logger.error('❌ [WebSocket Client] Error logging to cluster verification file:', error);
        }
    }

    /**
     * Show validation dialog with message content
     */
    async showValidationDialog(message) {
        try {
            this.logger.info('🔍 [WebSocket Client] ===== CREATING VALIDATION DIALOG =====');
            this.logger.info(`🔍 [WebSocket Client] Dialog message: ${message}`);

            // Log to cluster verification log file
            this.logToClusterVerification(message);

            const { BrowserWindow, screen } = require('electron');
            const path = require('path');

            // Get current user info for dialog title
            const DatabaseManager = require('../../sqlite/databaseManager');
            const clientId = this.client.clientId || process.env.C_CLIENT_ID || `c-client-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            const currentUser = DatabaseManager.getCurrentUserFieldsForClient(['username'], clientId);
            const username = currentUser ? currentUser.username : 'User';

            // Dialog dimensions and positioning (same as greeting dialog)
            const dialogWidth = 300;
            const dialogHeight = 120;

            // Get display info for positioning
            const displays = screen.getAllDisplays();
            const primaryDisplay = displays.find(d => d.id === screen.getPrimaryDisplay().id) || displays[0];
            const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;

            // Position dialog at bottom-right of main window (same as hello user dialog)
            let x, y;

            try {
                // Get all browser windows and find the main window
                const windows = BrowserWindow.getAllWindows();
                const mainWindow = windows.find(w => w && !w.isDestroyed());

                if (mainWindow && typeof mainWindow.getBounds === 'function') {
                    // Position relative to main window (same as hello user dialog)
                    const mainBounds = mainWindow.getBounds();
                    x = Math.max(0, mainBounds.x + mainBounds.width - dialogWidth - 20);
                    y = Math.max(0, mainBounds.y + mainBounds.height - dialogHeight - 20);
                } else {
                    // Fallback to center of screen if main window not available
                    x = Math.max(0, Math.floor((screenWidth - dialogWidth) / 2));
                    y = Math.max(0, Math.floor((screenHeight - dialogHeight) / 2));
                }
            } catch (error) {
                this.logger.error('Error positioning dialog relative to main window:', error);
                // Fallback to center of screen
                x = Math.max(0, Math.floor((screenWidth - dialogWidth) / 2));
                y = Math.max(0, Math.floor((screenHeight - dialogHeight) / 2));
            }

            // Ensure dialog is within screen bounds
            const finalX = Math.min(x, screenWidth - dialogWidth - 20);
            const finalY = Math.min(y, screenHeight - dialogHeight - 20);

            // Create validation dialog window
            const dialogWindow = new BrowserWindow({
                width: dialogWidth,
                height: dialogHeight,
                x: finalX,
                y: finalY,
                resizable: false,
                minimizable: false,
                maximizable: false,
                fullscreenable: false,
                alwaysOnTop: true,
                skipTaskbar: false,
                show: false,
                frame: false,
                transparent: false,
                backgroundColor: '#ffffff',
                webPreferences: {
                    nodeIntegration: true,
                    contextIsolation: false,
                    enableRemoteModule: false,
                    preload: path.join(__dirname, '../../pages/preload.js'),
                }
            });

            // Set window properties
            dialogWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

            // Load validation dialog HTML content (matching hello user dialog style)
            const htmlContent = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Validation Dialog</title>
    <style>
        body {
            margin: 0;
            padding: 20px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: white;
            color: #333;
            display: flex;
            align-items: center;
            justify-content: center;
            height: 100vh;
            box-sizing: border-box;
        }
        .greeting-container {
            text-align: center;
            padding: 20px;
        }
        .greeting-text {
            font-size: 18px;
            font-weight: 600;
            color: #4CAF50;
            margin: 0;
        }
        .username {
            font-weight: 700;
            color: #2196F3;
        }
        .message-content {
            font-size: 14px;
            color: #666;
            margin-top: 8px;
        }
    </style>
</head>
<body>
    <div class="greeting-container">
        <p class="greeting-text">Hello, <span class="username">${username}</span></p>
        <div class="message-content">${message}</div>
    </div>
</body>
</html>`;

            // Load HTML content
            dialogWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`);

            // Show window after content is loaded
            dialogWindow.once('ready-to-show', () => {
                dialogWindow.show();
                dialogWindow.focus();
            });

            // Auto-close after 5 seconds
            setTimeout(() => {
                if (dialogWindow && !dialogWindow.isDestroyed()) {
                    this.logger.info('🔍 [WebSocket Client] Auto-closing validation dialog after 5 seconds');
                    dialogWindow.close();
                }
            }, 5000);

            this.logger.info('✅ [WebSocket Client] Validation dialog created and shown successfully');

        } catch (error) {
            this.logger.error('❌ [WebSocket Client] Error creating validation dialog:', error);
        }
    }

    /**
     * Handle auto-login from B-Client
     */
    async handleAutoLogin(message) {
        try {
            this.logger.info('🔐 [WebSocket Client] ===== AUTO LOGIN MESSAGE RECEIVED =====');
            this.logger.info('🔐 [WebSocket Client] Auto-login message:', message);

            const { user_id, session_data, website_config, message: msg, timestamp, nsn_username } = message;

            this.logger.info('🔐 [WebSocket Client] User ID:', user_id);
            this.logger.info('🔐 [WebSocket Client] Session data type:', typeof session_data);
            this.logger.info('🔐 [WebSocket Client] Session data:', session_data);
            this.logger.info('🔐 [WebSocket Client] Website config:', website_config);
            this.logger.info('🔐 [WebSocket Client] Message:', msg);
            this.logger.info('🔐 [WebSocket Client] Timestamp:', timestamp);

            // Note: Message field check and validation dialog will be handled at the end of the method

            // Add WebSocket connection state logging
            this.logger.info('🔍 [WebSocket Client] ===== WEBSOCKET CONNECTION STATE =====');
            this.logger.info('🔍 [WebSocket Client] WebSocket connection state:');
            this.logger.info('   - isConnected:', this.client.isConnected);
            this.logger.info('   - isRegistered:', this.client.isRegistered);
            this.logger.info('   - readyState:', this.client.websocket ? this.client.websocket.readyState : 'N/A');
            this.logger.info('   - WebSocket object:', !!this.client.websocket);
            this.logger.info('🔍 [WebSocket Client] ===== END WEBSOCKET STATE =====');

            // Check if user has logged out (prevent auto-login after logout)
            this.logger.info('🔍 [WebSocket Client] ===== CHECKING USER LOGOUT STATUS =====');
            const isUserLoggedOut = await this.checkUserLogoutStatus(user_id);
            if (isUserLoggedOut) {
                this.logger.info('🔓 [WebSocket Client] User has logged out, rejecting auto-login');
                this.logger.info('🔓 [WebSocket Client] User must login manually to reset logout status');

                // Add WebSocket connection state logging after logout check
                this.logger.info('🔍 [WebSocket Client] ===== WEBSOCKET STATE AFTER LOGOUT CHECK =====');
                this.logger.info('🔍 [WebSocket Client] WebSocket connection state after logout rejection:');
                this.logger.info('   - isConnected:', this.client.isConnected);
                this.logger.info('   - isRegistered:', this.client.isRegistered);
                this.logger.info('   - readyState:', this.client.websocket ? this.client.websocket.readyState : 'N/A');
                this.logger.info('   - WebSocket object:', !!this.client.websocket);
                this.logger.info('🔍 [WebSocket Client] ===== END POST-LOGOUT STATE =====');

                // Send feedback to B-Client that auto-login was rejected
                this.client.sendSessionFeedback(message, false, 'User has logged out, auto-login rejected');

                // Add WebSocket connection state logging after sending feedback
                this.logger.info('🔍 [WebSocket Client] ===== WEBSOCKET STATE AFTER FEEDBACK =====');
                this.logger.info('🔍 [WebSocket Client] WebSocket connection state after sending feedback:');
                this.logger.info('   - isConnected:', this.client.isConnected);
                this.logger.info('   - isRegistered:', this.client.isRegistered);
                this.logger.info('   - readyState:', this.client.websocket ? this.client.websocket.readyState : 'N/A');
                this.logger.info('   - WebSocket object:', !!this.client.websocket);
                this.logger.info('🔍 [WebSocket Client] ===== END POST-FEEDBACK STATE =====');

                return;
            }
            this.logger.info('✅ [WebSocket Client] User is not logged out, proceeding with auto-login');
            this.logger.info('🔍 [WebSocket Client] ===== END CHECKING LOGOUT STATUS =====');

            // Check if already logged in to NSN to prevent duplicate login
            this.logger.info('🔍 [WebSocket Client] ===== CHECKING CURRENT LOGIN STATUS =====');
            const isAlreadyLoggedIn = await this.checkNSNLoginStatus();
            if (isAlreadyLoggedIn) {
                this.logger.info('✅ [WebSocket Client] Already logged in to NSN, skipping auto-login');
                this.logger.info('✅ [WebSocket Client] This prevents duplicate login from multiple C-Client instances');

                // Send success feedback to B-Client that we're already logged in
                this.client.sendSessionFeedback(message, true, 'Already logged in to NSN, no action needed');
                return;
            }
            this.logger.info('🔍 [WebSocket Client] Not logged in to NSN, proceeding with auto-login');
            this.logger.info('🔍 [WebSocket Client] ===== END CHECKING LOGIN STATUS =====');

            // Register website configuration if provided
            if (website_config && this.client.mainWindow && this.client.mainWindow.tabManager) {
                this.logger.info('🌐 [WebSocket Client] Registering website configuration:', website_config);
                this.client.mainWindow.tabManager.registerWebsite(website_config);
            }

            // Show cluster verification result dialog if verification was performed
            if (message.cluster_verification) {
                this.logger.info('🔍 [WebSocket Client] ===== CLUSTER VERIFICATION RESULT DETECTED =====');
                this.logger.info('🔍 Verification result:', message.cluster_verification);

                try {
                    const { ipcMain } = require('electron');

                    // Show verification result dialog via IPC
                    // We need to invoke from the main process, so we'll use the client's window
                    if (this.client.mainWindow && this.client.mainWindow.webContents) {
                        // Send IPC event to show verification dialog
                        // Note: We can't use ipcRenderer.invoke from main process, 
                        // so we need to call the IPC handler directly or use a different approach

                        // Import IPC handlers
                        const { BrowserWindow } = require('electron');
                        const path = require('path');

                        this.logger.info('🔍 Creating cluster verification dialog window');

                        const verificationDialog = new BrowserWindow({
                            width: 520,
                            height: 480,
                            modal: false,
                            parent: this.client.mainWindow,
                            resizable: false,
                            minimizable: false,
                            maximizable: false,
                            alwaysOnTop: false,
                            webPreferences: {
                                nodeIntegration: true,
                                contextIsolation: false
                            }
                        });

                        const encodedResult = encodeURIComponent(JSON.stringify(message.cluster_verification));
                        const dialogPath = path.join(__dirname, '..', '..', 'clusterVerificationDialog.html');

                        await verificationDialog.loadFile(dialogPath, {
                            query: {
                                result: encodedResult
                            }
                        });

                        verificationDialog.removeMenu();

                        // Auto-close when main window closes
                        if (this.client.mainWindow) {
                            const mainWindowCloseHandler = () => {
                                if (verificationDialog && !verificationDialog.isDestroyed()) {
                                    this.logger.info('🔍 Main window closing, auto-closing verification dialog');
                                    verificationDialog.close();
                                }
                            };

                            this.client.mainWindow.once('close', mainWindowCloseHandler);

                            // Clean up listener when dialog is closed
                            verificationDialog.once('closed', () => {
                                if (this.client.mainWindow && !this.client.mainWindow.isDestroyed()) {
                                    this.client.mainWindow.removeListener('close', mainWindowCloseHandler);
                                }
                            });
                        }

                        this.logger.info('✅ [WebSocket Client] Cluster verification dialog shown successfully');
                    } else {
                        this.logger.warning('⚠️ [WebSocket Client] Main window not available for showing verification dialog');
                    }
                } catch (error) {
                    this.logger.error('❌ [WebSocket Client] Error showing cluster verification dialog:', error);
                }

                this.logger.info('🔍 [WebSocket Client] ===== END CLUSTER VERIFICATION RESULT =====');
            }

            if (!session_data) {
                this.logger.error('❌ [WebSocket Client] No session data provided for auto-login');
                // Send error feedback to B-Client
                this.client.sendSessionFeedback(message, false, 'No session data provided for auto-login');
                return;
            }

            // Use pre-processed session data from B-Client
            this.logger.info('🔐 [WebSocket Client] Using pre-processed session data from B-Client');
            this.logger.info('🔐 [WebSocket Client] Session data type:', typeof session_data);
            this.logger.info('🔐 [WebSocket Client] Session data:', session_data);

            this.logger.info('🔐 [WebSocket Client] ===== PERFORMING AUTO LOGIN =====');
            this.logger.info('🔐 [WebSocket Client] Logging in user:', user_id);
            this.logger.info('🔐 [WebSocket Client] User ID:', user_id);

            // Use pre-processed session data from B-Client
            const { session } = require('electron');
            const nsnSession = session.fromPartition('persist:nsn');

            this.logger.info('🔐 [WebSocket Client] Using pre-processed session data from B-Client');
            this.logger.info('🔐 [WebSocket Client] Session data type:', typeof session_data);
            this.logger.info('🔐 [WebSocket Client] Session data:', session_data);

            // Set session cookie using standard JSON format
            const sessionValue = session_data.session_cookie;
            if (sessionValue) {
                this.logger.info('🔍 [WebSocket Client] ===== RECEIVED SESSION FROM B-CLIENT =====');
                this.logger.info('🔍 [WebSocket Client] Session data type:', typeof sessionValue);
                this.logger.info('🔍 [WebSocket Client] Session data length:', sessionValue.length);
                this.logger.info('🔍 [WebSocket Client] Session data content:', sessionValue);
                this.logger.info('🔍 [WebSocket Client] ===== END RECEIVED SESSION =====');

                // Log cookie setting process in detail
                this.logger.info('🍪 [WebSocket Client] ===== SETTING SESSION COOKIE =====');
                this.logger.info(`🍪 [WebSocket Client] Target URL: ${apiConfig.getNsnUrl()}`);
                this.logger.info('🍪 [WebSocket Client] Cookie name: session');
                this.logger.info('🍪 [WebSocket Client] Cookie value:', sessionValue);
                this.logger.info('🍪 [WebSocket Client] Domain: localhost');
                this.logger.info('🍪 [WebSocket Client] Path: /');
                this.logger.info('🍪 [WebSocket Client] Session partition: persist:nsn');

                // Use NSN session partition to set cookie
                this.logger.info('🍪 [WebSocket Client] Using NSN session partition to set cookie');
                await nsnSession.cookies.set({
                    url: apiConfig.getNsnUrl(),
                    name: 'session',
                    value: sessionValue,
                    domain: 'localhost',
                    path: '/',
                    httpOnly: true,
                    secure: false,
                    sameSite: 'lax'
                });
                this.logger.info('✅ [WebSocket Client] Session cookie set successfully');
                this.logger.info('🍪 [WebSocket Client] ===== END SETTING SESSION COOKIE =====');

                // Verify cookie was set successfully
                this.logger.info('🔍 [WebSocket Client] ===== VERIFYING COOKIE SET =====');
                const cookies = await nsnSession.cookies.get({ url: apiConfig.getNsnUrl() });
                this.logger.info('🔍 [WebSocket Client] Total cookies found:', cookies.length);
                this.logger.info('🔍 [WebSocket Client] All cookies:', cookies.map(c => `${c.name}=${c.value.substring(0, 50)}...`));

                const sessionCookie = cookies.find(cookie => cookie.name === 'session');
                if (sessionCookie) {
                    this.logger.info('✅ [WebSocket Client] Cookie verification successful');
                    this.logger.info('🔍 [WebSocket Client] Cookie name:', sessionCookie.name);
                    this.logger.info('🔍 [WebSocket Client] Cookie value type:', typeof sessionCookie.value);
                    this.logger.info('🔍 [WebSocket Client] Cookie value length:', sessionCookie.value.length);
                    this.logger.info('🔍 [WebSocket Client] Cookie value content:', sessionCookie.value);
                    this.logger.info('🔍 [WebSocket Client] Cookie domain:', sessionCookie.domain);
                    this.logger.info('🔍 [WebSocket Client] Cookie path:', sessionCookie.path);
                    this.logger.info('🔍 [WebSocket Client] Cookie httpOnly:', sessionCookie.httpOnly);
                    this.logger.info('🔍 [WebSocket Client] Cookie secure:', sessionCookie.secure);
                } else {
                    this.logger.info('❌ [WebSocket Client] Cookie verification failed - session cookie not found');
                    this.logger.info('🔍 [WebSocket Client] Available cookie names:', cookies.map(c => c.name));
                    this.logger.info('⚠️ [WebSocket Client] Cookie verification failed, but continuing operation...');
                }
                this.logger.info('🔍 [WebSocket Client] ===== END COOKIE VERIFICATION =====');
            } else {
                this.logger.info('⚠️ [WebSocket Client] No session cookie provided');
            }

            this.logger.info('✅ [WebSocket Client] ===== AUTO LOGIN COMPLETED =====');
            this.logger.info('✅ [WebSocket Client] User successfully logged in to NSN');
            this.logger.info('✅ [WebSocket Client] Cookies set for automatic authentication');

            // Notify main process about successful auto-login
            const { ipcMain } = require('electron');
            if (ipcMain) {
                ipcMain.emit('auto-login-success', {
                    user_id: user_id,
                    username: nsn_username,
                    session_data: session_data
                });
            }

            // Wait a moment for cookies to be fully set before refreshing
            this.logger.info('⏳ [WebSocket Client] Waiting 50ms for cookies to be fully set...');
            await new Promise(resolve => setTimeout(resolve, 50));
            this.logger.info('✅ [WebSocket Client] Cookie setup delay completed');

            // Trigger page refresh to apply the new session
            this.logger.info('🔄 [WebSocket Client] Triggering page refresh to apply new session...');
            this.logger.info('🔄 [WebSocket Client] Main window available:', !!this.client.mainWindow);
            try {
                // Get the main window and refresh the NSN tab
                if (this.client.mainWindow && this.client.mainWindow.windowManager) {
                    this.logger.info('🔄 [WebSocket Client] WindowManager available:', !!this.client.mainWindow.windowManager);
                    const mainWindow = this.client.mainWindow.windowManager.getMainWindow();
                    this.logger.info('🔄 [WebSocket Client] Main window object:', !!mainWindow);
                    if (mainWindow) {
                        // Find all tabs for the website and refresh them
                        const tabManager = this.client.mainWindow.tabManager;
                        this.logger.info('🔄 [WebSocket Client] TabManager available:', !!tabManager);
                        if (tabManager && website_config) {
                            const websiteTabs = tabManager.findAllTabsForWebsite(website_config);
                            this.logger.info(`[WebSocket Client] ${website_config.name} tabs found:`, websiteTabs.length);
                            if (websiteTabs.length > 0) {
                                // Process all website tabs
                                for (let i = 0; i < websiteTabs.length; i++) {
                                    const websiteTab = websiteTabs[i];
                                    this.logger.info(`[WebSocket Client] Processing ${website_config.name} tab ${i + 1}/${websiteTabs.length} (ID: ${websiteTab.id})`);
                                    this.logger.info(`[WebSocket Client] Navigating ${website_config.name} tab to root path to apply new session`);

                                    // Verify cookie still exists before navigation
                                    this.logger.info('🔍 [WebSocket Client] ===== PRE-NAVIGATION COOKIE CHECK =====');
                                    const websiteUrl = website_config.root_url || apiConfig.getNsnUrl();
                                    const preNavCookies = await nsnSession.cookies.get({ url: websiteUrl });
                                    const preNavSessionCookie = preNavCookies.find(cookie => cookie.name === 'session');
                                    if (preNavSessionCookie) {
                                        this.logger.info('✅ [WebSocket Client] Pre-navigation cookie check: session cookie exists');
                                        this.logger.info('🔍 [WebSocket Client] Pre-navigation cookie value:', preNavSessionCookie.value);
                                    } else {
                                        this.logger.info('❌ [WebSocket Client] Pre-navigation cookie check: session cookie missing');
                                    }
                                    this.logger.info('🔍 [WebSocket Client] ===== END PRE-NAVIGATION COOKIE CHECK =====');

                                    // Navigate to website root path to trigger session check
                                    // Re-set cookie before navigation to ensure correct format
                                    this.logger.info('🔄 [WebSocket Client] Re-setting cookie before navigation to ensure correct format');

                                    // Check if webContents exists and has session
                                    if (websiteTab.browserView.webContents && websiteTab.browserView.webContents.session) {
                                        await websiteTab.browserView.webContents.session.cookies.set({
                                            url: websiteUrl,
                                            name: 'session',
                                            value: sessionValue, // Use original JSON string
                                            domain: new URL(websiteUrl).hostname,
                                            path: '/',
                                            httpOnly: true,
                                            secure: false,
                                            sameSite: 'lax'
                                        });
                                        this.logger.info(`[WebSocket Client] Cookie re-set successfully in ${website_config.name} tab`);
                                    } else {
                                        this.logger.info(`[WebSocket Client] ${website_config.name} tab webContents or session not available, skipping cookie re-set`);
                                    }

                                    // Apply session cookie directly to website tab (like ViewManager does)
                                    this.logger.info(`[WebSocket Client] Applying session cookie directly to ${website_config.name} tab...`);
                                    if (websiteTab.browserView.webContents && websiteTab.browserView.webContents.session) {
                                        // Extract the actual cookie value from the session cookie string
                                        let cookieValue = sessionValue;
                                        if (sessionValue.startsWith('session=')) {
                                            cookieValue = sessionValue.split('session=')[1].split(';')[0];
                                        }

                                        this.logger.info(`[WebSocket Client] Setting session cookie directly to ${website_config.name} tab...`);
                                        this.logger.info('🔄 [WebSocket Client] Cookie value:', cookieValue.substring(0, 50) + '...');

                                        // Set cookie directly in the website tab's session (like ViewManager)
                                        // Use the website tab's actual session, not the persist:nsn partition
                                        await websiteTab.browserView.webContents.session.cookies.set({
                                            url: websiteUrl,
                                            name: 'session',
                                            value: cookieValue,
                                            httpOnly: true,
                                            secure: false,
                                            domain: new URL(websiteUrl).hostname,
                                            path: '/'
                                        });

                                        this.logger.info(`[WebSocket Client] Session cookie set directly to ${website_config.name} tab`);

                                        // Navigate to root URL from website config to let website handle redirect based on session state
                                        const rootUrl = website_config?.root_url || websiteUrl;
                                        this.logger.info(`[WebSocket Client] Navigating ${website_config.name} tab to root URL from config:`, rootUrl);
                                        websiteTab.browserView.webContents.loadURL(rootUrl);
                                        this.logger.info(`[WebSocket Client] ${website_config.name} tab navigated to root, website will handle redirect based on session state`);
                                    } else {
                                        this.logger.info(`[WebSocket Client] ${website_config.name} tab webContents or session not available, cannot apply cookie`);
                                    }

                                    // Listen for page load completion event to verify cookie delivery
                                    websiteTab.browserView.webContents.once('did-finish-load', async () => {
                                        this.logger.info('🔍 [WebSocket Client] ===== POST-NAVIGATION COOKIE CHECK =====');
                                        this.logger.info('🔍 [WebSocket Client] Page finished loading, checking cookies...');

                                        // Get current page cookies
                                        const postNavCookies = await websiteTab.browserView.webContents.session.cookies.get({ url: websiteUrl });
                                        const postNavSessionCookie = postNavCookies.find(cookie => cookie.name === 'session');

                                        if (postNavSessionCookie) {
                                            this.logger.info('✅ [WebSocket Client] Post-navigation cookie check: session cookie exists');
                                            this.logger.info('🔍 [WebSocket Client] Post-navigation cookie value:', postNavSessionCookie.value);
                                        } else {
                                            this.logger.info('❌ [WebSocket Client] Post-navigation cookie check: session cookie missing');
                                            this.logger.info('🔍 [WebSocket Client] Available cookies:', postNavCookies.map(c => c.name));
                                        }
                                        this.logger.info('🔍 [WebSocket Client] ===== END POST-NAVIGATION COOKIE CHECK =====');
                                    });
                                }
                            } else {
                                this.logger.info(`[WebSocket Client] No ${website_config.name} tab found, navigating current tab to ${website_config.name}...`);
                                this.logger.info(`[WebSocket Client] Applying session to current tab by navigating to ${website_config.name}...`);

                                // Navigate current tab to website with NMP parameters
                                try {
                                    const currentTabId = tabManager.getCurrentTab();
                                    if (currentTabId) {
                                        this.logger.info(`[WebSocket Client] Navigating current tab to ${website_config.name} with NMP parameters:`, currentTabId);

                                        // Use the URL parameter injector to get NMP parameters
                                        const { URLParameterInjector } = require('../../utils/urlParameterInjector');
                                        const injector = new URLParameterInjector();

                                        // Get the processed URL with NMP parameters using website config
                                        const websiteUrl = website_config.root_url || apiConfig.getNsnUrl();
                                        const processedUrl = await injector.processUrl(websiteUrl, this.client.clientId);
                                        this.logger.info(`[WebSocket Client] Processed URL with NMP parameters for ${website_config.name}:`, processedUrl);

                                        await tabManager.navigateTo(processedUrl);
                                        this.logger.info(`[WebSocket Client] Current tab navigated to ${website_config.name} with NMP parameters successfully`);

                                        // Wait for navigation to complete, then set session cookie
                                        setTimeout(async () => {
                                            try {
                                                const currentTab = tabManager.getCurrentTab();
                                                if (currentTab && currentTab.webContents && currentTab.webContents.session) {
                                                    this.logger.info('🔄 [WebSocket Client] Setting session cookie to current tab after navigation...');

                                                    // Extract the actual cookie value from the session cookie string
                                                    let cookieValue = sessionValue;
                                                    if (sessionValue.startsWith('session=')) {
                                                        cookieValue = sessionValue.split('session=')[1].split(';')[0];
                                                    }

                                                    // Set cookie directly in the current tab's session
                                                    // Use the current tab's actual session, not the persist:nsn partition
                                                    await currentTab.webContents.session.cookies.set({
                                                        url: apiConfig.getNsnUrl(),
                                                        name: 'session',
                                                        value: cookieValue,
                                                        httpOnly: true,
                                                        secure: false,
                                                        domain: 'localhost',
                                                        path: '/'
                                                    });

                                                    this.logger.info('✅ [WebSocket Client] Session cookie set to current tab');

                                                    // Navigate to root URL from website config to let NSN handle redirect based on session state
                                                    const rootUrl = website_config?.root_url || `${apiConfig.getNsnUrl()}/`;
                                                    this.logger.info('🔄 [WebSocket Client] Navigating current tab to root URL from config:', rootUrl);
                                                    currentTab.webContents.loadURL(rootUrl);
                                                    this.logger.info('✅ [WebSocket Client] Current tab navigated to root, NSN will handle redirect based on session state');
                                                }
                                            } catch (error) {
                                                this.logger.error('❌ [WebSocket Client] Error setting session cookie to current tab:', error);
                                            }
                                        }, 1000); // Wait 1 second for navigation to complete
                                    } else {
                                        this.logger.info('⚠️ [WebSocket Client] No current tab found, session cookie will be applied when user navigates to NSN');
                                    }
                                } catch (error) {
                                    this.logger.error('❌ [WebSocket Client] Error navigating current tab to NSN:', error);
                                    this.logger.info('⚠️ [WebSocket Client] Session cookie will be applied when user navigates to NSN');
                                }
                            }
                        } else {
                            this.logger.info('⚠️ [WebSocket Client] ViewManager not available');
                        }
                    } else {
                        this.logger.info('⚠️ [WebSocket Client] Main window object not available');
                    }
                } else {
                    this.logger.info('⚠️ [WebSocket Client] Main window or windowManager not available');
                    this.logger.info('⚠️ [WebSocket Client] this.mainWindow:', !!this.client.mainWindow);
                    this.logger.info('⚠️ [WebSocket Client] this.mainWindow.windowManager:', !!(this.client.mainWindow && this.client.mainWindow.windowManager));
                }
            } catch (error) {
                this.logger.error('❌ [WebSocket Client] Error refreshing page:', error);
                this.logger.error('❌ [WebSocket Client] Error details:', error.message);
                this.logger.error('❌ [WebSocket Client] Stack trace:', error.stack);
            }

            // Send success feedback to B-Client after auto-login completion
            this.client.sendSessionFeedback(message, true, 'Auto-login completed successfully');

            // Check if message field has value and sync_data table has data (after all other checks pass)
            if (msg && msg.trim()) {
                this.logger.info('🔍 [WebSocket Client] ===== MESSAGE FIELD DETECTED =====');
                this.logger.info(`🔍 [WebSocket Client] Message content: ${msg}`);

                // Filter out standard auto-login messages, only show validation messages
                const isValidationMessage = msg.includes('login success with validation');
                const isStandardAutoLogin = msg.includes('Auto-login with pre-processed session data from B-Client') ||
                    msg.includes('Auto-login with session data');

                if (isStandardAutoLogin) {
                    this.logger.info('🔍 [WebSocket Client] Standard auto-login message detected, skipping validation dialog');
                    return;
                }

                if (isValidationMessage) {
                    this.logger.info('🔍 [WebSocket Client] Validation message detected, checking sync data...');

                    // Check if sync_data table has data
                    const hasSyncData = await this.checkSyncDataExists();
                    this.logger.info(`🔍 [WebSocket Client] Sync data exists: ${hasSyncData}`);

                    if (hasSyncData) {
                        this.logger.info('🔍 [WebSocket Client] ===== SHOWING VALIDATION DIALOG =====');
                        // Show validation dialog with message content
                        await this.showValidationDialog(msg);
                    } else {
                        this.logger.info('🔍 [WebSocket Client] No sync data found, skipping validation dialog');
                    }
                } else {
                    this.logger.info('🔍 [WebSocket Client] Unknown message type, skipping validation dialog');
                }
            } else {
                this.logger.info('🔍 [WebSocket Client] No message field or empty message, skipping validation dialog');
            }

        } catch (error) {
            this.logger.error('❌ [WebSocket Client] Error in auto-login:', error);

            // Send error feedback to B-Client
            this.client.sendSessionFeedback(message, false, error.message);
        }
    }

    /**
     * Handle user logout notification from B-Client
     */
    async handleUserLogoutNotification(data) {
        try {
            this.logger.info('🔓 [WebSocket Client] ===== USER LOGOUT NOTIFICATION =====');
            this.logger.info('🔓 [WebSocket Client] User logout notification:', data);

            const { user_id, username, website_config } = data;

            this.logger.info('🔓 [WebSocket Client] Logging out user:', user_id);
            this.logger.info('🔓 [WebSocket Client] Username:', username);
            this.logger.info('🔓 [WebSocket Client] Website config:', website_config);

            // Check if this is a repeated logout for this specific client instance
            const isRepeatedLogout = this.isRepeatedLogout(this.client.clientId, user_id);
            this.logger.info(`🔓 [WebSocket Client] Repeated logout check: ${isRepeatedLogout}`);

            // Step 1: Clear website-specific browser sessions (always complete cleanup)
            this.logger.info('🔓 [WebSocket Client] Step 1: Clearing website-specific browser sessions...');
            if (this.client.mainWindow && this.client.mainWindow.tabManager) {
                try {
                    // Always clear all sessions for complete cleanup - no optimization for repeated logouts
                    await this.client.clearWebsiteSpecificSessions(website_config);
                    this.logger.info(`[WebSocket Client] ${website_config?.name || 'Website'} browser sessions cleared (other websites preserved)`);
                } catch (error) {
                    this.logger.error('❌ [WebSocket Client] Error clearing website browser sessions:', error);
                }
            } else {
                this.logger.warn('⚠️ [WebSocket Client] TabManager not available for session clearing');
            }

            // Step 2: Close website-specific tabs (always complete cleanup)
            this.logger.info('🔓 [WebSocket Client] Step 2: Closing website-specific tabs...');
            if (this.client.mainWindow && this.client.mainWindow.tabManager) {
                try {
                    // Always close all tabs for complete logout - no optimization for repeated logouts
                    await this.client.closeWebsiteSpecificTabs(website_config);
                    this.logger.info(`[WebSocket Client] ${website_config?.name || 'Website'} tabs closed (other website tabs preserved)`);
                } catch (error) {
                    this.logger.error('❌ [WebSocket Client] Error managing website tabs:', error);
                }
            } else {
                this.logger.warn('⚠️ [WebSocket Client] TabManager not available for tab management');
            }

            // Step 3: Clear local user session data (always clear for complete logout)
            this.logger.info('🔓 [WebSocket Client] Step 3: Clearing local user session data...');
            try {
                // Always clear session data for complete logout - no optimization for repeated logouts
                await this.client.clearUserSessionData(user_id);
                this.logger.info('ℹ️ [WebSocket Client] User session data cleared');
            } catch (error) {
                this.logger.error('❌ [WebSocket Client] Error clearing local session data:', error);
            }

            this.logger.info('✅ [WebSocket Client] ===== USER LOGOUT COMPLETED =====');
            this.logger.info('✅ [WebSocket Client] User logout process completed successfully');

            // Step 4: IMMEDIATELY send feedback to B-Client (before any other operations)
            this.logger.info('🚀 [WebSocket Client] Step 4: IMMEDIATELY sending logout feedback to B-Client...');
            this.client.sendLogoutFeedback(data, true, 'Logout completed successfully');
            this.logger.info('✅ [WebSocket Client] Logout feedback sent IMMEDIATELY');

            // Step 5: Brief delay to ensure feedback is sent before proceeding
            this.logger.info('⏳ [WebSocket Client] Step 5: Brief delay to ensure feedback delivery...');
            await new Promise(resolve => setTimeout(resolve, 200)); // 200ms delay to ensure feedback is sent

            // Step 6: Call NSN logout API (after feedback is sent)
            this.logger.info('🔓 [WebSocket Client] Step 6: Calling NSN logout API...');
            if (data.logout_api?.url) {
                this.logger.info('🔓 [WebSocket Client] Calling NSN logout API...');
                await this.callNSNLogoutAPI(data.logout_api.url, data.website_config?.root_path);
                this.logger.info('✅ [WebSocket Client] NSN logout API called');
            } else {
                this.logger.info('⚠️ [WebSocket Client] No logout API URL provided, skipping server-side logout');
            }

            // Step 7: Mark current WebSocket server connection as unavailable
            this.logger.info('🔓 [WebSocket Client] Step 7: Marking current WebSocket server connection as unavailable...');
            this.client.markCurrentWebSocketServerAsUnavailable();
            this.logger.info('✅ [WebSocket Client] Current WebSocket server connection marked as unavailable');

            // Step 8: Reset WebSocket connection (after all operations)
            this.logger.info('🔓 [WebSocket Client] Step 8: Resetting WebSocket connection...');
            this.client.resetWebSocketConnection();
            this.logger.info('✅ [WebSocket Client] WebSocket connection reset');

            // Clear logout history after successful logout (allows new logout flows)
            this.clearLogoutHistory(this.client.clientId, user_id);

        } catch (error) {
            this.logger.error('❌ [WebSocket Client] Error handling user logout notification:', error);
            this.logger.error('❌ [WebSocket Client] Error details:', error.stack);

            // Send error feedback to B-Client
            this.client.sendLogoutFeedback(data, false, error.message);
        }
    }

    /**
     * Check if this is a repeated logout for the same CLIENT within a SINGLE logout flow
     * This prevents processing duplicate messages in the same logout sequence
     * Uses client_id + user_id to uniquely identify each client instance
     */
    isRepeatedLogout(client_id, user_id) {
        if (!this.logoutHistory) {
            this.logoutHistory = {};
        }

        // Use client_id + user_id as key to track each client instance separately
        const key = `${client_id}_${user_id}`;
        const now = Date.now();
        const lastLogoutTime = this.logoutHistory[key];

        this.logger.info(`🔍 [WebSocket Client] Checking repeated logout for key: ${key}`);
        this.logger.info(`🔍 [WebSocket Client] Current time: ${now}`);
        this.logger.info(`🔍 [WebSocket Client] Last logout time: ${lastLogoutTime || 'none'}`);
        this.logger.info(`🔍 [WebSocket Client] Logout history keys: ${Object.keys(this.logoutHistory).join(', ')}`);

        if (!lastLogoutTime) {
            // First logout for this client instance
            this.logoutHistory[key] = now;
            this.logger.info(`🔍 [WebSocket Client] First logout for key ${key}, recorded time`);
            return false;
        }

        // Consider it repeated if within 10 seconds (short window for same logout flow)
        // CRITICAL: Only update time if it's NOT repeated, to avoid extending the window
        const timeDiff = now - lastLogoutTime;
        const isRepeated = timeDiff < 10000;

        this.logger.info(`🔍 [WebSocket Client] Time diff: ${timeDiff}ms, isRepeated: ${isRepeated}`);

        if (!isRepeated) {
            // This is a NEW logout flow for this client, update the timestamp
            this.logoutHistory[key] = now;
            this.logger.info(`🔍 [WebSocket Client] New logout flow, updated timestamp for key ${key}`);
        } else {
            this.logger.info(`🔍 [WebSocket Client] Repeated logout within 10s window`);
        }
        // If repeated, DON'T update timestamp to keep the window stable

        return isRepeated;
    }

    /**
     * Clear logout history after successful logout (allows new logout flows)
     */
    clearLogoutHistory(client_id, user_id) {
        if (this.logoutHistory) {
            const key = `${client_id}_${user_id}`;
            this.logger.info(`🧹 [WebSocket Client] Attempting to clear logout history for key: ${key}`);
            this.logger.info(`🧹 [WebSocket Client] History before clear: ${Object.keys(this.logoutHistory).join(', ')}`);
            if (this.logoutHistory[key]) {
                delete this.logoutHistory[key];
                this.logger.info(`✅ [WebSocket Client] Cleared logout history for key ${key}`);
            } else {
                this.logger.warn(`⚠️ [WebSocket Client] No logout history found for key ${key}`);
            }
            this.logger.info(`🧹 [WebSocket Client] History after clear: ${Object.keys(this.logoutHistory).join(', ')}`);
        }
    }

    /**
     * Handle logout for specific website
     */
    async handleLogoutForWebsite(message) {
        try {
            this.logger.info('🔓 [WebSocket Client] Handling logout for website...');
            this.logger.info(`   Website: ${message.website_config?.name || 'Unknown'}`);
            this.logger.info(`   User ID: ${message.user_id || 'Unknown'}`);
            this.logger.info(`   Root Path: ${message.website_config?.root_path || 'Unknown'}`);
            this.logger.info(`   Logout API: ${message.logout_api?.url || 'None'}`);

            // Check if this is a repeated logout for this specific client instance
            const isRepeatedLogout = this.isRepeatedLogout(this.client.clientId, message.user_id);
            this.logger.info(`🔓 [WebSocket Client] Repeated logout check: ${isRepeatedLogout}`);

            if (isRepeatedLogout) {
                this.logger.info('⚠️ [WebSocket Client] Repeated logout detected within 10 seconds for this client, skipping cleanup to avoid errors');
                // Still send feedback but skip the cleanup
                try {
                    this.client.sendLogoutFeedback(message, true, 'Logout already processed (repeated logout)');
                    this.logger.info('✅ [WebSocket Client] Repeated logout feedback sent successfully');
                } catch (feedbackError) {
                    this.logger.warn('⚠️ [WebSocket Client] Cannot send repeated logout feedback (connection may be closed):', feedbackError.message);
                }
                return;
            }

            // Get main window reference - try multiple methods
            const { BrowserWindow } = require('electron');
            let mainWindow = null;
            let tabManager = null;

            // First try to find any window with TabManager
            const allWindows = BrowserWindow.getAllWindows();
            this.logger.info('🔍 [WebSocket Client] Searching for TabManager in', allWindows.length, 'windows');

            for (let i = 0; i < allWindows.length; i++) {
                const win = allWindows[i];
                this.logger.info(`[WebSocket Client] Window ${i}: has TabManager =`, !!win.tabManager);
                if (win.tabManager) {
                    mainWindow = win;
                    tabManager = win.tabManager;
                    this.logger.info('✅ [WebSocket Client] Found TabManager in window', i);
                    break;
                }
            }

            // If still no TabManager found, try focused window
            if (!tabManager) {
                const focusedWindow = BrowserWindow.getFocusedWindow();
                if (focusedWindow && focusedWindow.tabManager) {
                    mainWindow = focusedWindow;
                    tabManager = focusedWindow.tabManager;
                    this.logger.info('✅ [WebSocket Client] Found TabManager in focused window');
                }
            }

            // If still no TabManager, try the first window
            if (!tabManager && allWindows.length > 0) {
                mainWindow = allWindows[0];
                tabManager = mainWindow.tabManager;
                this.logger.info('🔍 [WebSocket Client] Trying first window for TabManager:', !!tabManager);
            }

            if (!tabManager) {
                this.logger.error('❌ [WebSocket Client] No TabManager found for logout handling');
                this.logger.error('❌ [WebSocket Client] Available windows:', allWindows.length);
                this.logger.error('❌ [WebSocket Client] All windows TabManager status:', allWindows.map((win, i) => `Window ${i}: ${!!win.tabManager}`));

                // Try to get TabManager from mainWindow reference
                if (this.client.mainWindow && this.client.mainWindow.tabManager) {
                    tabManager = this.client.mainWindow.tabManager;
                    this.logger.info('✅ [WebSocket Client] Found TabManager from mainWindow reference');
                } else {
                    this.logger.error('❌ [WebSocket Client] No TabManager available, sending error feedback');
                    this.client.sendLogoutFeedback(message, false, 'No TabManager available for logout handling');
                    return;
                }
            }

            // Clear sessions for the specific website
            this.logger.info('🔓 [WebSocket Client] Clearing sessions for website:', message.website_config?.name);

            // Use the existing clearNSNSessions method if it's NSN, otherwise clear all
            if (message.website_config?.name === 'NSN' || message.website_config?.root_path?.includes(apiConfig.getNsnHost())) {
                this.logger.info('🔓 [WebSocket Client] Clearing NSN-specific sessions');
                try {
                    await tabManager.clearNSNSessions();
                    this.logger.info('✅ [WebSocket Client] NSN sessions cleared successfully');
                } catch (error) {
                    this.logger.error('❌ [WebSocket Client] Error clearing NSN sessions:', error);
                }
            } else {
                this.logger.info('🔓 [WebSocket Client] Website-specific logout not implemented, clearing all sessions');
                try {
                    await tabManager.clearAllSessions();
                    this.logger.info('✅ [WebSocket Client] All sessions cleared successfully');
                } catch (error) {
                    this.logger.error('❌ [WebSocket Client] Error clearing all sessions:', error);
                }
            }

            // CRITICAL FIX: Clear C-Client's own session cookies to prevent sending invalid sessions
            this.logger.info('🔓 [WebSocket Client] Clearing C-Client own session cookies...');
            try {
                const { session } = require('electron');

                // Clear NSN session partition cookies
                const nsnSession = session.fromPartition('persist:nsn');
                await nsnSession.clearStorageData({
                    storages: ['cookies', 'localStorage', 'sessionStorage', 'cache']
                });
                await nsnSession.clearCache();
                this.logger.info('✅ [WebSocket Client] C-Client NSN session cookies cleared');

                // Clear default session cookies
                const defaultSession = session.defaultSession;
                await defaultSession.clearStorageData({
                    storages: ['cookies', 'localStorage', 'sessionStorage', 'cache']
                });
                await defaultSession.clearCache();
                this.logger.info('✅ [WebSocket Client] C-Client default session cookies cleared');

            } catch (error) {
                this.logger.error('❌ [WebSocket Client] Error clearing C-Client session cookies:', error);
            }

            // Close website-specific tabs
            this.logger.info('🔓 [WebSocket Client] Closing website-specific tabs...');
            try {
                await this.client.closeWebsiteSpecificTabs(message.website_config);
                this.logger.info(`✅ [WebSocket Client] ${message.website_config?.name || 'Website'} tabs closed`);
            } catch (error) {
                this.logger.error('❌ [WebSocket Client] Error closing website tabs:', error);
            }

            // Call NSN logout API if available
            if (message.logout_api?.url) {
                this.logger.info('🔓 [WebSocket Client] Calling NSN logout API...');
                this.callNSNLogoutAPI(message.logout_api.url, message.website_config?.root_path);
            } else {
                this.logger.info('⚠️ [WebSocket Client] No logout API URL provided, skipping server-side logout');
            }

            this.logger.info('✅ [WebSocket Client] Logout handling completed');

            // Add a small delay before sending feedback to ensure all cleanup is complete
            this.logger.info('⏳ [WebSocket Client] Waiting for cleanup to complete...');
            await new Promise(resolve => setTimeout(resolve, 1000)); // 1 second delay

            // Send feedback to B-Client that logout is completed BEFORE disconnecting
            this.logger.info('📤 [WebSocket Client] Sending logout feedback BEFORE disconnecting...');
            this.client.sendLogoutFeedback(message, true, 'Logout completed successfully');
            this.logger.info('✅ [WebSocket Client] Logout feedback sent successfully');

            // Clear logout history after successful logout (allows new logout flows)
            this.clearLogoutHistory(this.client.clientId, message.user_id);

            // CRITICAL: Wait for feedback to be transmitted before disconnecting
            // This ensures B-Client receives the feedback before connection closes
            this.logger.info('⏳ [WebSocket Client] Waiting 500ms for feedback transmission...');
            await new Promise(resolve => setTimeout(resolve, 500)); // 500ms delay for transmission
            this.logger.info('✅ [WebSocket Client] Feedback transmission delay completed');

            // CRITICAL FIX: Reset WebSocket connection state AFTER sending feedback
            this.logger.info('🔄 [WebSocket Client] Resetting WebSocket connection state after sending feedback...');

            // Check if connection is still valid before disconnecting
            const WebSocket = require('ws');
            if (this.client.websocket && this.client.websocket.readyState === WebSocket.OPEN) {
                this.logger.info('🔌 [WebSocket Client] Connection is still open, proceeding with clean disconnect...');
                this.client.disconnect(); // This will close the connection but keep isRegistered=true
            } else {
                this.logger.info('⚠️ [WebSocket Client] Connection already closed or invalid, skipping disconnect...');
                // Just reset the state without calling disconnect
                this.client.isConnected = false;
                this.client.websocket = null;
            }

            this.client.resetRegistrationStatus(); // This will reset isRegistered=false
            this.logger.info('✅ [WebSocket Client] WebSocket connection state reset - ready for reconnection');

        } catch (error) {
            this.logger.error('❌ [WebSocket Client] Error handling logout for website:', error);

            // Send error feedback to B-Client
            this.client.sendLogoutFeedback(message, false, error.message);
        }
    }



    /**
     * Check user logout status via B-Client API
     */
    async checkUserLogoutStatus(user_id) {
        try {
            this.logger.info('🔍 [WebSocket Client] Checking logout status for user:', user_id);

            // Check if user has logged out by querying B-Client API
            const response = await fetch(`http://localhost:3000/api/user/logout-status?user_id=${user_id}`);
            if (response.ok) {
                const data = await response.json();
                this.logger.info('🔍 [WebSocket Client] Logout status response:', data);
                return data.logout === true;
            } else {
                this.logger.info('⚠️ [WebSocket Client] Failed to check logout status, assuming not logged out');
                return false;
            }
        } catch (error) {
            this.logger.error('❌ [WebSocket Client] Error checking logout status:', error);
            this.logger.info('⚠️ [WebSocket Client] Error occurred, assuming not logged out');
            return false;
        }
    }

    /**
     * Check if already logged in to NSN
     */
    async checkNSNLoginStatus() {
        try {
            this.logger.info('🔍 [WebSocket Client] ===== CHECKING NSN LOGIN STATUS =====');

            if (!this.client.mainWindow || !this.client.mainWindow.tabManager) {
                this.logger.info('⚠️ [WebSocket Client] No TabManager available for login status check');
                return false;
            }

            const tabManager = this.client.mainWindow.tabManager;
            const nsnTab = tabManager.findNSNTab();

            if (!nsnTab) {
                this.logger.info('ℹ️ [WebSocket Client] No NSN tab found, not logged in');
                return false;
            }

            this.logger.info('🔍 [WebSocket Client] Found NSN tab, checking login status...');

            // Check if nsnTab has the correct structure
            if (!nsnTab || !nsnTab.browserView.webContents) {
                this.logger.info('⚠️ [WebSocket Client] NSN tab structure invalid, not logged in');
                return false;
            }

            this.logger.info('🔍 [WebSocket Client] NSN tab URL:', nsnTab.browserView.webContents.getURL());

            // Check if NSN tab shows logged-in state by examining the URL
            const currentURL = nsnTab.browserView.webContents.getURL();
            this.logger.info('🔍 [WebSocket Client] NSN tab URL:', currentURL);

            // Simple URL-based login status check
            const isLoggedIn = currentURL.includes('/dashboard') ||
                currentURL.includes('/profile') ||
                currentURL.includes('/journey') ||
                currentURL.includes('loggedin=true');

            const loginStatus = {
                isLoggedIn: isLoggedIn,
                currentUrl: currentURL,
                pathname: new URL(currentURL).pathname,
                indicators: [isLoggedIn]
            };

            this.logger.info('🔍 [WebSocket Client] NSN login status check result:', loginStatus);

            if (loginStatus.isLoggedIn) {
                this.logger.info('✅ [WebSocket Client] Already logged in to NSN');
                this.logger.info('✅ [WebSocket Client] Current URL:', loginStatus.currentUrl);
                this.logger.info('✅ [WebSocket Client] This prevents duplicate auto-login');
                return true;
            } else {
                this.logger.info('ℹ️ [WebSocket Client] Not logged in to NSN');
                this.logger.info('ℹ️ [WebSocket Client] Current URL:', loginStatus.currentUrl);
                this.logger.info('ℹ️ [WebSocket Client] Proceeding with auto-login');
                return false;
            }

        } catch (error) {
            this.logger.error('❌ [WebSocket Client] Error checking NSN login status:', error);
            this.logger.info('⚠️ [WebSocket Client] Assuming not logged in due to error');
            return false;
        }
    }

    /**
     * Call NSN logout API
     */
    async callNSNLogoutAPI(logoutUrl, websiteRootPath) {
        try {
            this.logger.info('🔓 [WebSocket Client] ===== CALLING NSN LOGOUT API =====');
            this.logger.info(`🔓 [WebSocket Client] Logout URL: ${logoutUrl}`);
            this.logger.info(`🔓 [WebSocket Client] Website Root Path: ${websiteRootPath}`);

            // Use axios instead of node-fetch for better compatibility
            const axios = require('axios');

            try {
                this.logger.info('🔓 [WebSocket Client] Making direct HTTP request to NSN logout endpoint...');
                const response = await axios.get(logoutUrl, {
                    headers: {
                        'Content-Type': 'application/json',
                        'User-Agent': 'C-Client/1.0'
                    },
                    timeout: 5000 // 5 second timeout
                });

                this.logger.info('🔓 [WebSocket Client] NSN logout response status:', response.status);

                if (response.status >= 200 && response.status < 300) {
                    this.logger.info('✅ [WebSocket Client] NSN server-side logout successful');
                    this.logger.info('✅ [WebSocket Client] Response status:', response.status);
                    this.logger.info('✅ [WebSocket Client] Response data:', response.data);
                } else {
                    this.logger.info('⚠️ [WebSocket Client] NSN server-side logout failed:', response.status);
                    this.logger.info('⚠️ [WebSocket Client] Response data:', response.data);
                }
            } catch (error) {
                this.logger.error('❌ [WebSocket Client] Error calling NSN logout API:', error);
            }

            this.logger.info('🔓 [WebSocket Client] ===== END CALLING NSN LOGOUT API =====');

        } catch (error) {
            this.logger.error('❌ [WebSocket Client] Error calling NSN logout API:', error);
        }
    }

}

module.exports = AuthHandler;
