/**
 * Session Manager - Handle session related operations
 */
const apiConfig = require('../config/apiConfig');

class SessionManager {
    constructor(viewManager) {
        this.viewManager = viewManager;
    }

    /**
     * Clear session data
     */
    async cleanupSession(view, id) {
        try {
            console.log(`🧹 Clearing session data for tab ${id}...`);

            // Clear cookies
            await view.webContents.session.clearStorageData({
                storages: ['cookies', 'localStorage', 'sessionStorage', 'cache']
            });

            // Clear cache
            await view.webContents.session.clearCache();

            console.log(`✅ Session data cleared for tab ${id}`);
        } catch (error) {
            console.error('❌ Error clearing session:', error);
        }
    }

    /**
     * Clear only NSN-related sessions (views and partitions)
     */
    async clearNSNSessions() {
        try {
            console.log('🧹 Clearing NSN-related sessions only...');

            // Get all views
            const views = this.viewManager.views;
            let nsnViewsCleared = 0;

            // Clear session data only for NSN views
            for (const [id, view] of Object.entries(views)) {
                if (view && view.webContents && !view.webContents.isDestroyed()) {
                    try {
                        // Check if this view is for NSN
                        const currentURL = view.webContents.getURL();
                        if (this.viewManager.isNSNUrl(currentURL)) {
                            console.log(`🧹 Clearing NSN session for view ${id} (${currentURL})`);

                            // Clear session data
                            await view.webContents.session.clearStorageData({
                                storages: ['cookies', 'localStorage', 'sessionStorage', 'cache']
                            });

                            // Clear cache
                            await view.webContents.session.clearCache();

                            console.log(`✅ NSN session cleared for view ${id}`);
                            nsnViewsCleared++;
                        } else {
                            console.log(`ℹ️ Skipping non-NSN view ${id} (${currentURL})`);
                        }
                    } catch (error) {
                        console.error(`❌ Error clearing NSN session for view ${id}:`, error);
                    }
                }
            }

            // Clear only NSN persistent session partition
            await this.clearNSNPersistentSessionPartition();

            console.log(`✅ NSN sessions cleared (${nsnViewsCleared} views, 1 partition)`);

            // Try to execute logout script only on NSN views
            for (const [id, view] of Object.entries(views)) {
                if (view && view.webContents && !view.webContents.isDestroyed()) {
                    try {
                        const currentURL = view.webContents.getURL();
                        if (this.viewManager.isNSNUrl(currentURL)) {
                            // Direct navigation to logout URL instead of JavaScript execution
                            console.log('🔓 Navigating to NSN logout URL...');
                            await view.webContents.loadURL(`${apiConfig.getNsnUrl()}/logout`);
                        }
                    } catch (error) {
                        console.error(`❌ Error executing logout script for view ${id}:`, error);
                    }
                }
            }

        } catch (error) {
            console.error('❌ Error clearing NSN sessions:', error);
        }
    }

    /**
     * Clear only NSN persistent session partition
     */
    async clearNSNPersistentSessionPartition() {
        try {
            console.log('🧹 Clearing NSN persistent session partition...');

            const { session } = require('electron');

            // Only clear NSN partition
            const partitionName = 'persist:nsn';

            try {
                console.log(`🧹 Clearing NSN session partition: ${partitionName}`);

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

                console.log(`✅ NSN session partition cleared: ${partitionName}`);

            } catch (error) {
                console.error(`❌ Error clearing NSN session partition ${partitionName}:`, error);
            }

        } catch (error) {
            console.error('❌ Error clearing NSN persistent session partition:', error);
        }
    }

    /**
     * Clear all sessions
     */
    async clearAllSessions() {
        try {
            console.log('🧹 Clearing all sessions...');

            // Get all views
            const views = this.viewManager.views;

            // Clear session data for all views
            for (const [id, view] of Object.entries(views)) {
                if (view && view.webContents && !view.webContents.isDestroyed()) {
                    try {
                        // Clear session data
                        await view.webContents.session.clearStorageData({
                            storages: ['cookies', 'localStorage', 'sessionStorage', 'cache']
                        });

                        // Clear cache
                        await view.webContents.session.clearCache();

                        console.log(`✅ Session cleared for view ${id}`);
                    } catch (error) {
                        console.error(`❌ Error clearing session for view ${id}:`, error);
                    }
                }
            }

            // Clear persistent session partitions
            await this.clearPersistentSessionPartitions();

            console.log('✅ All sessions cleared');

            // Only navigate to logout URL if there are existing NSN views
            // For new user registration, we don't need to logout from NSN
            const hasNSNViews = Object.values(views).some(view => {
                if (view && view.webContents && !view.webContents.isDestroyed()) {
                    const url = view.webContents.getURL();
                    return url.includes(apiConfig.getNsnHost()) || url.includes(`127.0.0.1:${apiConfig.getNsnPort()}`);
                }
                return false;
            });

            if (hasNSNViews) {
                console.log('🔓 Found NSN views, navigating to logout URL...');
                for (const [id, view] of Object.entries(views)) {
                    if (view && view.webContents && !view.webContents.isDestroyed()) {
                        try {
                            const url = view.webContents.getURL();
                            if (url.includes(apiConfig.getNsnHost()) || url.includes(`127.0.0.1:${apiConfig.getNsnPort()}`)) {
                                console.log(`🔓 Logging out NSN view ${id}...`);
                                await view.webContents.loadURL(`${apiConfig.getNsnUrl()}/logout`);
                            }
                        } catch (error) {
                            console.error(`❌ Error executing logout script for view ${id}:`, error);
                        }
                    }
                }
            } else {
                console.log('ℹ️ No NSN views found, skipping logout navigation');
            }

        } catch (error) {
            console.error('❌ Error clearing all sessions:', error);
        }
    }

    /**
     * Clear persistent session partitions
     */
    async clearPersistentSessionPartitions() {
        try {
            console.log('🧹 Clearing persistent session partitions...');

            const { session } = require('electron');

            // List of persistent session partitions to clear
            const partitionsToClear = ['persist:main', 'persist:nsn', 'persist:registered'];

            for (const partitionName of partitionsToClear) {
                try {
                    console.log(`🧹 Clearing session partition: ${partitionName}`);

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

                    console.log(`✅ Session partition cleared: ${partitionName}`);
                } catch (partitionError) {
                    console.error(`❌ Error clearing session partition ${partitionName}:`, partitionError);
                }
            }

            console.log('✅ All persistent session partitions cleared');
        } catch (error) {
            console.error('❌ Error clearing persistent session partitions:', error);
        }
    }

    /**
     * Auto-cleanup Loading... titles
     */
    autoCleanupLoadingTitles() {
        try {
            const views = this.viewManager.views;
            Object.keys(views).forEach(id => {
                const view = views[id];
                if (view && view.webContents) {
                    const currentTitle = view.webContents.getTitle();
                    if (currentTitle && currentTitle.includes('Loading...')) {
                        console.log(`🧹 Auto-cleaning Loading... title for tab ${id}`);
                        this.viewManager.updateViewTitle(id, 'Loading...');
                    }
                }
            });
        } catch (error) {
            console.error('Error in autoCleanupLoadingTitles:', error);
        }
    }
}

module.exports = SessionManager;
