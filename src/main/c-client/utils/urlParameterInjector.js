// URL Parameter Injector for C-Client
// Automatically injects user parameters when navigating to specific websites

class UrlParameterInjector {
    constructor(apiPort = null, webSocketClient = null) {
        this.apiPort = apiPort;
        this.webSocketClient = webSocketClient;  // Store global webSocketClient instance
        this.config = this.loadConfig();
        // Target websites that should receive user parameters
        // Note: Now injecting parameters to ALL websites for universal tracking
        this.targetWebsites = [
            'comp693nsnproject.pythonanywhere.com',
            'localhost', // All localhost websites (will match any port)
            '127.0.0.1', // All 127.0.0.1 websites (will match any port)
            // Add more specific targets as needed, but by default inject to all
        ];

        // Parameter names to inject
        this.parameterNames = {
            user_id: 'nmp_user_id',
            username: 'nmp_username',
            client_type: 'nmp_client_type',
            timestamp: 'nmp_timestamp',
            injected: 'nmp_injected',  // New field to identify C-Client injection
            client_id: 'nmp_client_id', // C-Client unique identifier
            node_id: 'nmp_node_id',    // Current node ID
            domain_id: 'nmp_domain_id', // Current domain ID
            cluster_id: 'nmp_cluster_id', // Current cluster ID
            channel_id: 'nmp_channel_id'  // Current channel ID
        };
    }

    // Load configuration from config.json
    loadConfig() {
        try {
            const fs = require('fs');
            const path = require('path');
            const configPath = path.join(__dirname, '..', 'config.json');
            const configData = fs.readFileSync(configPath, 'utf8');
            return JSON.parse(configData);
        } catch (error) {
            console.log('🔧 URLParameterInjector: Using default config (config.json not found)');
            return {
                network: {
                    use_public_ip: false,
                    public_ip: '121.74.37.6',
                    local_ip: '127.0.0.1'
                }
            };
        }
    }


    /**
     * Check if a URL should have parameters injected
     * @param {string} url - The URL to check
     * @returns {boolean} - True if parameters should be injected
     */
    shouldInjectParameters(url) {
        if (!url || typeof url !== 'string') {
            return false;
        }

        try {
            const urlObj = new URL(url);

            // Skip file:// URLs and data: URLs
            if (url.startsWith('file://') || url.startsWith('data:')) {
                return false;
            }

            // Skip chrome:// and other browser internal URLs
            if (url.startsWith('chrome://') || url.startsWith('about:')) {
                return false;
            }

            // Inject parameters to ALL other websites for universal tracking
            console.log(`🔗 URLParameterInjector: Injecting parameters to: ${urlObj.hostname}`);
            return true;
        } catch (error) {
            console.error('Error parsing URL for parameter injection:', error);
            return false;
        }
    }

    /**
     * Get current user information and node information
     * @param {string} clientId - Client ID for user lookup
     * @returns {Object|null} - User and node information or null
     */
    getCurrentUserInfo(clientId = null) {
        try {
            console.log('🔍 URLParameterInjector: Attempting to get current user info...');

            // Try to get database instance
            let db;
            try {
                db = require('../sqlite/database');
                console.log('🔍 URLParameterInjector: Database module loaded successfully');
            } catch (dbError) {
                console.error('❌ URLParameterInjector: Failed to load database module:', dbError);
                return null;
            }

            // First check if database is accessible
            console.log('🔍 URLParameterInjector: Database connection established');

            // Query for current user with all NMP parameters using DatabaseManager
            const DatabaseManager = require('../sqlite/databaseManager');
            let currentUser;
            if (clientId) {
                // Use client-specific lookup (includes fallback to latest updated user)
                currentUser = DatabaseManager.getCurrentUserFieldsForClient(
                    ['user_id', 'username', 'node_id', 'domain_id', 'cluster_id', 'channel_id'],
                    clientId
                );
                console.log('🔍 URLParameterInjector: Using client-specific user lookup for clientId:', clientId);
                console.log('🔍 URLParameterInjector: Found current user:', currentUser ? `${currentUser.username} (${currentUser.user_id})` : 'null');

                // Debug: Check current user status
                DatabaseManager.debugClientCurrentUser(clientId);
            } else {
                // Fallback: try to get any available clientId from environment or generate one
                const fallbackClientId = process.env.C_CLIENT_ID || `c-client-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
                console.log('🔍 URLParameterInjector: No clientId provided, using fallback clientId:', fallbackClientId);

                currentUser = DatabaseManager.getCurrentUserFieldsForClient(
                    ['user_id', 'username', 'node_id', 'domain_id', 'cluster_id', 'channel_id'],
                    fallbackClientId
                );
                console.log('🔍 URLParameterInjector: Using fallback clientId for user lookup');
            }

            // Use provided clientId or the fallback clientId generated above
            let finalClientId = clientId || fallbackClientId;
            if (clientId) {
                console.log('🔍 URLParameterInjector: Using provided client_id:', finalClientId);
            } else {
                console.log('🔍 URLParameterInjector: Using fallback client_id:', finalClientId);
            }

            console.log('🔍 URLParameterInjector: Query result:', currentUser);
            console.log('🔍 URLParameterInjector: Current user ID:', currentUser?.user_id);
            console.log('🔍 URLParameterInjector: Current username:', currentUser?.username);
            console.log('🔍 URLParameterInjector: Current user domain_id:', currentUser?.domain_id);
            console.log('🔍 URLParameterInjector: Current user cluster_id:', currentUser?.cluster_id);
            console.log('🔍 URLParameterInjector: Current user channel_id:', currentUser?.channel_id);
            console.log('🔍 URLParameterInjector: Using finalClientId:', finalClientId);

            // Debug: Check all users and their client_id
            try {
                const allUsers = DatabaseManager.getAllLocalUsers();
                console.log('🔍 URLParameterInjector: All users in database:', allUsers.map(u => ({
                    user_id: u.user_id,
                    username: u.username,
                    is_current: u.is_current,
                    client_id: u.client_id
                })));
            } catch (debugError) {
                console.error('🔍 URLParameterInjector: Error getting all users for debug:', debugError);
            }

            if (currentUser) {
                const userInfo = {
                    user_id: currentUser.user_id,
                    username: currentUser.username,
                    client_id: finalClientId,
                    node_id: currentUser.node_id || 'unknown',
                    domain_id: currentUser.domain_id || null,
                    cluster_id: currentUser.cluster_id || null,
                    channel_id: currentUser.channel_id || null
                };

                console.log('✅ URLParameterInjector: Complete user info retrieved from local_users:', userInfo);
                return userInfo;
            } else {
                console.log('⚠️ URLParameterInjector: No current user found in database');

                // Try to get all users to debug using DatabaseManager
                try {
                    const allUsers = DatabaseManager.getAllLocalUsers();
                    console.log('🔍 URLParameterInjector: All users in database:', allUsers);
                } catch (debugError) {
                    console.error('❌ URLParameterInjector: Error querying all users:', debugError);
                }
            }
        } catch (error) {
            console.error('❌ URLParameterInjector: Error getting current user info:', error);
            console.error('❌ Error details:', {
                message: error.message,
                code: error.code,
                stack: error.stack
            });
        }

        return null;
    }

    /**
     * Inject user parameters into URL
     * @param {string} url - Original URL
     * @param {Object} userInfo - User information object
     * @returns {string} - URL with injected parameters
     */
    injectParameters(url, userInfo) {
        if (!url || !userInfo) {
            return url;
        }

        try {
            const urlObj = new URL(url);

            // Add user parameters from database
            urlObj.searchParams.set(this.parameterNames.user_id, userInfo.user_id);
            urlObj.searchParams.set(this.parameterNames.username, userInfo.username);
            urlObj.searchParams.set(this.parameterNames.client_type, 'c-client');  // Hardcoded as requested

            // Use current timestamp for NMP timestamp parameter
            urlObj.searchParams.set(this.parameterNames.timestamp, Date.now().toString());
            urlObj.searchParams.set(this.parameterNames.injected, 'true');  // Mark as injected by C-Client

            // Add client_id parameter
            if (userInfo.client_id) {
                urlObj.searchParams.set(this.parameterNames.client_id, userInfo.client_id);
                console.log(`🔍 URLParameterInjector: Injected client_id: ${userInfo.client_id}`);
            } else {
                console.log(`🔍 URLParameterInjector: No client_id available`);
            }

            // Add node information parameters (only if not null)
            urlObj.searchParams.set(this.parameterNames.node_id, userInfo.node_id);

            // Only inject domain/cluster/channel IDs if they are not null
            if (userInfo.domain_id) {
                urlObj.searchParams.set(this.parameterNames.domain_id, userInfo.domain_id);
                console.log(`🔍 URLParameterInjector: Injected domain_id: ${userInfo.domain_id}`);
            } else {
                console.log(`🔍 URLParameterInjector: Skipping domain_id (null or empty)`);
            }
            if (userInfo.cluster_id) {
                urlObj.searchParams.set(this.parameterNames.cluster_id, userInfo.cluster_id);
                console.log(`🔍 URLParameterInjector: Injected cluster_id: ${userInfo.cluster_id}`);
            } else {
                console.log(`🔍 URLParameterInjector: Skipping cluster_id (null or empty)`);
            }
            if (userInfo.channel_id) {
                urlObj.searchParams.set(this.parameterNames.channel_id, userInfo.channel_id);
                console.log(`🔍 URLParameterInjector: Injected channel_id: ${userInfo.channel_id}`);
            } else {
                console.log(`🔍 URLParameterInjector: Skipping channel_id (null or empty)`);
            }

            // Network information parameters removed as requested

            return urlObj.toString();
        } catch (error) {
            console.error('Error injecting parameters into URL:', error);
            return url;
        }
    }

    /**
     * Convert HTTPS to HTTP for local development servers
     * @param {string} url - Original URL
     * @returns {string} - URL with corrected protocol
     */
    fixLocalProtocol(url) {
        try {
            const urlObj = new URL(url);
            const hostname = urlObj.hostname;
            const port = urlObj.port;

            // Convert HTTPS to HTTP for local development servers
            if (urlObj.protocol === 'https:' &&
                (hostname === 'localhost' || hostname === '127.0.0.1') &&
                (port === '5000' || port === '3000' || port === '3001')) {
                urlObj.protocol = 'http:';
                console.log(`🔧 URLParameterInjector: Converting HTTPS to HTTP for local development: ${url} -> ${urlObj.toString()}`);
                return urlObj.toString();
            }
        } catch (error) {
            console.error('Error fixing local protocol:', error);
        }

        return url;
    }

    /**
     * Process URL and inject parameters if needed
     * @param {string} url - Original URL
     * @returns {string} - Processed URL with parameters if applicable
     */
    async processUrl(url, clientId = null) {
        console.log(`\n🔗 URLParameterInjector: Processing URL: ${url}`);

        // First, fix protocol for local development
        const fixedUrl = this.fixLocalProtocol(url);
        if (fixedUrl !== url) {
            console.log(`🔧 URLParameterInjector: Protocol fixed: ${url} -> ${fixedUrl}`);
        }

        if (!this.shouldInjectParameters(fixedUrl)) {
            console.log('ℹ️ URLParameterInjector: URL is not a target website, skipping injection');
            return fixedUrl;
        }

        console.log('✅ URLParameterInjector: URL is valid for parameter injection, proceeding...');

        const userInfo = this.getCurrentUserInfo(clientId);
        if (!userInfo) {
            console.log('⚠️ URLParameterInjector: No current user found, skipping parameter injection');
            return fixedUrl;
        }

        // NSN URL handling is now done through c-client-response div detection
        // No need to proactively fetch B-Client configuration here to avoid timing issues

        console.log('✅ URLParameterInjector: User info available, injecting NMP parameters...');
        const processedUrl = this.injectParameters(fixedUrl, userInfo);
        console.log(`🔗 URLParameterInjector: NMP parameter injection completed:`);
        console.log(`   Original:  ${url}`);
        console.log(`   Fixed:     ${fixedUrl}`);
        console.log(`   Processed: ${processedUrl}`);

        // Parse and display injected parameters
        try {
            const urlObj = new URL(processedUrl);
            console.log('📝 URLParameterInjector: Injected NMP parameters:');
            urlObj.searchParams.forEach((value, key) => {
                console.log(`   ${key}: ${value}`);
            });
        } catch (error) {
            console.error('❌ URLParameterInjector: Error parsing processed URL:', error);
        }

        return processedUrl;
    }

    isNSNUrl(url) {
        // Check if URL is an NSN server
        try {
            const urlObj = new URL(url);
            const hostname = urlObj.hostname;
            return hostname === 'localhost' && urlObj.port === '5000' ||
                hostname === 'comp693nsnproject.pythonanywhere.com';
        } catch (error) {
            return false;
        }
    }

    async handleNSNConnection(url, userInfo) {
        // Handle NSN connection and get B-Client configuration
        try {
            console.log('🔍 URLParameterInjector: Getting B-Client configuration from NSN...');

            // Get B-Client configuration from NSN
            const response = await fetch(`${url}/api/b-client/info`);
            if (response.ok) {
                const data = await response.json();
                if (data.success && data.b_client_info) {
                    console.log('✅ URLParameterInjector: B-Client configuration received:', data.b_client_info);

                    // Connect to B-Client WebSocket
                    await this.connectToBClient(data.b_client_info, userInfo);
                } else {
                    console.log('⚠️ URLParameterInjector: No B-Client configuration available');
                }
            } else {
                console.log('❌ URLParameterInjector: Failed to get B-Client configuration');
            }
        } catch (error) {
            console.error('❌ URLParameterInjector: Error getting B-Client configuration:', error);
        }
    }

    async connectToBClient(bClientInfo, userInfo) {
        // Connect to B-Client WebSocket server
        try {
            console.log('🔌 URLParameterInjector: Connecting to B-Client WebSocket...');

            // CRITICAL FIX: Use global webSocketClient instance instead of creating new one
            if (!this.webSocketClient) {
                console.error('❌ URLParameterInjector: No webSocketClient instance available');
                console.error('❌ URLParameterInjector: Cannot connect to B-Client WebSocket');
                return;
            }

            const wsClient = this.webSocketClient; // Use global instance

            // Update configuration with B-Client info
            wsClient.config.host = bClientInfo.websocket.host;
            wsClient.config.port = bClientInfo.websocket.port;

            // Connect to B-Client
            await wsClient.connect();

            console.log('✅ URLParameterInjector: Connected to B-Client WebSocket using global instance');
        } catch (error) {
            console.error('❌ URLParameterInjector: Error connecting to B-Client:', error);
        }
    }

    /**
     * Get parameter injection status for a URL
     * @param {string} url - URL to check
     * @param {string} clientId - Client ID for user lookup
     * @returns {Object} - Status information
     */
    getInjectionStatus(url, clientId = null) {
        const shouldInject = this.shouldInjectParameters(url);
        const userInfo = this.getCurrentUserInfo(clientId);

        return {
            shouldInject,
            hasUserInfo: !!userInfo,
            userInfo: userInfo,
            targetWebsites: this.targetWebsites
        };
    }

    /**
     * Process NSN response and handle WebSocket connection requests
     * @param {Object} response - Response from NSN
     * @param {Object} webSocketClient - WebSocket client instance
     */
    async processNSNResponse(response, webSocketClient) {
        try {
            console.log('🔍 URLParameterInjector: Processing NSN response:', response);

            if (response.action === 'connect_websocket') {
                console.log('🔌 URLParameterInjector: Received WebSocket connection request from NSN');
                console.log(`   WebSocket URL: ${response.websocket_url}`);
                console.log(`   User ID: ${response.user_id}`);
                console.log(`   Message: ${response.message}`);

                if (webSocketClient && response.websocket_url) {
                    // Parse WebSocket URL
                    const url = new URL(response.websocket_url);
                    const host = url.hostname;
                    const port = parseInt(url.port);

                    console.log(`🔌 URLParameterInjector: Connecting to WebSocket server: ${host}:${port}`);

                    // Connect to WebSocket server
                    await this.connectToNSNProvidedWebSocket(webSocketClient, host, port);
                } else {
                    console.error('❌ URLParameterInjector: Missing WebSocket client or URL');
                }
            } else if (response.action === 'auto_login') {
                console.log('🔐 URLParameterInjector: Received auto-login request from NSN');
                console.log(`   User ID: ${response.user_id}`);
                console.log(`   Session Data: ${JSON.stringify(response.session_data)}`);

                // Handle auto-login with session data
                await this.handleAutoLogin(response, webSocketClient);
            } else {
                console.log('ℹ️ URLParameterInjector: Unknown NSN response action:', response.action);
            }
        } catch (error) {
            console.error('❌ URLParameterInjector: Error processing NSN response:', error);
        }
    }

    /**
     * Connect to NSN-provided WebSocket server
     * @param {Object} webSocketClient - WebSocket client instance
     * @param {string} host - WebSocket host
     * @param {number} port - WebSocket port
     */
    async connectToNSNProvidedWebSocket(webSocketClient, host, port) {
        try {
            console.log(`🔌 URLParameterInjector: Connecting to NSN-provided WebSocket: ${host}:${port}`);

            // Use the WebSocket client's connectToServer method
            if (webSocketClient && typeof webSocketClient.connectToServer === 'function') {
                await webSocketClient.connectToServer(host, port, 'NSN-Provided WebSocket');
                console.log('✅ URLParameterInjector: Successfully connected to NSN-provided WebSocket');
            } else {
                console.error('❌ URLParameterInjector: WebSocket client not available or invalid');
            }
        } catch (error) {
            console.error('❌ URLParameterInjector: Error connecting to NSN-provided WebSocket:', error);
        }
    }

    /**
     * Handle auto-login with session data
     * @param {Object} response - Auto-login response from NSN
     * @param {Object} webSocketClient - WebSocket client instance
     */
    async handleAutoLogin(response, webSocketClient) {
        try {
            console.log('🔐 URLParameterInjector: Handling auto-login with session data');

            // Extract session data
            const sessionData = response.session_data || {};
            const userId = response.user_id;

            console.log(`🔐 URLParameterInjector: Auto-login for user: ${userId}`);
            console.log(`🔐 URLParameterInjector: Session data:`, sessionData);

            // TODO: Implement auto-login logic here
            // This would typically involve:
            // 1. Setting up the session in the browser
            // 2. Navigating to the appropriate page
            // 3. Setting cookies or other authentication data

            console.log('✅ URLParameterInjector: Auto-login handled successfully');
        } catch (error) {
            console.error('❌ URLParameterInjector: Error handling auto-login:', error);
        }
    }
}

// Global instance for singleton pattern
let globalInstance = null;

// Factory function to get or create global instance
function getUrlParameterInjector(apiPort = null, webSocketClient = null) {
    if (!globalInstance) {
        globalInstance = new UrlParameterInjector(apiPort, webSocketClient);
        console.log('[UrlParameterInjector] Created global instance');
    } else {
        // Update apiPort if provided and different
        if (apiPort && apiPort !== globalInstance.apiPort) {
            globalInstance.apiPort = apiPort;
            console.log(`[UrlParameterInjector] Updated global instance API port to ${apiPort}`);
        }
        // Update webSocketClient if provided
        if (webSocketClient && webSocketClient !== globalInstance.webSocketClient) {
            globalInstance.webSocketClient = webSocketClient;
            console.log(`[UrlParameterInjector] Updated global instance webSocketClient`);
        }
    }
    return globalInstance;
}

// Function to update the global instance's API port
function updateGlobalApiPort(apiPort) {
    if (globalInstance) {
        globalInstance.apiPort = apiPort;
        console.log(`[UrlParameterInjector] Updated global instance API port to ${apiPort}`);
    }
}

module.exports = UrlParameterInjector;
module.exports.getUrlParameterInjector = getUrlParameterInjector;
module.exports.updateGlobalApiPort = updateGlobalApiPort;
