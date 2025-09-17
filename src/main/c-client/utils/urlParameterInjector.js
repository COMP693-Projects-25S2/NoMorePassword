// URL Parameter Injector for C-Client
// Automatically injects user parameters when navigating to specific websites

class UrlParameterInjector {
    constructor(apiPort = null) {
        this.apiPort = apiPort;
        // Target websites that should receive user parameters
        // Note: Now injecting parameters to ALL websites for universal tracking
        this.targetWebsites = [
            'comp639nsn.pythonanywhere.com',
            'localhost:3000', // B-Client API
            'localhost:3001', // B-Client API (alternative port)
            'localhost:5000', // NSN development server
            '127.0.0.1:5000', // NSN development server (alternative)
            // Add more specific targets as needed, but by default inject to all
        ];

        // Parameter names to inject
        this.parameterNames = {
            user_id: 'nmp_user_id',
            username: 'nmp_username',
            client_type: 'nmp_client_type',
            timestamp: 'nmp_timestamp',
            injected: 'nmp_injected',  // New field to identify C-Client injection
            node_id: 'nmp_node_id',    // Current node ID
            domain_id: 'nmp_domain_id', // Current domain ID
            cluster_id: 'nmp_cluster_id', // Current cluster ID
            channel_id: 'nmp_channel_id',  // Current channel ID
            api_port: 'nmp_api_port'   // C-Client API port for B-Client communication
        };
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
     * @returns {Object|null} - User and node information or null
     */
    getCurrentUserInfo() {
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

            // Query for current user with node information
            const currentUser = db.prepare(
                'SELECT user_id, username, node_id, domain_id, cluster_id, channel_id FROM local_users WHERE is_current = 1'
            ).get();

            console.log('🔍 URLParameterInjector: Query result:', currentUser);
            console.log('🔍 URLParameterInjector: Current user ID:', currentUser?.user_id);
            console.log('🔍 URLParameterInjector: Current username:', currentUser?.username);

            if (currentUser) {
                const userInfo = {
                    user_id: currentUser.user_id,
                    username: currentUser.username,
                    node_id: currentUser.node_id || 'unknown',
                    domain_id: currentUser.domain_id || 'default-domain',
                    cluster_id: currentUser.cluster_id || 'default-cluster',
                    channel_id: currentUser.channel_id || 'default-channel'
                };
                console.log('✅ URLParameterInjector: User info retrieved:', userInfo);
                return userInfo;
            } else {
                console.log('⚠️ URLParameterInjector: No current user found in database');

                // Try to get all users to debug
                try {
                    const allUsers = db.prepare('SELECT user_id, username, is_current FROM local_users').all();
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

            // Add user parameters
            urlObj.searchParams.set(this.parameterNames.user_id, userInfo.user_id);
            urlObj.searchParams.set(this.parameterNames.username, userInfo.username);
            urlObj.searchParams.set(this.parameterNames.client_type, 'c-client');
            urlObj.searchParams.set(this.parameterNames.timestamp, Date.now().toString());
            urlObj.searchParams.set(this.parameterNames.injected, 'true');  // Mark as injected by C-Client

            // Add node information parameters
            urlObj.searchParams.set(this.parameterNames.node_id, userInfo.node_id);
            urlObj.searchParams.set(this.parameterNames.domain_id, userInfo.domain_id);
            urlObj.searchParams.set(this.parameterNames.cluster_id, userInfo.cluster_id);
            urlObj.searchParams.set(this.parameterNames.channel_id, userInfo.channel_id);

            // Add API port information
            if (this.apiPort) {
                urlObj.searchParams.set(this.parameterNames.api_port, this.apiPort.toString());
            }

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
    processUrl(url) {
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

        const userInfo = this.getCurrentUserInfo();
        if (!userInfo) {
            console.log('⚠️ URLParameterInjector: No current user found, skipping parameter injection');
            return fixedUrl;
        }

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

    /**
     * Get parameter injection status for a URL
     * @param {string} url - URL to check
     * @returns {Object} - Status information
     */
    getInjectionStatus(url) {
        const shouldInject = this.shouldInjectParameters(url);
        const userInfo = this.getCurrentUserInfo();

        return {
            shouldInject,
            hasUserInfo: !!userInfo,
            userInfo: userInfo,
            targetWebsites: this.targetWebsites
        };
    }
}

module.exports = UrlParameterInjector;
