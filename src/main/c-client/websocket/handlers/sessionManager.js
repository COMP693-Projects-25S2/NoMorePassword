/**
 * SessionManager
 * Session and cookie management
 */

class SessionManager {
    constructor(client) {
        this.client = client;
        this.logger = client.logger;
    }

    /**
     * Handle cookie query from B-Client
     */
    async handleCookieQuery(data) {
        const { user_id, username } = data;
        this.logger.info(`[WebSocket Client] Cookie query for user: ${user_id} (${username})`);

        try {
            // Get stored cookie from database
            const cookieData = await this.getStoredCookie(user_id, username);

            this.client.sendMessage({
                type: 'cookie_response',
                user_id: user_id,
                username: username,
                cookie: cookieData ? cookieData.cookie : null,
                auto_refresh: cookieData ? cookieData.auto_refresh : false,
                create_time: cookieData ? cookieData.create_time : null
            });
        } catch (error) {
            this.logger.error(`[WebSocket Client] Error handling cookie query:`, error);
            this.client.sendMessage({
                type: 'cookie_response',
                user_id: user_id,
                username: username,
                cookie: null,
                error: error.message
            });
        }
    }

    /**
     * Handle cookie update from B-Client
     */
    async handleCookieUpdate(data) {
        const { user_id, username, cookie, auto_refresh } = data;
        this.logger.info(`[WebSocket Client] Cookie update for user: ${user_id} (${username})`);

        try {
            const success = await this.storeCookie(user_id, username, cookie, auto_refresh);

            this.client.sendMessage({
                type: 'cookie_update_response',
                user_id: user_id,
                username: username,
                success: success
            });
        } catch (error) {
            this.logger.error(`[WebSocket Client] Error handling cookie update:`, error);
            this.client.sendMessage({
                type: 'cookie_update_response',
                user_id: user_id,
                username: username,
                success: false,
                error: error.message
            });
        }
    }

    /**
     * Get stored cookie from database
     */
    async getStoredCookie(userId, username) {
        try {
            const sqlite3 = require('sqlite3').verbose();
            const path = require('path');
            const dbPath = path.join(__dirname, '..', '..', 'sqlite', 'secure.db');

            return new Promise((resolve) => {
                const db = new sqlite3.Database(dbPath);

                db.get(`
                    SELECT cookie, auto_refresh, create_time 
                    FROM user_cookies 
                    WHERE user_id = ? AND username = ?
                `, [userId, username], (err, row) => {
                    db.close();

                    if (err) {
                        this.logger.error(`[WebSocket Client] Error getting stored cookie:`, err);
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
            this.logger.error(`[WebSocket Client] Error getting stored cookie:`, error);
            return null;
        }
    }

    /**
     * Store cookie to database
     */
    async storeCookie(userId, username, cookie, autoRefresh) {
        try {
            const sqlite3 = require('sqlite3').verbose();
            const path = require('path');
            const dbPath = path.join(__dirname, '..', '..', 'sqlite', 'secure.db');

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
                        this.logger.error(`[WebSocket Client] Error creating table:`, err);
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
                            this.logger.error(`[WebSocket Client] Error storing cookie:`, err);
                            resolve(false);
                        } else {
                            resolve(true);
                        }
                    });
                });
            });
        } catch (error) {
            this.logger.error(`[WebSocket Client] Error storing cookie:`, error);
            return false;
        }
    }

    /**
     * Handle session sync from B-Client
     */
    handleSessionSync(data) {
        this.logger.info('🔐 [WebSocket Client] ===== SESSION SYNC MESSAGE RECEIVED =====');
        this.logger.info('🔐 [WebSocket Client] Session sync data:', data);

        try {
            // Process the session data similar to auto_login
            if (data && data.session_data) {
                this.logger.info('🔐 [WebSocket Client] Processing session data from B-Client');
                this.client.handleAutoLogin({
                    type: 'auto_login',
                    user_id: data.user_id,
                    session_data: data.session_data,
                    website_config: data.website_config,
                    message: data.message,
                    timestamp: data.timestamp,
                    nsn_username: data.nsn_username
                });
            } else {
                this.logger.warn('⚠️ [WebSocket Client] No session data provided in session sync');
            }
        } catch (error) {
            this.logger.error('❌ [WebSocket Client] Error processing session sync:', error);
        }
    }

    /**
     * Check if URL belongs to website
     */
    isWebsiteUrl(url, websiteRootPath) {
        if (!url || !websiteRootPath) return false;
        try {
            const urlObj = new URL(url);
            const websiteUrl = new URL(websiteRootPath);
            return urlObj.origin === websiteUrl.origin;
        } catch (error) {
            this.logger.warn('Invalid URL or website root path:', url, websiteRootPath);
            return false;
        }
    }

    /**
     * Clear website-specific sessions
     */
    async clearWebsiteSpecificSessions(websiteConfig) {
        try {
            this.logger.info('🔓 [WebSocket Client] Clearing website-specific sessions...');

            if (!this.client.mainWindow || !this.client.mainWindow.tabManager) {
                this.logger.warn('⚠️ [WebSocket Client] TabManager not available for clearing website sessions');
                return;
            }

            if (!websiteConfig || !websiteConfig.root_path) {
                this.logger.warn('⚠️ [WebSocket Client] No website configuration provided, falling back to NSN-specific cleanup');
                await this.client.mainWindow.tabManager.clearNSNSessions();
                return;
            }

            const tabManager = this.client.mainWindow.tabManager;
            const views = tabManager.getAllViews();
            let websiteViewsCleared = 0;

            // Clear session data only for website views
            for (const [id, view] of Object.entries(views)) {
                if (view && view.webContents && !view.webContents.isDestroyed()) {
                    try {
                        // Check if this view belongs to the website
                        const currentURL = view.webContents.getURL();
                        if (this.isWebsiteUrl(currentURL, websiteConfig.root_path)) {
                            this.logger.info(`🧹 Clearing ${websiteConfig.name} session for view ${id} (${currentURL})`);

                            // Clear session data
                            await view.webContents.session.clearStorageData({
                                storages: ['cookies', 'localStorage', 'sessionStorage', 'cache']
                            });

                            // Clear cache
                            await view.webContents.session.clearCache();

                            this.logger.info(`✅ ${websiteConfig.name} session cleared for view ${id}`);
                            websiteViewsCleared++;
                        } else {
                            this.logger.info(`ℹ️ Skipping non-${websiteConfig.name} view ${id} (${currentURL})`);
                        }
                    } catch (error) {
                        this.logger.error(`❌ Error clearing ${websiteConfig.name} session for view ${id}:`, error);
                    }
                }
            }

            // Clear website-specific persistent session partition
            await this.clearWebsitePersistentSessionPartition(websiteConfig);

            this.logger.info(`✅ ${websiteConfig.name} sessions cleared (${websiteViewsCleared} views, 1 partition)`);

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
                        this.logger.error(`❌ Error executing logout script for view ${id}:`, error);
                    }
                }
            }

        } catch (error) {
            this.logger.error('❌ Error clearing website-specific sessions:', error);
        }
    }

    /**
     * Clear website persistent session partition
     */
    async clearWebsitePersistentSessionPartition(websiteConfig) {
        try {
            this.logger.info(`🧹 Clearing ${websiteConfig.name} persistent session partition...`);

            const { session } = require('electron');

            // Use website-specific partition or default to persist:nsn
            const partitionName = websiteConfig.session_partition || 'persist:nsn';

            try {
                this.logger.info(`🧹 Clearing ${websiteConfig.name} session partition: ${partitionName}`);

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

                this.logger.info(`✅ ${websiteConfig.name} session partition cleared: ${partitionName}`);

            } catch (error) {
                this.logger.error(`❌ Error clearing ${websiteConfig.name} session partition ${partitionName}:`, error);
            }

        } catch (error) {
            this.logger.error(`❌ Error clearing ${websiteConfig.name} persistent session partition:`, error);
        }
    }

    /**
     * Clear incremental website sessions (only new sessions since last logout)
     */
    async clearIncrementalWebsiteSessions(websiteConfig) {
        try {
            this.logger.info('🔓 [WebSocket Client] Clearing incremental website sessions...');

            if (!this.client.mainWindow || !this.client.mainWindow.tabManager) {
                this.logger.warn('⚠️ [WebSocket Client] TabManager not available for incremental session clearing');
                return;
            }

            const tabManager = this.client.mainWindow.tabManager;
            const views = tabManager.getAllViews();
            let newSessionsCleared = 0;

            // Only clear sessions that were created after the last logout
            const lastLogoutTime = this.client.logoutHistory[websiteConfig?.name] || 0;

            for (const [id, view] of Object.entries(views)) {
                if (view && view.webContents && !view.webContents.isDestroyed()) {
                    try {
                        const currentURL = view.webContents.getURL();
                        if (this.isWebsiteUrl(currentURL, websiteConfig.root_path)) {
                            // Check if this session was created after last logout
                            const sessionCreatedTime = view.webContents.getCreationTime ?
                                view.webContents.getCreationTime() : 0;

                            if (sessionCreatedTime > lastLogoutTime) {
                                this.logger.info(`🔓 [WebSocket Client] Clearing new session for view ${id}: ${currentURL}`);
                                await view.webContents.clearHistory();
                                await view.webContents.clearCache();
                                newSessionsCleared++;
                            }
                        }
                    } catch (error) {
                        this.logger.error(`[WebSocket Client] Error clearing incremental session for view ${id}:`, error);
                    }
                }
            }

            this.logger.info(`[WebSocket Client] Incremental session clearing completed (${newSessionsCleared} new sessions cleared)`);
        } catch (error) {
            this.logger.error('❌ [WebSocket Client] Error in clearIncrementalWebsiteSessions:', error);
        }
    }

    /**
     * Clear user session data
     */
    async clearUserSessionData(user_id) {
        try {
            this.logger.info(`🔓 [WebSocket Client] Clearing session data for user ${user_id}...`);

            // Clear any cached user data
            if (this.client.userSessionCache) {
                delete this.client.userSessionCache[user_id];
            }

            // Clear any user-specific flags
            if (this.client.userFlags) {
                delete this.client.userFlags[user_id];
            }

            this.logger.info(`[WebSocket Client] Session data cleared for user ${user_id}`);
        } catch (error) {
            this.logger.error(`[WebSocket Client] Error clearing session data for user ${user_id}:`, error);
        }
    }

    /**
     * Close website-specific tabs
     */
    async closeWebsiteSpecificTabs(websiteConfig) {
        try {
            this.logger.info(`🔓 [WebSocket Client] Closing ${websiteConfig?.name || 'website'} tabs...`);

            if (!this.client.mainWindow || !this.client.mainWindow.tabManager) {
                this.logger.warn('⚠️ [WebSocket Client] TabManager not available for closing website tabs');
                return;
            }

            if (!websiteConfig || !websiteConfig.root_path) {
                this.logger.warn('⚠️ [WebSocket Client] No website configuration provided, falling back to NSN-specific cleanup');
                await this.closeNSNTabsOnly();
                return;
            }

            const tabManager = this.client.mainWindow.tabManager;
            const views = tabManager.getAllViews();
            const websiteViewsToClose = [];

            // Identify website views to close
            for (const [id, view] of Object.entries(views)) {
                if (view && view.webContents && !view.webContents.isDestroyed()) {
                    try {
                        const currentURL = view.webContents.getURL();
                        if (this.isWebsiteUrl(currentURL, websiteConfig.root_path)) {
                            this.logger.info(`🔓 [WebSocket Client] Found ${websiteConfig.name} view ${id} to close: ${currentURL}`);
                            websiteViewsToClose.push(id);
                        } else {
                            this.logger.info(`ℹ️ [WebSocket Client] Preserving non-${websiteConfig.name} view ${id}: ${currentURL}`);
                        }
                    } catch (error) {
                        this.logger.error(`[WebSocket Client] Error checking URL for view ${id}:`, error);
                    }
                }
            }

            // Close website views
            for (const viewId of websiteViewsToClose) {
                try {
                    this.logger.info(`🔓 [WebSocket Client] Closing ${websiteConfig.name} view ${viewId}...`);
                    // Use TabManager if available, otherwise fallback to ViewManager
                    await tabManager.closeTab(viewId);
                    this.logger.info(`[WebSocket Client] ${websiteConfig.name} view ${viewId} closed`);
                } catch (error) {
                    this.logger.error(`[WebSocket Client] Error closing ${websiteConfig.name} view ${viewId}:`, error);
                }
            }

            // If no tabs remain, create a default page
            const remainingViews = Object.keys(tabManager.getAllViews());
            if (remainingViews.length === 0) {
                this.logger.info('🔓 [WebSocket Client] No tabs remaining, creating default page...');
                try {
                    // Use TabManager if available, otherwise fallback to ViewManager
                    await tabManager.closeAllTabs();
                    await tabManager.createTab();
                    this.logger.info('✅ [WebSocket Client] Default page created');
                } catch (error) {
                    this.logger.error('❌ [WebSocket Client] Error creating default page:', error);
                }
            } else {
                this.logger.info(`ℹ️ [WebSocket Client] ${remainingViews.length} non-${websiteConfig.name} tabs preserved`);
            }

            this.logger.info(`[WebSocket Client] ${websiteConfig.name} tab cleanup completed (${websiteViewsToClose.length} tabs closed)`);

        } catch (error) {
            this.logger.error(`[WebSocket Client] Error in closeWebsiteSpecificTabs:`, error);
        }
    }

    /**
     * Close NSN tabs only
     */
    async closeNSNTabsOnly() {
        try {
            this.logger.info('🔓 [WebSocket Client] Closing NSN tabs only...');

            if (!this.client.mainWindow || !this.client.mainWindow.tabManager) {
                this.logger.warn('⚠️ [WebSocket Client] TabManager not available for closing NSN tabs');
                return;
            }

            const tabManager = this.client.mainWindow.tabManager;
            const views = tabManager.getAllViews();
            const nsnViewsToClose = [];

            // Identify NSN views to close
            for (const [id, view] of Object.entries(views)) {
                if (view && view.webContents && !view.webContents.isDestroyed()) {
                    try {
                        const currentURL = view.webContents.getURL();
                        if (tabManager.isNSNUrl(currentURL)) {
                            this.logger.info(`🔓 [WebSocket Client] Found NSN view ${id} to close: ${currentURL}`);
                            nsnViewsToClose.push(id);
                        } else {
                            this.logger.info(`ℹ️ [WebSocket Client] Preserving non-NSN view ${id}: ${currentURL}`);
                        }
                    } catch (error) {
                        this.logger.error(`[WebSocket Client] Error checking URL for view ${id}:`, error);
                    }
                }
            }

            // Close NSN views
            for (const viewId of nsnViewsToClose) {
                try {
                    this.logger.info(`🔓 [WebSocket Client] Closing NSN view ${viewId}...`);
                    // Use TabManager if available, otherwise fallback to ViewManager
                    await tabManager.closeTab(viewId);
                    this.logger.info(`[WebSocket Client] NSN view ${viewId} closed`);
                } catch (error) {
                    this.logger.error(`[WebSocket Client] Error closing NSN view ${viewId}:`, error);
                }
            }

            // If no tabs remain, create a default page
            const remainingViews = Object.keys(tabManager.getAllViews());
            if (remainingViews.length === 0) {
                this.logger.info('🔓 [WebSocket Client] No tabs remaining, creating default page...');
                try {
                    // Use TabManager if available, otherwise fallback to ViewManager
                    await tabManager.closeAllTabs();
                    await tabManager.createTab();
                    this.logger.info('✅ [WebSocket Client] Default page created');
                } catch (error) {
                    this.logger.error('❌ [WebSocket Client] Error creating default page:', error);
                }
            } else {
                this.logger.info(`ℹ️ [WebSocket Client] ${remainingViews.length} non-NSN tabs preserved`);
            }

            this.logger.info(`[WebSocket Client] NSN tab cleanup completed (${nsnViewsToClose.length} tabs closed)`);

        } catch (error) {
            this.logger.error('❌ [WebSocket Client] Error in closeNSNTabsOnly:', error);
        }
    }

    /**
     * Close incremental website tabs (only new tabs since last logout)
     */
    async closeIncrementalWebsiteTabs(websiteConfig) {
        try {
            this.logger.info(`🔓 [WebSocket Client] Closing incremental ${websiteConfig?.name || 'website'} tabs...`);

            if (!this.client.mainWindow || !this.client.mainWindow.tabManager) {
                this.logger.warn('⚠️ [WebSocket Client] TabManager not available for incremental tab closing');
                return;
            }

            const tabManager = this.client.mainWindow.tabManager;
            const views = tabManager.getAllViews();
            const websiteViewsToClose = [];
            const lastLogoutTime = this.client.logoutHistory[websiteConfig?.name] || 0;

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
                                this.logger.info(`🔓 [WebSocket Client] Found new ${websiteConfig.name} view ${id} to close: ${currentURL}`);
                                websiteViewsToClose.push(id);
                            }
                        }
                    } catch (error) {
                        this.logger.error(`[WebSocket Client] Error checking URL for view ${id}:`, error);
                    }
                }
            }

            // Close new website views
            for (const viewId of websiteViewsToClose) {
                try {
                    this.logger.info(`🔓 [WebSocket Client] Closing new ${websiteConfig.name} view ${viewId}...`);
                    // Use TabManager if available, otherwise fallback to ViewManager
                    await tabManager.closeTab(viewId);
                    this.logger.info(`[WebSocket Client] New ${websiteConfig.name} view ${viewId} closed`);
                } catch (error) {
                    this.logger.error(`[WebSocket Client] Error closing new ${websiteConfig.name} view ${viewId}:`, error);
                }
            }

            this.logger.info(`[WebSocket Client] Incremental ${websiteConfig.name} tab cleanup completed (${websiteViewsToClose.length} new tabs closed)`);
        } catch (error) {
            this.logger.error(`[WebSocket Client] Error in closeIncrementalWebsiteTabs:`, error);
        }
    }

}

module.exports = SessionManager;
