// Configuration constants
module.exports = {
    // Active record management
    MAX_ACTIVE_RECORDS: 50,
    MERGE_THRESHOLD: 60 * 1000, // 1 minute
    WRITE_INTERVAL: 30 * 1000,  // 30 seconds

    // File paths
    HISTORY_FILE: 'visit_history.json',
    SHUTDOWN_LOG_FILE: 'shutdown-log.json',

    // UI configuration
    TOP_OFFSET: 86, // Toolbar 50px + Tab bar 36px = 86px

    // Window configuration
    WINDOW_CONFIG: {
        width: 1000,
        height: 800,
        minWidth: 800,
        minHeight: 600,
        autoHideMenuBar: true,
        show: false
    },

    // Blocked domains list
    BLOCKED_DOMAINS: [
        'audienceexposure.com',
        'pixel-sync.sitescout.com',
        'omnitagjs.com'
    ]
};