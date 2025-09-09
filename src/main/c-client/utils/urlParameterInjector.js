// URL Parameter Injector for C-Client
// Automatically injects user parameters when navigating to specific websites

class UrlParameterInjector {
    constructor() {
        // Target websites that should receive user parameters
        this.targetWebsites = [
            'comp639nsn.pythonanywhere.com',
            'localhost:3000', // B-Client API
            'localhost:3001'  // B-Client API (alternative port)
        ];

        // Parameter names to inject
        this.parameterNames = {
            user_id: 'nmp_user_id',
            username: 'nmp_username',
            client_type: 'nmp_client_type',
            timestamp: 'nmp_timestamp'
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
            const hostname = urlObj.hostname;

            // Always inject parameters for any valid URL (except localhost and file://)
            if (hostname === 'localhost' || hostname === '127.0.0.1' || url.startsWith('file://')) {
                return false;
            }

            return true;
        } catch (error) {
            console.error('Error parsing URL for parameter injection:', error);
            return false;
        }
    }

    /**
     * Get current user information
     * @returns {Object|null} - User information or null
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

            // Query for current user
            const currentUser = db.prepare(
                'SELECT user_id, username FROM local_users WHERE is_current = 1'
            ).get();

            console.log('🔍 URLParameterInjector: Query result:', currentUser);

            if (currentUser) {
                const userInfo = {
                    user_id: currentUser.user_id,
                    username: currentUser.username
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

            return urlObj.toString();
        } catch (error) {
            console.error('Error injecting parameters into URL:', error);
            return url;
        }
    }

    /**
     * Process URL and inject parameters if needed
     * @param {string} url - Original URL
     * @returns {string} - Processed URL with parameters if applicable
     */
    processUrl(url) {
        console.log(`\n🔗 URLParameterInjector: Processing URL: ${url}`);

        if (!this.shouldInjectParameters(url)) {
            console.log('ℹ️ URLParameterInjector: URL is localhost or file://, skipping injection');
            return url;
        }

        console.log('✅ URLParameterInjector: URL is valid for parameter injection, proceeding...');

        const userInfo = this.getCurrentUserInfo();
        if (!userInfo) {
            console.log('⚠️ URLParameterInjector: No current user found, skipping parameter injection');
            return url;
        }

        console.log('✅ URLParameterInjector: User info available, injecting NMP parameters...');
        const processedUrl = this.injectParameters(url, userInfo);
        console.log(`🔗 URLParameterInjector: NMP parameter injection completed:`);
        console.log(`   Original:  ${url}`);
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
