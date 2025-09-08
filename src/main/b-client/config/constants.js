// B-Client (Enterprise) Configuration constants
module.exports = {
    // Client identification
    CLIENT_TYPE: 'b-client',
    CLIENT_NAME: 'Enterprise Client',

    // Active record management
    MAX_ACTIVE_RECORDS: 100, // Higher limit for enterprise
    MERGE_THRESHOLD: 60 * 1000, // 1 minute
    WRITE_INTERVAL: 30 * 1000,  // 30 seconds

    // File paths - separate from c-client
    HISTORY_FILE: 'b_client_visit_history.json',
    SHUTDOWN_LOG_FILE: 'b_client_shutdown-log.json',
    DATABASE_FILE: 'b_client_secure.db',

    // UI configuration
    TOP_OFFSET: 86, // Toolbar 50px + Tab bar 36px = 86px

    // Window configuration - different styling for enterprise
    WINDOW_CONFIG: {
        width: 1200, // Larger default window
        height: 900,
        minWidth: 1000,
        minHeight: 700,
        autoHideMenuBar: true,
        show: false,
        titleBarStyle: 'default',
        backgroundColor: '#f5f5f5' // Light gray background
    },

    // Enterprise-specific blocked domains
    BLOCKED_DOMAINS: [
        'audienceexposure.com',
        'pixel-sync.sitescout.com',
        'omnitagjs.com',
        'ads.google.com',
        'doubleclick.net',
        'googlesyndication.com'
    ],

    // Enterprise features
    ENTERPRISE_FEATURES: {
        ADVANCED_ANALYTICS: true,
        USER_MANAGEMENT: true,
        SESSION_RECORDING: true,
        COMPLIANCE_LOGGING: true
    }
};
