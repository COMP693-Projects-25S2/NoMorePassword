const WebSocket = require('ws');

// Import logging system
const { getCClientLogger, getSyncLogger } = require('../utils/logger');

class CClientWebSocketClient {
    constructor() {
        // Initialize logging system
        this.logger = getCClientLogger('websocket');
        this.syncLogger = getSyncLogger('websocket'); // For sync-related logs

        this.websocket = null;
        this.clientId = null; // Will be set from NodeManager
        this.isConnected = false;
        this.isRegistered = false; // Track registration status
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
        this.logger.info('Main window reference set for page refresh functionality');
    }

    /**
     * Set the ElectronApp reference for connection sharing
     * @param {object} electronApp - The ElectronApp instance
     */
    setElectronApp(electronApp) {
        this.electronApp = electronApp;
        this.logger.info('ElectronApp reference set for connection sharing');
    }

    /**
     * Reset registration status - call this when explicitly needing to re-register
     */
    resetRegistrationStatus() {
        this.isRegistered = false;
        this.logger.info('Registration status reset - will register on next connection');
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
        this.logger.info(`Client ID set: ${this.clientId}`);
    }

    getCurrentUserInfo() {
        // Get current user information from local database for this specific client
        try {
            const DatabaseManager = require('../sqlite/databaseManager');
            const currentUser = DatabaseManager.getCurrentUserFieldsForClient(
                ['user_id', 'username', 'node_id', 'domain_id', 'cluster_id', 'channel_id'],
                this.clientId
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
            this.logger.debug(`Getting current user info...`);
            const currentUser = this.getCurrentUserInfo();
            this.logger.debug(`Current user info:`, currentUser);

            // Get main node IDs from NodeManager
            let mainNodeIds = {
                domain_main_node_id: null,
                cluster_main_node_id: null,
                channel_main_node_id: null
            };

            if (this.electronApp && this.electronApp.nodeManager) {
                this.logger.debug(`Getting main node IDs from NodeManager...`);
                mainNodeIds = this.electronApp.nodeManager.getMainNodeIds();
                this.logger.debug(`Main node IDs:`, mainNodeIds);
            } else {
                console.warn(`⚠️ [WebSocket Client] NodeManager not available, using null for main node IDs`);
            }

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
                // Add main node IDs for node type determination
                domain_main_node_id: mainNodeIds.domain_main_node_id,
                cluster_main_node_id: mainNodeIds.cluster_main_node_id,
                channel_main_node_id: mainNodeIds.channel_main_node_id
            };
            this.logger.info(`Sending registration message with main node IDs:`, registerMessage);
            this.sendMessage(registerMessage);
            return true;
        } catch (error) {
            console.error('[WebSocket Client] Error registering current user:', error);
            return false;
        }
    }

    async reRegisterUser() {
        this.logger.info(`Re-registering user after switch...`);

        if (!this.isConnected || !this.websocket) {
            console.warn('[WebSocket Client] Cannot re-register user - not connected');
            return false;
        }

        try {
            // Get updated user info
            const currentUser = this.getCurrentUserInfo();
            this.logger.debug(`Updated user info:`, currentUser);

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

            this.logger.info(`Sending re-registration message:`, reRegisterMessage);
            this.logger.debug(`Re-registration details:`);
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

            // Reset registration status for user switch
            this.resetRegistrationStatus();

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
            // Smart connection handling: only disconnect if connection is invalid
            if (this.websocket) {
                const currentReadyState = this.websocket.readyState;
                const readyStateName = this.getReadyStateName(currentReadyState);

                console.log(`🔍 [WebSocket Client] Existing connection detected`);
                console.log(`🔍 [WebSocket Client] Current state - isConnected: ${this.isConnected}, isRegistered: ${this.isRegistered}, readyState: ${currentReadyState} (${readyStateName})`);

                // Check if connection is valid and active
                const isConnectionValid = (
                    currentReadyState === 1 && // WebSocket.OPEN
                    this.isConnected &&
                    this.isRegistered
                );

                // Check if connection is in progress
                const isConnectionInProgress = (
                    currentReadyState === 0 || // WebSocket.CONNECTING
                    this.connectionInProgress
                );

                if (isConnectionValid) {
                    console.log(`✅ [WebSocket Client] Connection is valid and active, reusing existing connection`);
                    console.log(`   Skipping reconnection to avoid disrupting active connection`);
                    return true;
                } else if (isConnectionInProgress) {
                    console.log(`⏳ [WebSocket Client] Connection is in progress, waiting for it to complete`);
                    console.log(`   readyState=${currentReadyState} (CONNECTING), connectionInProgress=${this.connectionInProgress}`);
                    console.log(`   Skipping reconnection to avoid disrupting connection attempt`);
                    return true; // Return true to indicate connection is being handled (skip reconnection)
                } else {
                    console.log(`⚠️ [WebSocket Client] Connection is invalid or closed, will reconnect`);
                    console.log(`   Reason: readyState=${currentReadyState} (expected 1), isConnected=${this.isConnected}, isRegistered=${this.isRegistered}`);

                    // Force disconnect invalid connection
                    console.log(`🔌 [WebSocket Client] Disconnecting invalid connection...`);
                    this.disconnect();

                    // Reset registration status for forced reconnection
                    this.resetRegistrationStatus();

                    // Wait for disconnection to complete
                    console.log(`⏳ [WebSocket Client] Waiting 500ms for disconnection to complete...`);
                    await new Promise(resolve => setTimeout(resolve, 500));

                    // Clear any cached connection state
                    this.isConnected = false;
                    this.websocket = null;
                    console.log(`🧹 [WebSocket Client] Cleared connection state for fresh start`);
                }
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
                    console.log(`📥 [WebSocket Client] Raw message data:`, data.toString());
                    const message = JSON.parse(data);
                    console.log(`📥 [WebSocket Client] Received message:`, JSON.stringify(message, null, 2));
                    this.handleMessage(message);
                } catch (error) {
                    console.error('[WebSocket Client] Error parsing message:', error);
                }
            });

            this.websocket.on('close', (code, reason) => {
                console.log(`🔌 [WebSocket Client] ===== WEBSOCKET CONNECTION CLOSED =====`);
                console.log(`🔌 [WebSocket Client] Connection closed`);
                console.log(`   Code: ${code}`);
                console.log(`   Reason: ${reason}`);
                console.log(`   Target: ${environmentName} (${host}:${port})`);
                console.log(`   Close Code Meanings: 1000=Normal, 1005=No Status, 1006=Abnormal, 1011=Server Error`);
                console.log(`🔌 [WebSocket Client] ===== END CONNECTION CLOSED =====`);
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
                readyState: this.websocket ? this.websocket.readyState : 'N/A',
                isRegistered: this.isRegistered
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
            console.log(`🔌 [WebSocket Client] Connecting to NSN-provided WebSocket: ${host}:${port}`);

            const startTime = Date.now();
            const result = await this.connectToServer(host, port, 'NSN-Provided WebSocket');
            const endTime = Date.now();
            const duration = endTime - startTime;

            if (result) {
                console.log(`✅ [WebSocket Client] Connected to NSN WebSocket in ${duration}ms`);
            } else {
                console.error(`❌ [WebSocket Client] Failed to connect to NSN WebSocket`);
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

        // Detailed log: show connection config
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
                // Only reset registration status if we're explicitly reconnecting
                // For normal reconnections, keep the previous registration status

                // Only register if not already registered
                if (!this.isRegistered) {
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
                } else {
                    console.log(`🔄 [WebSocket Client] Already registered, skipping registration`);
                }
            });

            this.websocket.on('message', (data) => {
                try {
                    console.log(`📥 [WebSocket Client] Raw message data:`, data.toString());
                    const message = JSON.parse(data);
                    console.log(`📥 [WebSocket Client] Received message:`, JSON.stringify(message, null, 2));
                    this.handleMessage(message);
                } catch (error) {
                    console.error('[WebSocket Client] Error parsing message:', error);
                }
            });

            // REMOVED: Duplicate close event listeners that were causing connection state confusion
            // The close event is already handled above at line 351

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
        this.logger.info(`🔄 [WebSocket Client] Processing message type: ${type}`);

        // Specially log sync-related messages
        if (type === 'user_activities_batch_forward') {
            this.logger.info(`📦 [WebSocket Client] ===== SYNC MESSAGE RECEIVED =====`);
            this.logger.info(`📦 [WebSocket Client] Message type: ${type}`);
            this.logger.info(`📦 [WebSocket Client] Message data keys: ${data ? Object.keys(data) : 'no data'}`);
        }

        switch (type) {
            case 'registration_success':
                console.log('✅ [WebSocket Client] Registration successful');
                console.log(`   Client ID: ${message.client_id || 'N/A'}`);
                console.log(`   User ID: ${message.user_id || 'N/A'}`);
                this.isRegistered = true; // Mark as registered

                // Check if this is a new device login
                if (message.is_new_device_login) {
                    // Use dedicated security code logger
                    const { getCClientLogger } = require('../utils/logger');
                    const securityLogger = getCClientLogger('security_code');

                    securityLogger.info('🔐 [WebSocket Client] ===== NEW DEVICE LOGIN REGISTRATION SUCCESS RECEIVED =====');
                    securityLogger.info('🔐 [WebSocket Client] Received registration_success with is_new_device_login flag');
                    securityLogger.info('🔐 [WebSocket Client] Message details:');
                    securityLogger.info(`🔐 [WebSocket Client]   - client_id: ${message.client_id}`);
                    securityLogger.info(`🔐 [WebSocket Client]   - user_id: ${message.user_id}`);
                    securityLogger.info(`🔐 [WebSocket Client]   - username: ${message.username}`);
                    securityLogger.info(`🔐 [WebSocket Client]   - node_id: ${message.node_id}`);
                    securityLogger.info(`🔐 [WebSocket Client]   - domain_id: ${message.domain_id}`);
                    securityLogger.info(`🔐 [WebSocket Client]   - cluster_id: ${message.cluster_id}`);
                    securityLogger.info(`🔐 [WebSocket Client]   - channel_id: ${message.channel_id}`);
                    securityLogger.info(`🔐 [WebSocket Client]   - domain_main_node_id: ${message.domain_main_node_id}`);
                    securityLogger.info(`🔐 [WebSocket Client]   - cluster_main_node_id: ${message.cluster_main_node_id}`);
                    securityLogger.info(`🔐 [WebSocket Client]   - channel_main_node_id: ${message.channel_main_node_id}`);
                    securityLogger.info('🔐 [WebSocket Client] Calling handleNewDeviceLogin...');

                    // Handle new device login
                    this.handleNewDeviceLogin(message);
                }
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

            case 'user_activities_batch_forward':
                this.handleUserActivitiesBatchForward(message);
                break;

            case 'user_activities_batch_feedback':
                this.handleUserActivitiesBatchFeedback(message);
                break;

            case 'cluster_verification_query':
                this.handleClusterVerificationQuery(message);
                break;

            case 'cluster_verification_request':
                this.logger.info('🔍 [WebSocket Client] ===== RECEIVED CLUSTER VERIFICATION REQUEST =====');
                this.logger.info('🔍 [WebSocket Client] Message type: cluster_verification_request');
                this.logger.info('🔍 [WebSocket Client] Full message: ' + JSON.stringify(message, null, 2));
                this.handleClusterVerificationRequest(message);
                break;

            case 'security_code_response':
                this.logger.info('📱 [WebSocket Client] ===== RECEIVED SECURITY CODE RESPONSE =====');
                this.logger.info('📱 [WebSocket Client] Response data:', JSON.stringify(data, null, 2));
                this.handleSecurityCodeResponse(message);
                break;

            case 'error':
                console.error('[WebSocket Client] Received error:', message.message);
                break;

            // ========== NodeManager Commands ==========
            case 'new_domain_node':
            case 'new_cluster_node':
            case 'new_channel_node':
            case 'assign_to_domain':
            case 'assign_to_cluster':
            case 'assign_to_channel':
            case 'add_new_node_to_peers':
            case 'add_new_channel_to_peers':
            case 'add_new_cluster_to_peers':
            case 'add_new_domain_to_peers':
            case 'count_peers_amount':
                console.log(`🔧 [WebSocket Client] Received NodeManager command: ${type}`);
                this.handleNodeManagerCommand(message);
                break;

            default:
                console.log('[WebSocket Client] Unknown message type:', type);
        }
    }

    async handleNodeManagerCommand(message) {
        console.log('='.repeat(80));
        console.log(`🔧 [WebSocket Client] handleNodeManagerCommand() CALLED`);
        console.log(`📋 Command type: ${message.type}`);
        console.log(`📋 Command data:`, message.data);
        console.log(`📋 Request ID: ${message.request_id}`);

        try {
            // Get NodeManager instance
            const NodeManager = require('../nodeManager/nodeManager');

            // Check if nodeManager is available in electronApp
            if (!this.electronApp || !this.electronApp.nodeManager) {
                console.error('❌ [WebSocket Client] NodeManager not available in electronApp');

                // Send error response
                this.send({
                    success: false,
                    error: 'NodeManager not initialized',
                    request_id: message.request_id
                });
                return;
            }

            const nodeManager = this.electronApp.nodeManager;
            console.log('✅ [WebSocket Client] NodeManager found');

            let result = null;

            // Handle different command types
            switch (message.type) {
                case 'new_domain_node':
                    console.log('🏗️ [WebSocket Client] Calling nodeManager.newDomainNode()...');
                    result = await nodeManager.newDomainNode();
                    break;

                case 'new_cluster_node':
                    console.log('🏗️ [WebSocket Client] Calling nodeManager.newClusterNode()...');
                    result = await nodeManager.newClusterNode(message.data.domain_id);
                    break;

                case 'new_channel_node':
                    console.log('🏗️ [WebSocket Client] Calling nodeManager.newChannelNode()...');
                    result = await nodeManager.newChannelNode(
                        message.data.domain_id,
                        message.data.cluster_id
                    );
                    break;

                case 'assign_to_domain':
                    console.log('📍 [WebSocket Client] Calling nodeManager.assignToDomain()...');
                    result = await nodeManager.assignToDomain(
                        message.data.domain_id,
                        message.data.node_id
                    );
                    break;

                case 'assign_to_cluster':
                    console.log('📍 [WebSocket Client] Calling nodeManager.assignToCluster()...');
                    result = await nodeManager.assignToCluster(
                        message.data.cluster_id,
                        message.data.node_id,
                        message.data.domain_id
                    );
                    break;

                case 'assign_to_channel':
                    console.log('📍 [WebSocket Client] Calling nodeManager.assignToChannel()...');
                    result = await nodeManager.assignToChannel(
                        message.data.channel_id,
                        message.data.node_id,
                        message.data.domain_id,
                        message.data.cluster_id
                    );
                    break;

                case 'add_new_node_to_peers':
                    console.log('👥 [WebSocket Client] Calling nodeManager.addNewNodeToPeers()...');
                    result = await nodeManager.addNewNodeToPeers(
                        message.data.domain_id,
                        message.data.cluster_id,
                        message.data.channel_id,
                        message.data.node_id
                    );
                    break;

                case 'add_new_channel_to_peers':
                    console.log('👥 [WebSocket Client] Calling nodeManager.addNewChannelToPeers()...');
                    result = await nodeManager.addNewChannelToPeers(
                        message.data.domain_id,
                        message.data.cluster_id,
                        message.data.channel_id,
                        message.data.node_id
                    );
                    break;

                case 'add_new_cluster_to_peers':
                    console.log('👥 [WebSocket Client] Calling nodeManager.addNewClusterToPeers()...');
                    result = await nodeManager.addNewClusterToPeers(
                        message.data.domain_id,
                        message.data.cluster_id,
                        message.data.node_id
                    );
                    break;

                case 'add_new_domain_to_peers':
                    console.log('👥 [WebSocket Client] Calling nodeManager.addNewDomainToPeers()...');
                    result = await nodeManager.addNewDomainToPeers(
                        message.data.domain_id,
                        message.data.node_id
                    );
                    break;

                case 'count_peers_amount':
                    console.log('📊 [WebSocket Client] Calling nodeManager.countPeersAmount()...');
                    result = await nodeManager.countPeersAmount(
                        message.data.domain_id,
                        message.data.cluster_id,
                        message.data.channel_id
                    );
                    break;

                default:
                    console.warn(`[WebSocket Client] Unhandled NodeManager command: ${message.type}`);
                    result = {
                        success: false,
                        error: `Unknown command type: ${message.type}`
                    };
            }

            console.log(`✅ [WebSocket Client] NodeManager command completed:`, result);

            // Send response back to B-Client
            const response = {
                success: result.success,
                data: result,
                request_id: message.request_id,
                command_type: message.type
            };

            console.log(`📤 [WebSocket Client] Sending response to B-Client:`, response);
            this.sendMessage(response);  // Use sendMessage instead of send
            console.log('='.repeat(80));

        } catch (error) {
            console.error('❌ [WebSocket Client] Error handling NodeManager command:', error);
            console.error(error.stack);

            // Send error response
            this.sendMessage({  // Use sendMessage instead of send
                success: false,
                error: error.message,
                request_id: message.request_id
            });
            console.log('='.repeat(80));
        }
    }

    disconnect() {
        console.log('🔌 [WebSocket Client] Disconnecting from WebSocket server...');

        if (this.websocket) {
            this.websocket.close();
            this.websocket = null;
        }

        this.isConnected = false;
        // Keep isRegistered status on disconnect - only reset when explicitly needed

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
        this.isRegistered = false;  // Reset registration status for fresh connection
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

            // Step 1: Clear website-specific browser sessions (always complete cleanup)
            console.log('🔓 [WebSocket Client] Step 1: Clearing website-specific browser sessions...');
            if (this.mainWindow && this.mainWindow.tabManager) {
                try {
                    // Always clear all sessions for complete logout - no optimization for repeated logouts
                    await this.clearWebsiteSpecificSessions(website_config);
                    console.log(`✅ [WebSocket Client] ${website_config?.name || 'Website'} browser sessions cleared (other websites preserved)`);
                } catch (error) {
                    console.error('❌ [WebSocket Client] Error clearing website browser sessions:', error);
                }
            } else {
                console.warn('⚠️ [WebSocket Client] TabManager not available for session clearing');
            }

            // Step 2: Close website-specific tabs (always complete cleanup)
            console.log('🔓 [WebSocket Client] Step 2: Closing website-specific tabs...');
            if (this.mainWindow && this.mainWindow.tabManager) {
                try {
                    // Always close all tabs for complete logout - no optimization for repeated logouts
                    await this.closeWebsiteSpecificTabs(website_config);
                    console.log(`✅ [WebSocket Client] ${website_config?.name || 'Website'} tabs closed (other website tabs preserved)`);
                } catch (error) {
                    console.error('❌ [WebSocket Client] Error managing website tabs:', error);
                }
            } else {
                console.warn('⚠️ [WebSocket Client] TabManager not available for tab management');
            }

            // Step 3: Clear local user session data (always clear for complete logout)
            console.log('🔓 [WebSocket Client] Step 3: Clearing local user session data...');
            try {
                // Always clear session data for complete logout - no optimization for repeated logouts
                await this.clearUserSessionData(user_id);
                console.log('ℹ️ [WebSocket Client] User session data cleared');
            } catch (error) {
                console.error('❌ [WebSocket Client] Error clearing local session data:', error);
            }

            console.log('✅ [WebSocket Client] ===== USER LOGOUT COMPLETED =====');
            console.log('✅ [WebSocket Client] User logout process completed successfully');

            // Step 4: IMMEDIATELY send feedback to B-Client (before any other operations)
            console.log('🚀 [WebSocket Client] Step 4: IMMEDIATELY sending logout feedback to B-Client...');
            this.sendLogoutFeedback(data, true, 'Logout completed successfully');
            console.log('✅ [WebSocket Client] Logout feedback sent IMMEDIATELY');

            // Step 5: Brief delay to ensure feedback is sent before proceeding
            console.log('⏳ [WebSocket Client] Step 5: Brief delay to ensure feedback delivery...');
            await new Promise(resolve => setTimeout(resolve, 200)); // 200ms delay to ensure feedback is sent

            // Step 6: Call NSN logout API (after feedback is sent)
            console.log('🔓 [WebSocket Client] Step 6: Calling NSN logout API...');
            if (data.logout_api?.url) {
                console.log('🔓 [WebSocket Client] Calling NSN logout API...');
                await this.callNSNLogoutAPI(data.logout_api.url, data.website_config?.root_path);
                console.log('✅ [WebSocket Client] NSN logout API called');
            } else {
                console.log('⚠️ [WebSocket Client] No logout API URL provided, skipping server-side logout');
            }

            // Step 7: Mark current WebSocket server connection as unavailable
            console.log('🔓 [WebSocket Client] Step 7: Marking current WebSocket server connection as unavailable...');
            this.markCurrentWebSocketServerAsUnavailable();
            console.log('✅ [WebSocket Client] Current WebSocket server connection marked as unavailable');

            // Step 8: Reset WebSocket connection (after all operations)
            console.log('🔓 [WebSocket Client] Step 8: Resetting WebSocket connection...');
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

            if (!this.mainWindow || !this.mainWindow.tabManager) {
                console.warn('⚠️ [WebSocket Client] TabManager not available for incremental session clearing');
                return;
            }

            const tabManager = this.mainWindow.tabManager;
            const views = tabManager.getAllViews();
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

            if (!this.mainWindow || !this.mainWindow.tabManager) {
                console.warn('⚠️ [WebSocket Client] TabManager not available for incremental tab closing');
                return;
            }

            const tabManager = this.mainWindow.tabManager;
            const views = tabManager.getAllViews();
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
                    // Use TabManager if available, otherwise fallback to ViewManager
                    await tabManager.closeTab(viewId);
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

            if (!this.mainWindow || !this.mainWindow.tabManager) {
                console.warn('⚠️ [WebSocket Client] TabManager not available for clearing website sessions');
                return;
            }

            if (!websiteConfig || !websiteConfig.root_path) {
                console.warn('⚠️ [WebSocket Client] No website configuration provided, falling back to NSN-specific cleanup');
                await this.mainWindow.tabManager.clearNSNSessions();
                return;
            }

            const tabManager = this.mainWindow.tabManager;
            const views = tabManager.getAllViews();
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

            if (!this.mainWindow || !this.mainWindow.tabManager) {
                console.warn('⚠️ [WebSocket Client] TabManager not available for closing website tabs');
                return;
            }

            if (!websiteConfig || !websiteConfig.root_path) {
                console.warn('⚠️ [WebSocket Client] No website configuration provided, falling back to NSN-specific cleanup');
                await this.closeNSNTabsOnly();
                return;
            }

            const tabManager = this.mainWindow.tabManager;
            const views = tabManager.getAllViews();
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
                    // Use TabManager if available, otherwise fallback to ViewManager
                    await tabManager.closeTab(viewId);
                    console.log(`✅ [WebSocket Client] ${websiteConfig.name} view ${viewId} closed`);
                } catch (error) {
                    console.error(`❌ [WebSocket Client] Error closing ${websiteConfig.name} view ${viewId}:`, error);
                }
            }

            // If no tabs remain, create a default page
            const remainingViews = Object.keys(tabManager.getAllViews());
            if (remainingViews.length === 0) {
                console.log('🔓 [WebSocket Client] No tabs remaining, creating default page...');
                try {
                    // Use TabManager if available, otherwise fallback to ViewManager
                    await tabManager.closeAllTabs();
                    await tabManager.createTab();
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

            if (!this.mainWindow || !this.mainWindow.tabManager) {
                console.warn('⚠️ [WebSocket Client] TabManager not available for closing NSN tabs');
                return;
            }

            const tabManager = this.mainWindow.tabManager;
            const views = tabManager.getAllViews();
            const nsnViewsToClose = [];

            // Identify NSN views to close
            for (const [id, view] of Object.entries(views)) {
                if (view && view.webContents && !view.webContents.isDestroyed()) {
                    try {
                        const currentURL = view.webContents.getURL();
                        if (tabManager.isNSNUrl(currentURL)) {
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
                    // Use TabManager if available, otherwise fallback to ViewManager
                    await tabManager.closeTab(viewId);
                    console.log(`✅ [WebSocket Client] NSN view ${viewId} closed`);
                } catch (error) {
                    console.error(`❌ [WebSocket Client] Error closing NSN view ${viewId}:`, error);
                }
            }

            // If no tabs remain, create a default page
            const remainingViews = Object.keys(tabManager.getAllViews());
            if (remainingViews.length === 0) {
                console.log('🔓 [WebSocket Client] No tabs remaining, creating default page...');
                try {
                    // Use TabManager if available, otherwise fallback to ViewManager
                    await tabManager.closeAllTabs();
                    await tabManager.createTab();
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
        console.log('🔐 [WebSocket Client] ===== SESSION SYNC MESSAGE RECEIVED =====');
        console.log('🔐 [WebSocket Client] Session sync data:', data);

        try {
            // Process the session data similar to auto_login
            if (data && data.session_data) {
                console.log('🔐 [WebSocket Client] Processing session data from B-Client');
                this.handleAutoLogin({
                    type: 'auto_login',
                    user_id: data.user_id,
                    session_data: data.session_data,
                    website_config: data.website_config,
                    message: data.message,
                    timestamp: data.timestamp,
                    nsn_username: data.nsn_username
                });
            } else {
                console.warn('⚠️ [WebSocket Client] No session data provided in session sync');
            }
        } catch (error) {
            console.error('❌ [WebSocket Client] Error processing session sync:', error);
        }
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

            // Add WebSocket connection state logging
            console.log('🔍 [WebSocket Client] ===== WEBSOCKET CONNECTION STATE =====');
            console.log('🔍 [WebSocket Client] WebSocket connection state:');
            console.log('   - isConnected:', this.isConnected);
            console.log('   - isRegistered:', this.isRegistered);
            console.log('   - readyState:', this.websocket ? this.websocket.readyState : 'N/A');
            console.log('   - WebSocket object:', !!this.websocket);
            console.log('🔍 [WebSocket Client] ===== END WEBSOCKET STATE =====');

            // Check if user has logged out (prevent auto-login after logout)
            console.log('🔍 [WebSocket Client] ===== CHECKING USER LOGOUT STATUS =====');
            const isUserLoggedOut = await this.checkUserLogoutStatus(user_id);
            if (isUserLoggedOut) {
                console.log('🔓 [WebSocket Client] User has logged out, rejecting auto-login');
                console.log('🔓 [WebSocket Client] User must login manually to reset logout status');

                // Add WebSocket connection state logging after logout check
                console.log('🔍 [WebSocket Client] ===== WEBSOCKET STATE AFTER LOGOUT CHECK =====');
                console.log('🔍 [WebSocket Client] WebSocket connection state after logout rejection:');
                console.log('   - isConnected:', this.isConnected);
                console.log('   - isRegistered:', this.isRegistered);
                console.log('   - readyState:', this.websocket ? this.websocket.readyState : 'N/A');
                console.log('   - WebSocket object:', !!this.websocket);
                console.log('🔍 [WebSocket Client] ===== END POST-LOGOUT STATE =====');

                // Send feedback to B-Client that auto-login was rejected
                this.sendSessionFeedback(message, false, 'User has logged out, auto-login rejected');

                // Add WebSocket connection state logging after sending feedback
                console.log('🔍 [WebSocket Client] ===== WEBSOCKET STATE AFTER FEEDBACK =====');
                console.log('🔍 [WebSocket Client] WebSocket connection state after sending feedback:');
                console.log('   - isConnected:', this.isConnected);
                console.log('   - isRegistered:', this.isRegistered);
                console.log('   - readyState:', this.websocket ? this.websocket.readyState : 'N/A');
                console.log('   - WebSocket object:', !!this.websocket);
                console.log('🔍 [WebSocket Client] ===== END POST-FEEDBACK STATE =====');

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
            if (website_config && this.mainWindow && this.mainWindow.tabManager) {
                console.log('🌐 [WebSocket Client] Registering website configuration:', website_config);
                this.mainWindow.tabManager.registerWebsite(website_config);
            }

            if (!session_data) {
                console.error('❌ [WebSocket Client] No session data provided for auto-login');
                // Send error feedback to B-Client
                this.sendSessionFeedback(message, false, 'No session data provided for auto-login');
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

                // Log cookie setting process in detail
                console.log('🍪 [WebSocket Client] ===== SETTING SESSION COOKIE =====');
                console.log('🍪 [WebSocket Client] Target URL: http://localhost:5000');
                console.log('🍪 [WebSocket Client] Cookie name: session');
                console.log('🍪 [WebSocket Client] Cookie value:', sessionValue);
                console.log('🍪 [WebSocket Client] Domain: localhost');
                console.log('🍪 [WebSocket Client] Path: /');
                console.log('🍪 [WebSocket Client] Session partition: persist:nsn');

                // Use NSN session partition to set cookie
                console.log('🍪 [WebSocket Client] Using NSN session partition to set cookie');
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
                console.log('✅ [WebSocket Client] Session cookie set successfully');
                console.log('🍪 [WebSocket Client] ===== END SETTING SESSION COOKIE =====');

                // Verify cookie was set successfully
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
                    console.log('⚠️ [WebSocket Client] Cookie verification failed, but continuing operation...');
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
                        // Find all tabs for the website and refresh them
                        const tabManager = this.mainWindow.tabManager;
                        console.log('🔄 [WebSocket Client] TabManager available:', !!tabManager);
                        if (tabManager && website_config) {
                            const websiteTabs = tabManager.findAllTabsForWebsite(website_config);
                            console.log(`🔄 [WebSocket Client] ${website_config.name} tabs found:`, websiteTabs.length);
                            if (websiteTabs.length > 0) {
                                // Process all website tabs
                                for (let i = 0; i < websiteTabs.length; i++) {
                                    const websiteTab = websiteTabs[i];
                                    console.log(`🔄 [WebSocket Client] Processing ${website_config.name} tab ${i + 1}/${websiteTabs.length} (ID: ${websiteTab.id})`);
                                    console.log(`🔄 [WebSocket Client] Navigating ${website_config.name} tab to root path to apply new session`);

                                    // Verify cookie still exists before navigation
                                    console.log('🔍 [WebSocket Client] ===== PRE-NAVIGATION COOKIE CHECK =====');
                                    const websiteUrl = website_config.root_url || 'http://localhost:5000';
                                    const preNavCookies = await nsnSession.cookies.get({ url: websiteUrl });
                                    const preNavSessionCookie = preNavCookies.find(cookie => cookie.name === 'session');
                                    if (preNavSessionCookie) {
                                        console.log('✅ [WebSocket Client] Pre-navigation cookie check: session cookie exists');
                                        console.log('🔍 [WebSocket Client] Pre-navigation cookie value:', preNavSessionCookie.value);
                                    } else {
                                        console.log('❌ [WebSocket Client] Pre-navigation cookie check: session cookie missing');
                                    }
                                    console.log('🔍 [WebSocket Client] ===== END PRE-NAVIGATION COOKIE CHECK =====');

                                    // Navigate to website root path to trigger session check
                                    // Re-set cookie before navigation to ensure correct format
                                    console.log('🔄 [WebSocket Client] Re-setting cookie before navigation to ensure correct format');

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
                                        console.log(`✅ [WebSocket Client] Cookie re-set successfully in ${website_config.name} tab`);
                                    } else {
                                        console.log(`⚠️ [WebSocket Client] ${website_config.name} tab webContents or session not available, skipping cookie re-set`);
                                    }

                                    // Apply session cookie directly to website tab (like ViewManager does)
                                    console.log(`🔄 [WebSocket Client] Applying session cookie directly to ${website_config.name} tab...`);
                                    if (websiteTab.browserView.webContents && websiteTab.browserView.webContents.session) {
                                        // Extract the actual cookie value from the session cookie string
                                        let cookieValue = sessionValue;
                                        if (sessionValue.startsWith('session=')) {
                                            cookieValue = sessionValue.split('session=')[1].split(';')[0];
                                        }

                                        console.log(`🔄 [WebSocket Client] Setting session cookie directly to ${website_config.name} tab...`);
                                        console.log('🔄 [WebSocket Client] Cookie value:', cookieValue.substring(0, 50) + '...');

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

                                        console.log(`✅ [WebSocket Client] Session cookie set directly to ${website_config.name} tab`);

                                        // Navigate to root URL from website config to let website handle redirect based on session state
                                        const rootUrl = website_config?.root_url || websiteUrl;
                                        console.log(`🔄 [WebSocket Client] Navigating ${website_config.name} tab to root URL from config:`, rootUrl);
                                        websiteTab.browserView.webContents.loadURL(rootUrl);
                                        console.log(`✅ [WebSocket Client] ${website_config.name} tab navigated to root, website will handle redirect based on session state`);
                                    } else {
                                        console.log(`⚠️ [WebSocket Client] ${website_config.name} tab webContents or session not available, cannot apply cookie`);
                                    }

                                    // Listen for page load completion event to verify cookie delivery
                                    websiteTab.browserView.webContents.once('did-finish-load', async () => {
                                        console.log('🔍 [WebSocket Client] ===== POST-NAVIGATION COOKIE CHECK =====');
                                        console.log('🔍 [WebSocket Client] Page finished loading, checking cookies...');

                                        // Get current page cookies
                                        const postNavCookies = await websiteTab.browserView.webContents.session.cookies.get({ url: websiteUrl });
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
                                }
                            } else {
                                console.log(`🔄 [WebSocket Client] No ${website_config.name} tab found, navigating current tab to ${website_config.name}...`);
                                console.log(`🔄 [WebSocket Client] Applying session to current tab by navigating to ${website_config.name}...`);

                                // Navigate current tab to website with NMP parameters
                                try {
                                    const currentTabId = tabManager.getCurrentTab();
                                    if (currentTabId) {
                                        console.log(`🔄 [WebSocket Client] Navigating current tab to ${website_config.name} with NMP parameters:`, currentTabId);

                                        // Use the URL parameter injector to get NMP parameters
                                        const { URLParameterInjector } = require('../utils/urlParameterInjector');
                                        const injector = new URLParameterInjector();

                                        // Get the processed URL with NMP parameters using website config
                                        const websiteUrl = website_config.root_url || 'http://localhost:5000';
                                        const processedUrl = await injector.processUrl(websiteUrl, this.clientId);
                                        console.log(`🔄 [WebSocket Client] Processed URL with NMP parameters for ${website_config.name}:`, processedUrl);

                                        await tabManager.navigateTo(processedUrl);
                                        console.log(`✅ [WebSocket Client] Current tab navigated to ${website_config.name} with NMP parameters successfully`);

                                        // Wait for navigation to complete, then set session cookie
                                        setTimeout(async () => {
                                            try {
                                                const currentTab = tabManager.getCurrentTab();
                                                if (currentTab && currentTab.webContents && currentTab.webContents.session) {
                                                    console.log('🔄 [WebSocket Client] Setting session cookie to current tab after navigation...');

                                                    // Extract the actual cookie value from the session cookie string
                                                    let cookieValue = sessionValue;
                                                    if (sessionValue.startsWith('session=')) {
                                                        cookieValue = sessionValue.split('session=')[1].split(';')[0];
                                                    }

                                                    // Set cookie directly in the current tab's session
                                                    // Use the current tab's actual session, not the persist:nsn partition
                                                    await currentTab.webContents.session.cookies.set({
                                                        url: 'http://localhost:5000',
                                                        name: 'session',
                                                        value: cookieValue,
                                                        httpOnly: true,
                                                        secure: false,
                                                        domain: 'localhost',
                                                        path: '/'
                                                    });

                                                    console.log('✅ [WebSocket Client] Session cookie set to current tab');

                                                    // Navigate to root URL from website config to let NSN handle redirect based on session state
                                                    const rootUrl = website_config?.root_url || 'http://localhost:5000/';
                                                    console.log('🔄 [WebSocket Client] Navigating current tab to root URL from config:', rootUrl);
                                                    currentTab.webContents.loadURL(rootUrl);
                                                    console.log('✅ [WebSocket Client] Current tab navigated to root, NSN will handle redirect based on session state');
                                                }
                                            } catch (error) {
                                                console.error('❌ [WebSocket Client] Error setting session cookie to current tab:', error);
                                            }
                                        }, 1000); // Wait 1 second for navigation to complete
                                    } else {
                                        console.log('⚠️ [WebSocket Client] No current tab found, session cookie will be applied when user navigates to NSN');
                                    }
                                } catch (error) {
                                    console.error('❌ [WebSocket Client] Error navigating current tab to NSN:', error);
                                    console.log('⚠️ [WebSocket Client] Session cookie will be applied when user navigates to NSN');
                                }
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
        return new Promise((resolve, reject) => {
            if (this.websocket && this.isConnected) {
                // Check WebSocket readyState before sending
                if (this.websocket.readyState === WebSocket.OPEN) {
                    try {
                        this.websocket.send(JSON.stringify(message));
                        resolve();
                    } catch (error) {
                        console.error('[WebSocket Client] Error sending message:', error);
                        reject(error);
                    }
                } else {
                    const error = new Error(`WebSocket not ready. State: ${this.websocket.readyState} (${this.getReadyStateName(this.websocket.readyState)})`);
                    console.warn(`[WebSocket Client] Cannot send message - ${error.message}`);
                    reject(error);
                }
            } else {
                const error = new Error('WebSocket not connected');
                console.warn('[WebSocket Client] Cannot send message - not connected');
                reject(error);
            }
        });
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
            let tabManager = null;

            // First try to find any window with TabManager
            const allWindows = BrowserWindow.getAllWindows();
            console.log('🔍 [WebSocket Client] Searching for TabManager in', allWindows.length, 'windows');

            for (let i = 0; i < allWindows.length; i++) {
                const win = allWindows[i];
                console.log(`🔍 [WebSocket Client] Window ${i}: has TabManager =`, !!win.tabManager);
                if (win.tabManager) {
                    mainWindow = win;
                    tabManager = win.tabManager;
                    console.log('✅ [WebSocket Client] Found TabManager in window', i);
                    break;
                }
            }

            // If still no TabManager found, try focused window
            if (!tabManager) {
                const focusedWindow = BrowserWindow.getFocusedWindow();
                if (focusedWindow && focusedWindow.tabManager) {
                    mainWindow = focusedWindow;
                    tabManager = focusedWindow.tabManager;
                    console.log('✅ [WebSocket Client] Found TabManager in focused window');
                }
            }

            // If still no TabManager, try the first window
            if (!tabManager && allWindows.length > 0) {
                mainWindow = allWindows[0];
                tabManager = mainWindow.tabManager;
                console.log('🔍 [WebSocket Client] Trying first window for TabManager:', !!tabManager);
            }

            if (!tabManager) {
                console.error('❌ [WebSocket Client] No TabManager found for logout handling');
                console.error('❌ [WebSocket Client] Available windows:', allWindows.length);
                console.error('❌ [WebSocket Client] All windows TabManager status:', allWindows.map((win, i) => `Window ${i}: ${!!win.tabManager}`));

                // Try to get TabManager from mainWindow reference
                if (this.mainWindow && this.mainWindow.tabManager) {
                    tabManager = this.mainWindow.tabManager;
                    console.log('✅ [WebSocket Client] Found TabManager from mainWindow reference');
                } else {
                    console.error('❌ [WebSocket Client] No TabManager available, sending error feedback');
                    this.sendLogoutFeedback(message, false, 'No TabManager available for logout handling');
                    return;
                }
            }

            // Clear sessions for the specific website
            console.log('🔓 [WebSocket Client] Clearing sessions for website:', message.website_config?.name);

            // Use the existing clearNSNSessions method if it's NSN, otherwise clear all
            if (message.website_config?.name === 'NSN' || message.website_config?.root_path?.includes('localhost:5000')) {
                console.log('🔓 [WebSocket Client] Clearing NSN-specific sessions');
                try {
                    await tabManager.clearNSNSessions();
                    console.log('✅ [WebSocket Client] NSN sessions cleared successfully');
                } catch (error) {
                    console.error('❌ [WebSocket Client] Error clearing NSN sessions:', error);
                }
            } else {
                console.log('🔓 [WebSocket Client] Website-specific logout not implemented, clearing all sessions');
                try {
                    await tabManager.clearAllSessions();
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

            // Add a small delay before sending feedback to ensure all cleanup is complete
            console.log('⏳ [WebSocket Client] Waiting for cleanup to complete...');
            await new Promise(resolve => setTimeout(resolve, 1000)); // 1 second delay

            // Send feedback to B-Client that logout is completed BEFORE disconnecting
            console.log('📤 [WebSocket Client] Sending logout feedback BEFORE disconnecting...');
            this.sendLogoutFeedback(message, true, 'Logout completed successfully');

            // CRITICAL FIX: Reset WebSocket connection state AFTER sending feedback
            console.log('🔄 [WebSocket Client] Resetting WebSocket connection state after sending feedback...');

            // Check if connection is still valid before disconnecting
            if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
                console.log('🔌 [WebSocket Client] Connection is still open, proceeding with clean disconnect...');
                this.disconnect(); // This will close the connection but keep isRegistered=true
            } else {
                console.log('⚠️ [WebSocket Client] Connection already closed or invalid, skipping disconnect...');
                // Just reset the state without calling disconnect
                this.isConnected = false;
                this.websocket = null;
            }

            this.resetRegistrationStatus(); // This will reset isRegistered=false
            console.log('✅ [WebSocket Client] WebSocket connection state reset - ready for reconnection');

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
            console.log(`   User ID: ${originalMessage.user_id}`);

            const feedbackMessage = {
                type: 'logout_feedback',
                user_id: originalMessage.user_id,
                username: originalMessage.username,
                success: success,
                message: message,
                timestamp: new Date().toISOString(),
                immediate: true,  // Flag for immediate processing
                client_id: this.clientId || 'unknown'  // Add client ID for tracking
            };

            // Send immediately without any delays
            this.sendMessage(feedbackMessage);
            console.log('✅ [WebSocket Client] IMMEDIATE logout feedback sent successfully');
            console.log(`   Client ID: ${this.clientId || 'unknown'}`);
            console.log(`   User ID: ${originalMessage.user_id}`);

        } catch (error) {
            console.error('❌ [WebSocket Client] Error sending immediate logout feedback:', error);
            console.error('❌ [WebSocket Client] Error details:', error.stack);
        }
    }

    /**
     * Check if C-Client is already logged in to NSN
     * @returns {Promise<boolean>} - True if already logged in, false otherwise
     */
    async checkNSNLoginStatus() {
        try {
            console.log('🔍 [WebSocket Client] ===== CHECKING NSN LOGIN STATUS =====');

            if (!this.mainWindow || !this.mainWindow.tabManager) {
                console.log('⚠️ [WebSocket Client] No TabManager available for login status check');
                return false;
            }

            const tabManager = this.mainWindow.tabManager;
            const nsnTab = tabManager.findNSNTab();

            if (!nsnTab) {
                console.log('ℹ️ [WebSocket Client] No NSN tab found, not logged in');
                return false;
            }

            console.log('🔍 [WebSocket Client] Found NSN tab, checking login status...');

            // Check if nsnTab has the correct structure
            if (!nsnTab || !nsnTab.browserView.webContents) {
                console.log('⚠️ [WebSocket Client] NSN tab structure invalid, not logged in');
                return false;
            }

            console.log('🔍 [WebSocket Client] NSN tab URL:', nsnTab.browserView.webContents.getURL());

            // Check if NSN tab shows logged-in state by examining the URL
            const currentURL = nsnTab.browserView.webContents.getURL();
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

            // Use axios instead of node-fetch for better compatibility
            const axios = require('axios');

            try {
                console.log('🔓 [WebSocket Client] Making direct HTTP request to NSN logout endpoint...');
                const response = await axios.get(logoutUrl, {
                    headers: {
                        'Content-Type': 'application/json',
                        'User-Agent': 'C-Client/1.0'
                    },
                    timeout: 5000 // 5 second timeout
                });

                console.log('🔓 [WebSocket Client] NSN logout response status:', response.status);

                if (response.status >= 200 && response.status < 300) {
                    console.log('✅ [WebSocket Client] NSN server-side logout successful');
                    console.log('✅ [WebSocket Client] Response status:', response.status);
                    console.log('✅ [WebSocket Client] Response data:', response.data);
                } else {
                    console.log('⚠️ [WebSocket Client] NSN server-side logout failed:', response.status);
                    console.log('⚠️ [WebSocket Client] Response data:', response.data);
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

    /**
     * Handle incoming user activities batch from B-client
     * @param {Object} message - Message containing batch data
     */
    handleUserActivitiesBatchForward(message) {
        try {
            this.syncLogger.info('📦 [WebSocket Client] ===== RECEIVED USER ACTIVITIES BATCH FORWARD =====');
            this.syncLogger.info('📦 [WebSocket Client] Raw message:', JSON.stringify(message, null, 2));

            // Step 1: Check message structure
            this.syncLogger.info('📦 [WebSocket Client] ===== STEP 1: MESSAGE STRUCTURE CHECK =====');
            this.syncLogger.info(`📦 [WebSocket Client] Message type: ${message.type}`);
            this.syncLogger.info(`📦 [WebSocket Client] Message has data: ${!!message.data}`);

            const batchData = message.data;
            if (!batchData) {
                this.syncLogger.error('❌ [WebSocket Client] No batch data in message');
                return;
            }

            // Step 2: Check batchData structure
            this.syncLogger.info('📦 [WebSocket Client] ===== STEP 2: BATCH DATA STRUCTURE CHECK =====');
            this.syncLogger.info(`📦 [WebSocket Client] Batch data keys: ${Object.keys(batchData)}`);
            this.syncLogger.info(`📦 [WebSocket Client] user_id: ${batchData.user_id}`);
            this.syncLogger.info(`📦 [WebSocket Client] batch_id: ${batchData.batch_id}`);
            this.syncLogger.info(`📦 [WebSocket Client] sync_data type: ${Array.isArray(batchData.sync_data) ? 'Array' : typeof batchData.sync_data}`);
            this.syncLogger.info(`📦 [WebSocket Client] sync_data length: ${batchData.sync_data ? batchData.sync_data.length : 'undefined'}`);

            // Step 3: Check sync_data content
            if (batchData.sync_data && Array.isArray(batchData.sync_data)) {
                this.syncLogger.info('📦 [WebSocket Client] ===== STEP 3: SYNC_DATA CONTENT CHECK =====');
                this.syncLogger.info(`📦 [WebSocket Client] First activity keys: ${batchData.sync_data[0] ? Object.keys(batchData.sync_data[0]) : 'N/A'}`);
                if (batchData.sync_data[0]) {
                    this.syncLogger.info(`📦 [WebSocket Client] First activity sample:`, JSON.stringify(batchData.sync_data[0], null, 2));
                }

                // Log each received activity in detail
                this.syncLogger.info('📋 [WebSocket Client] ===== RECEIVED ACTIVITIES FROM B-CLIENT =====');
                batchData.sync_data.forEach((activity, index) => {
                    this.syncLogger.info(`📋 [WebSocket Client] Activity ${index + 1}:`);
                    this.syncLogger.info(`   ID: ${activity.id}`);
                    this.syncLogger.info(`   User ID: ${activity.user_id}`);
                    this.syncLogger.info(`   Username: ${activity.username}`);
                    this.syncLogger.info(`   URL: ${activity.url}`);
                    this.syncLogger.info(`   Title: ${activity.title}`);
                    this.syncLogger.info(`   Activity Type: ${activity.activity_type}`);
                    this.syncLogger.info(`   Description: ${activity.description ? activity.description.substring(0, 50) + '...' : 'N/A'}`);
                    this.syncLogger.info(`   Duration: ${activity.duration}ms`);
                    this.syncLogger.info(`   Created At: ${activity.created_at}`);
                });
                this.syncLogger.info('📋 [WebSocket Client] ===== END RECEIVED ACTIVITIES FROM B-CLIENT =====');
            } else {
                this.syncLogger.error('❌ [WebSocket Client] sync_data is not an array or is missing');
                return;
            }

            // Step 4: Check SyncManager availability
            this.syncLogger.info('📦 [WebSocket Client] ===== STEP 4: SYNC MANAGER AVAILABILITY CHECK =====');
            this.syncLogger.info(`📦 [WebSocket Client] mainWindow exists: ${!!this.mainWindow}`);

            try {
                if (this.mainWindow) {
                    try {
                        this.syncLogger.info(`📦 [WebSocket Client] mainWindow destroyed: ${this.mainWindow.isDestroyed()}`);
                    } catch (destroyedError) {
                        this.syncLogger.warn('⚠️ [WebSocket Client] Error checking mainWindow.isDestroyed():', destroyedError.message);
                    }

                    try {
                        this.syncLogger.info(`📦 [WebSocket Client] syncManager exists: ${!!this.mainWindow.syncManager}`);
                    } catch (syncManagerError) {
                        this.syncLogger.warn('⚠️ [WebSocket Client] Error checking syncManager exists:', syncManagerError.message);
                    }

                    // More detailed SyncManager check
                    try {
                        this.syncLogger.info(`📦 [WebSocket Client] mainWindow keys: ${Object.keys(this.mainWindow)}`);
                    } catch (keysError) {
                        this.syncLogger.warn('⚠️ [WebSocket Client] Error getting mainWindow keys:', keysError.message);
                    }

                    try {
                        this.syncLogger.info(`📦 [WebSocket Client] syncManager type: ${typeof this.mainWindow.syncManager}`);
                    } catch (typeError) {
                        this.syncLogger.warn('⚠️ [WebSocket Client] Error getting syncManager type:', typeError.message);
                    }

                    if (this.mainWindow.syncManager) {
                        try {
                            this.syncLogger.info(`📦 [WebSocket Client] syncManager methods: ${Object.getOwnPropertyNames(Object.getPrototypeOf(this.mainWindow.syncManager))}`);
                        } catch (methodsError) {
                            this.syncLogger.warn('⚠️ [WebSocket Client] Error getting syncManager methods:', methodsError.message);
                        }
                    } else {
                        this.syncLogger.warn('⚠️ [WebSocket Client] SyncManager is null or undefined');
                    }
                } else {
                    this.syncLogger.warn('⚠️ [WebSocket Client] mainWindow is null or undefined');
                }
            } catch (checkError) {
                this.syncLogger.error('❌ [WebSocket Client] Error during SyncManager availability check:', checkError);
                this.syncLogger.error('❌ [WebSocket Client] Check error message:', checkError.message);
                this.syncLogger.error('❌ [WebSocket Client] Check error stack:', checkError.stack);
            }

            // Additional SyncManager check
            this.syncLogger.info('📦 [WebSocket Client] ===== ADDITIONAL SYNC MANAGER CHECK =====');
            let syncManagerAvailable = false;
            try {
                if (this.mainWindow && this.mainWindow.syncManager) {
                    this.syncLogger.info('✅ [WebSocket Client] SyncManager is available and ready');
                    syncManagerAvailable = true;
                } else {
                    this.syncLogger.warn('⚠️ [WebSocket Client] SyncManager is not available');
                    this.syncLogger.warn(`⚠️ [WebSocket Client] mainWindow: ${!!this.mainWindow}`);
                    try {
                        this.syncLogger.warn(`⚠️ [WebSocket Client] syncManager: ${this.mainWindow ? !!this.mainWindow.syncManager : 'N/A'}`);
                    } catch (warnError) {
                        this.syncLogger.warn('⚠️ [WebSocket Client] Error checking syncManager in warning:', warnError.message);
                    }
                }
            } catch (additionalError) {
                this.syncLogger.error('❌ [WebSocket Client] Error in additional SyncManager check:', additionalError);
            }

            this.syncLogger.info(`📦 [WebSocket Client] Final SyncManager availability: ${syncManagerAvailable}`);

            // Forward to SyncManager if available
            if (this.mainWindow && this.mainWindow.syncManager) {
                this.syncLogger.info('📦 [WebSocket Client] ===== STEP 5: FORWARDING TO SYNC MANAGER =====');
                this.syncLogger.info('📦 [WebSocket Client] Forwarding to SyncManager...');
                this.syncLogger.info(`📦 [WebSocket Client] Batch data type: ${typeof batchData}`);
                this.syncLogger.info(`📦 [WebSocket Client] Batch data keys: ${Object.keys(batchData)}`);

                try {
                    const result = this.mainWindow.syncManager.handleIncomingActivities(batchData);
                    this.syncLogger.info(`📦 [WebSocket Client] handleIncomingActivities returned: ${typeof result}`);

                    if (result && typeof result.then === 'function') {
                        result.then(() => {
                            this.syncLogger.info('✅ [WebSocket Client] Successfully processed incoming activities batch');
                            this.syncLogger.info('📦 [WebSocket Client] ===== END SYNC MANAGER PROCESSING =====');
                        }).catch((error) => {
                            this.syncLogger.error('❌ [WebSocket Client] Error processing incoming activities batch:', error);
                            this.syncLogger.error('❌ [WebSocket Client] Error message:', error.message);
                            this.syncLogger.error('❌ [WebSocket Client] Error stack:', error.stack);
                            this.syncLogger.error('📦 [WebSocket Client] ===== SYNC MANAGER ERROR =====');
                        });
                    } else {
                        this.syncLogger.info('✅ [WebSocket Client] SyncManager processing completed synchronously');
                    }
                } catch (syncError) {
                    this.syncLogger.error('❌ [WebSocket Client] Error calling handleIncomingActivities:', syncError);
                    this.syncLogger.error('❌ [WebSocket Client] Error message:', syncError.message);
                    this.syncLogger.error('❌ [WebSocket Client] Error stack:', syncError.stack);
                }
            } else {
                this.syncLogger.warn('⚠️ [WebSocket Client] SyncManager not available, cannot process incoming activities batch');
                this.syncLogger.warn('⚠️ [WebSocket Client] mainWindow:', !!this.mainWindow);
                this.syncLogger.warn('⚠️ [WebSocket Client] syncManager:', this.mainWindow ? !!this.mainWindow.syncManager : 'N/A');
            }

            this.syncLogger.info('📦 [WebSocket Client] ===== END USER ACTIVITIES BATCH FORWARD =====');
        } catch (error) {
            this.syncLogger.error('❌ [WebSocket Client] Error handling user activities batch forward:', error);
            this.syncLogger.error('📦 [WebSocket Client] Error stack:', error.stack);
        }
    }

    /**
     * Handle feedback from B-client about batch processing
     * @param {Object} message - Message containing feedback data
     */
    handleUserActivitiesBatchFeedback(message) {
        try {
            console.log('📨 [WebSocket Client] ===== RECEIVED BATCH FEEDBACK =====');
            console.log('📨 [WebSocket Client] Message:', JSON.stringify(message, null, 2));

            const feedbackData = message.data;
            if (!feedbackData) {
                console.error('❌ [WebSocket Client] No feedback data in message');
                return;
            }

            const batchId = feedbackData.batch_id;
            const success = feedbackData.success;
            const feedbackMessage = feedbackData.message;

            console.log(`📨 [WebSocket Client] Batch ${batchId}: ${success ? 'success' : 'failed'} - ${feedbackMessage}`);

            // Forward to SyncManager if available
            if (this.mainWindow && this.mainWindow.syncManager) {
                console.log('📨 [WebSocket Client] Forwarding feedback to SyncManager...');
                this.mainWindow.syncManager.handleBatchFeedback(batchId, success, feedbackMessage);
            } else {
                console.warn('⚠️ [WebSocket Client] SyncManager not available, cannot process batch feedback');
            }

            console.log('📨 [WebSocket Client] ===== END BATCH FEEDBACK =====');
        } catch (error) {
            console.error('❌ [WebSocket Client] Error handling batch feedback:', error);
        }
    }

    /**
     * Handle cluster verification query from B-Client
     * @param {Object} message - Cluster verification query message
     */
    async handleClusterVerificationQuery(message) {
        try {
            this.logger.info('🔍 [WebSocket Client] ===== CLUSTER VERIFICATION QUERY RECEIVED =====');
            this.logger.info('🔍 [WebSocket Client] Full message: ' + JSON.stringify(message, null, 2));
            this.logger.info('🔍 [WebSocket Client] Query action: ' + (message.data ? message.data.action : 'undefined'));
            this.logger.info('🔍 [WebSocket Client] Channel ID: ' + (message.data ? message.data.channel_id : 'undefined'));
            this.logger.info('🔍 [WebSocket Client] User ID: ' + (message.data ? message.data.user_id : 'undefined'));
            this.logger.info('🔍 [WebSocket Client] Min batch size: ' + (message.data ? message.data.min_batch_size : 'undefined'));
            this.logger.info('🔍 [WebSocket Client] Timestamp: ' + (message.data ? message.data.timestamp : 'undefined'));

            if (message.data && message.data.action === 'get_valid_batch') {
                const channelId = message.data.channel_id;
                const targetUserId = message.data.user_id; // C1's user_id
                const minBatchSize = message.data.min_batch_size || 5;

                this.logger.info('🔍 [WebSocket Client] ===== QUERYING DATABASE FOR VALID BATCHES =====');
                this.logger.info('🔍 [WebSocket Client] Channel ID: ' + channelId);
                this.logger.info('🔍 [WebSocket Client] Target User ID (C1): ' + targetUserId);
                this.logger.info('🔍 [WebSocket Client] Min batch size: ' + minBatchSize);

                // Query database for valid batches of the target user (C1)
                const validBatches = await this.queryValidBatchesForUser(targetUserId, minBatchSize);

                if (validBatches && validBatches.length > 0) {
                    this.logger.info('🔍 [WebSocket Client] ===== FOUND VALID BATCHES =====');
                    this.logger.info('🔍 [WebSocket Client] Found ' + validBatches.length + ' valid batches');

                    // Get the first valid batch
                    const firstBatch = validBatches[0];
                    this.logger.info('🔍 [WebSocket Client] First batch ID: ' + firstBatch.batch_id);
                    this.logger.info('🔍 [WebSocket Client] Record count: ' + firstBatch.record_count);

                    // Get the first record of the batch
                    const firstRecord = await this.getBatchFirstRecord(firstBatch.batch_id);

                    if (firstRecord) {
                        this.logger.info('🔍 [WebSocket Client] ===== PREPARING RESPONSE =====');
                        this.logger.info('🔍 [WebSocket Client] First record URL: ' + firstRecord.url);
                        this.logger.info('🔍 [WebSocket Client] First record title: ' + firstRecord.title);

                        // Send response to B-Client
                        const response = {
                            type: 'cluster_verification_response',
                            success: true,
                            batch_id: firstBatch.batch_id,
                            record_count: firstBatch.record_count,
                            first_record: firstRecord,
                            channel_id: channelId
                        };

                        this.logger.info('🔍 [WebSocket Client] ===== SENDING RESPONSE TO B-CLIENT =====');
                        this.logger.info('🔍 [WebSocket Client] Response: ' + JSON.stringify(response, null, 2));

                        await this.sendMessage(response);
                        this.logger.info('✅ [WebSocket Client] Cluster verification response sent successfully');
                    } else {
                        this.logger.info('⚠️ [WebSocket Client] No first record found for batch');
                        await this.sendNoValidBatchesResponse(channelId);
                    }
                } else {
                    this.logger.info('⚠️ [WebSocket Client] No valid batches found');
                    await this.sendNoValidBatchesResponse(channelId);
                }
            } else {
                this.logger.info('⚠️ [WebSocket Client] Unknown cluster verification action: ' + (message.action || 'undefined'));
                await this.sendErrorResponse('Unknown action');
            }

            this.logger.info('🔍 [WebSocket Client] ===== END CLUSTER VERIFICATION QUERY =====');
        } catch (error) {
            this.logger.error('❌ [WebSocket Client] Error handling cluster verification query: ' + error.message);
            await this.sendErrorResponse(error.message);
        }
    }

    /**
     * Query database for valid batches for target user (C1)
     * @param {string} targetUserId - Target user ID (C1's user_id)
     * @param {number} minBatchSize - Minimum batch size
     * @returns {Array} Array of valid batches
     */
    async queryValidBatchesForUser(targetUserId, minBatchSize) {
        try {
            this.logger.info('🔍 [WebSocket Client] ===== QUERYING DATABASE FOR TARGET USER =====');
            this.logger.info('🔍 [WebSocket Client] Target User ID (C1): ' + targetUserId);
            this.logger.info('🔍 [WebSocket Client] Min batch size: ' + minBatchSize);

            const database = require('../sqlite/database');

            // Query for batches with record count >= minBatchSize for target user (C1)
            const query = `
                SELECT 
                    batch_id,
                    COUNT(*) as record_count,
                    MIN(created_at) as first_created_at
                FROM sync_data 
                WHERE user_id = ?
                GROUP BY batch_id
                HAVING COUNT(*) >= ?
                ORDER BY first_created_at DESC
                LIMIT 10
            `;

            const rows = database.prepare(query).all(targetUserId, minBatchSize);
            this.logger.info('🔍 [WebSocket Client] Query result: ' + rows.length + ' batches found for target user: ' + targetUserId);

            return rows;
        } catch (error) {
            this.logger.error('❌ [WebSocket Client] Error querying valid batches for target user: ' + error.message);
            return [];
        }
    }

    /**
     * Get the first record of a batch
     * @param {string} batchId - Batch ID
     * @returns {Object|null} First record or null
     */
    async getBatchFirstRecord(batchId) {
        try {
            this.logger.info('🔍 [WebSocket Client] ===== GETTING FIRST RECORD =====');
            this.logger.info('🔍 [WebSocket Client] Batch ID: ' + batchId);
            this.logger.info('🔍 [WebSocket Client] ===== QUERYING DATABASE =====');

            const database = require('../sqlite/database');

            // Get the first record of the batch
            const query = `
                SELECT 
                    url,
                    title,
                    created_at,
                    user_id
                FROM sync_data 
                WHERE batch_id = ?
                ORDER BY created_at ASC
                LIMIT 1
            `;

            this.logger.info('🔍 [WebSocket Client] SQL Query: ' + query);
            this.logger.info('🔍 [WebSocket Client] Query parameter: ' + batchId);

            const row = database.prepare(query).get(batchId);

            this.logger.info('🔍 [WebSocket Client] ===== QUERY RESULT =====');
            this.logger.info('🔍 [WebSocket Client] Query executed successfully');
            this.logger.info('🔍 [WebSocket Client] Result: ' + (row ? 'Found' : 'Not found'));

            if (row) {
                this.logger.info('🔍 [WebSocket Client] Record details:');
                this.logger.info('🔍 [WebSocket Client]   URL: ' + row.url);
                this.logger.info('🔍 [WebSocket Client]   Title: ' + row.title);
                this.logger.info('🔍 [WebSocket Client]   Created At: ' + row.created_at);
                this.logger.info('🔍 [WebSocket Client]   User ID: ' + row.user_id);
                this.logger.info('🔍 [WebSocket Client] Full record: ' + JSON.stringify(row, null, 2));
            } else {
                this.logger.warning('🔍 [WebSocket Client] No record found for batch_id: ' + batchId);
                this.logger.warning('🔍 [WebSocket Client] This batch may not exist or may be empty');
            }

            this.logger.info('🔍 [WebSocket Client] ===== END QUERY RESULT =====');
            return row;
        } catch (error) {
            this.logger.error('❌ [WebSocket Client] Error getting first record: ' + error.message);
            this.logger.error('❌ [WebSocket Client] Error stack: ' + error.stack);
            this.logger.error('❌ [WebSocket Client] Batch ID: ' + batchId);
            this.logger.error('❌ [WebSocket Client] Database query failed');
            return null;
        }
    }

    /**
     * Send no valid batches response
     * @param {string} channelId - Channel ID
     */
    async sendNoValidBatchesResponse(channelId) {
        const response = {
            type: 'cluster_verification_response',
            success: false,
            message: 'No valid batches found',
            channel_id: channelId
        };

        this.logger.info('🔍 [WebSocket Client] ===== SENDING NO VALID BATCHES RESPONSE =====');
        this.logger.info('🔍 [WebSocket Client] Response: ' + JSON.stringify(response, null, 2));

        await this.sendMessage(response);
    }

    /**
     * Send error response
     * @param {string} errorMessage - Error message
     */
    async sendErrorResponse(errorMessage) {
        const response = {
            type: 'cluster_verification_response',
            success: false,
            error: errorMessage
        };

        this.logger.info('🔍 [WebSocket Client] ===== SENDING ERROR RESPONSE =====');
        this.logger.info('🔍 [WebSocket Client] Response: ' + JSON.stringify(response, null, 2));

        await this.sendMessage(response);
    }

    /**
     * Handle cluster verification request from B-Client
     * This is called when B-Client requests C1 to verify a specific batch
     * @param {Object} message - Message from B-Client
     */
    async handleClusterVerificationRequest(message) {
        try {
            this.logger.info('🔍 [WebSocket Client] ===== HANDLING CLUSTER VERIFICATION REQUEST =====');
            this.logger.info('🔍 [WebSocket Client] Message: ' + JSON.stringify(message, null, 2));

            const { action, batch_id, user_id, timestamp } = message;

            this.logger.info('🔍 [WebSocket Client] Request details:');
            this.logger.info('🔍 [WebSocket Client]   Action: ' + action);
            this.logger.info('🔍 [WebSocket Client]   Batch ID: ' + batch_id);
            this.logger.info('🔍 [WebSocket Client]   User ID: ' + user_id);
            this.logger.info('🔍 [WebSocket Client]   Timestamp: ' + timestamp);

            if (action === 'verify_batch' && batch_id) {
                this.logger.info('🔍 [WebSocket Client] ===== VERIFYING BATCH =====');
                this.logger.info('🔍 [WebSocket Client] Action: verify_batch');
                this.logger.info('🔍 [WebSocket Client] Batch ID: ' + batch_id);
                this.logger.info('🔍 [WebSocket Client] User ID: ' + user_id);
                this.logger.info('🔍 [WebSocket Client] Timestamp: ' + timestamp);

                // Get the first record of the specified batch
                this.logger.info('🔍 [WebSocket Client] ===== QUERYING DATABASE FOR BATCH =====');
                this.logger.info('🔍 [WebSocket Client] Querying batch_id: ' + batch_id);
                const firstRecord = await this.getBatchFirstRecord(batch_id);

                if (firstRecord) {
                    this.logger.info('🔍 [WebSocket Client] ✅ Found first record for batch: ' + batch_id);
                    this.logger.info('🔍 [WebSocket Client] First record details:');
                    this.logger.info('🔍 [WebSocket Client]   URL: ' + firstRecord.url);
                    this.logger.info('🔍 [WebSocket Client]   Title: ' + firstRecord.title);
                    this.logger.info('🔍 [WebSocket Client]   Created At: ' + firstRecord.created_at);
                    this.logger.info('🔍 [WebSocket Client]   User ID: ' + firstRecord.user_id);
                    this.logger.info('🔍 [WebSocket Client] Full record: ' + JSON.stringify(firstRecord, null, 2));

                    // Send success response
                    this.logger.info('🔍 [WebSocket Client] ===== PREPARING SUCCESS RESPONSE =====');
                    const response = {
                        type: 'cluster_verification_response',
                        success: true,
                        batch_id: batch_id,
                        record: firstRecord,
                        timestamp: Date.now()
                    };

                    this.logger.info('🔍 [WebSocket Client] ===== SENDING VERIFICATION RESPONSE =====');
                    this.logger.info('🔍 [WebSocket Client] Response type: cluster_verification_response');
                    this.logger.info('🔍 [WebSocket Client] Response success: true');
                    this.logger.info('🔍 [WebSocket Client] Response batch_id: ' + batch_id);
                    this.logger.info('🔍 [WebSocket Client] Response timestamp: ' + response.timestamp);
                    this.logger.info('🔍 [WebSocket Client] Full response: ' + JSON.stringify(response, null, 2));

                    await this.sendMessage(response);
                    this.logger.info('🔍 [WebSocket Client] ✅ Verification response sent successfully');
                } else {
                    this.logger.warning('🔍 [WebSocket Client] ❌ No first record found for batch: ' + batch_id);
                    this.logger.warning('🔍 [WebSocket Client] Database query returned null/undefined');
                    this.logger.warning('🔍 [WebSocket Client] This batch may not exist or may be empty');

                    // Send failure response
                    this.logger.info('🔍 [WebSocket Client] ===== PREPARING FAILURE RESPONSE =====');
                    const response = {
                        type: 'cluster_verification_response',
                        success: false,
                        batch_id: batch_id,
                        message: 'No record found for batch',
                        timestamp: Date.now()
                    };

                    this.logger.info('🔍 [WebSocket Client] ===== SENDING FAILURE RESPONSE =====');
                    this.logger.info('🔍 [WebSocket Client] Response type: cluster_verification_response');
                    this.logger.info('🔍 [WebSocket Client] Response success: false');
                    this.logger.info('🔍 [WebSocket Client] Response batch_id: ' + batch_id);
                    this.logger.info('🔍 [WebSocket Client] Response message: No record found for batch');
                    this.logger.info('🔍 [WebSocket Client] Response timestamp: ' + response.timestamp);
                    this.logger.info('🔍 [WebSocket Client] Full response: ' + JSON.stringify(response, null, 2));

                    await this.sendMessage(response);
                    this.logger.info('🔍 [WebSocket Client] ✅ Failure response sent successfully');
                }
            } else {
                this.logger.warning('🔍 [WebSocket Client] ❌ Invalid verification request');
                this.logger.warning('🔍 [WebSocket Client] Action: ' + action);
                this.logger.warning('🔍 [WebSocket Client] Batch ID: ' + batch_id);
                this.logger.warning('🔍 [WebSocket Client] Expected: action=verify_batch AND batch_id present');
                this.logger.warning('🔍 [WebSocket Client] Actual: action=' + action + ', batch_id=' + batch_id);

                // Send error response
                this.logger.info('🔍 [WebSocket Client] ===== PREPARING ERROR RESPONSE =====');
                const response = {
                    type: 'cluster_verification_response',
                    success: false,
                    message: 'Invalid verification request',
                    timestamp: Date.now()
                };

                this.logger.info('🔍 [WebSocket Client] ===== SENDING ERROR RESPONSE =====');
                this.logger.info('🔍 [WebSocket Client] Response type: cluster_verification_response');
                this.logger.info('🔍 [WebSocket Client] Response success: false');
                this.logger.info('🔍 [WebSocket Client] Response message: Invalid verification request');
                this.logger.info('🔍 [WebSocket Client] Response timestamp: ' + response.timestamp);
                this.logger.info('🔍 [WebSocket Client] Full response: ' + JSON.stringify(response, null, 2));

                await this.sendMessage(response);
                this.logger.info('🔍 [WebSocket Client] ✅ Error response sent successfully');
            }
        } catch (error) {
            this.logger.error('❌ [WebSocket Client] Error handling cluster verification request: ' + error.message);
            this.logger.error('❌ [WebSocket Client] Error stack: ' + error.stack);
            this.logger.error('❌ [WebSocket Client] This is a critical error in cluster verification');

            // Send error response
            this.logger.info('🔍 [WebSocket Client] ===== PREPARING EXCEPTION ERROR RESPONSE =====');
            const response = {
                type: 'cluster_verification_response',
                success: false,
                message: 'Error processing verification request: ' + error.message,
                timestamp: Date.now()
            };

            this.logger.info('🔍 [WebSocket Client] ===== SENDING EXCEPTION ERROR RESPONSE =====');
            this.logger.info('🔍 [WebSocket Client] Response type: cluster_verification_response');
            this.logger.info('🔍 [WebSocket Client] Response success: false');
            this.logger.info('🔍 [WebSocket Client] Response message: Error processing verification request: ' + error.message);
            this.logger.info('🔍 [WebSocket Client] Response timestamp: ' + response.timestamp);
            this.logger.info('🔍 [WebSocket Client] Full response: ' + JSON.stringify(response, null, 2));

            await this.sendMessage(response);
            this.logger.info('🔍 [WebSocket Client] ✅ Exception error response sent successfully');
        }
    }

    /**
     * Handle security code response from B-Client
     * @param {Object} message - Security code response message
     */
    handleSecurityCodeResponse(message) {
        try {
            // Use dedicated security code logger
            const { getCClientLogger } = require('../utils/logger');
            const securityLogger = getCClientLogger('security_code');

            securityLogger.info('📱 [WebSocket Client] ===== HANDLING SECURITY CODE RESPONSE =====');
            securityLogger.info('📱 [WebSocket Client] Message:', JSON.stringify(message, null, 2));

            // Emit event for IPC handler to catch
            if (this.securityCodeCallback) {
                securityLogger.info('📱 [WebSocket Client] Calling security code callback');
                this.securityCodeCallback(message);
                this.securityCodeCallback = null; // Clear callback after use
            } else {
                securityLogger.warn('📱 [WebSocket Client] No security code callback registered');
            }

            securityLogger.info('📱 [WebSocket Client] ===== SECURITY CODE RESPONSE HANDLED =====');
        } catch (error) {
            const { getCClientLogger } = require('../utils/logger');
            const securityLogger = getCClientLogger('security_code');
            securityLogger.error('❌ [WebSocket Client] Error handling security code response:', error);
        }
    }

    /**
     * Request security code from B-Client
     * @param {Object} data - Request data
     * @returns {Promise} Promise that resolves with security code response
     */
    requestSecurityCode(data) {
        // Use dedicated security code logger
        const { getCClientLogger } = require('../utils/logger');
        const securityLogger = getCClientLogger('security_code');

        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                securityLogger.error('📱 [WebSocket Client] Security code request timeout');
                this.securityCodeCallback = null;
                resolve({
                    success: false,
                    error: 'Request timeout - please try again'
                });
            }, 10000); // 10 second timeout

            // Set up callback for response
            this.securityCodeCallback = (message) => {
                clearTimeout(timeout);
                securityLogger.info('📱 [WebSocket Client] Security code response received');

                if (message.data && message.data.success) {
                    resolve({
                        success: true,
                        security_code: message.data.security_code,
                        username: message.data.nmp_username,
                        domain_id: message.data.domain_id,
                        cluster_id: message.data.cluster_id,
                        channel_id: message.data.channel_id
                    });
                } else {
                    resolve({
                        success: false,
                        error: message.data?.error || 'Failed to get security code'
                    });
                }
            };

            // Send request
            const requestMessage = {
                type: 'request_security_code',
                data: data
            };

            this.sendMessage(requestMessage);  // sendMessage will handle JSON.stringify
            securityLogger.info('📱 [WebSocket Client] Security code request sent');
        });
    }

    /**
     * Handle new device login
     * @param {Object} message - Registration success message with new device login flag
     */
    async handleNewDeviceLogin(message) {
        try {
            // Use dedicated security code logger
            const { getCClientLogger } = require('../utils/logger');
            const securityLogger = getCClientLogger('security_code');

            securityLogger.info('🔐 [WebSocket Client] ===== HANDLING NEW DEVICE LOGIN =====');
            securityLogger.info('🔐 [WebSocket Client] Starting new device login process');
            securityLogger.info('🔐 [WebSocket Client] Current client_id:', this.clientId);

            // Extract user information from message
            securityLogger.info('🔐 [WebSocket Client] ===== STEP 1: EXTRACTING USER INFORMATION =====');
            const userInfo = {
                user_id: message.user_id,
                username: message.username,
                node_id: message.node_id,
                domain_id: message.domain_id,
                cluster_id: message.cluster_id,
                channel_id: message.channel_id,
                domain_main_node_id: message.domain_main_node_id,
                cluster_main_node_id: message.cluster_main_node_id,
                channel_main_node_id: message.channel_main_node_id,
                client_ids: JSON.stringify([this.clientId]) // Add current client ID
            };

            securityLogger.info('🔐 [WebSocket Client] Main node IDs from B-Client:');
            securityLogger.info(`🔐 [WebSocket Client]   - domain_main_node_id: ${userInfo.domain_main_node_id}`);
            securityLogger.info(`🔐 [WebSocket Client]   - cluster_main_node_id: ${userInfo.cluster_main_node_id}`);
            securityLogger.info(`🔐 [WebSocket Client]   - channel_main_node_id: ${userInfo.channel_main_node_id}`);

            securityLogger.info('🔐 [WebSocket Client] Extracted user info:');
            securityLogger.info(`🔐 [WebSocket Client]   - user_id: ${userInfo.user_id}`);
            securityLogger.info(`🔐 [WebSocket Client]   - username: ${userInfo.username}`);
            securityLogger.info(`🔐 [WebSocket Client]   - node_id: ${userInfo.node_id}`);
            securityLogger.info(`🔐 [WebSocket Client]   - domain_id: ${userInfo.domain_id}`);
            securityLogger.info(`🔐 [WebSocket Client]   - cluster_id: ${userInfo.cluster_id}`);
            securityLogger.info(`🔐 [WebSocket Client]   - channel_id: ${userInfo.channel_id}`);
            securityLogger.info(`🔐 [WebSocket Client]   - client_ids: ${userInfo.client_ids}`);

            // Get database
            securityLogger.info('🔐 [WebSocket Client] ===== STEP 2: SAVING TO LOCAL_USERS TABLE =====');
            const db = require('../sqlite/database');

            securityLogger.info('🔐 [WebSocket Client] Database obtained');
            securityLogger.info('🔐 [WebSocket Client] Preparing INSERT OR REPLACE statement...');

            const now = Math.floor(Date.now() / 1000);

            try {
                securityLogger.info('🔐 [WebSocket Client] Executing database INSERT...');
                securityLogger.info('🔐 [WebSocket Client] Values:');
                securityLogger.info(`🔐 [WebSocket Client]   user_id: ${userInfo.user_id}`);
                securityLogger.info(`🔐 [WebSocket Client]   username: ${userInfo.username}`);
                securityLogger.info(`🔐 [WebSocket Client]   node_id: ${userInfo.node_id}`);
                securityLogger.info(`🔐 [WebSocket Client]   domain_id: ${userInfo.domain_id}`);
                securityLogger.info(`🔐 [WebSocket Client]   cluster_id: ${userInfo.cluster_id}`);
                securityLogger.info(`🔐 [WebSocket Client]   channel_id: ${userInfo.channel_id}`);
                securityLogger.info(`🔐 [WebSocket Client]   client_ids: ${userInfo.client_ids}`);
                securityLogger.info(`🔐 [WebSocket Client]   created_at: ${now}`);
                securityLogger.info(`🔐 [WebSocket Client]   updated_at: ${now}`);

                const result = db.prepare(`
                    INSERT OR REPLACE INTO local_users (
                        user_id, username, node_id, 
                        domain_id, cluster_id, channel_id,
                        client_ids, created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                `).run(
                    userInfo.user_id,
                    userInfo.username,
                    userInfo.node_id,
                    userInfo.domain_id,
                    userInfo.cluster_id,
                    userInfo.channel_id,
                    userInfo.client_ids,
                    now,
                    now
                );

                securityLogger.info(`🔐 [WebSocket Client] Database INSERT result: changes=${result.changes}, lastInsertRowid=${result.lastInsertRowid}`);
                securityLogger.info('✅ [WebSocket Client] User saved to local_users table successfully');
                securityLogger.info(`✅ [WebSocket Client] Record: user_id=${userInfo.user_id}, username=${userInfo.username}`);
            } catch (dbError) {
                securityLogger.error('❌ [WebSocket Client] Database INSERT error:', dbError.message);
                securityLogger.error('❌ [WebSocket Client] Error code:', dbError.code);
                securityLogger.error('❌ [WebSocket Client] Error stack:', dbError.stack);
                throw dbError; // Re-throw to be caught by outer catch
            }

            // Update main node information in respective tables
            securityLogger.info('🔐 [WebSocket Client] ===== STEP 3: UPDATING MAIN NODE TABLES =====');

            // Update domain_main_nodes
            if (userInfo.domain_id && userInfo.domain_main_node_id) {
                securityLogger.info(`🔐 [WebSocket Client] Updating domain_main_nodes...`);
                securityLogger.info(`🔐 [WebSocket Client]   node_id (PK): ${userInfo.domain_main_node_id}`);
                securityLogger.info(`🔐 [WebSocket Client]   domain_id: ${userInfo.domain_id}`);

                db.prepare(`
                    INSERT OR REPLACE INTO domain_main_nodes (
                        node_id, domain_id, updated_at
                    ) VALUES (?, ?, ?)
                `).run(userInfo.domain_main_node_id, userInfo.domain_id, now);
                securityLogger.info(`✅ [WebSocket Client] Domain main node updated successfully`);
            } else {
                securityLogger.info(`⚠️ [WebSocket Client] Skipping domain_main_nodes update (domain_id or main_node_id is null)`);
            }

            // Update cluster_main_nodes
            if (userInfo.cluster_id && userInfo.cluster_main_node_id) {
                securityLogger.info(`🔐 [WebSocket Client] Updating cluster_main_nodes...`);
                securityLogger.info(`🔐 [WebSocket Client]   node_id (PK): ${userInfo.cluster_main_node_id}`);
                securityLogger.info(`🔐 [WebSocket Client]   domain_id: ${userInfo.domain_id}`);
                securityLogger.info(`🔐 [WebSocket Client]   cluster_id: ${userInfo.cluster_id}`);

                db.prepare(`
                    INSERT OR REPLACE INTO cluster_main_nodes (
                        node_id, domain_id, cluster_id, updated_at
                    ) VALUES (?, ?, ?, ?)
                `).run(userInfo.cluster_main_node_id, userInfo.domain_id, userInfo.cluster_id, now);
                securityLogger.info(`✅ [WebSocket Client] Cluster main node updated successfully`);
            } else {
                securityLogger.info(`⚠️ [WebSocket Client] Skipping cluster_main_nodes update (cluster_id or main_node_id is null)`);
            }

            // Update channel_main_nodes
            if (userInfo.channel_id && userInfo.channel_main_node_id) {
                securityLogger.info(`🔐 [WebSocket Client] Updating channel_main_nodes...`);
                securityLogger.info(`🔐 [WebSocket Client]   node_id (PK): ${userInfo.channel_main_node_id}`);
                securityLogger.info(`🔐 [WebSocket Client]   domain_id: ${userInfo.domain_id}`);
                securityLogger.info(`🔐 [WebSocket Client]   cluster_id: ${userInfo.cluster_id}`);
                securityLogger.info(`🔐 [WebSocket Client]   channel_id: ${userInfo.channel_id}`);

                db.prepare(`
                    INSERT OR REPLACE INTO channel_main_nodes (
                        node_id, domain_id, cluster_id, channel_id, updated_at
                    ) VALUES (?, ?, ?, ?, ?)
                `).run(userInfo.channel_main_node_id, userInfo.domain_id, userInfo.cluster_id, userInfo.channel_id, now);
                securityLogger.info(`✅ [WebSocket Client] Channel main node updated successfully`);
            } else {
                securityLogger.info(`⚠️ [WebSocket Client] Skipping channel_main_nodes update (channel_id or main_node_id is null)`);
            }

            securityLogger.info('✅ [WebSocket Client] All main node tables updated');

            // Perform user switch operation
            securityLogger.info('🔐 [WebSocket Client] ===== STEP 4: TRIGGERING USER SWITCH =====');
            securityLogger.info(`🔐 [WebSocket Client] Will switch to user: ${userInfo.username} (${userInfo.user_id})`);

            // Get IPC handlers to trigger user switch
            const { ipcMain } = require('electron');

            // Emit event to trigger user switch
            // Note: ipcMain.emit requires (event, ...args) format
            // The first parameter will be received as 'event', the second as 'data'
            securityLogger.info('🔐 [WebSocket Client] Emitting new-device-login-complete event to IPC...');
            ipcMain.emit('new-device-login-complete', null, {
                user_id: userInfo.user_id,
                username: userInfo.username
            });

            securityLogger.info('✅ [WebSocket Client] Event emitted successfully');
            securityLogger.info('✅ [WebSocket Client] ===== NEW DEVICE LOGIN PROCESS COMPLETE =====');
            securityLogger.info('✅ [WebSocket Client] IPC handlers will now perform user switch (clear sessions, close tabs, create new tab)');

        } catch (error) {
            const { getCClientLogger } = require('../utils/logger');
            const securityLogger = getCClientLogger('security_code');
            securityLogger.error('❌ [WebSocket Client] Error handling new device login:');
            securityLogger.error('❌ [WebSocket Client] Error type:', typeof error);
            securityLogger.error('❌ [WebSocket Client] Error:', error);
            if (error) {
                securityLogger.error('❌ [WebSocket Client] Error message:', error.message || 'No message');
                securityLogger.error('❌ [WebSocket Client] Error name:', error.name || 'No name');
                securityLogger.error('❌ [WebSocket Client] Error code:', error.code || 'No code');
                securityLogger.error('❌ [WebSocket Client] Error stack:', error.stack || 'No stack');
            }
        }
    }

}

module.exports = CClientWebSocketClient;
