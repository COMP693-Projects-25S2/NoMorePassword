/**
 * WebSocket Connection Manager
 * Handles connection establishment, disconnection, and reconnection logic
 */

const WebSocket = require('ws');

class ConnectionManager {
    constructor(client) {
        this.client = client;
        this.logger = client.logger;
        this.connectionInProgress = false;
        this.lastConnectionConfig = null;
    }

    /**
     * Connect to WebSocket using full URL
     */
    async connectToWebSocketUrl(websocketUrl, environmentName = 'WebSocket Server') {
        this.logger.info(`[WebSocket Client] Connecting to WebSocket server: ${environmentName}`);
        this.logger.info(`   URL: ${websocketUrl}`);

        // Prevent multiple simultaneous connections
        if (this.connectionInProgress) {
            this.logger.info(`[WebSocket Client] Connection already in progress, skipping duplicate connection attempt`);
            return false;
        }

        this.connectionInProgress = true;

        try {
            // Check if we already have a valid connection
            if (this.client.websocket) {
                const currentReadyState = this.client.websocket.readyState;

                // Check if connection is valid and active
                const isConnectionValid = this.client.isConnected && currentReadyState === WebSocket.OPEN;
                const isConnectionInProgress = currentReadyState === WebSocket.CONNECTING && this.connectionInProgress;

                if (isConnectionValid) {
                    this.logger.info(`[WebSocket Client] Connection is valid and active, reusing existing connection`);
                    this.logger.info(`   Skipping reconnection to avoid disrupting active connection`);
                    return true;
                } else if (isConnectionInProgress) {
                    this.logger.info(`[WebSocket Client] Connection is in progress, waiting for it to complete`);
                    this.logger.info(`   readyState=${currentReadyState} (CONNECTING), connectionInProgress=${this.connectionInProgress}`);
                    this.logger.info(`   Skipping reconnection to avoid disrupting connection attempt`);
                    return true; // Return true to indicate connection is being handled (skip reconnection)
                } else {
                    this.logger.info(`[WebSocket Client] Connection is invalid or closed, will reconnect`);
                    this.logger.info(`   Reason: readyState=${currentReadyState} (expected 1), isConnected=${this.client.isConnected}, isRegistered=${this.client.isRegistered}`);

                    // Force disconnect invalid connection
                    this.logger.info(`[WebSocket Client] Disconnecting invalid connection...`);
                    this.disconnect();

                    // Reset connection in progress flag since we're disconnecting
                    this.connectionInProgress = false;

                    // Wait for disconnection to complete
                    this.logger.info(`[WebSocket Client] Waiting 500ms for disconnection to complete...`);
                    await new Promise(resolve => setTimeout(resolve, 500));

                    // Clear any cached connection state
                    this.client.isConnected = false;
                    this.client.websocket = null;
                    this.logger.info(`🧹 [WebSocket Client] Cleared connection state for fresh start`);
                }
            }

            this.logger.info(`[WebSocket Client] Connecting to ${environmentName} at ${websocketUrl}...`);

            this.client.websocket = new WebSocket(websocketUrl);
            this.logger.info(`[WebSocket Client] WebSocket object created, setting up event handlers...`);

            // Remove existing event listeners to prevent memory leaks
            if (this.client.websocket) {
                this.client.websocket.removeAllListeners();
            }

            // Wait for connection to be established
            return new Promise((resolve) => {
                const timeout = setTimeout(() => {
                    this.logger.error(`[WebSocket Client] Connection timeout to ${environmentName}`);
                    this.connectionInProgress = false;
                    resolve(false);
                }, 10000); // 10 second timeout

                const startTime = Date.now();

                this.client.websocket.on('open', () => {
                    clearTimeout(timeout);
                    this.logger.info(`[WebSocket Client] Connected to ${environmentName}`);
                    this.logger.info(`   Target: ${environmentName} (${websocketUrl})`);
                    this.client.isConnected = true;
                    this.connectionInProgress = false;

                    // Store connection config for reconnection
                    this.lastConnectionConfig = { websocketUrl, environmentName };

                    // Register with current user info after a short delay to ensure connection is stable
                    this.client.registrationTimeout = setTimeout(() => {
                        // Check if WebSocket still exists before accessing its properties
                        if (this.client.websocket && this.client.websocket.readyState !== undefined) {
                            this.logger.info(`[WebSocket Client] WebSocket readyState: ${this.client.websocket.readyState} (${this.getReadyStateName(this.client.websocket.readyState)})`);
                            if (this.client.websocket.readyState === WebSocket.OPEN) {
                                // Register with current user info
                                this.client.registerCurrentUser();
                            } else {
                                this.logger.warn(`[WebSocket Client] WebSocket not ready for registration, readyState: ${this.client.websocket.readyState}`);
                            }
                        } else {
                            this.logger.warn(`[WebSocket Client] WebSocket not available for registration`);
                        }
                    }, 1000); // Wait 1 second before attempting registration

                    resolve(true);
                });

                this.client.websocket.on('message', (data) => {
                    this.logger.info(`[WebSocket Client] Received message from ${environmentName}:`, data.toString());
                    this.client.handleMessage(data);
                });

                this.client.websocket.on('close', (code, reason) => {
                    this.logger.info(`[WebSocket Client] Connection to ${environmentName} closed`);
                    this.logger.info(`   Code: ${code}, Reason: ${reason}`);
                    this.client.isConnected = false;
                    this.client.isRegistered = false;
                    this.connectionInProgress = false;
                });

                this.client.websocket.on('error', (error) => {
                    clearTimeout(timeout);
                    this.logger.error(`[WebSocket Client] Error connecting to ${environmentName}:`, error);
                    this.logger.error(`[WebSocket Client] WebSocket URL: ${websocketUrl}`);
                    this.logger.error(`[WebSocket Client] Connection time: ${Date.now() - startTime}ms`);
                    this.client.isConnected = false;
                    this.client.isRegistered = false;
                    this.connectionInProgress = false;
                    resolve(false);
                });
            });

        } catch (error) {
            this.logger.error(`[WebSocket Client] Failed to connect to ${environmentName}:`, error);
            this.connectionInProgress = false;
            return false;
        }
    }

    /**
     * Connect to server
     */
    async connectToServer(host, port, environmentName = 'Custom Server', protocol = 'ws') {
        this.logger.info(`[WebSocket Client] Connecting to custom server: ${environmentName}`);
        this.logger.info(`   Host: ${host}`);
        this.logger.info(`   Port: ${port}`);

        // Prevent multiple simultaneous connections
        if (this.connectionInProgress) {
            this.logger.info(`[WebSocket Client] Connection already in progress, skipping duplicate request`);
            return false;
        }

        this.connectionInProgress = true;

        // Set a timeout to reset connectionInProgress flag if connection takes too long
        const connectionTimeout = setTimeout(() => {
            if (this.connectionInProgress) {
                this.logger.warn(`[WebSocket Client] Connection timeout - resetting connectionInProgress flag`);
                this.connectionInProgress = false;
            }
        }, 15000); // 15 second timeout

        try {
            // Smart connection handling: only disconnect if connection is invalid
            if (this.client.websocket) {
                const currentReadyState = this.client.websocket.readyState;
                const readyStateName = this.getReadyStateName(currentReadyState);

                this.logger.info(`[WebSocket Client] Existing connection detected`);
                this.logger.info(`[WebSocket Client] Current state - isConnected: ${this.client.isConnected}, isRegistered: ${this.client.isRegistered}, readyState: ${currentReadyState} (${readyStateName})`);

                // Check if connection is valid and active
                const isConnectionValid = this.client.isConnected && currentReadyState === WebSocket.OPEN;
                const isConnectionInProgress = currentReadyState === WebSocket.CONNECTING && this.connectionInProgress;

                if (isConnectionValid) {
                    this.logger.info(`[WebSocket Client] Connection is valid and active, reusing existing connection`);
                    this.logger.info(`   Skipping reconnection to avoid disrupting active connection`);
                    return true;
                } else if (isConnectionInProgress) {
                    this.logger.info(`[WebSocket Client] Connection is in progress, waiting for it to complete`);
                    this.logger.info(`   readyState=${currentReadyState} (CONNECTING), connectionInProgress=${this.connectionInProgress}`);
                    this.logger.info(`   Skipping reconnection to avoid disrupting connection attempt`);
                    return true; // Return true to indicate connection is being handled (skip reconnection)
                } else {
                    this.logger.info(`[WebSocket Client] Connection is invalid or closed, will reconnect`);
                    this.logger.info(`   Reason: readyState=${currentReadyState} (expected 1), isConnected=${this.client.isConnected}, isRegistered=${this.client.isRegistered}`);

                    // Force disconnect invalid connection
                    this.logger.info(`[WebSocket Client] Disconnecting invalid connection...`);
                    this.disconnect();

                    // Reset connection in progress flag since we're disconnecting
                    this.connectionInProgress = false;

                    // Wait for disconnection to complete
                    this.logger.info(`[WebSocket Client] Waiting 500ms for disconnection to complete...`);
                    await new Promise(resolve => setTimeout(resolve, 500));

                    // Clear any cached connection state
                    this.client.isConnected = false;
                    this.client.websocket = null;
                    this.logger.info(`🧹 [WebSocket Client] Cleared connection state for fresh start`);
                }
            }

            const uri = `${protocol}://${host}:${port}`;
            this.logger.info(`[WebSocket Client] Connecting to ${environmentName} at ${uri}...`);

            this.client.websocket = new WebSocket(uri);
            this.logger.info(`[WebSocket Client] WebSocket object created, setting up event handlers...`);

            this.client.websocket.on('open', () => {
                clearTimeout(connectionTimeout); // Clear the connection timeout
                this.logger.info(`[WebSocket Client] Connected to ${environmentName}`);
                this.logger.info(`   Target: ${environmentName} (${host}:${port})`);
                this.client.isConnected = true;
                this.connectionInProgress = false;

                // Store connection config for reconnection
                this.lastConnectionConfig = { host, port, environmentName };

                // Register with current user info after a short delay to ensure connection is stable
                this.client.registrationTimeout = setTimeout(() => {
                    // Check if WebSocket still exists before accessing its properties
                    if (this.client.websocket && this.client.websocket.readyState !== undefined) {
                        this.logger.info(`[WebSocket Client] WebSocket readyState: ${this.client.websocket.readyState} (${this.getReadyStateName(this.client.websocket.readyState)})`);
                        if (this.client.websocket.readyState === WebSocket.OPEN) {
                            // Register with current user info
                            this.client.registerCurrentUser();
                        } else {
                            this.logger.warn(`[WebSocket Client] WebSocket not ready for registration, state: ${this.client.websocket.readyState}`);
                        }
                    } else {
                        this.logger.warn(`[WebSocket Client] WebSocket no longer exists, skipping registration`);
                    }
                    this.client.registrationTimeout = null; // Clear the timeout reference
                }, 1000); // Wait 1 second before registering
            });

            this.client.websocket.on('message', (data) => {
                try {
                    this.logger.info(`📥 [WebSocket Client] Raw message data:`, data.toString());
                    const message = JSON.parse(data);
                    this.logger.info(`📥 [WebSocket Client] Received message:`, JSON.stringify(message, null, 2));
                    this.client.handleIncomingMessage(message);
                } catch (error) {
                    this.logger.error(`[WebSocket Client] Error parsing message:`, error);
                }
            });

            this.client.websocket.on('close', (code, reason) => {
                clearTimeout(connectionTimeout); // Clear the connection timeout
                this.logger.info(`[WebSocket Client] ===== WEBSOCKET CONNECTION CLOSED =====`);
                this.logger.info(`[WebSocket Client] Connection closed`);
                this.logger.info(`   Code: ${code}`);
                this.logger.info(`   Reason: ${reason}`);
                this.logger.info(`   Target: ${environmentName} (${host}:${port})`);
                this.logger.info(`   Close Code Meanings: 1000=Normal, 1005=No Status, 1006=Abnormal, 1011=Server Error`);
                this.logger.info(`[WebSocket Client] ===== END CONNECTION CLOSED =====`);
                this.client.isConnected = false;
                this.connectionInProgress = false;

                // Clear any pending registration timeout
                if (this.client.registrationTimeout) {
                    clearTimeout(this.client.registrationTimeout);
                    this.client.registrationTimeout = null;
                }
            });

            this.client.websocket.on('error', (error) => {
                clearTimeout(connectionTimeout); // Clear the connection timeout
                this.logger.info(`[WebSocket Client] Connection error:`, error);
                this.logger.info(`   Target: ${environmentName} (${host}:${port})`);
                this.client.isConnected = false;
                this.connectionInProgress = false;
            });

            return true;
        } catch (error) {
            clearTimeout(connectionTimeout); // Clear the connection timeout
            this.logger.error(`[WebSocket Client] Failed to connect to ${environmentName}:`, error);
            this.connectionInProgress = false;
            return false;
        } finally {
            // Always reset connection in progress flag
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
            this.logger.info(`[WebSocket Client] ===== CONNECTING TO NSN-PROVIDED WEBSOCKET =====`);
            this.logger.info(`[WebSocket Client] WebSocket URL: ${websocketUrl}`);
            this.logger.info(`[WebSocket Client] Current connection status:`, {
                isConnected: this.client.isConnected,
                hasWebSocket: !!this.client.websocket,
                readyState: this.client.websocket ? this.client.websocket.readyState : 'N/A',
                isRegistered: this.client.isRegistered
            });

            // Parse the WebSocket URL for logging
            this.logger.info(`[WebSocket Client] ===== URL PARSING =====`);
            this.logger.info(`[WebSocket Client] Parsing WebSocket URL...`);
            const url = new URL(websocketUrl);
            const host = url.hostname;
            const port = url.port || (url.protocol === 'wss:' ? '443' : '80');

            this.logger.info(`[WebSocket Client] Parsed URL details:`);
            this.logger.info(`   Host: ${host}`);
            this.logger.info(`   Port: ${port}`);
            this.logger.info(`   Protocol: ${url.protocol}`);
            this.logger.info(`   Full URL: ${websocketUrl}`);

            // Connect directly using the full WebSocket URL
            this.logger.info(`[WebSocket Client] Connecting to NSN-provided WebSocket: ${websocketUrl}`);

            const startTime = Date.now();
            const result = await this.connectToWebSocketUrl(websocketUrl, 'NSN-Provided WebSocket');
            const endTime = Date.now();
            const duration = endTime - startTime;

            if (result) {
                this.logger.info(`[WebSocket Client] Connected to NSN WebSocket in ${duration}ms`);
                // Store websocket URL for reconnection
                if (!this.lastConnectionConfig) {
                    this.lastConnectionConfig = {};
                }
                this.lastConnectionConfig.websocketUrl = websocketUrl;
            } else {
                this.logger.error(`[WebSocket Client] Failed to connect to NSN WebSocket`);
                this.logger.error(`[WebSocket Client] WebSocket URL: ${websocketUrl}`);
                this.logger.error(`[WebSocket Client] Connection time: ${duration}ms`);
                this.logger.error(`[WebSocket Client] Auto-registration cannot proceed`);
            }

            return result;
        } catch (error) {
            this.logger.error('❌ [WebSocket Client] ===== ERROR CONNECTING TO NSN WEBSOCKET =====');
            this.logger.error('❌ [WebSocket Client] Error connecting to NSN-provided WebSocket:', error);
            this.logger.error('❌ [WebSocket Client] Error stack:', error.stack);
            this.logger.error('❌ [WebSocket Client] WebSocket URL that caused error:', websocketUrl);
            return false;
        }
    }

    async connect() {
        if (!this.client.config.enabled) {
            this.logger.info(`[WebSocket Client] Connection disabled in config`);
            return false;
        }

        // Detailed log: show connection config
        this.logger.info('🔌 [WebSocket Client] Connection Configuration:');
        this.logger.info(`   Environment: ${this.client.config.environment}`);
        this.logger.info(`   Environment Name: ${this.client.config.environment_name}`);
        this.logger.info(`   Host: ${this.client.config.host}`);
        this.logger.info(`   Port: ${this.client.config.port}`);
        this.logger.info(`   Auto Reconnect: ${this.client.config.auto_reconnect}`);
        this.logger.info(`   Reconnect Interval: ${this.client.config.reconnect_interval}s`);

        // Use the connectToServer method
        return await this.connectToServer(this.client.config.host, this.client.config.port, this.client.config.environment_name);
    }

    /**
     * Disconnect from server
     */
    disconnect() {
        this.logger.info('🔌 [WebSocket Client] Disconnecting from WebSocket server...');

        if (this.client.websocket) {
            try {
                this.client.websocket.close();
                this.client.websocket = null;
            } catch (error) {
                this.logger.error('Error closing WebSocket:', error);
            }
        }

        this.client.isConnected = false;

        // Clear any reconnect timer
        if (this.client.reconnectTimer) {
            clearTimeout(this.client.reconnectTimer);
            this.client.reconnectTimer = null;
        }

        // Clear any registration timeout
        if (this.client.registrationTimeout) {
            clearTimeout(this.client.registrationTimeout);
            this.client.registrationTimeout = null;
        }

        // Clear current WebSocket URL from ElectronApp
        if (this.client.electronApp && this.client.electronApp.currentWebSocketUrl) {
            this.client.electronApp.currentWebSocketUrl = null;
            this.logger.info('🔌 [WebSocket Client] Cleared current WebSocket URL');
        }

        this.logger.info('🔌 [WebSocket Client] Disconnected from WebSocket server');
    }

    /**
     * Disconnect and reconnect for user switch
     */
    async disconnectAndReconnectForUserSwitch() {
        this.logger.info(`[WebSocket Client] ===== DISCONNECTING AND RECONNECTING FOR USER SWITCH =====`);

        try {
            // Store current connection config
            const currentConfig = { ...this.client.config };

            this.logger.info(`[WebSocket Client] Current connection config:`, {
                host: currentConfig.host,
                port: currentConfig.port,
                environment: currentConfig.environment,
                environment_name: currentConfig.environment_name
            });

            // Disconnect current connection
            this.logger.info(`[WebSocket Client] Disconnecting current WebSocket connection...`);
            this.disconnect();

            // Reset registration status for user switch
            this.client.resetRegistrationStatus();

            // Wait a moment for disconnection to complete
            this.logger.info(`[WebSocket Client] Waiting 500ms for disconnection to complete...`);
            await new Promise(resolve => setTimeout(resolve, 500));

            this.logger.info(`[WebSocket Client] Disconnection completed`);

            // Reconnect with same config
            this.logger.info(`[WebSocket Client] Reconnecting with same configuration...`);
            const reconnectResult = await this.connectToServer(
                currentConfig.host,
                currentConfig.port,
                currentConfig.environment_name
            );

            if (reconnectResult) {
                this.logger.info(`[WebSocket Client] ===== USER SWITCH RECONNECTION SUCCESS =====`);
                this.logger.info(`[WebSocket Client] Successfully reconnected after user switch`);
                this.logger.info(`[WebSocket Client] New connection will register with updated user info`);
                return true;
            } else {
                this.logger.error(`[WebSocket Client] ===== USER SWITCH RECONNECTION FAILED =====`);
                this.logger.error(`[WebSocket Client] Failed to reconnect after user switch`);
                return false;
            }

        } catch (error) {
            this.logger.error(`[WebSocket Client] ===== ERROR DURING USER SWITCH RECONNECTION =====`);
            this.logger.error(`[WebSocket Client] Error during disconnect and reconnect:`, error);
            this.logger.error(`[WebSocket Client] Error details:`, error.message);
            this.logger.error(`[WebSocket Client] Stack trace:`, error.stack);
            return false;
        }
    }

    /**
     * Attempt reconnection
     */
    async attemptReconnection() {
        if (!this.lastConnectionConfig) {
            this.logger.info('⚠️ [WebSocket Client] No previous connection config available for reconnection');
            return false;
        }

        this.logger.info('🔄 [WebSocket Client] ===== ATTEMPTING RECONNECTION =====');
        this.logger.info('🔄 [WebSocket Client] Last connection config:', this.lastConnectionConfig);

        try {
            const result = await this.connectToServer(
                this.lastConnectionConfig.host,
                this.lastConnectionConfig.port,
                this.lastConnectionConfig.environmentName
            );

            if (result) {
                this.logger.info('✅ [WebSocket Client] Reconnection successful');
                return true;
            } else {
                this.logger.warn('⚠️ [WebSocket Client] Reconnection failed');
                return false;
            }
        } catch (error) {
            this.logger.error('❌ [WebSocket Client] Reconnection failed:', error);
            return false;
        }
    }

    /**
     * Reset WebSocket connection
     */
    resetWebSocketConnection() {
        this.logger.info('🔄 [WebSocket Client] ===== COMPLETELY RESETTING WEBSOCKET CONNECTION =====');

        // Force disconnect if connected
        if (this.client.websocket) {
            this.logger.info('🔄 [WebSocket Client] Force closing existing WebSocket...');
            try {
                this.client.websocket.close();
            } catch (error) {
                this.logger.warn('⚠️ [WebSocket Client] Error closing WebSocket during reset:', error);
            }
        }

        // Clear all connection state
        this.client.websocket = null;
        this.client.isConnected = false;
        this.client.isRegistered = false;
        this.connectionInProgress = false;

        // Clear all timers
        if (this.client.reconnectTimer) {
            clearTimeout(this.client.reconnectTimer);
            this.client.reconnectTimer = null;
        }

        if (this.client.registrationTimeout) {
            clearTimeout(this.client.registrationTimeout);
            this.client.registrationTimeout = null;
        }

        // Clear WebSocket URL from ElectronApp
        if (this.client.electronApp) {
            this.client.electronApp.currentWebSocketUrl = null;

            // Clear website WebSocket connections
            if (this.client.electronApp.websiteWebSocketConnections) {
                this.client.electronApp.websiteWebSocketConnections.clear();
                this.logger.info('🔄 [WebSocket Client] Cleared website WebSocket connections from ElectronApp');
            }
            this.logger.info('🔄 [WebSocket Client] Cleared current WebSocket URL from ElectronApp');
        }

        // Clear last connection config to force fresh connection
        this.lastConnectionConfig = null;
        this.logger.info('🔄 [WebSocket Client] Cleared last connection config');

        // Keep the same client ID - it's important for connection tracking
        this.logger.info(`[WebSocket Client] Keeping existing client ID: ${this.client.clientId}`);

        this.logger.info('✅ [WebSocket Client] ===== WEBSOCKET CONNECTION COMPLETELY RESET =====');
        this.logger.info('✅ [WebSocket Client] All connection state cleared, ready for fresh connection');
    }

    /**
     * Mark current WebSocket server as unavailable
     */
    markCurrentWebSocketServerAsUnavailable() {
        this.logger.info('🔓 [WebSocket Client] ===== MARKING WEBSOCKET SERVER AS UNAVAILABLE =====');

        // Mark current WebSocket server as unavailable in ElectronApp
        if (this.client.electronApp) {
            // Clear current WebSocket URL to force reconnection
            this.client.electronApp.currentWebSocketUrl = null;
            this.logger.info('🔓 [WebSocket Client] Cleared current WebSocket URL from ElectronApp');

            // Mark all website connections as unavailable
            if (this.client.electronApp.websiteWebSocketConnections) {
                this.logger.info('🔓 [WebSocket Client] Marking all website WebSocket connections as unavailable...');
                for (const [websiteDomain, connectionInfo] of this.client.electronApp.websiteWebSocketConnections) {
                    connectionInfo.available = false;
                    connectionInfo.unavailableReason = 'logout';
                    connectionInfo.unavailableAt = Date.now();
                    this.logger.info(`🔓 [WebSocket Client] Marked connection for website ${websiteDomain} as unavailable due to logout`);
                }
            }
        }

        this.logger.info('✅ [WebSocket Client] ===== WEBSOCKET SERVER MARKED AS UNAVAILABLE =====');
    }

    /**
     * Get ready state name
     */
    getReadyStateName(readyState) {
        switch (readyState) {
            case WebSocket.CONNECTING: return 'CONNECTING';
            case WebSocket.OPEN: return 'OPEN';
            case WebSocket.CLOSING: return 'CLOSING';
            case WebSocket.CLOSED: return 'CLOSED';
            default: return 'UNKNOWN';
        }
    }
}

module.exports = ConnectionManager;

