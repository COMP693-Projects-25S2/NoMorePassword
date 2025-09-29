const WebSocket = require('ws');

class CClientWebSocketClient {
    constructor() {
        this.websocket = null;
        this.clientId = null; // Will be set from NodeManager
        this.isConnected = false;
        this.config = this.loadWebSocketConfig();
        this.reconnectInterval = this.config.reconnect_interval || 30;
        this.reconnectTimer = null;
        this.mainWindow = null; // Will be set by main process
    }

    /**
     * Set the main window reference for page refresh functionality
     * @param {object} mainWindow - The main ElectronApp instance
     */
    setMainWindow(mainWindow) {
        this.mainWindow = mainWindow;
        console.log('🔌 [WebSocket Client] Main window reference set for page refresh functionality');
    }

    /**
     * Set the ElectronApp reference for connection sharing
     * @param {object} electronApp - The ElectronApp instance
     */
    setElectronApp(electronApp) {
        this.electronApp = electronApp;
        console.log('🔌 [WebSocket Client] ElectronApp reference set for connection sharing');
    }

    loadWebSocketConfig() {
        try {
            const fs = require('fs');
            const path = require('path');
            const configPath = path.join(__dirname, '..', 'config.json');

            if (fs.existsSync(configPath)) {
                const configData = fs.readFileSync(configPath, 'utf8');
                const config = JSON.parse(configData);

                // Get environment configuration
                const envConfig = config.b_client_environment || {};
                const currentEnv = envConfig.current || 'local';
                const envSettings = envConfig[currentEnv] || envConfig.local || {
                    host: 'localhost',
                    port: 8766
                };

                // Merge WebSocket config with environment settings
                const wsConfig = config.b_client_websocket || {};
                return {
                    enabled: wsConfig.enabled !== false,
                    host: envSettings.host || 'localhost',
                    port: envSettings.port || 8766,
                    auto_reconnect: wsConfig.auto_reconnect !== false,
                    reconnect_interval: wsConfig.reconnect_interval || 30,
                    environment: currentEnv,
                    environment_name: envSettings.name || `${currentEnv} B-Client`
                };
            } else {
                return {
                    enabled: true,
                    host: 'localhost',
                    port: 8766,
                    auto_reconnect: true,
                    reconnect_interval: 30,
                    environment: 'local',
                    environment_name: 'Local B-Client'
                };
            }
        } catch (error) {
            console.error('[WebSocket Client] Error loading config:', error);
            return {
                enabled: true,
                host: 'localhost',
                port: 8766,
                auto_reconnect: true,
                reconnect_interval: 30,
                environment: 'local',
                environment_name: 'Local B-Client'
            };
        }
    }

    setClientId(clientId) {
        this.clientId = clientId;
        console.log(`🆔 [WebSocket Client] Client ID set: ${this.clientId}`);
    }

    getCurrentUserInfo() {
        // Get current user information from local database
        try {
            const db = require('../sqlite/database');
            const currentUser = db.prepare(
                'SELECT user_id, username, node_id, domain_id, cluster_id, channel_id FROM local_users WHERE is_current = 1'
            ).get();

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
            console.error('[WebSocket Client] Error getting current user info:', error);
            return null;
        }
    }

    registerCurrentUser() {
        if (!this.isConnected || !this.websocket) {
            console.warn('[WebSocket Client] Cannot register user - not connected');
            return false;
        }

        try {
            // Get current user info for registration
            console.log(`🔍 [WebSocket Client] Getting current user info...`);
            const currentUser = this.getCurrentUserInfo();
            console.log(`👤 [WebSocket Client] Current user info:`, currentUser);

            // Register as C-Client with user_id and additional parameters
            const registerMessage = {
                type: 'c_client_register',
                client_id: this.clientId || `c-client-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                user_id: currentUser ? currentUser.user_id : null,
                username: currentUser ? currentUser.username : null,
                node_id: currentUser ? currentUser.node_id : null,
                domain_id: currentUser ? currentUser.domain_id : null,
                cluster_id: currentUser ? currentUser.cluster_id : null,
                channel_id: currentUser ? currentUser.channel_id : null,
            };
            console.log(`📤 [WebSocket Client] Sending registration message:`, registerMessage);
            this.sendMessage(registerMessage);
            return true;
        } catch (error) {
            console.error('[WebSocket Client] Error registering current user:', error);
            return false;
        }
    }

    async reRegisterUser() {
        console.log(`🔄 [WebSocket Client] Re-registering user after switch...`);

        if (!this.isConnected || !this.websocket) {
            console.warn('[WebSocket Client] Cannot re-register user - not connected');
            return false;
        }

        try {
            // Get updated user info
            const currentUser = this.getCurrentUserInfo();
            console.log(`👤 [WebSocket Client] Updated user info:`, currentUser);

            // Send re-registration message
            const reRegisterMessage = {
                type: 'c_client_register',
                client_id: this.clientId,
                user_id: currentUser ? currentUser.user_id : null,
                username: currentUser ? currentUser.username : null,
                node_id: currentUser ? currentUser.node_id : null,
                domain_id: currentUser ? currentUser.domain_id : null,
                cluster_id: currentUser ? currentUser.cluster_id : null,
                channel_id: currentUser ? currentUser.channel_id : null,
            };

            console.log(`📤 [WebSocket Client] Sending re-registration message:`, reRegisterMessage);
            console.log(`🔍 [WebSocket Client] Re-registration details:`);
            console.log(`   Client ID: ${this.clientId}`);
            console.log(`   User ID: ${currentUser ? currentUser.user_id : 'null'}`);
            console.log(`   Username: ${currentUser ? currentUser.username : 'null'}`);
            console.log(`   Node ID: ${currentUser ? currentUser.node_id : 'null'}`);
            console.log(`   WebSocket connected: ${this.isConnected}`);
            console.log(`   WebSocket ready state: ${this.websocket ? this.websocket.readyState : 'null'}`);

            this.sendMessage(reRegisterMessage);
            return true;
        } catch (error) {
            console.error('[WebSocket Client] Error re-registering user:', error);
            return false;
        }
    }

    /**
     * Disconnect and reconnect WebSocket for user switch to ensure accurate counting
     */
    async disconnectAndReconnectForUserSwitch() {
        console.log(`🔄 [WebSocket Client] ===== DISCONNECTING AND RECONNECTING FOR USER SWITCH =====`);

        try {
            // Store current connection config
            const currentConfig = { ...this.config };

            console.log(`🔌 [WebSocket Client] Current connection config:`, {
                host: currentConfig.host,
                port: currentConfig.port,
                environment: currentConfig.environment,
                environment_name: currentConfig.environment_name
            });

            // Disconnect current connection
            console.log(`🔌 [WebSocket Client] Disconnecting current WebSocket connection...`);
            this.disconnect();

            // Wait a moment for disconnection to complete
            console.log(`⏳ [WebSocket Client] Waiting 500ms for disconnection to complete...`);
            await new Promise(resolve => setTimeout(resolve, 500));

            console.log(`✅ [WebSocket Client] Disconnection completed`);

            // Reconnect with same config
            console.log(`🔌 [WebSocket Client] Reconnecting with same configuration...`);
            const reconnectResult = await this.connectToServer(
                currentConfig.host,
                currentConfig.port,
                currentConfig.environment_name
            );

            if (reconnectResult) {
                console.log(`✅ [WebSocket Client] ===== USER SWITCH RECONNECTION SUCCESS =====`);
                console.log(`✅ [WebSocket Client] Successfully reconnected after user switch`);
                console.log(`✅ [WebSocket Client] New connection will register with updated user info`);
                return true;
            } else {
                console.error(`❌ [WebSocket Client] ===== USER SWITCH RECONNECTION FAILED =====`);
                console.error(`❌ [WebSocket Client] Failed to reconnect after user switch`);
                return false;
            }

        } catch (error) {
            console.error(`❌ [WebSocket Client] ===== ERROR DURING USER SWITCH RECONNECTION =====`);
            console.error(`❌ [WebSocket Client] Error during disconnect and reconnect:`, error);
            console.error(`❌ [WebSocket Client] Error details:`, error.message);
            console.error(`❌ [WebSocket Client] Stack trace:`, error.stack);
            return false;
        }
    }

    async connectToServer(host, port, environmentName = 'Custom Server') {
        console.log(`🔌 [WebSocket Client] Connecting to custom server: ${environmentName}`);
        console.log(`   Host: ${host}`);
        console.log(`   Port: ${port}`);

        // Prevent multiple simultaneous connections
        if (this.connectionInProgress) {
            console.log(`⚠️ [WebSocket Client] Connection already in progress, skipping duplicate request`);
            return false;
        }

        this.connectionInProgress = true;

        try {
            // Force disconnect from current connection if any (always disconnect to ensure clean state)
            if (this.websocket) {
                console.log(`🔌 [WebSocket Client] Force disconnecting existing connection before reconnecting...`);
                console.log(`🔌 [WebSocket Client] Current state - isConnected: ${this.isConnected}, readyState: ${this.websocket.readyState} (${this.getReadyStateName(this.websocket.readyState)})`);

                // Force disconnect regardless of state
                this.disconnect();

                // Wait longer for disconnection to complete and clear any cached state
                console.log(`⏳ [WebSocket Client] Waiting 500ms for disconnection to complete...`);
                await new Promise(resolve => setTimeout(resolve, 500));

                // Clear any cached connection state
                this.isConnected = false;
                this.websocket = null;
                console.log(`🧹 [WebSocket Client] Cleared connection state for fresh start`);
            }

            const uri = `ws://${host}:${port}`;
            console.log(`🔌 [WebSocket Client] Connecting to ${environmentName} at ${uri}...`);

            this.websocket = new WebSocket(uri);
            console.log(`🔌 [WebSocket Client] WebSocket object created, setting up event handlers...`);

            this.websocket.on('open', () => {
                console.log(`✅ [WebSocket Client] Connected to ${environmentName}`);
                console.log(`   Target: ${environmentName} (${host}:${port})`);
                this.isConnected = true;

                // Wait a small delay to ensure WebSocket is fully ready
                this.registrationTimeout = setTimeout(() => {
                    // Check if WebSocket still exists before accessing its properties
                    if (this.websocket && this.websocket.readyState !== undefined) {
                        console.log(`🔍 [WebSocket Client] WebSocket readyState: ${this.websocket.readyState} (${this.getReadyStateName(this.websocket.readyState)})`);
                        if (this.websocket.readyState === WebSocket.OPEN) {
                            // Register with current user info
                            this.registerCurrentUser();
                        } else {
                            console.warn(`⚠️ [WebSocket Client] WebSocket not ready for registration, state: ${this.websocket.readyState}`);
                        }
                    } else {
                        console.warn(`⚠️ [WebSocket Client] WebSocket no longer exists, skipping registration`);
                    }
                    this.registrationTimeout = null; // Clear the timeout reference
                }, 100); // 100ms delay to ensure connection is stable
            });

            this.websocket.on('message', (data) => {
                try {
                    const message = JSON.parse(data);
                    console.log(`📥 [WebSocket Client] Received message:`, message);
                    this.handleMessage(message);
                } catch (error) {
                    console.error('[WebSocket Client] Error parsing message:', error);
                }
            });

            this.websocket.on('close', () => {
                console.log(`🔌 [WebSocket Client] Connection closed`);
                console.log(`   Target: ${environmentName} (${host}:${port})`);
                this.isConnected = false;

                // Store connection info for potential reconnection
                this.lastConnectionConfig = {
                    host: host,
                    port: port,
                    environmentName: environmentName,
                    websocketUrl: null
                };
            });

            this.websocket.on('error', (error) => {
                console.log(`❌ [WebSocket Client] Connection error:`, error);
                console.log(`   Target: ${environmentName} (${host}:${port})`);
                this.isConnected = false;
            });

            return true;
        } catch (error) {
            console.error(`[WebSocket Client] Failed to connect to ${environmentName}:`, error);
            return false;
        } finally {
            // Always clear the connection in progress flag
            this.connectionInProgress = false;
        }
    }

    /**
     * Connect to NSN-provided WebSocket server
     * @param {string} websocketUrl - Full WebSocket URL from NSN
     * @returns {Promise<boolean>} - Connection success status
     */
    async connectToNSNProvidedWebSocket(websocketUrl) {
        try {
            console.log(`🔌 [WebSocket Client] ===== CONNECTING TO NSN-PROVIDED WEBSOCKET =====`);
            console.log(`🔌 [WebSocket Client] WebSocket URL: ${websocketUrl}`);
            console.log(`🔌 [WebSocket Client] Current connection status:`, {
                isConnected: this.isConnected,
                hasWebSocket: !!this.websocket,
                readyState: this.websocket ? this.websocket.readyState : 'N/A'
            });

            // Parse the WebSocket URL
            console.log(`🔌 [WebSocket Client] ===== URL PARSING =====`);
            console.log(`🔌 [WebSocket Client] Parsing WebSocket URL...`);
            const url = new URL(websocketUrl);
            const host = url.hostname;
            const port = parseInt(url.port);

            console.log(`🔌 [WebSocket Client] Parsed URL details:`);
            console.log(`   Host: ${host}`);
            console.log(`   Port: ${port}`);
            console.log(`   Protocol: ${url.protocol}`);
            console.log(`   Full URL: ${url.toString()}`);

            // Use the existing connectToServer method
            console.log(`🔌 [WebSocket Client] ===== INITIATING CONNECTION =====`);
            console.log(`🔌 [WebSocket Client] Calling connectToServer method...`);
            console.log(`🔌 [WebSocket Client] Target: ${host}:${port}`);
            console.log(`🔌 [WebSocket Client] Connection type: NSN-Provided WebSocket`);

            const startTime = Date.now();
            const result = await this.connectToServer(host, port, 'NSN-Provided WebSocket');
            const endTime = Date.now();
            const duration = endTime - startTime;

            console.log(`🔌 [WebSocket Client] ===== CONNECTION RESULT =====`);
            console.log(`🔌 [WebSocket Client] Connection duration: ${duration}ms`);
            console.log(`🔌 [WebSocket Client] ConnectToServer result: ${result}`);
            console.log(`🔌 [WebSocket Client] Final connection status:`, {
                connected: this.isConnected,
                websocket: !!this.websocket,
                readyState: this.websocket ? this.websocket.readyState : 'N/A'
            });

            if (result) {
                console.log(`✅ [WebSocket Client] ===== NSN WEBSOCKET CONNECTION SUCCESS =====`);
                console.log(`✅ [WebSocket Client] Successfully connected to NSN-provided WebSocket`);
                console.log(`✅ [WebSocket Client] WebSocket URL: ${websocketUrl}`);
                console.log(`✅ [WebSocket Client] Connection time: ${duration}ms`);
                console.log(`✅ [WebSocket Client] Ready to register with B-Client`);
                console.log(`✅ [WebSocket Client] Auto-registration can now proceed`);
            } else {
                console.error(`❌ [WebSocket Client] ===== NSN WEBSOCKET CONNECTION FAILED =====`);
                console.error(`❌ [WebSocket Client] Failed to connect to NSN-provided WebSocket`);
                console.error(`❌ [WebSocket Client] WebSocket URL: ${websocketUrl}`);
                console.error(`❌ [WebSocket Client] Connection time: ${duration}ms`);
                console.error(`❌ [WebSocket Client] Auto-registration cannot proceed`);
            }

            return result;
        } catch (error) {
            console.error('❌ [WebSocket Client] ===== ERROR CONNECTING TO NSN WEBSOCKET =====');
            console.error('❌ [WebSocket Client] Error connecting to NSN-provided WebSocket:', error);
            console.error('❌ [WebSocket Client] Error stack:', error.stack);
            console.error('❌ [WebSocket Client] WebSocket URL that caused error:', websocketUrl);
            return false;
        }
    }

    async connect() {
        if (!this.config.enabled) {
            console.log('[WebSocket Client] Connection disabled in config');
            return false;
        }

        // 详细日志：显示连接配置
        console.log('🔌 [WebSocket Client] Connection Configuration:');
        console.log(`   Environment: ${this.config.environment}`);
        console.log(`   Environment Name: ${this.config.environment_name}`);
        console.log(`   Host: ${this.config.host}`);
        console.log(`   Port: ${this.config.port}`);
        console.log(`   Auto Reconnect: ${this.config.auto_reconnect}`);
        console.log(`   Reconnect Interval: ${this.config.reconnect_interval}s`);

        try {
            const uri = `ws://${this.config.host}:${this.config.port}`;
            console.log(`🔌 [WebSocket Client] Connecting to ${this.config.environment_name} at ${uri}...`);

            this.websocket = new WebSocket(uri);
            console.log(`🔌 [WebSocket Client] WebSocket object created, setting up event handlers...`);

            this.websocket.on('open', () => {
                console.log(`✅ [WebSocket Client] Connected to B-Client`);
                console.log(`   Target: ${this.config.environment_name} (${this.config.host}:${this.config.port})`);
                this.isConnected = true;

                // Get current user info for registration
                console.log(`🔍 [WebSocket Client] Getting current user info...`);
                const currentUser = this.getCurrentUserInfo();
                console.log(`👤 [WebSocket Client] Current user info:`, currentUser);

                // Register as C-Client with user_id and additional parameters
                const registerMessage = {
                    type: 'c_client_register',
                    client_id: this.clientId || `c-client-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                    user_id: currentUser ? currentUser.user_id : null,
                    username: currentUser ? currentUser.username : null,
                    node_id: currentUser ? currentUser.node_id : null,
                    domain_id: currentUser ? currentUser.domain_id : null,
                    cluster_id: currentUser ? currentUser.cluster_id : null,
                    channel_id: currentUser ? currentUser.channel_id : null
                };
                console.log(`📤 [WebSocket Client] Sending registration message:`, registerMessage);
                this.sendMessage(registerMessage);
            });

            this.websocket.on('message', (data) => {
                try {
                    const message = JSON.parse(data);
                    console.log(`📥 [WebSocket Client] Received message:`, message);
                    this.handleMessage(message);
                } catch (error) {
                    console.error('[WebSocket Client] Error parsing message:', error);
                }
            });

            this.websocket.on('close', () => {
                console.log('[WebSocket Client] Disconnected from B-Client');
                this.isConnected = false;

                // Auto-reconnect if enabled
                if (this.config.auto_reconnect) {
                    console.log(`[WebSocket Client] Auto-reconnecting in ${this.reconnectInterval} seconds...`);
                    this.reconnectTimer = setTimeout(() => {
                        this.connect();
                    }, this.reconnectInterval * 1000);
                }
            });

            this.websocket.on('error', (error) => {
                console.log(`❌ [WebSocket Client] Connection error:`, error);
                console.log(`   Target: ${this.config.environment_name} (${this.config.host}:${this.config.port})`);
                console.log(`   Error Code: ${error.code}`);
                console.log(`   Error Message: ${error.message}`);
                console.log(`⚠️ [WebSocket Client] B-Client WebSocket server may not be running`);
                console.log(`⚠️ [WebSocket Client] C-Client will continue to work, connection will be retried automatically`);
                this.isConnected = false;
            });

            this.websocket.on('close', (code, reason) => {
                console.log(`🔌 [WebSocket Client] Connection closed`);
                console.log(`   Code: ${code}`);
                console.log(`   Reason: ${reason}`);
                console.log(`   Target: ${this.config.environment_name} (${this.config.host}:${this.config.port})`);
                console.log(`⚠️ [WebSocket Client] Connection lost, but C-Client will continue to work`);
                console.log(`⚠️ [WebSocket Client] Auto-reconnect is enabled, will retry automatically`);
                this.isConnected = false;
            });

            // Add a timeout to check if open event fires
            setTimeout(() => {
                console.log(`⏰ [WebSocket Client] Connection status check after 2 seconds:`);
                console.log(`   Ready State: ${this.websocket.readyState}`);
                console.log(`   Is Connected: ${this.isConnected}`);
                console.log(`   Ready State Values: 0=CONNECTING, 1=OPEN, 2=CLOSING, 3=CLOSED`);
            }, 2000);

            return true;
        } catch (error) {
            console.error('[WebSocket Client] Failed to connect:', error);
            console.log(`⚠️ [WebSocket Client] Connection failed, but C-Client will continue to work`);
            console.log(`⚠️ [WebSocket Client] Auto-reconnect is enabled, will retry automatically`);
            return false;
        }
    }

    handleMessage(message) {
        const { type, data } = message;
        console.log(`🔄 [WebSocket Client] Processing message type: ${type}`);

        switch (type) {
            case 'registration_success':
                console.log('✅ [WebSocket Client] Registration successful');
                console.log(`   Client ID: ${message.client_id || 'N/A'}`);
                console.log(`   User ID: ${message.user_id || 'N/A'}`);
                break;

            case 'registration_rejected':
                console.log('❌ [WebSocket Client] Registration rejected');
                console.log(`   Reason: ${message.reason || 'Unknown'}`);
                console.log(`   Message: ${message.message || 'No message provided'}`);
                console.log(`   User ID: ${message.user_id || 'N/A'}`);
                console.log(`   Username: ${message.username || 'N/A'}`);
                this.isConnected = false;

                // Show user already logged in dialog
                this.showUserAlreadyLoggedInDialog(message);
                break;

            case 'cookie_query':
                this.handleCookieQuery(data);
                break;

            case 'cookie_update':
                this.handleCookieUpdate(data);
                break;

            case 'user_login_notification':
                this.handleUserLoginNotification(data);
                break;

            case 'user_logout_notification':
                this.handleUserLogoutNotification(data);
                break;

            case 'user_connected_on_another_node':
                this.handleUserConnectedOnAnotherNode(message);
                break;

            case 'user_connected_on_another_client':
                console.log('🔔 [WebSocket Client] ===== RECEIVED user_connected_on_another_client =====');
                console.log('🔔 [WebSocket Client] Raw message:', JSON.stringify(message, null, 2));
                this.handleUserConnectedOnAnotherClient(message);
                break;

            case 'user_logout':
                this.handleUserLogout(message);
                break;

            case 'session_sync':
                this.handleSessionSync(data);
                break;

            case 'auto_login':
                this.handleAutoLogin(message);
                break;

            case 'error':
                console.error('[WebSocket Client] Received error:', message.message);
                break;

            default:
                console.log('[WebSocket Client] Unknown message type:', type);
        }
    }

    disconnect() {
        console.log('🔌 [WebSocket Client] Disconnecting from WebSocket server...');

        if (this.websocket) {
            this.websocket.close();
            this.websocket = null;
        }

        this.isConnected = false;

        // Clear any existing reconnect timer
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }

        // Clear any pending registration timeout
        if (this.registrationTimeout) {
            clearTimeout(this.registrationTimeout);
            this.registrationTimeout = null;
        }

        // Clear connection in progress flag
        this.connectionInProgress = false;

        // Clear the current WebSocket URL when disconnecting
        if (this.electronApp && this.electronApp.currentWebSocketUrl) {
            this.electronApp.currentWebSocketUrl = null;
            console.log('🔌 [WebSocket Client] Cleared current WebSocket URL');
        }

        console.log('🔌 [WebSocket Client] Disconnected from WebSocket server');
    }

    /**
     * Completely reset WebSocket connection object and all related state
     * This is used after logout to ensure a completely fresh connection
     */
    resetWebSocketConnection() {
        console.log('🔄 [WebSocket Client] ===== COMPLETELY RESETTING WEBSOCKET CONNECTION =====');

        // Force disconnect if connected
        if (this.websocket) {
            console.log('🔄 [WebSocket Client] Force closing existing WebSocket...');
            try {
                this.websocket.close();
            } catch (error) {
                console.warn('⚠️ [WebSocket Client] Error closing WebSocket during reset:', error);
            }
        }

        // Completely reset all connection state
        this.websocket = null;
        this.isConnected = false;
        this.connectionInProgress = false;

        // Clear all timers
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }

        if (this.registrationTimeout) {
            clearTimeout(this.registrationTimeout);
            this.registrationTimeout = null;
        }

        // Clear connection tracking
        if (this.electronApp) {
            this.electronApp.currentWebSocketUrl = null;
            // Clear website connection tracking
            if (this.electronApp.websiteWebSocketConnections) {
                this.electronApp.websiteWebSocketConnections.clear();
                console.log('🔄 [WebSocket Client] Cleared website WebSocket connections from ElectronApp');
            }
            console.log('🔄 [WebSocket Client] Cleared current WebSocket URL from ElectronApp');
        }

        // Clear last connection config to force fresh connection
        this.lastConnectionConfig = null;
        console.log('🔄 [WebSocket Client] Cleared last connection config');

        // Keep the same client ID - it's important for connection tracking
        console.log(`🔄 [WebSocket Client] Keeping existing client ID: ${this.clientId}`);

        console.log('✅ [WebSocket Client] ===== WEBSOCKET CONNECTION COMPLETELY RESET =====');
        console.log('✅ [WebSocket Client] All connection state cleared, ready for fresh connection');
    }

    markCurrentWebSocketServerAsUnavailable() {
        console.log('🔓 [WebSocket Client] ===== MARKING WEBSOCKET SERVER AS UNAVAILABLE =====');

        // Mark current WebSocket server as unavailable in ElectronApp
        if (this.electronApp) {
            // Clear current WebSocket URL to force reconnection
            this.electronApp.currentWebSocketUrl = null;
            console.log('🔓 [WebSocket Client] Cleared current WebSocket URL from ElectronApp');

            // Mark all website connections as unavailable
            if (this.electronApp.websiteWebSocketConnections) {
                console.log('🔓 [WebSocket Client] Marking all website WebSocket connections as unavailable...');
                for (const [websiteDomain, connectionInfo] of this.electronApp.websiteWebSocketConnections) {
                    connectionInfo.available = false;
                    connectionInfo.unavailableReason = 'logout';
                    connectionInfo.unavailableAt = Date.now();
                    console.log(`🔓 [WebSocket Client] Marked connection for website ${websiteDomain} as unavailable due to logout`);
                }
            }
        }

        console.log('✅ [WebSocket Client] ===== WEBSOCKET SERVER MARKED AS UNAVAILABLE =====');
    }

    async handleCookieQuery(data) {
        const { user_id, username } = data;
        console.log(`[WebSocket Client] Cookie query for user: ${user_id} (${username})`);

        try {
            // Get stored cookie from database
            const cookieData = await this.getStoredCookie(user_id, username);

            this.sendMessage({
                type: 'cookie_response',
                user_id: user_id,
                username: username,
                cookie: cookieData ? cookieData.cookie : null,
                auto_refresh: cookieData ? cookieData.auto_refresh : false,
                create_time: cookieData ? cookieData.create_time : null
            });
        } catch (error) {
            console.error('[WebSocket Client] Error handling cookie query:', error);
            this.sendMessage({
                type: 'cookie_response',
                user_id: user_id,
                username: username,
                cookie: null,
                error: error.message
            });
        }
    }

    async handleCookieUpdate(data) {
        const { user_id, username, cookie, auto_refresh } = data;
        console.log(`[WebSocket Client] Cookie update for user: ${user_id} (${username})`);

        try {
            const success = await this.storeCookie(user_id, username, cookie, auto_refresh);

            this.sendMessage({
                type: 'cookie_update_response',
                user_id: user_id,
                username: username,
                success: success
            });
        } catch (error) {
            console.error('[WebSocket Client] Error handling cookie update:', error);
            this.sendMessage({
                type: 'cookie_update_response',
                user_id: user_id,
                username: username,
                success: false,
                error: error.message
            });
        }
    }

    handleUserLoginNotification(data) {
        console.log('[WebSocket Client] User login notification:', data);
        // Handle user login notification
    }

    async handleUserLogoutNotification(data) {
        try {
            console.log('🔓 [WebSocket Client] ===== USER LOGOUT NOTIFICATION =====');
            console.log('🔓 [WebSocket Client] User logout notification:', data);

            const { user_id, username, website_config } = data;

            console.log('🔓 [WebSocket Client] Logging out user:', user_id);
            console.log('🔓 [WebSocket Client] Username:', username);
            console.log('🔓 [WebSocket Client] Website config:', website_config);

            // Check if this is a repeated logout for optimization
            const isRepeatedLogout = this.isRepeatedLogout(user_id);
            console.log(`🔓 [WebSocket Client] Repeated logout: ${isRepeatedLogout}`);

            // Step 1: Clear website-specific browser sessions (optimized for repeated logouts)
            console.log('🔓 [WebSocket Client] Step 1: Clearing website-specific browser sessions...');
            if (this.mainWindow && this.mainWindow.viewManager) {
                try {
                    if (isRepeatedLogout) {
                        // For repeated logouts, only clear new sessions
                        await this.clearIncrementalWebsiteSessions(website_config);
                    } else {
                        // For first logout, clear all sessions
                        await this.clearWebsiteSpecificSessions(website_config);
                    }
                    console.log(`✅ [WebSocket Client] ${website_config?.name || 'Website'} browser sessions cleared (other websites preserved)`);
                } catch (error) {
                    console.error('❌ [WebSocket Client] Error clearing website browser sessions:', error);
                }
            } else {
                console.warn('⚠️ [WebSocket Client] ViewManager not available for session clearing');
            }

            // Step 2: Close website-specific tabs (optimized for repeated logouts)
            console.log('🔓 [WebSocket Client] Step 2: Closing website-specific tabs...');
            if (this.mainWindow && this.mainWindow.viewManager) {
                try {
                    if (isRepeatedLogout) {
                        // For repeated logouts, only close new tabs
                        await this.closeIncrementalWebsiteTabs(website_config);
                    } else {
                        // For first logout, close all tabs
                        await this.closeWebsiteSpecificTabs(website_config);
                    }
                    console.log(`✅ [WebSocket Client] ${website_config?.name || 'Website'} tabs closed (other website tabs preserved)`);
                } catch (error) {
                    console.error('❌ [WebSocket Client] Error managing website tabs:', error);
                }
            } else {
                console.warn('⚠️ [WebSocket Client] ViewManager not available for tab management');
            }

            // Step 3: Clear local user session data (optimized)
            console.log('🔓 [WebSocket Client] Step 3: Clearing local user session data...');
            try {
                if (!isRepeatedLogout) {
                    // Only clear session data on first logout
                    await this.clearUserSessionData(user_id);
                    console.log('ℹ️ [WebSocket Client] User session data cleared');
                } else {
                    console.log('ℹ️ [WebSocket Client] Skipping session data clearing for repeated logout');
                }
            } catch (error) {
                console.error('❌ [WebSocket Client] Error clearing local session data:', error);
            }

            console.log('✅ [WebSocket Client] ===== USER LOGOUT COMPLETED =====');
            console.log('✅ [WebSocket Client] User logout process completed successfully');

            // IMMEDIATE feedback to B-Client - no waiting
            console.log('🚀 [WebSocket Client] Sending immediate logout feedback...');
            this.sendLogoutFeedback(data, true, 'Logout completed successfully');
            console.log('✅ [WebSocket Client] Immediate feedback sent');

            // Step 4: Mark current WebSocket server connection as unavailable (async)
            console.log('🔓 [WebSocket Client] Step 4: Marking current WebSocket server connection as unavailable...');
            this.markCurrentWebSocketServerAsUnavailable();
            console.log('✅ [WebSocket Client] Current WebSocket server connection marked as unavailable');

            // Step 5: Reset WebSocket connection (async, non-blocking)
            console.log('🔓 [WebSocket Client] Step 5: Resetting WebSocket connection...');
            this.resetWebSocketConnection();
            console.log('✅ [WebSocket Client] WebSocket connection reset');

        } catch (error) {
            console.error('❌ [WebSocket Client] Error handling user logout notification:', error);
            console.error('❌ [WebSocket Client] Error details:', error.stack);

            // Send error feedback to B-Client
            this.sendLogoutFeedback(data, false, error.message);
        }
    }

    /**
     * Check if this is a repeated logout for the same user
     */
    isRepeatedLogout(user_id) {
        if (!this.logoutHistory) {
            this.logoutHistory = {};
        }

        const now = Date.now();
        const lastLogoutTime = this.logoutHistory[user_id];

        if (!lastLogoutTime) {
            // First logout for this user
            this.logoutHistory[user_id] = now;
            return false;
        }

        // Consider it repeated if within 30 seconds
        const isRepeated = (now - lastLogoutTime) < 30000;
        this.logoutHistory[user_id] = now;

        return isRepeated;
    }

    /**
     * Clear incremental website sessions (only new sessions since last logout)
     */
    async clearIncrementalWebsiteSessions(websiteConfig) {
        try {
            console.log('🔓 [WebSocket Client] Clearing incremental website sessions...');

            if (!this.mainWindow || !this.mainWindow.viewManager) {
                console.warn('⚠️ [WebSocket Client] ViewManager not available for incremental session clearing');
                return;
            }

            const viewManager = this.mainWindow.viewManager;
            const views = viewManager.views;
            let newSessionsCleared = 0;

            // Only clear sessions that were created after the last logout
            const lastLogoutTime = this.logoutHistory[websiteConfig?.name] || 0;

            for (const [id, view] of Object.entries(views)) {
                if (view && view.webContents && !view.webContents.isDestroyed()) {
                    try {
                        const currentURL = view.webContents.getURL();
                        if (this.isWebsiteUrl(currentURL, websiteConfig.root_path)) {
                            // Check if this session was created after last logout
                            const sessionCreatedTime = view.webContents.getCreationTime ?
                                view.webContents.getCreationTime() : 0;

                            if (sessionCreatedTime > lastLogoutTime) {
                                console.log(`🔓 [WebSocket Client] Clearing new session for view ${id}: ${currentURL}`);
                                await view.webContents.clearHistory();
                                await view.webContents.clearCache();
                                newSessionsCleared++;
                            }
                        }
                    } catch (error) {
                        console.error(`❌ [WebSocket Client] Error clearing incremental session for view ${id}:`, error);
                    }
                }
            }

            console.log(`✅ [WebSocket Client] Incremental session clearing completed (${newSessionsCleared} new sessions cleared)`);
        } catch (error) {
            console.error('❌ [WebSocket Client] Error in clearIncrementalWebsiteSessions:', error);
        }
    }

    /**
     * Close incremental website tabs (only new tabs since last logout)
     */
    async closeIncrementalWebsiteTabs(websiteConfig) {
        try {
            console.log(`🔓 [WebSocket Client] Closing incremental ${websiteConfig?.name || 'website'} tabs...`);

            if (!this.mainWindow || !this.mainWindow.viewManager) {
                console.warn('⚠️ [WebSocket Client] ViewManager not available for incremental tab closing');
                return;
            }

            const viewManager = this.mainWindow.viewManager;
            const views = viewManager.views;
            const websiteViewsToClose = [];
            const lastLogoutTime = this.logoutHistory[websiteConfig?.name] || 0;

            // Identify new website views to close
            for (const [id, view] of Object.entries(views)) {
                if (view && view.webContents && !view.webContents.isDestroyed()) {
                    try {
                        const currentURL = view.webContents.getURL();
                        if (this.isWebsiteUrl(currentURL, websiteConfig.root_path)) {
                            // Check if this tab was created after last logout
                            const tabCreatedTime = view.webContents.getCreationTime ?
                                view.webContents.getCreationTime() : 0;

                            if (tabCreatedTime > lastLogoutTime) {
                                console.log(`🔓 [WebSocket Client] Found new ${websiteConfig.name} view ${id} to close: ${currentURL}`);
                                websiteViewsToClose.push(id);
                            }
                        }
                    } catch (error) {
                        console.error(`❌ [WebSocket Client] Error checking URL for view ${id}:`, error);
                    }
                }
            }

            // Close new website views
            for (const viewId of websiteViewsToClose) {
                try {
                    console.log(`🔓 [WebSocket Client] Closing new ${websiteConfig.name} view ${viewId}...`);
                    await viewManager.closeTab(viewId);
                    console.log(`✅ [WebSocket Client] New ${websiteConfig.name} view ${viewId} closed`);
                } catch (error) {
                    console.error(`❌ [WebSocket Client] Error closing new ${websiteConfig.name} view ${viewId}:`, error);
                }
            }

            console.log(`✅ [WebSocket Client] Incremental ${websiteConfig.name} tab cleanup completed (${websiteViewsToClose.length} new tabs closed)`);
        } catch (error) {
            console.error(`❌ [WebSocket Client] Error in closeIncrementalWebsiteTabs:`, error);
        }
    }

    /**
     * Clear user session data
     */
    async clearUserSessionData(user_id) {
        try {
            console.log(`🔓 [WebSocket Client] Clearing session data for user ${user_id}...`);

            // Clear any cached user data
            if (this.userSessionCache) {
                delete this.userSessionCache[user_id];
            }

            // Clear any user-specific flags
            if (this.userFlags) {
                delete this.userFlags[user_id];
            }

            console.log(`✅ [WebSocket Client] Session data cleared for user ${user_id}`);
        } catch (error) {
            console.error(`❌ [WebSocket Client] Error clearing session data for user ${user_id}:`, error);
        }
    }

    /**
     * Clear website-specific sessions based on website configuration
     */
    async clearWebsiteSpecificSessions(websiteConfig) {
        try {
            console.log('🔓 [WebSocket Client] Clearing website-specific sessions...');

            if (!this.mainWindow || !this.mainWindow.viewManager) {
                console.warn('⚠️ [WebSocket Client] ViewManager not available for clearing website sessions');
                return;
            }

            if (!websiteConfig || !websiteConfig.root_path) {
                console.warn('⚠️ [WebSocket Client] No website configuration provided, falling back to NSN-specific cleanup');
                await this.mainWindow.viewManager.clearNSNSessions();
                return;
            }

            const viewManager = this.mainWindow.viewManager;
            const views = viewManager.views;
            let websiteViewsCleared = 0;

            // Clear session data only for website views
            for (const [id, view] of Object.entries(views)) {
                if (view && view.webContents && !view.webContents.isDestroyed()) {
                    try {
                        // Check if this view belongs to the website
                        const currentURL = view.webContents.getURL();
                        if (this.isWebsiteUrl(currentURL, websiteConfig.root_path)) {
                            console.log(`🧹 Clearing ${websiteConfig.name} session for view ${id} (${currentURL})`);

                            // Clear session data
                            await view.webContents.session.clearStorageData({
                                storages: ['cookies', 'localStorage', 'sessionStorage', 'cache']
                            });

                            // Clear cache
                            await view.webContents.session.clearCache();

                            console.log(`✅ ${websiteConfig.name} session cleared for view ${id}`);
                            websiteViewsCleared++;
                        } else {
                            console.log(`ℹ️ Skipping non-${websiteConfig.name} view ${id} (${currentURL})`);
                        }
                    } catch (error) {
                        console.error(`❌ Error clearing ${websiteConfig.name} session for view ${id}:`, error);
                    }
                }
            }

            // Clear website-specific persistent session partition
            await this.clearWebsitePersistentSessionPartition(websiteConfig);

            console.log(`✅ ${websiteConfig.name} sessions cleared (${websiteViewsCleared} views, 1 partition)`);

            // Try to execute logout script only on website views
            for (const [id, view] of Object.entries(views)) {
                if (view && view.webContents && !view.webContents.isDestroyed()) {
                    try {
                        const currentURL = view.webContents.getURL();
                        if (this.isWebsiteUrl(currentURL, websiteConfig.root_path)) {
                            await view.webContents.executeJavaScript(`
                                (function() {
                                    try {
                                        console.log('🔓 Trying to execute automatic logout on ${websiteConfig.name}...');
                                        
                                        // Find logout button
                                        const logoutSelectors = [
                                            '[data-testid="AccountSwitcher_Logout_Button"]',
                                            '[aria-label*="log out"]',
                                            '[aria-label*="Log out"]',
                                            '[aria-label*="Sign out"]',
                                            '[aria-label*="sign out"]',
                                            '.logout',
                                            '[href*="logout"]',
                                            '[onclick*="logout"]'
                                        ];
                                        
                                        let logoutButton = null;
                                        for (const selector of logoutSelectors) {
                                            logoutButton = document.querySelector(selector);
                                            if (logoutButton && logoutButton.offsetParent !== null) {
                                                break;
                                            }
                                        }
                                        
                                        if (logoutButton) {
                                            console.log('🔓 Found logout button, clicking...');
                                            logoutButton.click();
                                        } else {
                                            console.log('ℹ️ No logout button found');
                                        }
                                    } catch (error) {
                                        console.error('❌ Error in logout script:', error);
                                    }
                                })();
                            `);
                        }
                    } catch (error) {
                        console.error(`❌ Error executing logout script for view ${id}:`, error);
                    }
                }
            }

        } catch (error) {
            console.error('❌ Error clearing website-specific sessions:', error);
        }
    }

    /**
     * Clear website-specific persistent session partition
     */
    async clearWebsitePersistentSessionPartition(websiteConfig) {
        try {
            console.log(`🧹 Clearing ${websiteConfig.name} persistent session partition...`);

            const { session } = require('electron');

            // Use website-specific partition or default to persist:nsn
            const partitionName = websiteConfig.session_partition || 'persist:nsn';

            try {
                console.log(`🧹 Clearing ${websiteConfig.name} session partition: ${partitionName}`);

                // Get the session from partition
                const partitionSession = session.fromPartition(partitionName);

                // Clear all storage data
                await partitionSession.clearStorageData({
                    storages: [
                        'cookies',
                        'localStorage',
                        'sessionStorage',
                        'indexeddb',
                        'websql',
                        'cache',
                        'serviceworkers'
                    ]
                });

                // Clear cache
                await partitionSession.clearCache();

                console.log(`✅ ${websiteConfig.name} session partition cleared: ${partitionName}`);

            } catch (error) {
                console.error(`❌ Error clearing ${websiteConfig.name} session partition ${partitionName}:`, error);
            }

        } catch (error) {
            console.error(`❌ Error clearing ${websiteConfig.name} persistent session partition:`, error);
        }
    }

    /**
     * Check if URL belongs to a specific website
     */
    isWebsiteUrl(url, websiteRootPath) {
        if (!url || !websiteRootPath) return false;
        try {
            const urlObj = new URL(url);
            const websiteUrl = new URL(websiteRootPath);
            return urlObj.origin === websiteUrl.origin;
        } catch (error) {
            console.warn('Invalid URL or website root path:', url, websiteRootPath);
            return false;
        }
    }

    /**
     * Close website-specific tabs, preserving other website tabs
     */
    async closeWebsiteSpecificTabs(websiteConfig) {
        try {
            console.log(`🔓 [WebSocket Client] Closing ${websiteConfig?.name || 'website'} tabs...`);

            if (!this.mainWindow || !this.mainWindow.viewManager) {
                console.warn('⚠️ [WebSocket Client] ViewManager not available for closing website tabs');
                return;
            }

            if (!websiteConfig || !websiteConfig.root_path) {
                console.warn('⚠️ [WebSocket Client] No website configuration provided, falling back to NSN-specific cleanup');
                await this.closeNSNTabsOnly();
                return;
            }

            const viewManager = this.mainWindow.viewManager;
            const views = viewManager.views;
            const websiteViewsToClose = [];

            // Identify website views to close
            for (const [id, view] of Object.entries(views)) {
                if (view && view.webContents && !view.webContents.isDestroyed()) {
                    try {
                        const currentURL = view.webContents.getURL();
                        if (this.isWebsiteUrl(currentURL, websiteConfig.root_path)) {
                            console.log(`🔓 [WebSocket Client] Found ${websiteConfig.name} view ${id} to close: ${currentURL}`);
                            websiteViewsToClose.push(id);
                        } else {
                            console.log(`ℹ️ [WebSocket Client] Preserving non-${websiteConfig.name} view ${id}: ${currentURL}`);
                        }
                    } catch (error) {
                        console.error(`❌ [WebSocket Client] Error checking URL for view ${id}:`, error);
                    }
                }
            }

            // Close website views
            for (const viewId of websiteViewsToClose) {
                try {
                    console.log(`🔓 [WebSocket Client] Closing ${websiteConfig.name} view ${viewId}...`);
                    await viewManager.closeTab(viewId);
                    console.log(`✅ [WebSocket Client] ${websiteConfig.name} view ${viewId} closed`);
                } catch (error) {
                    console.error(`❌ [WebSocket Client] Error closing ${websiteConfig.name} view ${viewId}:`, error);
                }
            }

            // If no tabs remain, create a default page
            const remainingViews = Object.keys(viewManager.views);
            if (remainingViews.length === 0) {
                console.log('🔓 [WebSocket Client] No tabs remaining, creating default page...');
                try {
                    await viewManager.closeAllTabsAndCreateDefault();
                    console.log('✅ [WebSocket Client] Default page created');
                } catch (error) {
                    console.error('❌ [WebSocket Client] Error creating default page:', error);
                }
            } else {
                console.log(`ℹ️ [WebSocket Client] ${remainingViews.length} non-${websiteConfig.name} tabs preserved`);
            }

            console.log(`✅ [WebSocket Client] ${websiteConfig.name} tab cleanup completed (${websiteViewsToClose.length} tabs closed)`);

        } catch (error) {
            console.error(`❌ [WebSocket Client] Error in closeWebsiteSpecificTabs:`, error);
        }
    }

    /**
     * Close only NSN-related tabs, preserving other website tabs
     * @deprecated Use closeWebsiteSpecificTabs instead
     */
    async closeNSNTabsOnly() {
        try {
            console.log('🔓 [WebSocket Client] Closing NSN tabs only...');

            if (!this.mainWindow || !this.mainWindow.viewManager) {
                console.warn('⚠️ [WebSocket Client] ViewManager not available for closing NSN tabs');
                return;
            }

            const viewManager = this.mainWindow.viewManager;
            const views = viewManager.views;
            const nsnViewsToClose = [];

            // Identify NSN views to close
            for (const [id, view] of Object.entries(views)) {
                if (view && view.webContents && !view.webContents.isDestroyed()) {
                    try {
                        const currentURL = view.webContents.getURL();
                        if (viewManager.isNSNUrl(currentURL)) {
                            console.log(`🔓 [WebSocket Client] Found NSN view ${id} to close: ${currentURL}`);
                            nsnViewsToClose.push(id);
                        } else {
                            console.log(`ℹ️ [WebSocket Client] Preserving non-NSN view ${id}: ${currentURL}`);
                        }
                    } catch (error) {
                        console.error(`❌ [WebSocket Client] Error checking URL for view ${id}:`, error);
                    }
                }
            }

            // Close NSN views
            for (const viewId of nsnViewsToClose) {
                try {
                    console.log(`🔓 [WebSocket Client] Closing NSN view ${viewId}...`);
                    await viewManager.closeTab(viewId);
                    console.log(`✅ [WebSocket Client] NSN view ${viewId} closed`);
                } catch (error) {
                    console.error(`❌ [WebSocket Client] Error closing NSN view ${viewId}:`, error);
                }
            }

            // If no tabs remain, create a default page
            const remainingViews = Object.keys(viewManager.views);
            if (remainingViews.length === 0) {
                console.log('🔓 [WebSocket Client] No tabs remaining, creating default page...');
                try {
                    await viewManager.closeAllTabsAndCreateDefault();
                    console.log('✅ [WebSocket Client] Default page created');
                } catch (error) {
                    console.error('❌ [WebSocket Client] Error creating default page:', error);
                }
            } else {
                console.log(`ℹ️ [WebSocket Client] ${remainingViews.length} non-NSN tabs preserved`);
            }

            console.log(`✅ [WebSocket Client] NSN tab cleanup completed (${nsnViewsToClose.length} tabs closed)`);

        } catch (error) {
            console.error('❌ [WebSocket Client] Error in closeNSNTabsOnly:', error);
        }
    }

    handleSessionSync(data) {
        console.log('[WebSocket Client] Session sync:', data);
        // Handle session sync
    }

    async checkUserLogoutStatus(user_id) {
        try {
            console.log('🔍 [WebSocket Client] Checking logout status for user:', user_id);

            // Check if user has logged out by querying B-Client API
            const response = await fetch(`http://localhost:3000/api/user/logout-status?user_id=${user_id}`);
            if (response.ok) {
                const data = await response.json();
                console.log('🔍 [WebSocket Client] Logout status response:', data);
                return data.logout === true;
            } else {
                console.log('⚠️ [WebSocket Client] Failed to check logout status, assuming not logged out');
                return false;
            }
        } catch (error) {
            console.error('❌ [WebSocket Client] Error checking logout status:', error);
            console.log('⚠️ [WebSocket Client] Error occurred, assuming not logged out');
            return false;
        }
    }

    async handleAutoLogin(message) {
        try {
            console.log('🔐 [WebSocket Client] ===== AUTO LOGIN MESSAGE RECEIVED =====');
            console.log('🔐 [WebSocket Client] Auto-login message:', message);

            const { user_id, session_data, website_config, message: msg, timestamp, nsn_username } = message;

            console.log('🔐 [WebSocket Client] User ID:', user_id);
            console.log('🔐 [WebSocket Client] Session data type:', typeof session_data);
            console.log('🔐 [WebSocket Client] Session data:', session_data);
            console.log('🔐 [WebSocket Client] Website config:', website_config);
            console.log('🔐 [WebSocket Client] Message:', msg);
            console.log('🔐 [WebSocket Client] Timestamp:', timestamp);

            // Check if user has logged out (prevent auto-login after logout)
            console.log('🔍 [WebSocket Client] ===== CHECKING USER LOGOUT STATUS =====');
            const isUserLoggedOut = await this.checkUserLogoutStatus(user_id);
            if (isUserLoggedOut) {
                console.log('🔓 [WebSocket Client] User has logged out, rejecting auto-login');
                console.log('🔓 [WebSocket Client] User must login manually to reset logout status');

                // Send feedback to B-Client that auto-login was rejected
                this.sendSessionFeedback(message, false, 'User has logged out, auto-login rejected');
                return;
            }
            console.log('✅ [WebSocket Client] User is not logged out, proceeding with auto-login');
            console.log('🔍 [WebSocket Client] ===== END CHECKING LOGOUT STATUS =====');

            // Check if already logged in to NSN to prevent duplicate login
            console.log('🔍 [WebSocket Client] ===== CHECKING CURRENT LOGIN STATUS =====');
            const isAlreadyLoggedIn = await this.checkNSNLoginStatus();
            if (isAlreadyLoggedIn) {
                console.log('✅ [WebSocket Client] Already logged in to NSN, skipping auto-login');
                console.log('✅ [WebSocket Client] This prevents duplicate login from multiple C-Client instances');

                // Send success feedback to B-Client that we're already logged in
                this.sendSessionFeedback(message, true, 'Already logged in to NSN, no action needed');
                return;
            }
            console.log('🔍 [WebSocket Client] Not logged in to NSN, proceeding with auto-login');
            console.log('🔍 [WebSocket Client] ===== END CHECKING LOGIN STATUS =====');

            // Register website configuration if provided
            if (website_config && this.mainWindow && this.mainWindow.viewManager) {
                console.log('🌐 [WebSocket Client] Registering website configuration:', website_config);
                this.mainWindow.viewManager.registerWebsite(website_config);
            }

            if (!session_data) {
                console.error('❌ [WebSocket Client] No session data provided for auto-login');
                return;
            }

            // Use pre-processed session data from B-Client
            console.log('🔐 [WebSocket Client] Using pre-processed session data from B-Client');
            console.log('🔐 [WebSocket Client] Session data type:', typeof session_data);
            console.log('🔐 [WebSocket Client] Session data:', session_data);

            console.log('🔐 [WebSocket Client] ===== PERFORMING AUTO LOGIN =====');
            console.log('🔐 [WebSocket Client] Logging in user:', user_id);
            console.log('🔐 [WebSocket Client] User ID:', user_id);

            // Use pre-processed session data from B-Client
            const { session } = require('electron');
            const nsnSession = session.fromPartition('persist:nsn');

            console.log('🔐 [WebSocket Client] Using pre-processed session data from B-Client');
            console.log('🔐 [WebSocket Client] Session data type:', typeof session_data);
            console.log('🔐 [WebSocket Client] Session data:', session_data);

            // Set session cookie using standard JSON format
            const sessionValue = session_data.session_cookie;
            if (sessionValue) {
                console.log('🔍 [WebSocket Client] ===== RECEIVED SESSION FROM B-CLIENT =====');
                console.log('🔍 [WebSocket Client] Session data type:', typeof sessionValue);
                console.log('🔍 [WebSocket Client] Session data length:', sessionValue.length);
                console.log('🔍 [WebSocket Client] Session data content:', sessionValue);
                console.log('🔍 [WebSocket Client] ===== END RECEIVED SESSION =====');

                // 详细记录 cookie 设置过程
                console.log('🍪 [WebSocket Client] ===== SETTING SESSION COOKIE =====');
                console.log('🍪 [WebSocket Client] Target URL: http://localhost:5000');
                console.log('🍪 [WebSocket Client] Cookie name: session');
                console.log('🍪 [WebSocket Client] Cookie value:', sessionValue);
                console.log('🍪 [WebSocket Client] Domain: localhost');
                console.log('🍪 [WebSocket Client] Path: /');
                console.log('🍪 [WebSocket Client] Session partition: persist:nsn');

                // 使用webContents的session来设置cookie，确保格式正确
                const { webContents } = require('electron');
                const allWindows = webContents.getAllWebContents();

                // 找到NSN的webContents
                let nsnWebContents = null;
                for (const wc of allWindows) {
                    if (wc.getURL().includes('localhost:5000')) {
                        nsnWebContents = wc;
                        break;
                    }
                }

                if (nsnWebContents) {
                    console.log('🍪 [WebSocket Client] Found NSN webContents, setting cookie directly');
                    await nsnWebContents.session.cookies.set({
                        url: 'http://localhost:5000',
                        name: 'session',
                        value: sessionValue,
                        domain: 'localhost',
                        path: '/',
                        httpOnly: true,
                        secure: false,
                        sameSite: 'lax'
                    });
                } else {
                    console.log('🍪 [WebSocket Client] NSN webContents not found, using session partition');
                    await nsnSession.cookies.set({
                        url: 'http://localhost:5000',
                        name: 'session',
                        value: sessionValue,
                        domain: 'localhost',
                        path: '/',
                        httpOnly: true,
                        secure: false,
                        sameSite: 'lax'
                    });
                }
                console.log('✅ [WebSocket Client] Session cookie set successfully');
                console.log('🍪 [WebSocket Client] ===== END SETTING SESSION COOKIE =====');

                // 验证 cookie 是否设置成功
                console.log('🔍 [WebSocket Client] ===== VERIFYING COOKIE SET =====');
                const cookies = await nsnSession.cookies.get({ url: 'http://localhost:5000' });
                console.log('🔍 [WebSocket Client] Total cookies found:', cookies.length);
                console.log('🔍 [WebSocket Client] All cookies:', cookies.map(c => `${c.name}=${c.value.substring(0, 50)}...`));

                const sessionCookie = cookies.find(cookie => cookie.name === 'session');
                if (sessionCookie) {
                    console.log('✅ [WebSocket Client] Cookie verification successful');
                    console.log('🔍 [WebSocket Client] Cookie name:', sessionCookie.name);
                    console.log('🔍 [WebSocket Client] Cookie value type:', typeof sessionCookie.value);
                    console.log('🔍 [WebSocket Client] Cookie value length:', sessionCookie.value.length);
                    console.log('🔍 [WebSocket Client] Cookie value content:', sessionCookie.value);
                    console.log('🔍 [WebSocket Client] Cookie domain:', sessionCookie.domain);
                    console.log('🔍 [WebSocket Client] Cookie path:', sessionCookie.path);
                    console.log('🔍 [WebSocket Client] Cookie httpOnly:', sessionCookie.httpOnly);
                    console.log('🔍 [WebSocket Client] Cookie secure:', sessionCookie.secure);
                } else {
                    console.log('❌ [WebSocket Client] Cookie verification failed - session cookie not found');
                    console.log('🔍 [WebSocket Client] Available cookie names:', cookies.map(c => c.name));
                }
                console.log('🔍 [WebSocket Client] ===== END COOKIE VERIFICATION =====');
            } else {
                console.log('⚠️ [WebSocket Client] No session cookie provided');
            }

            console.log('✅ [WebSocket Client] ===== AUTO LOGIN COMPLETED =====');
            console.log('✅ [WebSocket Client] User successfully logged in to NSN');
            console.log('✅ [WebSocket Client] Cookies set for automatic authentication');

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
            console.log('⏳ [WebSocket Client] Waiting 50ms for cookies to be fully set...');
            await new Promise(resolve => setTimeout(resolve, 50));
            console.log('✅ [WebSocket Client] Cookie setup delay completed');

            // Trigger page refresh to apply the new session
            console.log('🔄 [WebSocket Client] Triggering page refresh to apply new session...');
            console.log('🔄 [WebSocket Client] Main window available:', !!this.mainWindow);
            try {
                // Get the main window and refresh the NSN tab
                if (this.mainWindow && this.mainWindow.windowManager) {
                    console.log('🔄 [WebSocket Client] WindowManager available:', !!this.mainWindow.windowManager);
                    const mainWindow = this.mainWindow.windowManager.getMainWindow();
                    console.log('🔄 [WebSocket Client] Main window object:', !!mainWindow);
                    if (mainWindow) {
                        // Find NSN tab and refresh it
                        const viewManager = this.mainWindow.viewManager;
                        console.log('🔄 [WebSocket Client] ViewManager available:', !!viewManager);
                        if (viewManager) {
                            const nsnTab = viewManager.findNSNTab();
                            console.log('🔄 [WebSocket Client] NSN tab found:', !!nsnTab);
                            if (nsnTab) {
                                console.log('🔄 [WebSocket Client] Navigating NSN tab to root path to apply new session');

                                // 在导航前再次验证 cookie 是否还在
                                console.log('🔍 [WebSocket Client] ===== PRE-NAVIGATION COOKIE CHECK =====');
                                const preNavCookies = await nsnSession.cookies.get({ url: 'http://localhost:5000' });
                                const preNavSessionCookie = preNavCookies.find(cookie => cookie.name === 'session');
                                if (preNavSessionCookie) {
                                    console.log('✅ [WebSocket Client] Pre-navigation cookie check: session cookie exists');
                                    console.log('🔍 [WebSocket Client] Pre-navigation cookie value:', preNavSessionCookie.value);
                                } else {
                                    console.log('❌ [WebSocket Client] Pre-navigation cookie check: session cookie missing');
                                }
                                console.log('🔍 [WebSocket Client] ===== END PRE-NAVIGATION COOKIE CHECK =====');

                                // Navigate to NSN root path to trigger session check
                                // 在导航前重新设置cookie，确保格式正确
                                console.log('🔄 [WebSocket Client] Re-setting cookie before navigation to ensure correct format');
                                await nsnTab.webContents.session.cookies.set({
                                    url: 'http://localhost:5000',
                                    name: 'session',
                                    value: sessionValue, // 使用原始的JSON字符串
                                    domain: 'localhost',
                                    path: '/',
                                    httpOnly: true,
                                    secure: false,
                                    sameSite: 'lax'
                                });

                                nsnTab.webContents.loadURL('http://localhost:5000/');
                                console.log('✅ [WebSocket Client] NSN tab navigation triggered successfully');

                                // 监听页面加载完成事件，验证 cookie 传递
                                nsnTab.webContents.once('did-finish-load', async () => {
                                    console.log('🔍 [WebSocket Client] ===== POST-NAVIGATION COOKIE CHECK =====');
                                    console.log('🔍 [WebSocket Client] Page finished loading, checking cookies...');

                                    // 获取当前页面的 cookies
                                    const postNavCookies = await nsnTab.webContents.session.cookies.get({ url: 'http://localhost:5000' });
                                    const postNavSessionCookie = postNavCookies.find(cookie => cookie.name === 'session');

                                    if (postNavSessionCookie) {
                                        console.log('✅ [WebSocket Client] Post-navigation cookie check: session cookie exists');
                                        console.log('🔍 [WebSocket Client] Post-navigation cookie value:', postNavSessionCookie.value);
                                    } else {
                                        console.log('❌ [WebSocket Client] Post-navigation cookie check: session cookie missing');
                                        console.log('🔍 [WebSocket Client] Available cookies:', postNavCookies.map(c => c.name));
                                    }
                                    console.log('🔍 [WebSocket Client] ===== END POST-NAVIGATION COOKIE CHECK =====');
                                });
                            } else {
                                console.log('🔄 [WebSocket Client] No NSN tab found, refreshing main window');
                                mainWindow.webContents.reload();
                                console.log('✅ [WebSocket Client] Main window refresh triggered successfully');
                            }
                        } else {
                            console.log('⚠️ [WebSocket Client] ViewManager not available');
                        }
                    } else {
                        console.log('⚠️ [WebSocket Client] Main window object not available');
                    }
                } else {
                    console.log('⚠️ [WebSocket Client] Main window or windowManager not available');
                    console.log('⚠️ [WebSocket Client] this.mainWindow:', !!this.mainWindow);
                    console.log('⚠️ [WebSocket Client] this.mainWindow.windowManager:', !!(this.mainWindow && this.mainWindow.windowManager));
                }
            } catch (error) {
                console.error('❌ [WebSocket Client] Error refreshing page:', error);
                console.error('❌ [WebSocket Client] Error details:', error.message);
                console.error('❌ [WebSocket Client] Stack trace:', error.stack);
            }

            // Send success feedback to B-Client after auto-login completion
            this.sendSessionFeedback(message, true, 'Auto-login completed successfully');

        } catch (error) {
            console.error('❌ [WebSocket Client] Error in auto-login:', error);

            // Send error feedback to B-Client
            this.sendSessionFeedback(message, false, error.message);
        }
    }

    sendSessionFeedback(originalMessage, success, message) {
        try {
            console.log('📤 [WebSocket Client] Sending session feedback to B-Client');
            console.log(`   Success: ${success}`);
            console.log(`   Message: ${message}`);

            const feedbackMessage = {
                type: 'session_feedback',
                user_id: originalMessage.user_id,
                username: originalMessage.username,
                success: success,
                message: message,
                timestamp: new Date().toISOString()
            };

            this.sendMessage(feedbackMessage);
            console.log('✅ [WebSocket Client] Session feedback sent successfully');

        } catch (error) {
            console.error('❌ [WebSocket Client] Error sending session feedback:', error);
        }
    }

    async getStoredCookie(userId, username) {
        try {
            const sqlite3 = require('sqlite3').verbose();
            const path = require('path');
            const dbPath = path.join(__dirname, '..', 'sqlite', 'secure.db');

            return new Promise((resolve) => {
                const db = new sqlite3.Database(dbPath);

                db.get(`
                    SELECT cookie, auto_refresh, create_time 
                    FROM user_cookies 
                    WHERE user_id = ? AND username = ?
                `, [userId, username], (err, row) => {
                    db.close();

                    if (err) {
                        console.error('[WebSocket Client] Error getting stored cookie:', err);
                        resolve(null);
                    } else if (row) {
                        resolve({
                            cookie: row.cookie,
                            auto_refresh: Boolean(row.auto_refresh),
                            create_time: row.create_time
                        });
                    } else {
                        resolve(null);
                    }
                });
            });
        } catch (error) {
            console.error('[WebSocket Client] Error getting stored cookie:', error);
            return null;
        }
    }

    async storeCookie(userId, username, cookie, autoRefresh) {
        try {
            const sqlite3 = require('sqlite3').verbose();
            const path = require('path');
            const dbPath = path.join(__dirname, '..', 'sqlite', 'secure.db');

            return new Promise((resolve) => {
                const db = new sqlite3.Database(dbPath);

                // Create table if not exists
                db.exec(`
                    CREATE TABLE IF NOT EXISTS user_cookies (
                        user_id TEXT,
                        username TEXT,
                        cookie TEXT,
                        auto_refresh BOOLEAN,
                        create_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        PRIMARY KEY (user_id, username)
                    )
                `, (err) => {
                    if (err) {
                        console.error('[WebSocket Client] Error creating table:', err);
                        db.close();
                        resolve(false);
                        return;
                    }

                    // Insert or update cookie
                    db.run(`
                        INSERT OR REPLACE INTO user_cookies 
                        (user_id, username, cookie, auto_refresh, create_time)
                        VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
                    `, [userId, username, cookie, autoRefresh ? 1 : 0], (err) => {
                        db.close();

                        if (err) {
                            console.error('[WebSocket Client] Error storing cookie:', err);
                            resolve(false);
                        } else {
                            resolve(true);
                        }
                    });
                });
            });
        } catch (error) {
            console.error('[WebSocket Client] Error storing cookie:', error);
            return false;
        }
    }

    sendMessage(message) {
        if (this.websocket && this.isConnected) {
            // Check WebSocket readyState before sending
            if (this.websocket.readyState === WebSocket.OPEN) {
                try {
                    this.websocket.send(JSON.stringify(message));
                } catch (error) {
                    console.error('[WebSocket Client] Error sending message:', error);
                }
            } else {
                console.warn(`[WebSocket Client] Cannot send message - WebSocket not ready. State: ${this.websocket.readyState} (${this.getReadyStateName(this.websocket.readyState)})`);
            }
        } else {
            console.warn('[WebSocket Client] Cannot send message - not connected');
        }
    }

    getReadyStateName(readyState) {
        switch (readyState) {
            case WebSocket.CONNECTING: return 'CONNECTING';
            case WebSocket.OPEN: return 'OPEN';
            case WebSocket.CLOSING: return 'CLOSING';
            case WebSocket.CLOSED: return 'CLOSED';
            default: return 'UNKNOWN';
        }
    }

    handleUserConnectedOnAnotherNode(message) {
        console.log('🔔 [WebSocket Client] User connected on another node notification');
        console.log(`   User: ${message.username || 'Unknown'}`);
        console.log(`   User ID: ${message.user_id || 'Unknown'}`);
        console.log(`   New Node: ${message.new_node_id || 'Unknown'}`);
        console.log(`   Message: ${message.message || 'No message provided'}`);

        // Show notification dialog
        this.showUserConnectedOnAnotherNodeDialog(message);
    }

    handleUserConnectedOnAnotherClient(message) {
        console.log('🔔 [WebSocket Client] ===== HANDLING USER CONNECTED ON ANOTHER CLIENT =====');
        console.log('🔔 [WebSocket Client] User connected on another client notification');
        console.log(`   User: ${message.username || 'Unknown'}`);
        console.log(`   User ID: ${message.user_id || 'Unknown'}`);
        console.log(`   New Client: ${message.new_client_id || 'Unknown'}`);
        console.log(`   New Node: ${message.new_node_id || 'Unknown'}`);
        console.log(`   Message: ${message.message || 'No message provided'}`);
        console.log(`   Timestamp: ${message.timestamp || 'No timestamp'}`);

        // Show notification dialog
        console.log('🔔 [WebSocket Client] Calling showUserConnectedOnAnotherClientDialog...');
        try {
            this.showUserConnectedOnAnotherClientDialog(message);
            console.log('✅ [WebSocket Client] showUserConnectedOnAnotherClientDialog called successfully');
        } catch (error) {
            console.error('❌ [WebSocket Client] Error calling showUserConnectedOnAnotherClientDialog:', error);
        }
        console.log('🔔 [WebSocket Client] ===== END HANDLING USER CONNECTED ON ANOTHER CLIENT =====');
    }

    handleUserLogout(message) {
        console.log('🔓 [WebSocket Client] User logout notification received');
        console.log(`   User: ${message.username || 'Unknown'}`);
        console.log(`   User ID: ${message.user_id || 'Unknown'}`);
        console.log(`   Website: ${message.website_config?.name || 'Unknown'}`);
        console.log(`   Root Path: ${message.website_config?.root_path || 'Unknown'}`);

        // Handle logout - clear sessions for the specific website
        this.handleLogoutForWebsite(message);
    }


    showUserConnectedOnAnotherNodeDialog(message) {
        try {
            console.log('🔔 [WebSocket Client] Showing user connected on another node dialog...');

            // Get main window reference
            const { BrowserWindow, screen } = require('electron');
            const mainWindow = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];

            if (!mainWindow) {
                console.error('❌ [WebSocket Client] No main window found for dialog');
                return;
            }

            // Get display info for positioning
            const displays = screen.getAllDisplays();
            const primaryDisplay = displays.find(d => d.id === screen.getPrimaryDisplay().id) || displays[0];
            const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;

            // Calculate dialog position (center of main window)
            const mainBounds = mainWindow.getBounds();
            const dialogWidth = 450;
            const dialogHeight = 250;

            // Position dialog at center of main window
            const x = Math.max(0, mainBounds.x + (mainBounds.width - dialogWidth) / 2);
            const y = Math.max(0, mainBounds.y + (mainBounds.height - dialogHeight) / 2);

            // Ensure dialog is within screen bounds
            const finalX = Math.min(x, screenWidth - dialogWidth - 20);
            const finalY = Math.min(y, screenHeight - dialogHeight - 20);

            // Create dialog window
            const dialogWindow = new BrowserWindow({
                width: dialogWidth,
                height: dialogHeight,
                x: finalX,
                y: finalY,
                resizable: false,
                minimizable: false,
                maximizable: false,
                alwaysOnTop: true,
                skipTaskbar: true,
                frame: false,
                transparent: false,
                webPreferences: {
                    nodeIntegration: false,
                    contextIsolation: true
                }
            });

            // Set window properties
            dialogWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

            // Create HTML content
            const htmlContent = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>User Connected on Another Node</title>
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
        .dialog-container {
            text-align: center;
            padding: 20px;
            max-width: 100%;
        }
        .dialog-title {
            font-size: 20px;
            font-weight: 600;
            color: #2196F3;
            margin-bottom: 16px;
        }
        .dialog-message {
            font-size: 16px;
            color: #666;
            margin-bottom: 20px;
            line-height: 1.4;
        }
        .username {
            font-weight: 700;
            color: #2196F3;
        }
        .node-id {
            font-weight: 700;
            color: #4CAF50;
        }
        .close-button {
            background: #4CAF50;
            color: white;
            border: none;
            padding: 10px 20px;
            border-radius: 6px;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
            transition: background-color 0.2s;
        }
        .close-button:hover {
            background: #45a049;
        }
        .close-button:active {
            background: #3d8b40;
        }
    </style>
</head>
<body>
    <div class="dialog-container">
        <div class="dialog-title">🔔 User Connected on Another Node</div>
        <div class="dialog-message">
            User <span class="username">${message.username || 'Unknown'}</span> has logged in on another node: <span class="node-id">${message.new_node_id || 'Unknown'}</span>.
            <br><br>
            You can now communicate with this user across multiple nodes.
        </div>
        <button class="close-button" onclick="window.close()">OK</button>
    </div>
</body>
</html>`;

            // Load HTML content
            dialogWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(htmlContent));

            // Show dialog
            dialogWindow.show();
            dialogWindow.focus();

            // Auto-close after 10 seconds
            setTimeout(() => {
                if (dialogWindow && !dialogWindow.isDestroyed()) {
                    dialogWindow.close();
                }
            }, 10000);

            // Handle dialog close
            dialogWindow.on('closed', () => {
                console.log('🔔 [WebSocket Client] User connected on another node dialog closed');
            });

            console.log('✅ [WebSocket Client] User connected on another node dialog shown successfully');

        } catch (error) {
            console.error('❌ [WebSocket Client] Error showing user connected on another node dialog:', error);
        }
    }


    showUserAlreadyLoggedInDialog(message) {
        try {
            console.log('🔔 [WebSocket Client] Showing user already logged in dialog...');

            // Get main window reference
            const { BrowserWindow, screen } = require('electron');
            const mainWindow = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];

            if (!mainWindow) {
                console.error('❌ [WebSocket Client] No main window found for dialog');
                return;
            }

            // Get display info for positioning
            const displays = screen.getAllDisplays();
            const primaryDisplay = displays.find(d => d.id === screen.getPrimaryDisplay().id) || displays[0];
            const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;

            // Calculate dialog position (center of main window)
            const mainBounds = mainWindow.getBounds();
            const dialogWidth = 400;
            const dialogHeight = 200;

            // Position dialog at center of main window
            const x = Math.max(0, mainBounds.x + (mainBounds.width - dialogWidth) / 2);
            const y = Math.max(0, mainBounds.y + (mainBounds.height - dialogHeight) / 2);

            // Ensure dialog is within screen bounds
            const finalX = Math.min(x, screenWidth - dialogWidth - 20);
            const finalY = Math.min(y, screenHeight - dialogHeight - 20);

            // Create dialog window
            const dialogWindow = new BrowserWindow({
                width: dialogWidth,
                height: dialogHeight,
                x: finalX,
                y: finalY,
                resizable: false,
                minimizable: false,
                maximizable: false,
                alwaysOnTop: true,
                skipTaskbar: true,
                frame: false,
                transparent: false,
                webPreferences: {
                    nodeIntegration: false,
                    contextIsolation: true
                }
            });

            // Set window properties
            dialogWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

            // Create HTML content
            const htmlContent = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>User Already Logged In</title>
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
        .dialog-container {
            text-align: center;
            padding: 20px;
            max-width: 100%;
        }
        .dialog-title {
            font-size: 20px;
            font-weight: 600;
            color: #f44336;
            margin-bottom: 16px;
        }
        .dialog-message {
            font-size: 16px;
            color: #666;
            margin-bottom: 20px;
            line-height: 1.4;
        }
        .username {
            font-weight: 700;
            color: #2196F3;
        }
        .close-button {
            background: #4CAF50;
            color: white;
            border: none;
            padding: 10px 20px;
            border-radius: 6px;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
            transition: background-color 0.2s;
        }
        .close-button:hover {
            background: #45a049;
        }
        .close-button:active {
            background: #3d8b40;
        }
    </style>
</head>
<body>
    <div class="dialog-container">
        <div class="dialog-title">⚠️ Node Already Connected</div>
        <div class="dialog-message">
            Node <span class="username">${message.node_id || 'Unknown'}</span> is already connected.
            <br><br>
            Only one WebSocket connection per node is allowed. Please close the other session or wait for it to disconnect before trying again.
        </div>
        <button class="close-button" onclick="window.close()">OK</button>
    </div>
</body>
</html>`;

            // Load HTML content
            dialogWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(htmlContent));

            // Show dialog
            dialogWindow.show();
            dialogWindow.focus();

            // Auto-close after 8 seconds
            setTimeout(() => {
                if (dialogWindow && !dialogWindow.isDestroyed()) {
                    dialogWindow.close();
                }
            }, 8000);

            // Handle dialog close
            dialogWindow.on('closed', () => {
                console.log('🔔 [WebSocket Client] User already logged in dialog closed');
            });

            console.log('✅ [WebSocket Client] User already logged in dialog shown successfully');

        } catch (error) {
            console.error('❌ [WebSocket Client] Error showing user already logged in dialog:', error);
        }
    }

    showUserConnectedOnAnotherClientDialog(message) {
        try {
            console.log('🔔 [WebSocket Client] Showing user connected on another client dialog...');
            console.log(`   User: ${message.username || 'Unknown'}`);
            console.log(`   User ID: ${message.user_id || 'Unknown'}`);
            console.log(`   New Client: ${message.new_client_id || 'Unknown'}`);

            // Get all windows and show dialog on all of them
            // This ensures the notification appears on ALL clients where this user is logged in
            const { BrowserWindow, screen } = require('electron');
            const allWindows = BrowserWindow.getAllWindows();

            if (allWindows.length === 0) {
                console.error('❌ [WebSocket Client] No windows found for dialog');
                return;
            }

            console.log(`🔔 [WebSocket Client] Showing dialog on ${allWindows.length} window(s) for user ${message.username}`);

            // Show dialog on all windows - both existing and new clients
            allWindows.forEach((mainWindow, index) => {
                this.showDialogOnWindow(mainWindow, message, index);
            });
        } catch (error) {
            console.error('❌ [WebSocket Client] Error showing user connected on another client dialog:', error);
        }
    }

    showDialogOnWindow(mainWindow, message, windowIndex) {
        try {
            console.log(`🔔 [WebSocket Client] Showing dialog on window ${windowIndex + 1}...`);

            // Get display info for positioning using Electron's screen module
            const { BrowserWindow, screen } = require('electron');
            const displays = screen.getAllDisplays();
            const primaryDisplay = displays.find(d => d.id === screen.getPrimaryDisplay().id) || displays[0];
            const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;

            // Calculate dialog position (bottom right corner)
            const mainBounds = mainWindow.getBounds();
            const dialogWidth = 400;
            const dialogHeight = 200;

            // Position dialog at bottom right corner of screen
            const x = screenWidth - dialogWidth - 20;
            const y = screenHeight - dialogHeight - 20;

            // Ensure dialog is within screen bounds
            const finalX = Math.max(0, Math.min(x, screenWidth - dialogWidth - 20));
            const finalY = Math.max(0, Math.min(y, screenHeight - dialogHeight - 20));

            // Create dialog window
            const dialogWindow = new BrowserWindow({
                width: dialogWidth,
                height: dialogHeight,
                x: finalX,
                y: finalY,
                resizable: false,
                minimizable: false,
                maximizable: false,
                alwaysOnTop: true,
                skipTaskbar: true,
                frame: false,
                transparent: false,
                webPreferences: {
                    nodeIntegration: false,
                    contextIsolation: true
                }
            });

            // Set window properties
            dialogWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

            // Create HTML content
            const htmlContent = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>User Connected on Another Client</title>
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
        .notification-container {
            text-align: center;
            padding: 20px;
        }
        .notification-text {
            font-size: 18px;
            font-weight: 600;
            color: #4CAF50;
            margin: 0;
        }
        .username {
            font-weight: 700;
            color: #2196F3;
        }
    </style>
</head>
<body>
    <div class="notification-container">
        <p class="notification-text">🔔 User <span class="username">${message.username || 'Unknown'}</span> connected on another client</p>
    </div>
</body>
</html>`;

            // Load HTML content
            dialogWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`);

            // Show dialog
            dialogWindow.show();
            dialogWindow.focus();

            // Auto-close after 3 seconds
            setTimeout(() => {
                if (dialogWindow && !dialogWindow.isDestroyed()) {
                    dialogWindow.close();
                }
            }, 3000);

            console.log(`✅ [WebSocket Client] Dialog shown on window ${windowIndex + 1}`);
        } catch (error) {
            console.error(`❌ [WebSocket Client] Error showing dialog on window ${windowIndex + 1}:`, error);
        }
    }

    async handleLogoutForWebsite(message) {
        try {
            console.log('🔓 [WebSocket Client] Handling logout for website...');
            console.log(`   Website: ${message.website_config?.name || 'Unknown'}`);
            console.log(`   Root Path: ${message.website_config?.root_path || 'Unknown'}`);
            console.log(`   Logout API: ${message.logout_api?.url || 'None'}`);

            // Get main window reference - try multiple methods
            const { BrowserWindow } = require('electron');
            let mainWindow = null;
            let viewManager = null;

            // First try to find any window with ViewManager
            const allWindows = BrowserWindow.getAllWindows();
            console.log('🔍 [WebSocket Client] Searching for ViewManager in', allWindows.length, 'windows');

            for (let i = 0; i < allWindows.length; i++) {
                const win = allWindows[i];
                console.log(`🔍 [WebSocket Client] Window ${i}: has ViewManager =`, !!win.viewManager);
                if (win.viewManager) {
                    mainWindow = win;
                    viewManager = win.viewManager;
                    console.log('✅ [WebSocket Client] Found ViewManager in window', i);
                    break;
                }
            }

            // If still no ViewManager found, try focused window
            if (!viewManager) {
                const focusedWindow = BrowserWindow.getFocusedWindow();
                if (focusedWindow && focusedWindow.viewManager) {
                    mainWindow = focusedWindow;
                    viewManager = focusedWindow.viewManager;
                    console.log('✅ [WebSocket Client] Found ViewManager in focused window');
                }
            }

            // If still no ViewManager, try the first window
            if (!viewManager && allWindows.length > 0) {
                mainWindow = allWindows[0];
                viewManager = mainWindow.viewManager;
                console.log('🔍 [WebSocket Client] Trying first window for ViewManager:', !!viewManager);
            }

            if (!viewManager) {
                console.error('❌ [WebSocket Client] No ViewManager found for logout handling');
                console.error('❌ [WebSocket Client] Available windows:', allWindows.length);
                console.error('❌ [WebSocket Client] All windows ViewManager status:', allWindows.map((win, i) => `Window ${i}: ${!!win.viewManager}`));

                // Try to get ViewManager from mainWindow reference
                if (this.mainWindow && this.mainWindow.viewManager) {
                    viewManager = this.mainWindow.viewManager;
                    console.log('✅ [WebSocket Client] Found ViewManager from mainWindow reference');
                } else {
                    console.error('❌ [WebSocket Client] No ViewManager available, sending error feedback');
                    this.sendLogoutFeedback(message, false, 'No ViewManager available for logout handling');
                    return;
                }
            }

            // Clear sessions for the specific website
            console.log('🔓 [WebSocket Client] Clearing sessions for website:', message.website_config?.name);

            // Use the existing clearNSNSessions method if it's NSN, otherwise clear all
            if (message.website_config?.name === 'NSN' || message.website_config?.root_path?.includes('localhost:5000')) {
                console.log('🔓 [WebSocket Client] Clearing NSN-specific sessions');
                try {
                    await viewManager.clearNSNSessions();
                    console.log('✅ [WebSocket Client] NSN sessions cleared successfully');
                } catch (error) {
                    console.error('❌ [WebSocket Client] Error clearing NSN sessions:', error);
                }
            } else {
                console.log('🔓 [WebSocket Client] Website-specific logout not implemented, clearing all sessions');
                try {
                    await viewManager.clearAllSessions();
                    console.log('✅ [WebSocket Client] All sessions cleared successfully');
                } catch (error) {
                    console.error('❌ [WebSocket Client] Error clearing all sessions:', error);
                }
            }

            // CRITICAL FIX: Clear C-Client's own session cookies to prevent sending invalid sessions
            console.log('🔓 [WebSocket Client] Clearing C-Client own session cookies...');
            try {
                const { session } = require('electron');

                // Clear NSN session partition cookies
                const nsnSession = session.fromPartition('persist:nsn');
                await nsnSession.clearStorageData({
                    storages: ['cookies', 'localStorage', 'sessionStorage', 'cache']
                });
                await nsnSession.clearCache();
                console.log('✅ [WebSocket Client] C-Client NSN session cookies cleared');

                // Clear default session cookies
                const defaultSession = session.defaultSession;
                await defaultSession.clearStorageData({
                    storages: ['cookies', 'localStorage', 'sessionStorage', 'cache']
                });
                await defaultSession.clearCache();
                console.log('✅ [WebSocket Client] C-Client default session cookies cleared');

            } catch (error) {
                console.error('❌ [WebSocket Client] Error clearing C-Client session cookies:', error);
            }

            // Call NSN logout API if available
            if (message.logout_api?.url) {
                console.log('🔓 [WebSocket Client] Calling NSN logout API...');
                this.callNSNLogoutAPI(message.logout_api.url, message.website_config?.root_path);
            } else {
                console.log('⚠️ [WebSocket Client] No logout API URL provided, skipping server-side logout');
            }

            console.log('✅ [WebSocket Client] Logout handling completed');

            // Send feedback to B-Client that logout is completed
            this.sendLogoutFeedback(message, true, 'Logout completed successfully');

        } catch (error) {
            console.error('❌ [WebSocket Client] Error handling logout for website:', error);

            // Send error feedback to B-Client
            this.sendLogoutFeedback(message, false, error.message);
        }
    }

    sendLogoutFeedback(originalMessage, success, message) {
        try {
            console.log('📤 [WebSocket Client] Sending IMMEDIATE logout feedback to B-Client');
            console.log(`   Success: ${success}`);
            console.log(`   Message: ${message}`);

            const feedbackMessage = {
                type: 'logout_feedback',
                user_id: originalMessage.user_id,
                username: originalMessage.username,
                success: success,
                message: message,
                timestamp: new Date().toISOString(),
                immediate: true  // Flag for immediate processing
            };

            // Send immediately without any delays
            this.sendMessage(feedbackMessage);
            console.log('✅ [WebSocket Client] IMMEDIATE logout feedback sent successfully');

        } catch (error) {
            console.error('❌ [WebSocket Client] Error sending immediate logout feedback:', error);
        }
    }

    /**
     * Check if C-Client is already logged in to NSN
     * @returns {Promise<boolean>} - True if already logged in, false otherwise
     */
    async checkNSNLoginStatus() {
        try {
            console.log('🔍 [WebSocket Client] ===== CHECKING NSN LOGIN STATUS =====');

            if (!this.mainWindow || !this.mainWindow.viewManager) {
                console.log('⚠️ [WebSocket Client] No ViewManager available for login status check');
                return false;
            }

            const viewManager = this.mainWindow.viewManager;
            const nsnTab = viewManager.findNSNTab();

            if (!nsnTab) {
                console.log('ℹ️ [WebSocket Client] No NSN tab found, not logged in');
                return false;
            }

            console.log('🔍 [WebSocket Client] Found NSN tab, checking login status...');

            // Check if nsnTab has the correct structure
            if (!nsnTab || !nsnTab.webContents) {
                console.log('⚠️ [WebSocket Client] NSN tab structure invalid, not logged in');
                return false;
            }

            console.log('🔍 [WebSocket Client] NSN tab URL:', nsnTab.webContents.getURL());

            // Check if NSN tab shows logged-in state by examining the URL
            const currentURL = nsnTab.webContents.getURL();
            console.log('🔍 [WebSocket Client] NSN tab URL:', currentURL);

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

            console.log('🔍 [WebSocket Client] NSN login status check result:', loginStatus);

            if (loginStatus.isLoggedIn) {
                console.log('✅ [WebSocket Client] Already logged in to NSN');
                console.log('✅ [WebSocket Client] Current URL:', loginStatus.currentUrl);
                console.log('✅ [WebSocket Client] This prevents duplicate auto-login');
                return true;
            } else {
                console.log('ℹ️ [WebSocket Client] Not logged in to NSN');
                console.log('ℹ️ [WebSocket Client] Current URL:', loginStatus.currentUrl);
                console.log('ℹ️ [WebSocket Client] Proceeding with auto-login');
                return false;
            }

        } catch (error) {
            console.error('❌ [WebSocket Client] Error checking NSN login status:', error);
            console.log('⚠️ [WebSocket Client] Assuming not logged in due to error');
            return false;
        }
    }

    async callNSNLogoutAPI(logoutUrl, websiteRootPath) {
        try {
            console.log('🔓 [WebSocket Client] ===== CALLING NSN LOGOUT API =====');
            console.log(`🔓 [WebSocket Client] Logout URL: ${logoutUrl}`);
            console.log(`🔓 [WebSocket Client] Website Root Path: ${websiteRootPath}`);

            // Direct HTTP request to NSN logout endpoint
            const fetch = require('node-fetch');

            try {
                console.log('🔓 [WebSocket Client] Making direct HTTP request to NSN logout endpoint...');
                const response = await fetch(logoutUrl, {
                    method: 'GET',
                    headers: {
                        'Content-Type': 'application/json',
                        'User-Agent': 'C-Client/1.0'
                    }
                });

                console.log('🔓 [WebSocket Client] NSN logout response status:', response.status);

                if (response.ok) {
                    console.log('✅ [WebSocket Client] NSN server-side logout successful');
                    console.log('✅ [WebSocket Client] Response status:', response.status);
                } else {
                    console.log('⚠️ [WebSocket Client] NSN server-side logout failed:', response.status);
                    console.log('⚠️ [WebSocket Client] Response text:', await response.text());
                }
            } catch (error) {
                console.error('❌ [WebSocket Client] Error calling NSN logout API:', error);
            }

            console.log('🔓 [WebSocket Client] ===== END CALLING NSN LOGOUT API =====');

        } catch (error) {
            console.error('❌ [WebSocket Client] Error calling NSN logout API:', error);
        }
    }

    /**
     * Attempt to reconnect using the last connection configuration
     */
    async attemptReconnection() {
        if (!this.lastConnectionConfig) {
            console.log('⚠️ [WebSocket Client] No previous connection config available for reconnection');
            return false;
        }

        console.log('🔄 [WebSocket Client] ===== ATTEMPTING RECONNECTION =====');
        console.log('🔄 [WebSocket Client] Last connection config:', this.lastConnectionConfig);

        try {
            if (this.lastConnectionConfig.websocketUrl) {
                // Reconnect using WebSocket URL
                return await this.connectToNSNProvidedWebSocket(this.lastConnectionConfig.websocketUrl);
            } else {
                // Reconnect using host/port
                return await this.connectToServer(
                    this.lastConnectionConfig.host,
                    this.lastConnectionConfig.port,
                    this.lastConnectionConfig.environmentName
                );
            }
        } catch (error) {
            console.error('❌ [WebSocket Client] Reconnection failed:', error);
            return false;
        }
    }

}

module.exports = CClientWebSocketClient;
