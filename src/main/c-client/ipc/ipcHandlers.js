const { ipcMain } = require('electron');
const NetworkConfigManager = require('../config/networkConfigManager');
const apiConfig = require('../config/apiConfig');

// Import logging system
const { getCClientLogger, getSyncLogger } = require('../utils/logger');

// IPC handlers
class IpcHandlers {
    constructor(viewManager, historyManager, mainWindow = null, clientManager = null, nodeManager = null, startupValidator = null, apiPort = null, webSocketClient = null, tabManager = null, clientId = null, syncManager = null) {
        // Initialize logging system
        this.logger = getCClientLogger('ipc');
        this.syncLogger = getSyncLogger('ipc'); // For sync-related logs

        this.clientId = clientId; // Store client ID for user-specific operations
        this.viewManager = viewManager;
        this.historyManager = historyManager;
        this.mainWindow = mainWindow; // Store reference to main window
        this.clientManager = clientManager; // Store reference to client manager
        this.nodeManager = nodeManager; // Store reference to node manager
        this.startupValidator = startupValidator; // Store reference to startup validator
        this.apiPort = apiPort; // Store API port for C-Client API calls
        this.webSocketClient = webSocketClient; // Store reference to WebSocket client
        this.tabManager = tabManager; // Store reference to unified TabManager
        this.syncManager = syncManager; // Store reference to SyncManager
        this.networkConfigManager = new NetworkConfigManager(); // Network configuration manager
        this.registerHandlers();
    }

    /**
     * Update SyncManager reference after initialization
     * @param {SyncManager} syncManager - SyncManager instance
     */
    updateSyncManager(syncManager) {
        this.syncManager = syncManager;
        console.log('🔄 IPC Handlers: SyncManager reference updated');
    }

    /**
     * Register all IPC handlers
     */
    registerHandlers() {
        // Tab management
        this.registerTabHandlers();

        // History management
        this.registerHistoryHandlers();

        // Navigation control
        this.registerNavigationHandlers();

        // View management
        this.registerViewHandlers();

        // Database management
        this.registerDatabaseHandlers();

        // Client management
        this.registerClientHandlers();

        // Network configuration
        this.registerNetworkConfigHandlers();

        // Cookie reload handling
        this.registerCookieReloadHandlers();

        // NSN response handling
        this.registerNSNResponseHandlers();

        // New device login handling
        this.registerNewDeviceLoginHandlers();
    }

    /**
     * Register cookie reload handlers
     */
    registerCookieReloadHandlers() {
        // Cookie reload handling is done in main.js setupCookieReloadListener()
        // No need to duplicate the listener here
        console.log(`🔄 C-Client IPC: Cookie reload handlers registration skipped (handled in main.js)`);
    }

    /**
     * Handle reload with cookie
     */
    handleReloadWithCookie(data) {
        try {
            const { user_id, username, cookie, nsn_url, nsn_port, nsn_domain } = data;
            console.log(`🔄 C-Client IPC: Handling reload with cookie for user: ${username}`);

            // Log NSN information if provided
            if (nsn_url || nsn_port || nsn_domain) {
                console.log(`🔄 C-Client IPC: NSN information:`, {
                    nsn_url: nsn_url,
                    nsn_port: nsn_port,
                    nsn_domain: nsn_domain
                });
            }

            // Find the current NSN tab and reload it with the cookie
            if (this.tabManager) {
                const nsnTab = this.tabManager.findNSNTab();
                if (nsnTab) {
                    console.log(`🔄 C-Client IPC: Found NSN tab, reloading with cookie for user: ${username}`);

                    // Extract the actual cookie value from the session cookie string
                    // The cookie might be in format: "session=eyJ..." or just "eyJ..."
                    let cookieValue = cookie;
                    if (cookie.startsWith('session=')) {
                        // Extract just the session value part
                        cookieValue = cookie.split('session=')[1].split(';')[0];
                    }

                    console.log(`🔄 C-Client IPC: Setting cookie value: ${cookieValue.substring(0, 50)}...`);

                    // Set cookie in the browser session
                    // Get NSN URL from configuration
                    const apiConfig = require('../config/apiConfig');
                    const nsnConfig = apiConfig.getCurrentNsnWebsite();

                    nsnTab.webContents.session.cookies.set({
                        url: nsnConfig.url,
                        name: 'session',
                        value: cookieValue,
                        httpOnly: true,
                        secure: false
                    }).then(() => {
                        console.log(`🔄 C-Client IPC: Cookie set successfully for user: ${username}`);

                        // Reload the NSN tab
                        nsnTab.webContents.reload();
                        console.log(`🔄 C-Client IPC: NSN tab reloaded with cookie for user: ${username}`);
                    }).catch(error => {
                        console.error(`❌ C-Client IPC: Failed to set cookie for user ${username}:`, error);
                    });
                } else {
                    console.log(`🔄 C-Client IPC: No NSN tab found, creating new tab with cookie for user: ${username}`);

                    // Create new NSN tab with cookie
                    // Use NSN URL from the originating B-Client if available
                    if (nsn_url) {
                        console.log(`🔄 C-Client IPC: Creating new tab with NSN URL from originating B-Client: ${nsn_url}`);
                        this.tabManager.createViewWithCookie(nsn_url, cookie, username, nsn_url);
                    } else {
                        // Fallback to configuration (should be avoided in multi-tenant scenarios)
                        const apiConfig = require('../config/apiConfig');
                        const nsnConfig = apiConfig.getCurrentNsnWebsite();
                        console.warn(`🔄 C-Client IPC: No NSN URL from B-Client, using configuration: ${nsnConfig.url}`);
                        this.tabManager.createViewWithCookie(nsnConfig.url, cookie, username);
                    }
                }
            } else {
                console.error(`❌ C-Client IPC: TabManager not available for reload with cookie`);
            }
        } catch (error) {
            console.error(`❌ C-Client IPC: Error handling reload with cookie:`, error);
        }
    }

    /**
     * Safely register an IPC handler, removing any existing one first
     */
    safeRegisterHandler(channel, handler) {
        try {
            ipcMain.removeHandler(channel);
        } catch (error) {
            // Handler might not exist, ignore error
        }
        ipcMain.handle(channel, handler);
    }

    /**
     * Get C-Client API port (dynamic port from merged API server)
     */
    getApiPort() {
        if (this.apiPort) {
            return this.apiPort;
        }
        // No fallback - should always be set to merged API server port
        console.warn('⚠️ IpcHandlers: API port not set, this should not happen');
        return null;
    }

    /**
     * Register tab-related handlers
     */
    registerTabHandlers() {
        // Create new tab - using unified TabManager
        this.safeRegisterHandler('create-tab', async (_, url, options = {}) => {
            try {
                console.log(`\n📝 C-Client IPC: Creating synchronized tab with URL: ${url}`);

                if (!this.tabManager) {
                    console.error('❌ C-Client IPC: TabManager not available for creating tab');
                    return { success: false, error: 'TabManager not available' };
                }

                // Process URL with parameter injection if URL is provided
                let processedUrl = url;
                if (url && url !== 'about:blank' && !url.startsWith('browser://')) {
                    const { getUrlParameterInjector } = require('../utils/urlParameterInjector');
                    const urlInjector = getUrlParameterInjector(this.apiPort, this.webSocketClient);
                    processedUrl = await urlInjector.processUrl(url, this.clientId);
                    console.log(`🔧 C-Client IPC: URL processed for new tab: ${url} -> ${processedUrl}`);
                }

                // Create synchronized tab with processed URL
                const result = await this.tabManager.createTab(processedUrl, options);
                if (result && result.id && this.historyManager) {
                    // Record visit start (skip blank pages and browser internal pages)
                    if (url && url !== 'about:blank' && !url.startsWith('browser://')) {
                        const record = await this.historyManager.recordVisit(url, result.id);
                        if (record) {
                            console.log(`📊 C-Client IPC: Visit recorded for tab ${result.id}`);
                        }
                    } else {
                        console.log(`⏭️ C-Client IPC: Skipping visit record for blank/internal page: ${url}`);
                    }
                }

                console.log(`✅ C-Client IPC: Synchronized tab created successfully with ID: ${result?.id}`);
                return {
                    success: true,
                    id: result?.id,
                    title: result?.title,
                    url: result?.url,
                    tabUI: result?.tabUI
                };
            } catch (error) {
                console.error('❌ C-Client IPC: Failed to create synchronized tab:', error);
                return { success: false, error: error.message };
            }
        });



        // Create history tab - using unified TabManager
        this.safeRegisterHandler('create-history-tab', async () => {
            try {
                if (!this.tabManager) {
                    console.error('❌ C-Client IPC: TabManager not available for creating history tab');
                    return { success: false, error: 'TabManager not available' };
                }

                const result = await this.tabManager.createTab('browser://history', { isHistory: true });
                console.log(`✅ C-Client IPC: History tab created successfully with ID: ${result?.id}`);
                return {
                    success: true,
                    id: result?.id,
                    title: result?.title || 'History',
                    url: result?.url,
                    tabUI: result?.tabUI
                };
            } catch (error) {
                console.error('Failed to create history tab:', error);
                return { success: false, error: error.message };
            }
        });



        // Switch tab - using unified TabManager
        this.safeRegisterHandler('switch-tab', async (_, id) => {
            try {
                if (!this.tabManager) {
                    console.error('❌ C-Client IPC: TabManager not available for switching tab');
                    return { success: false, error: 'TabManager not available' };
                }

                const result = await this.tabManager.switchTab(id);

                // When switching tabs, end previous tab's active records
                if (result && this.historyManager) {
                    const now = Date.now();
                    // Get all tabs, end active records except current tab
                    const allTabs = this.tabManager.getAllTabs();
                    allTabs.forEach(tab => {
                        if (tab.id !== parseInt(id)) {
                            this.historyManager.finishActiveRecords(tab.id, now);
                        }
                    });
                }

                return { success: result };
            } catch (error) {
                console.error('Failed to switch tab:', error);
                return { success: false, error: error.message };
            }
        });

        // Close tab - using unified TabManager
        this.safeRegisterHandler('close-tab', async (_, id) => {
            try {
                if (!this.tabManager) {
                    console.error('❌ C-Client IPC: TabManager not available for closing tab');
                    return { success: false, error: 'TabManager not available' };
                }

                const result = await this.tabManager.closeTab(id);

                // Finish active records for closed tab
                if (result && this.historyManager) {
                    this.historyManager.finishActiveRecords(parseInt(id), Date.now());
                }

                return { success: result };
            } catch (error) {
                console.error('Failed to close tab:', error);
                return { success: false, error: error.message };
            }
        });

        // Get tab info
        this.safeRegisterHandler('get-tab-info', (_, id) => {
            try {
                return this.tabManager.getTabInfo(id);
            } catch (error) {
                console.error('Failed to get tab info:', error);
                return null;
            }
        });
    }

    /**
     * Register history-related handlers
     */
    registerHistoryHandlers() {
        // Get visit history
        this.safeRegisterHandler('get-visit-history', (_, limit) => {
            try {
                return this.historyManager.getHistory(limit);
            } catch (error) {
                console.error('Failed to get visit history:', error);
                return [];
            }
        });

        // Get visit statistics
        this.safeRegisterHandler('get-visit-stats', () => {
            try {
                return this.historyManager.getStats();
            } catch (error) {
                console.error('Failed to get visit stats:', error);
                return {
                    totalVisits: 0,
                    totalTime: 0,
                    averageStayTime: 0,
                    topPages: {},
                    activeRecords: 0
                };
            }
        });

        // Get history data (including statistics and records)
        this.safeRegisterHandler('get-history-data', (_, limit) => {
            try {
                return this.historyManager.getHistoryData(limit || 100);
            } catch (error) {
                console.error('Failed to get history data:', error);
                return {
                    stats: {
                        totalVisits: 0,
                        totalTime: 0,
                        averageStayTime: 0,
                        topPages: {},
                        activeRecords: 0
                    },
                    history: []
                };
            }
        });

        // Get current user
        this.safeRegisterHandler('get-current-user', () => {
            try {
                return this.historyManager.userActivityManager.getCurrentUser();
            } catch (error) {
                console.error('Failed to get current user:', error);
                return null;
            }
        });

        // Get shutdown history
        this.safeRegisterHandler('get-shutdown-history', () => {
            try {
                return this.historyManager.getShutdownHistory();
            } catch (error) {
                console.error('Failed to get shutdown history:', error);
                return [];
            }
        });

        // Manually trigger shutdown log (for testing)
        this.safeRegisterHandler('trigger-shutdown-log', (_, reason) => {
            try {
                this.historyManager.logShutdown(reason || 'manual');
                return true;
            } catch (error) {
                console.error('Failed to trigger shutdown log:', error);
                return false;
            }
        });

        // Get active records information
        this.safeRegisterHandler('get-active-records', () => {
            try {
                return this.historyManager.getActiveRecordsInfo();
            } catch (error) {
                console.error('Failed to get active records:', error);
                return {
                    activeRecords: [],
                    totalActive: 0,
                    maxActive: 50
                };
            }
        });

        // Get history by date range
        this.safeRegisterHandler('get-history-by-date-range', (_, startDate, endDate) => {
            try {
                const start = new Date(startDate);
                const end = new Date(endDate);
                return this.historyManager.getHistoryByDateRange(start, end);
            } catch (error) {
                console.error('Failed to get history by date range:', error);
                return [];
            }
        });

        // Get top domains statistics
        this.safeRegisterHandler('get-top-domains', (_, limit) => {
            try {
                return this.historyManager.getTopDomains(limit || 10);
            } catch (error) {
                console.error('Failed to get top domains:', error);
                return [];
            }
        });

        // Export history data
        this.safeRegisterHandler('export-history-data', (_, limit) => {
            try {
                return this.historyManager.exportHistoryData(limit);
            } catch (error) {
                console.error('Failed to export history data:', error);
                return {
                    exportTime: new Date().toISOString(),
                    error: error.message,
                    stats: {},
                    history: [],
                    shutdownHistory: [],
                    totalRecords: 0
                };
            }
        });

        // Manually record visit (for testing or special cases)
        this.safeRegisterHandler('record-manual-visit', async (_, url, viewId) => {
            try {
                if (!url || !viewId) {
                    throw new Error('URL and viewId are required');
                }
                const record = await this.historyManager.recordVisit(url, viewId);
                return record;
            } catch (error) {
                console.error('Failed to record manual visit:', error);
                return null;
            }
        });

        // Update record title (for frontend manual update)
        this.safeRegisterHandler('update-record-title', (_, recordId, title) => {
            try {
                if (!recordId || !title) {
                    throw new Error('Record ID and title are required');
                }
                // Need to get record object first here
                const record = { id: recordId };
                this.historyManager.updateRecordTitle(record, title);
                return true;
            } catch (error) {
                console.error('Failed to update record title:', error);
                return false;
            }
        });

        // Auto-fetch titles for loading records
        this.safeRegisterHandler('auto-fetch-titles', async () => {
            try {
                if (!this.historyManager) {
                    throw new Error('History manager not available');
                }
                const result = await this.historyManager.autoFetchTitleForLoadingRecords();
                return {
                    success: true,
                    updated: result.updated,
                    total: result.total
                };
            } catch (error) {
                console.error('Failed to auto-fetch titles:', error);
                return {
                    success: false,
                    error: error.message
                };
            }
        });
    }

    /**
     * Register navigation-related handlers
     */
    registerNavigationHandlers() {
        // Navigate to specified URL
        this.safeRegisterHandler('navigate-to', async (_, url) => {
            try {
                console.log(`\n🧭 C-Client IPC: Navigating to URL: ${url}`);

                // Get global URL parameter injector instance
                const { getUrlParameterInjector } = require('../utils/urlParameterInjector');
                const urlInjector = getUrlParameterInjector(this.apiPort);

                // Process URL and inject parameters if needed
                console.log('🔧 C-Client IPC: Processing URL for parameter injection...');
                const processedUrl = await urlInjector.processUrl(url, this.clientId);

                console.log(`🔧 C-Client IPC: URL processing completed:`);
                console.log(`   Input URL:  ${url}`);
                console.log(`   Output URL: ${processedUrl}`);

                await this.tabManager.navigateTo(processedUrl);

                // Record new visit (skip blank pages and browser internal pages)
                if (url && url !== 'about:blank' && !url.startsWith('browser://') && this.historyManager) {
                    if (this.tabManager) {
                        // Use TabManager to get current tab
                        const currentTab = this.tabManager.getCurrentTab();
                        if (currentTab) {
                            const record = await this.historyManager.recordVisit(url, currentTab.id);
                            console.log(`📊 C-Client IPC: Navigation visit recorded for tab ${currentTab.id}`);

                            // Record navigation activity
                            this.historyManager.recordNavigationActivity(url, 'Loading...', 'navigate');
                        }
                    } else {
                        // Fallback to ViewManager
                        const currentView = this.tabManager.getCurrentView();
                        if (currentView) {
                            const viewId = currentView.id || Date.now();
                            const record = await this.historyManager.recordVisit(url, viewId);
                            console.log(`📊 C-Client IPC: Navigation visit recorded for view ${viewId}`);

                            // Record navigation activity
                            this.historyManager.recordNavigationActivity(url, 'Loading...', 'navigate');
                        }
                    }
                } else {
                    console.log(`⏭️ C-Client IPC: Skipping visit record for blank/internal page: ${url}`);
                }

                console.log(`✅ C-Client IPC: Navigation completed successfully`);
                return { success: true };
            } catch (error) {
                console.error('❌ C-Client IPC: Failed to navigate to URL:', error);

                // Handle specific error types
                if (error.code === 'ERR_ABORTED') {
                    console.log('⚠️ C-Client IPC: Navigation was aborted (ERR_ABORTED)');
                    console.log('⚠️ C-Client IPC: This usually means the navigation was interrupted by another navigation request');
                    console.log('⚠️ C-Client IPC: This is often normal during logout/login sequences');

                    // For ERR_ABORTED, we might want to retry or just log it as a warning
                    return { success: false, error: 'Navigation was aborted', code: 'ERR_ABORTED', retry: true };
                } else if (error.code === 'ERR_INVALID_URL') {
                    console.log('❌ C-Client IPC: Invalid URL provided');
                    return { success: false, error: 'Invalid URL', code: 'ERR_INVALID_URL' };
                } else {
                    console.log('❌ C-Client IPC: Unknown navigation error');
                    return { success: false, error: error.message, code: error.code || 'UNKNOWN' };
                }
            }
        });

        // Navigate to NSN with NMP parameters
        this.safeRegisterHandler('navigate-to-nsn-request', async (_, navigationData) => {
            try {
                console.log(`\n🧭 C-Client IPC: Navigating to NSN with NMP parameters`);
                console.log(`🧭 C-Client IPC: Navigation data:`, {
                    user_id: navigationData.user_id,
                    username: navigationData.username,
                    url: navigationData.url
                });

                if (!navigationData.url) {
                    console.error('❌ C-Client IPC: No URL provided in navigation data');
                    return false;
                }

                // Navigate to the NSN URL with NMP parameters
                await this.tabManager.navigateTo(navigationData.url);

                // Record new visit
                if (navigationData.url && this.historyManager) {
                    if (this.tabManager) {
                        // Use TabManager to get current tab
                        const currentTab = this.tabManager.getCurrentTab();
                        if (currentTab) {
                            const record = await this.historyManager.recordVisit(navigationData.url, currentTab.id);
                            console.log(`📊 C-Client IPC: NSN navigation visit recorded for tab ${currentTab.id}`);
                        }
                    } else {
                        // Fallback to ViewManager
                        const currentView = this.tabManager.getCurrentView();
                        if (currentView) {
                            const viewId = currentView.id || Date.now();
                            const record = await this.historyManager.recordVisit(navigationData.url, viewId);
                            console.log(`📊 C-Client IPC: NSN navigation visit recorded for view ${viewId}`);
                        }
                    }
                }

                console.log(`✅ C-Client IPC: NSN navigation completed successfully`);
                return { success: true };
            } catch (error) {
                console.error('❌ C-Client IPC: Failed to navigate to NSN:', error);
                return { success: false, error: error.message };
            }
        });

        // Go back
        this.safeRegisterHandler('go-back', async () => {
            try {
                const result = this.tabManager.goBack();

                // Record back navigation
                if (result && this.historyManager) {
                    if (this.tabManager) {
                        // Use TabManager to get current tab
                        const currentTab = this.tabManager.getCurrentTab();
                        if (currentTab && currentTab.browserView && currentTab.browserView.webContents) {
                            const url = currentTab.browserView.webContents.getURL();
                            if (url) {
                                await this.historyManager.recordVisit(url, currentTab.id);

                                // Record navigation activity
                                this.historyManager.recordNavigationActivity(url, 'Loading...', 'back');
                            }
                        }
                    } else {
                        // Fallback to ViewManager
                        const currentView = this.tabManager.getCurrentView();
                        if (currentView && currentView.webContents) {
                            const url = currentView.webContents.getURL();
                            const viewId = currentView.id || Date.now();
                            if (url) {
                                await this.historyManager.recordVisit(url, viewId);

                                // Record navigation activity
                                this.historyManager.recordNavigationActivity(url, 'Loading...', 'back');
                            }
                        }
                    }
                }

                return { success: result };
            } catch (error) {
                console.error('Failed to go back:', error);
                return { success: false, error: error.message };
            }
        });

        // Go forward
        this.safeRegisterHandler('go-forward', async () => {
            try {
                const result = this.tabManager.goForward();

                // Record forward navigation
                if (result && this.historyManager) {
                    if (this.tabManager) {
                        // Use TabManager to get current tab
                        const currentTab = this.tabManager.getCurrentTab();
                        if (currentTab && currentTab.browserView && currentTab.browserView.webContents) {
                            const url = currentTab.browserView.webContents.getURL();
                            if (url) {
                                await this.historyManager.recordVisit(url, currentTab.id);

                                // Record navigation activity
                                this.historyManager.recordNavigationActivity(url, 'Loading...', 'forward');
                            }
                        }
                    } else {
                        // Fallback to ViewManager
                        const currentView = this.tabManager.getCurrentView();
                        if (currentView && currentView.webContents) {
                            const url = currentView.webContents.getURL();
                            const viewId = currentView.id || Date.now();
                            if (url) {
                                await this.historyManager.recordVisit(url, viewId);

                                // Record navigation activity
                                this.historyManager.recordNavigationActivity(url, 'Loading...', 'forward');
                            }
                        }
                    }
                }

                return { success: result };
            } catch (error) {
                console.error('Failed to go forward:', error);
                return { success: false, error: error.message };
            }
        });

        // Refresh page
        this.safeRegisterHandler('refresh', async () => {
            try {
                const result = this.tabManager.refresh();

                // Record page refresh
                if (result && this.historyManager) {
                    if (this.tabManager) {
                        // Use TabManager to get current tab
                        const currentTab = this.tabManager.getCurrentTab();
                        if (currentTab && currentTab.browserView && currentTab.browserView.webContents) {
                            const url = currentTab.browserView.webContents.getURL();
                            if (url) {
                                await this.historyManager.recordVisit(url, currentTab.id);

                                // Record navigation activity
                                this.historyManager.recordNavigationActivity(url, 'Loading...', 'refresh');
                            }
                        }
                    } else {
                        // Fallback to ViewManager
                        const currentView = this.tabManager.getCurrentView();
                        if (currentView && currentView.webContents) {
                            const url = currentView.webContents.getURL();
                            const viewId = currentView.id || Date.now();
                            if (url) {
                                await this.historyManager.recordVisit(url, viewId);

                                // Record navigation activity
                                this.historyManager.recordNavigationActivity(url, 'Loading...', 'refresh');
                            }
                        }
                    }
                }

                return { success: result };
            } catch (error) {
                console.error('Failed to refresh page:', error);
                return { success: false, error: error.message };
            }
        });
    }

    /**
     * Register view management related handlers
     */
    registerViewHandlers() {
        // Hide current BrowserView
        this.safeRegisterHandler('hide-browser-view', () => {
            try {
                return this.tabManager.hideAllViews();
            } catch (error) {
                console.error('Failed to hide browser view:', error);
                return false;
            }
        });

        // Show current BrowserView
        this.safeRegisterHandler('show-browser-view', () => {
            try {
                return this.tabManager.showAllViews();
            } catch (error) {
                console.error('Failed to show browser view:', error);
                return false;
            }
        });

        // Get current view information - using unified TabManager
        this.safeRegisterHandler('get-current-view-info', () => {
            try {
                if (this.tabManager) {
                    // Use TabManager to get current tab info
                    const currentTab = this.tabManager.getCurrentTab();
                    if (currentTab && currentTab.browserView && currentTab.browserView.webContents) {
                        return {
                            id: currentTab.id,
                            url: currentTab.browserView.webContents.getURL(),
                            title: currentTab.title || currentTab.browserView.webContents.getTitle(),
                            canGoBack: currentTab.browserView.webContents.canGoBack(),
                            canGoForward: currentTab.browserView.webContents.canGoForward()
                        };
                    }
                } else {
                    // Fallback to ViewManager
                    const currentView = this.viewManager.getCurrentView();
                    if (currentView && currentView.webContents) {
                        return {
                            id: currentView.id,
                            url: currentView.webContents.getURL(),
                            title: currentView.webContents.getTitle(),
                            canGoBack: currentView.webContents.canGoBack(),
                            canGoForward: currentView.webContents.canGoForward()
                        };
                    }
                }
                return null;
            } catch (error) {
                console.error('Failed to get current view info:', error);
                return null;
            }
        });

        // Get all views information - using unified TabManager
        this.safeRegisterHandler('get-all-views-info', () => {
            try {
                if (this.tabManager) {
                    // Use TabManager to get all tabs info
                    const allTabs = this.tabManager.getAllTabs();
                    const viewsInfo = {};

                    allTabs.forEach(tab => {
                        if (tab && tab.browserView && tab.browserView.webContents) {
                            viewsInfo[tab.id] = {
                                id: tab.id,
                                url: tab.browserView.webContents.getURL(),
                                title: tab.title || tab.browserView.webContents.getTitle(),
                                canGoBack: tab.browserView.webContents.canGoBack(),
                                canGoForward: tab.browserView.webContents.canGoForward()
                            };
                        }
                    });

                    return viewsInfo;
                }
            } catch (error) {
                console.error('Failed to get all views info:', error);
                return {};
            }
        });
    }

    /**
     * Register database management related handlers
     */
    registerDatabaseHandlers() {
        // Get database statistics
        this.safeRegisterHandler('get-database-stats', () => {
            try {
                return this.historyManager.getDatabaseStats();
            } catch (error) {
                console.error('Failed to get database stats:', error);
                return {
                    visitHistory: 0,
                    activeRecords: 0,
                    shutdownLogs: 0
                };
            }
        });

        // Clean up old data
        this.safeRegisterHandler('cleanup-old-data', (_, daysToKeep) => {
            try {
                const days = daysToKeep || 30;
                return this.historyManager.cleanupOldData(days);
            } catch (error) {
                console.error('Failed to cleanup old data:', error);
                return { changes: 0 };
            }
        });

        // Force write data (mainly for testing)
        this.safeRegisterHandler('force-write-data', () => {
            try {
                this.historyManager.forceWrite();
                return true;
            } catch (error) {
                console.error('Failed to force write data:', error);
                return false;
            }
        });

        // Clear local users
        this.safeRegisterHandler('clear-local-users', () => {
            try {
                const DatabaseManager = require('../sqlite/databaseManager');
                const result = DatabaseManager.clearAllLocalUsers();
                return result;
            } catch (error) {
                console.error('Error clearing local_users table:', error);
                return { success: false, error: error.message };
            }
        });

        // Get sync data
        this.safeRegisterHandler('get-sync-data', () => {
            try {
                const DatabaseManager = require('../sqlite/databaseManager');
                const result = DatabaseManager.getSyncData();
                this.logger.info(`Retrieved ${result.length} sync data records`);
                return result;
            } catch (error) {
                console.error('Error getting sync data:', error);
                this.logger.error('Failed to get sync data:', error);
                return [];
            }
        });

        // Node Test: Generate unique node_id for each user
        this.safeRegisterHandler('node-test-unique-ids', () => {
            try {
                const DatabaseManager = require('../sqlite/databaseManager');
                return DatabaseManager.generateUniqueNodeIdsForAllUsers();
            } catch (error) {
                return { success: false, error: error.message };
            }
        });

        // Exit application
        this.safeRegisterHandler('exit-app', () => {
            try {
                const { app } = require('electron');
                app.quit();
                return { success: true };
            } catch (error) {
                console.error('Error exiting application:', error);
                return { success: false, error: error.message };
            }
        });

        // Clear current user activities
        this.safeRegisterHandler('clear-current-user-activities', () => {
            try {
                const DatabaseManager = require('../sqlite/databaseManager');
                const result = DatabaseManager.clearCurrentUserActivities(this.clientId);
                return result;
            } catch (error) {
                console.error('Error clearing current user activities:', error);
                return { success: false, error: error.message };
            }
        });



        // Get browser session information
        this.safeRegisterHandler('get-session-info', () => {
            try {
                const stats = this.historyManager.getStats();
                const activeRecords = this.historyManager.getActiveRecordsInfo();

                return {
                    totalVisits: stats.totalVisits,
                    totalTime: stats.totalTime,
                    averageStayTime: stats.averageStayTime,
                    activeRecords: activeRecords.totalActive,
                    maxActiveRecords: activeRecords.maxActive,
                    topDomains: Object.keys(stats.topPages).length,
                    sessionStartTime: new Date().toISOString() // Can store actual session start time here
                };
            } catch (error) {
                console.error('Failed to get session info:', error);
                return {
                    totalVisits: 0,
                    totalTime: 0,
                    averageStayTime: 0,
                    activeRecords: 0,
                    maxActiveRecords: 50,
                    topDomains: 0,
                    sessionStartTime: new Date().toISOString()
                };
            }
        });

        // User registration
        this.safeRegisterHandler('submit-username', async (event, username) => {
            try {

                if (!username || username.trim() === '') {
                    throw new Error('Username cannot be empty');
                }

                // Generate user ID and get IP address based on configuration
                const { v4: uuidv4 } = require('uuid');
                const userId = uuidv4();

                // Get IP address based on environment configuration
                let ipAddress = '127.0.0.1'; // Default fallback
                try {
                    // Load configuration to determine IP address
                    const fs = require('fs');
                    const path = require('path');
                    const configPath = path.join(__dirname, '..', 'config.json');

                    if (fs.existsSync(configPath)) {
                        const configData = fs.readFileSync(configPath, 'utf8');
                        const config = JSON.parse(configData);

                        if (config.network && config.network.use_public_ip) {
                            console.log('🌐 C-Client: Using public IP mode for new user');
                            try {
                                const response = await fetch('https://api.ipify.org?format=json');
                                const data = await response.json();
                                ipAddress = data.ip;
                                console.log(`🌐 C-Client: Retrieved public IP: ${ipAddress}`);
                            } catch (ipError) {
                                console.error('Failed to get public IP, using configured public IP:', ipError);
                                ipAddress = config.network.public_ip || '127.0.0.1';
                            }
                        } else {
                            console.log('🏠 C-Client: Using local IP mode for new user');
                            ipAddress = config.network.local_ip || '127.0.0.1';
                        }
                    } else {
                        console.log('⚠️ C-Client: Config file not found, using default local IP');
                        ipAddress = '127.0.0.1';
                    }
                } catch (configError) {
                    console.error('Failed to load configuration, using default IP:', configError);
                    ipAddress = '127.0.0.1';
                }

                // Store user data locally and register via B-Client
                const userData = {
                    username: username.trim(),
                    userId: userId,
                    domainId: null,
                    clusterId: null,
                    channelId: null,
                    ipAddress: ipAddress,
                    isCurrent: 1
                };

                // Insert new user into database using DatabaseManager
                const DatabaseManager = require('../sqlite/databaseManager');

                // Use the client_id from IpcHandlers constructor
                let clientId = this.clientId;

                // Remove client from all users for this client only (multi-client support)
                if (clientId) {
                    DatabaseManager.removeClientFromCurrentUsers(clientId);
                    console.log(`🔧 C-Client IPC: Removed client from all users for client: ${clientId}`);
                    console.log(`🔧 C-Client IPC: Using client_id for new user: ${clientId}`);
                } else {
                    console.warn(`⚠️ C-Client IPC: No client_id available for new user`);
                }

                // Then insert the new user as current using DatabaseManager (which handles node_id consistency)
                const result = DatabaseManager.addLocalUser(
                    userData.userId,
                    userData.username,
                    userData.domainId,
                    userData.clusterId,
                    userData.channelId,
                    null, // nodeId will be handled by addLocalUser method
                    userData.ipAddress,
                    1, // isCurrent = 1
                    'c-client', // clientType
                    clientId // clientId
                );

                // User will be registered to third-party websites only when they click "signup with NMP"

                if (result.changes > 0) {
                    console.log(`✅ C-Client IPC: Successfully created local user ${username}`);
                    console.log(`ℹ️ C-Client IPC: User will be registered to NSN on first visit`);

                    // Re-register with WebSocket service to ensure accurate counting (instead of disconnecting)
                    try {
                        if (this.webSocketClient) {
                            console.log(`🔄 C-Client IPC: Handling WebSocket connection after user registration...`);
                            console.log(`🔍 C-Client IPC: WebSocket client details:`);
                            console.log(`   WebSocket client available: ${!!this.webSocketClient}`);
                            console.log(`   WebSocket connected: ${this.webSocketClient.isConnected}`);
                            console.log(`   WebSocket ready state: ${this.webSocketClient.websocket ? this.webSocketClient.websocket.readyState : 'null'}`);
                            console.log(`   Client ID: ${this.webSocketClient.clientId}`);

                            if (this.webSocketClient.isConnected) {
                                console.log(`🔄 C-Client IPC: Disconnecting and reconnecting WebSocket for user registration...`);
                                // Disconnect and reconnect WebSocket connection when registering new user
                                const reconnectResult = await this.webSocketClient.disconnectAndReconnectForUserSwitch();
                                if (reconnectResult) {
                                    console.log(`✅ C-Client IPC: WebSocket reconnected successfully for user registration`);
                                } else {
                                    console.log(`⚠️ C-Client IPC: WebSocket reconnection failed for user registration, will connect when needed`);
                                }
                            } else {
                                console.log(`ℹ️ C-Client IPC: No active WebSocket connection after user registration`);
                                console.log(`🔌 C-Client IPC: WebSocket will connect when user accesses NSN page`);
                            }
                        } else {
                            console.warn(`⚠️ C-Client IPC: WebSocket client not available after user registration`);
                            console.log(`🔍 C-Client IPC: WebSocket client reference: ${this.webSocketClient}`);
                        }
                    } catch (wsError) {
                        console.error(`❌ C-Client IPC: Error during WebSocket disconnect after user registration:`, wsError);
                        console.error(`🔍 C-Client IPC: Error details:`, wsError.stack);
                        // Don't fail the user registration if WebSocket disconnect fails
                    }

                    // Registration successful, close any open registration dialog after WebSocket re-registration
                    try {
                        console.log('🔄 C-Client IPC: Attempting to close registration dialog...');

                        // Try to close dialog from startupValidator.nodeManager first
                        if (this.startupValidator && this.startupValidator.nodeManager && this.startupValidator.nodeManager.userRegistrationDialog) {
                            console.log('🔄 C-Client IPC: Closing dialog from startupValidator.nodeManager');
                            this.startupValidator.nodeManager.userRegistrationDialog.closeFromExternalRequest();
                        }
                        // Note: nodeManager.userRegistrationDialog is no longer available after refactoring
                        // Dialog closing is now handled through direct window management

                        // Also try to close any dialog windows directly
                        const { BrowserWindow } = require('electron');
                        const allWindows = BrowserWindow.getAllWindows();
                        for (const window of allWindows) {
                            if (window.webContents && window.webContents.getURL().includes('data:text/html')) {
                                console.log('🔄 C-Client IPC: Found registration dialog window, closing directly');
                                window.close();
                                break;
                            }
                        }

                        console.log('✅ C-Client IPC: Registration dialog close attempt completed');
                    } catch (closeError) {
                        console.error('❌ C-Client IPC: Error closing registration dialog:', closeError);
                    }

                    // Clear all sessions and close all existing tabs before creating new default page (same as user switch)
                    if (this.tabManager) {
                        try {
                            console.log('🔄 C-Client IPC: Clearing all sessions and closing all tabs after user registration...');
                            console.log('🔍 C-Client IPC: TabManager available:', !!this.tabManager);
                            console.log('🔍 C-Client IPC: clearAllSessions method available:', typeof this.tabManager.clearAllSessions);
                            console.log('🔍 C-Client IPC: closeAllTabsAndCreateDefault method available:', typeof this.tabManager.closeAllTabsAndCreateDefault);

                            // Clear all sessions and close all tabs (clearAllSessions already closes tabs)
                            console.log('🧹 C-Client IPC: Clearing all sessions including persistent partitions...');
                            await this.tabManager.clearAllSessions();
                            console.log('✅ C-Client IPC: All sessions cleared and tabs closed after user registration');

                            // Create new default tab (tabs were already closed by clearAllSessions)
                            if (this.tabManager) {
                                // Create a new default tab
                                await this.tabManager.createTab();
                                console.log('✅ C-Client IPC: New default tab created after registration');
                            } else {
                                console.warn('⚠️ C-Client IPC: TabManager not available, cannot create default tab');
                            }
                        } catch (viewError) {
                            console.error('❌ C-Client IPC: Error managing views after user registration:', viewError);
                            console.error('❌ C-Client IPC: ViewError details:', {
                                message: viewError.message,
                                stack: viewError.stack
                            });
                            // Don't fail the registration if view management fails
                        }
                    } else {
                        console.error('❌ C-Client IPC: ViewManager not available after user registration');
                    }

                    // Then show greeting dialog
                    try {
                        const UserRegistrationDialog = require('../userManager/userRegistrationDialog');
                        const userRegistrationDialog = new UserRegistrationDialog(this.clientId);

                        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
                            await userRegistrationDialog.showGreeting(this.mainWindow);
                        } else {
                            console.warn('Main window not available for greeting dialog');
                        }
                    } catch (greetingError) {
                        console.error('Error showing greeting dialog after registration:', greetingError);
                    }

                    return { success: true, userData };
                } else {
                    throw new Error('Failed to insert user into database');
                }

            } catch (error) {
                console.error('Error submitting username:', error);
                return { success: false, error: error.message };
            }
        });

        // Handle dialog close request
        ipcMain.on('close-user-registration-dialog', async (event) => {
            console.log('🔄 C-Client IPC: Received close-user-registration-dialog event');

            // Close the registration dialog first
            try {
                const { BrowserWindow } = require('electron');
                const allWindows = BrowserWindow.getAllWindows();

                console.log(`🔍 C-Client IPC: Found ${allWindows.length} windows`);

                for (const window of allWindows) {
                    if (window.webContents && window.webContents.getURL().includes('data:text/html')) {
                        console.log('🔄 C-Client IPC: Found registration dialog window, closing...');
                        window.close();
                        console.log('✅ C-Client IPC: Registration dialog closed');
                        break;
                    }
                }
            } catch (closeError) {
                console.error('❌ C-Client IPC: Error closing registration dialog:', closeError);
            }

            // After closing registration dialog, show greeting dialog
            // Note: Greeting dialog is already shown by submit-username handler
            // So we don't need to show it again here
            console.log('✅ C-Client IPC: close-user-registration-dialog event handled');
        });

        // Handle config modal open request
        this.safeRegisterHandler('open-config-modal', async (event) => {
            try {
                const ConfigModal = require('../configModal');
                const configModal = new ConfigModal();

                // Use the stored main window reference
                if (this.mainWindow && !this.mainWindow.isDestroyed()) {
                    await configModal.show(this.mainWindow);
                    return { success: true };
                } else {
                    throw new Error('Main window not found');
                }
            } catch (error) {
                console.error('Failed to open config modal:', error);
                return { success: false, error: error.message };
            }
        });

        // Handle network config modal open request
        this.safeRegisterHandler('open-network-config', async (event) => {
            try {
                const NetworkConfigDialog = require('../ui/networkConfigDialog');
                const networkConfigDialog = new NetworkConfigDialog();

                // Use the stored main window reference
                if (this.mainWindow && !this.mainWindow.isDestroyed()) {
                    await networkConfigDialog.show(this.mainWindow);
                    return { success: true };
                } else {
                    throw new Error('Main window not found');
                }
            } catch (error) {
                console.error('Error opening network config dialog:', error);
                return { success: false, error: error.message };
            }
        });

        // Handle node status modal open request
        this.safeRegisterHandler('open-node-status-modal', async (event) => {
            try {
                console.log('🔍 IPC: open-node-status-modal handler called');
                const NodeStatusModal = require('../nodeStatusModal');
                const nodeStatusModal = new NodeStatusModal();

                // Try to get main window from different sources
                let mainWindow = this.mainWindow;

                if (!mainWindow || mainWindow.isDestroyed()) {
                    // Try to get main window from the event sender
                    if (event && event.sender && event.sender.getOwnerBrowserWindow) {
                        mainWindow = event.sender.getOwnerBrowserWindow();
                    }

                    // If still no main window, try to get it from the main app
                    if (!mainWindow || mainWindow.isDestroyed()) {
                        const mainApp = require('../main');
                        if (mainApp && mainApp.mainWindow && !mainApp.mainWindow.isDestroyed()) {
                            mainWindow = mainApp.mainWindow;
                        }
                    }

                    // If still no main window, try to get it from the client switch manager context
                    if (!mainWindow || mainWindow.isDestroyed()) {
                        // Try to get the current main window from BrowserWindow.getAllWindows()
                        const { BrowserWindow } = require('electron');
                        const allWindows = BrowserWindow.getAllWindows();
                        if (allWindows.length > 0) {
                            mainWindow = allWindows[0]; // Use the first available window
                        }
                    }
                }

                if (mainWindow && !mainWindow.isDestroyed()) {
                    console.log('🔍 IPC: Main window found, showing node status modal...');
                    await nodeStatusModal.show(mainWindow);
                    console.log('🔍 IPC: Node status modal shown successfully');
                    return { success: true };
                } else {
                    console.log('🔍 IPC: Main window not found or destroyed');
                    throw new Error('Main window not found or destroyed');
                }
            } catch (error) {
                console.error('Failed to open node status modal:', error);
                return { success: false, error: error.message };
            }
        });

        // Handle get node status request
        this.safeRegisterHandler('get-node-status', async (event) => {
            try {
                console.log('🔍 Getting node status...');

                // Node management functionality removed
                return {
                    success: true,
                    data: {
                        currentNode: null,
                        mainNodes: {},
                        hierarchy: []
                    }
                };

            } catch (error) {
                console.error('Error getting node status:', error);
                return {
                    success: false,
                    error: error.message
                };
            }
        });

        // Handle sync data viewer modal open request
        this.safeRegisterHandler('open-sync-data-viewer', async (event) => {
            try {
                console.log('📈 IPC: open-sync-data-viewer handler called');
                const SyncDataViewer = require('../ui/syncDataViewer');
                const syncDataViewer = new SyncDataViewer();

                // Use the stored main window reference
                if (this.mainWindow && !this.mainWindow.isDestroyed()) {
                    await syncDataViewer.show(this.mainWindow);
                    return { success: true };
                } else {
                    throw new Error('Main window not found');
                }
            } catch (error) {
                console.error('Failed to open sync data viewer:', error);
                return { success: false, error: error.message };
            }
        });

        // Handle get sync data request
        this.safeRegisterHandler('get-sync-data', async (event) => {
            try {
                console.log('📈 IPC: get-sync-data handler called');

                // Get sync data from database using better-sqlite3
                const database = require('../sqlite/database');

                const query = 'SELECT * FROM sync_data ORDER BY created_at DESC LIMIT 100';
                const rows = database.prepare(query).all();

                console.log(`📈 Found ${rows.length} sync data records`);
                return { success: true, data: rows || [] };
            } catch (error) {
                console.error('Error getting sync data:', error);
                return { success: false, error: error.message };
            }
        });

        // Handle manual sync activities request
        this.safeRegisterHandler('manual-sync-activities', async (event) => {
            try {
                console.log('📤 IPC: manual-sync-activities handler called');

                // Check WebSocket connection first
                if (!this.webSocketClient || !this.webSocketClient.isConnected) {
                    return { success: false, error: 'Please connect to WebSocket server first' };
                }

                // Get current user ID from WebSocket client
                const currentUser = this.webSocketClient.getCurrentUserInfo();
                if (!currentUser || !currentUser.user_id) {
                    return { success: false, error: 'No current user found' };
                }

                const userId = currentUser.user_id;
                this.syncLogger.info(`📤 Manual sync requested for user: ${userId}`);

                // Get last sync time from sync_data table
                const database = require('../sqlite/database');
                const lastSyncQuery = 'SELECT MAX(created_at) as last_sync_time FROM sync_data WHERE user_id = ?';
                const lastSyncResult = database.prepare(lastSyncQuery).get(userId);

                // Convert to Unix timestamp for comparison with user_activities table
                let lastSyncTime;
                if (lastSyncResult?.last_sync_time) {
                    // If we have a sync record, use its timestamp
                    lastSyncTime = lastSyncResult.last_sync_time;
                } else {
                    // For first sync, use a very old timestamp (2025-01-01)
                    lastSyncTime = Math.floor(new Date('2025-01-01T00:00:00.000Z').getTime() / 1000);
                }
                this.syncLogger.info(`📤 Last sync time: ${lastSyncTime} (Unix timestamp)`);

                // Get new activities since last sync (using same format as SyncManager)
                const activitiesQuery = `
                    SELECT id, user_id, username, activity_type, url, title, description, 
                           start_time, end_time, duration, created_at, updated_at
                    FROM user_activities 
                    WHERE user_id = ? AND created_at > ?
                    ORDER BY created_at ASC
                `;
                const newActivities = database.prepare(activitiesQuery).all(userId, lastSyncTime);

                this.syncLogger.info(`📤 Found ${newActivities.length} new activities to sync`);

                if (newActivities.length === 0) {
                    return {
                        success: true,
                        data: {
                            activitiesCount: 0,
                            batchId: null,
                            message: 'No new activities to sync'
                        }
                    };
                }

                // Generate batch ID
                const { v4: uuidv4 } = require('uuid');
                const batchId = uuidv4();

                // Create batch data
                const batchData = {
                    batch_id: batchId,
                    user_id: userId,
                    activities: newActivities,
                    timestamp: new Date().toISOString(),
                    count: newActivities.length
                };

                // Use SyncManager to send the data (this will use the correct format)
                if (this.syncManager) {
                    this.syncLogger.info(`📤 Using SyncManager to send manual sync batch ${batchId} with ${newActivities.length} activities`);
                    await this.syncManager.sendToBClient(batchData);
                } else {
                    // Fallback to direct WebSocket send (old format)
                    const message = {
                        type: 'user_activities_batch',
                        data: batchData
                    };
                    this.syncLogger.info(`📤 Sending manual sync batch ${batchId} with ${newActivities.length} activities (fallback)`);
                    await this.webSocketClient.sendMessage(message);
                }

                // Save to sync_data table using SyncManager (if available) or fallback to direct insert
                if (this.syncManager) {
                    this.syncLogger.info(`📤 Using SyncManager to save manual sync batch ${batchId} to sync_data table`);
                    await this.syncManager.storeSyncData(batchData, 'outgoing', 'success');
                } else {
                    // Fallback to direct database insert
                    const insertQuery = `
                        INSERT INTO sync_data (user_id, batch_id, description, created_at)
                        VALUES (?, ?, ?, ?)
                    `;
                    const description = JSON.stringify({
                        manual_sync: true,
                        activities_count: newActivities.length,
                        timestamp: batchData.timestamp,
                        activities: newActivities
                    });

                    database.prepare(insertQuery).run(
                        userId,
                        batchId,
                        description,
                        Math.floor(Date.now() / 1000) // Unix timestamp
                    );
                    this.syncLogger.info(`📤 Manual sync batch ${batchId} saved to sync_data table (fallback)`);
                }

                return {
                    success: true,
                    data: {
                        activitiesCount: newActivities.length,
                        batchId: batchId,
                        message: `Successfully synced ${newActivities.length} activities`
                    }
                };

            } catch (error) {
                console.error('Error during manual sync:', error);
                return { success: false, error: error.message };
            }
        });

        // Handle user selector modal open request
        this.safeRegisterHandler('open-user-selector', async (event) => {
            try {
                const UserSelectorModal = require('../userSelectorModal');
                const userSelectorModal = new UserSelectorModal(this.clientId);

                // Use the stored main window reference
                if (this.mainWindow && !this.mainWindow.isDestroyed()) {
                    const result = await userSelectorModal.show(this.mainWindow);
                    return result;
                } else {
                    throw new Error('Main window not found');
                }
            } catch (error) {
                console.error('Failed to open user selector modal:', error);
                return { success: false, error: error.message };
            }
        });

        // Handle user switch request
        this.safeRegisterHandler('switch-user', async (event, userId) => {
            try {
                console.log(`🔄 C-Client IPC: Switching to user: ${userId}`);

                const DatabaseManager = require('../sqlite/databaseManager');

                // Use the client_id from IpcHandlers constructor
                let clientId = this.clientId;
                if (clientId) {
                    console.log(`🔧 C-Client IPC: Using client_id for user switch: ${clientId}`);
                } else {
                    console.warn(`⚠️ C-Client IPC: No client_id available for user switch`);
                }

                // Set the selected user as current with client_id (supports multiple clients with different current users)
                const updateResult = DatabaseManager.setCurrentLocalUser(userId, clientId);
                if (!updateResult.success) {
                    throw new Error(`Failed to update user: ${updateResult.error}`);
                }
                console.log(`✅ C-Client IPC: Set user ${userId} as current with client_id: ${clientId}`);

                // Get the new current user info
                const newUser = DatabaseManager.getLocalUserById(userId);
                if (!newUser) {
                    throw new Error('User not found after switch');
                }

                console.log(`✅ C-Client IPC: User switched to: ${newUser.username}`);

                // Debug: Check current user status after switch
                DatabaseManager.debugUserStatus();
                DatabaseManager.debugClientCurrentUser(clientId);

                // Update nodeManager current user reference
                if (this.nodeManager) {
                    try {
                        this.nodeManager.setCurrentUser(newUser);
                        console.log(`🔄 C-Client IPC: Updated NodeManager current user to: ${newUser.username}`);
                    } catch (nodeError) {
                        console.error(`❌ C-Client IPC: Error updating NodeManager current user:`, nodeError);
                    }
                }

                // Update userActivityManager current user reference
                if (this.historyManager && this.historyManager.userActivityManager) {
                    try {
                        this.historyManager.userActivityManager.updateCurrentUser();
                        console.log(`🔄 C-Client IPC: Updated UserActivityManager current user to: ${newUser.username}`);
                    } catch (activityError) {
                        console.error(`❌ C-Client IPC: Error updating UserActivityManager current user:`, activityError);
                    }
                }

                // Disconnect WebSocket connection when switching users
                try {
                    if (this.webSocketClient) {
                        console.log(`🔄 C-Client IPC: Handling WebSocket connection during user switch...`);
                        console.log(`🔍 C-Client IPC: WebSocket client details:`);
                        console.log(`   WebSocket client available: ${!!this.webSocketClient}`);
                        console.log(`   WebSocket connected: ${this.webSocketClient.isConnected}`);
                        console.log(`   WebSocket ready state: ${this.webSocketClient.websocket ? this.webSocketClient.websocket.readyState : 'null'}`);
                        console.log(`   Client ID: ${this.webSocketClient.clientId}`);

                        if (this.webSocketClient.isConnected) {
                            console.log(`🔄 C-Client IPC: Disconnecting and reconnecting WebSocket for user switch...`);
                            // Disconnect and reconnect WebSocket connection when switching users
                            const reconnectResult = await this.webSocketClient.disconnectAndReconnectForUserSwitch();
                            if (reconnectResult) {
                                console.log(`✅ C-Client IPC: WebSocket reconnected successfully for user switch`);
                            } else {
                                console.log(`⚠️ C-Client IPC: WebSocket reconnection failed for user switch, will connect when needed`);
                            }
                        } else {
                            console.log(`ℹ️ C-Client IPC: No active WebSocket connection during user switch`);
                            console.log(`🔌 C-Client IPC: WebSocket will connect when user accesses NSN page`);
                        }
                    } else {
                        console.warn(`⚠️ C-Client IPC: WebSocket client not available`);
                        console.log(`🔍 C-Client IPC: WebSocket client reference: ${this.webSocketClient}`);
                    }
                } catch (wsError) {
                    console.error(`❌ C-Client IPC: Error during WebSocket disconnect:`, wsError);
                    console.error(`🔍 C-Client IPC: Error details:`, wsError.stack);
                    // Don't fail the user switch if WebSocket disconnect fails
                }

                // Close user selector modal immediately (don't wait for any other operations)
                try {
                    // Send message to close any open user selector modal
                    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
                        this.mainWindow.webContents.send('close-user-selector-modal');
                    }
                    console.log('✅ C-Client IPC: User selector modal closed immediately');
                } catch (modalCloseError) {
                    console.error('Error closing user selector modal:', modalCloseError);
                    // Don't fail the user switch if modal close fails
                }

                // Process ALL remaining operations asynchronously (don't block user interaction)
                setImmediate(async () => {
                    try {
                        console.log('🔄 C-Client IPC: [Async] Processing all post-switch operations...');

                        // Clear all sessions and close all existing tabs
                        if (this.tabManager) {
                            try {
                                console.log('🔄 C-Client IPC: [Async] Clearing all sessions and closing all tabs...');
                                console.log('🔍 C-Client IPC: [Async] TabManager available:', !!this.tabManager);
                                console.log('🔍 C-Client IPC: [Async] closeAllTabsAndCreateDefault method available:', typeof this.tabManager.closeAllTabsAndCreateDefault);

                                // Use the unified method that clears sessions and creates default tab
                                if (this.tabManager.closeAllTabsAndCreateDefault) {
                                    console.log('🔧 C-Client IPC: [Async] Using closeAllTabsAndCreateDefault method...');
                                    await this.tabManager.closeAllTabsAndCreateDefault();
                                    console.log('✅ C-Client IPC: [Async] All tabs closed and default tab created');
                                } else {
                                    console.warn('⚠️ C-Client IPC: [Async] closeAllTabsAndCreateDefault method not available');
                                }
                            } catch (viewError) {
                                console.error('❌ C-Client IPC: [Async] Error managing views during user switch:', viewError);
                                console.error('❌ C-Client IPC: [Async] ViewError details:', {
                                    message: viewError.message,
                                    stack: viewError.stack
                                });
                                // Don't fail the user switch if view management fails
                            }
                        } else {
                            console.error('❌ C-Client IPC: [Async] TabManager not available for user switch');
                        }

                        // Show greeting dialog for the switched user (also async)
                        try {
                            const UserRegistrationDialog = require('../userManager/userRegistrationDialog');
                            const greetingDialog = new UserRegistrationDialog(this.clientId);

                            // Use the stored main window reference instead of event.sender
                            if (this.mainWindow && !this.mainWindow.isDestroyed()) {
                                await greetingDialog.showGreeting(this.mainWindow);
                                console.log('✅ C-Client IPC: [Async] Greeting dialog shown for switched user');
                            }
                        } catch (greetingError) {
                            console.error('❌ C-Client IPC: [Async] Error showing greeting dialog:', greetingError);
                            // Don't fail the user switch if greeting fails
                        }
                    } catch (sessionError) {
                        console.error('❌ C-Client IPC: [Async] Failed to process post-switch operations:', sessionError);
                        // Don't fail the user switch if post-switch operations fail
                    }
                });

                return {
                    success: true,
                    user: newUser,
                    message: `Switched to user: ${newUser.username}`
                };
            } catch (error) {
                console.error('Error switching user:', error);
                return { success: false, error: error.message };
            }
        });

        // Handle new user registration request
        this.safeRegisterHandler('open-user-registration', async (event) => {
            try {
                const UserRegistrationDialog = require('../userManager/userRegistrationDialog');
                const userRegistrationDialog = new UserRegistrationDialog(this.clientId);

                // Note: nodeManager.userRegistrationDialog is no longer available after refactoring
                // Dialog management is now handled through direct window management

                // Use the stored main window reference
                if (this.mainWindow && !this.mainWindow.isDestroyed()) {
                    await userRegistrationDialog.show(this.mainWindow);
                    return { success: true };
                } else {
                    throw new Error('Main window not found');
                }
            } catch (error) {
                console.error('Failed to open user registration dialog:', error);
                return { success: false, error: error.message };
            }
        });




    }

    /**
 * Clean up all IPC handlers
 */
    cleanup() {
        console.log('🧹 C-Client IPC: Starting cleanup of all handlers...');

        // Remove all registered handlers
        const handlers = [
            // Tab related
            'create-tab',
            'create-history-tab',
            'switch-tab',
            'close-tab',
            'get-tab-info',

            // History related
            'get-visit-history',
            'get-visit-stats',
            'get-history-data',
            'get-current-user',
            'get-shutdown-history',
            'trigger-shutdown-log',
            'get-active-records',
            'get-history-by-date-range',
            'get-top-domains',
            'export-history-data',
            'record-manual-visit',
            'update-record-title',

            // Navigation related
            'navigate-to',
            'go-back',
            'go-forward',
            'refresh',

            // View management related
            'hide-browser-view',
            'show-browser-view',
            'get-current-view-info',
            'get-all-views-info',

            // Database management related
            'get-database-stats',
            'cleanup-old-data',
            'force-write-data',
            'clear-local-users',
            'exit-app',
            'get-session-info',

            // User registration related
            'submit-username',
            'open-config-modal',
            'open-network-config',
            'open-node-status-modal',
            'get-node-status',
            'open-user-selector',
            'switch-user',
            'open-user-registration',

            // User activities related
            'clear-current-user-activities',

            // Client management related
            'switch-client',
            'switch-to-client',
            'get-current-client',
            'get-client-info',
            'get-url-injection-status',
            'manual-connect-to-bclient',

        ];

        let removedCount = 0;
        handlers.forEach(handler => {
            try {
                ipcMain.removeHandler(handler);
                removedCount++;
            } catch (error) {
                // Warning: Failed to remove handler
                console.warn(`⚠️ C-Client IPC: Failed to remove handler '${handler}':`, error.message);
            }
        });

        console.log(`🧹 C-Client IPC: Cleanup completed, removed ${removedCount}/${handlers.length} handlers`);
    }

    /**
     * Register client management handlers
     */
    registerClientHandlers() {
        // Switch client (show selector modal)
        this.safeRegisterHandler('switch-client', async () => {
            try {
                if (!this.clientManager) {
                    return { success: false, error: 'Client manager not available' };
                }

                // Show client selector modal
                const ClientSelectorModal = require('../clientSelectorModal');
                const clientSelector = new ClientSelectorModal();
                await clientSelector.show(this.mainWindow);

                return { success: true, message: 'Client selector modal opened' };
            } catch (error) {
                console.error('Failed to show client selector:', error);
                return { success: false, error: error.message };
            }
        });

        // Switch to specific client
        this.safeRegisterHandler('switch-to-client', async (_, targetClient) => {
            try {
                if (!this.clientManager) {
                    console.error('C-Client IPC: Client manager not available');
                    return { success: false, error: 'Client manager not available' };
                }

                // Hide browser views when switching away from C-Client
                if (targetClient !== 'c-client' && this.tabManager) {
                    this.tabManager.hideAllViews();
                    console.log('🔄 C-Client IPC: Hidden all browser views for client switch');
                }

                // If switching to B-Client, stop the API server to prevent interference
                if (targetClient === 'b-client') {
                    try {
                        // Get the main app instance to access the API server
                        const mainApp = require('../main');
                        if (mainApp && mainApp.apiServer) {
                            console.log('🔄 C-Client IPC: Switching to B-Client, stopping API server...');
                            mainApp.apiServer.stop();
                            console.log('✅ C-Client IPC: API server stopped successfully');
                        }
                    } catch (apiError) {
                        console.error('❌ C-Client IPC: Error stopping API server:', apiError);
                        // Don't fail the client switch if API server stop fails
                    }
                }

                // If switching back to C-Client, restart the API server
                if (targetClient === 'c-client') {
                    try {
                        // Get the main app instance to restart the API server
                        const mainApp = require('../main');
                        if (mainApp && !mainApp.apiServer) {
                            console.log('🔄 C-Client IPC: Switching back to C-Client, restarting API server...');
                            mainApp.startApiServer();
                            console.log('✅ C-Client IPC: API server restarted successfully');
                        }
                    } catch (apiError) {
                        console.error('❌ C-Client IPC: Error restarting API server:', apiError);
                        // Don't fail the client switch if API server restart fails
                    }
                }

                const result = this.clientManager.switchClient(targetClient);

                // If switching back to C-Client, create default page with URL parameter injection
                if (targetClient === 'c-client' && this.viewManager) {
                    try {
                        console.log('🔄 C-Client IPC: Switching back to C-Client, creating default page...');
                        if (this.tabManager) {
                            await this.tabManager.closeAllTabs();
                            // Create a new default tab
                            await this.tabManager.createTab();
                            console.log('✅ C-Client IPC: Default tab created with URL parameter injection (using TabManager)');
                        } else {
                            await this.tabManager.closeAllTabsAndCreateDefault();
                            console.log('✅ C-Client IPC: Default page created with URL parameter injection (using ViewManager)');
                        }
                    } catch (viewError) {
                        console.error('❌ C-Client IPC: Error creating default page after client switch:', viewError);
                        // Don't fail the client switch if view management fails
                    }
                }

                return result;
            } catch (error) {
                console.error('C-Client IPC: Exception during switch to specific client:', error);
                return { success: false, error: error.message };
            }
        });

        // Manual connect to B-Client (through NSN)
        this.safeRegisterHandler('manual-connect-to-bclient', async () => {
            try {
                console.log('🔗 C-Client IPC: Manual connect to B-Client through NSN requested');

                // C-Client communicates with B-Client through NSN, not directly
                console.log('✅ C-Client IPC: Ready to communicate with B-Client through NSN');
                return { success: true, message: 'C-Client ready to communicate with B-Client through NSN' };
            } catch (error) {
                console.error('❌ C-Client IPC: Exception during manual connect:', error);
                return { success: false, error: error.message };
            }
        });

        // Get current client
        this.safeRegisterHandler('get-current-client', async () => {
            try {
                if (!this.clientManager) {
                    return { success: false, error: 'Client manager not available' };
                }

                return {
                    success: true,
                    client: this.clientManager.currentClient,
                    displayName: this.clientManager.getClientDisplayName(),
                    isEnterprise: this.clientManager.isEnterpriseClient()
                };
            } catch (error) {
                console.error('Failed to get current client:', error);
                return { success: false, error: error.message };
            }
        });

        // Get client info
        this.safeRegisterHandler('get-client-info', async () => {
            try {
                if (!this.clientManager) {
                    return { success: false, error: 'Client manager not available' };
                }

                return {
                    success: true,
                    currentClient: this.clientManager.currentClient,
                    displayName: this.clientManager.getClientDisplayName(),
                    isEnterprise: this.clientManager.isEnterpriseClient(),
                    otherClient: this.clientManager.getOtherClient(),
                    features: this.clientManager.getClientFeatures(),
                    blockedDomains: this.clientManager.getClientBlockedDomains()
                };
            } catch (error) {
                console.error('Failed to get client info:', error);
                return { success: false, error: error.message };
            }
        });

        // Get URL parameter injection status
        this.safeRegisterHandler('get-url-injection-status', async (_, url) => {
            try {
                const { getUrlParameterInjector } = require('../utils/urlParameterInjector');
                const urlInjector = getUrlParameterInjector(this.apiPort);
                const status = urlInjector.getInjectionStatus(url);

                return {
                    success: true,
                    ...status
                };
            } catch (error) {
                console.error('Failed to get URL injection status:', error);
                return { success: false, error: error.message };
            }
        });

        // Process URL with parameter injection
        this.safeRegisterHandler('process-url-with-injection', async (_, url) => {
            try {
                console.log(`🔧 C-Client IPC: Processing URL with injection: ${url}`);
                const { getUrlParameterInjector } = require('../utils/urlParameterInjector');
                const urlInjector = getUrlParameterInjector(this.apiPort);
                const processedUrl = await urlInjector.processUrl(url, this.clientId);
                console.log(`🔧 C-Client IPC: URL processing completed: ${url} -> ${processedUrl}`);
                return processedUrl;
            } catch (error) {
                console.error('Failed to process URL with injection:', error);
                return url; // Return original URL if processing fails
            }
        });

        // Request security code for login in another device
        this.safeRegisterHandler('request-security-code', async () => {
            try {
                // Use dedicated security code logger
                const { getCClientLogger } = require('../utils/logger');
                const securityLogger = getCClientLogger('security_code');

                securityLogger.info('📱 IPC: Request security code for another device login');

                // Get cooperative website URL from config
                const fs = require('fs');
                const path = require('path');
                let cooperativeWebsiteUrl = apiConfig.getNsnUrl(); // Default fallback

                try {
                    const configPath = path.join(__dirname, '..', 'config.json');
                    if (fs.existsSync(configPath)) {
                        const configData = fs.readFileSync(configPath, 'utf8');
                        const config = JSON.parse(configData);

                        if (config.nmp_cooperative_website) {
                            const currentEnv = config.nmp_cooperative_website.current || 'local';
                            const envConfig = config.nmp_cooperative_website[currentEnv];
                            if (envConfig && envConfig.url) {
                                cooperativeWebsiteUrl = envConfig.url;
                                securityLogger.info(`📱 IPC: Using cooperative website URL from config: ${cooperativeWebsiteUrl}`);
                            }
                        }
                    }
                } catch (configError) {
                    securityLogger.warn(`📱 IPC: Failed to load config, using default URL: ${configError.message}`);
                }

                // Step 1: Check if WebSocket is connected
                if (!this.webSocketClient || !this.webSocketClient.isConnected) {
                    securityLogger.warn('📱 IPC: WebSocket not connected');
                    return {
                        success: false,
                        error: 'Please connect to cooperative websites first',
                        cooperativeWebsiteUrl: cooperativeWebsiteUrl
                    };
                }

                // Step 2: Get current user info from WebSocket client
                const currentUser = this.webSocketClient.getCurrentUserInfo();

                if (!currentUser || !currentUser.user_id) {
                    securityLogger.warn('📱 IPC: No current user found');
                    return {
                        success: false,
                        error: 'No user is currently logged in'
                    };
                }

                // Check if user has node hierarchy information
                if (!currentUser.domain_id || !currentUser.cluster_id || !currentUser.channel_id) {
                    securityLogger.warn('📱 IPC: User has no node hierarchy information');
                    securityLogger.warn(`📱 IPC: domain_id: ${currentUser.domain_id}, cluster_id: ${currentUser.cluster_id}, channel_id: ${currentUser.channel_id}`);
                    return {
                        success: false,
                        error: 'Please connect to cooperative websites first',
                        cooperativeWebsiteUrl: cooperativeWebsiteUrl
                    };
                }

                securityLogger.info(`📱 IPC: Requesting security code for user ${currentUser.username}`);
                securityLogger.info(`📱 IPC: User hierarchy - domain: ${currentUser.domain_id}, cluster: ${currentUser.cluster_id}, channel: ${currentUser.channel_id}`);

                // Step 3: Send request to B-Client via WebSocket (include hierarchy info)
                const requestData = {
                    nmp_user_id: currentUser.user_id,
                    nmp_username: currentUser.username,
                    domain_id: currentUser.domain_id,
                    cluster_id: currentUser.cluster_id,
                    channel_id: currentUser.channel_id,
                    timestamp: Date.now()
                };

                // Use WebSocket client's requestSecurityCode method
                return await this.webSocketClient.requestSecurityCode(requestData);

            } catch (error) {
                const { getCClientLogger } = require('../utils/logger');
                const securityLogger = getCClientLogger('security_code');
                securityLogger.error('📱 IPC: Error requesting security code:', error);
                return {
                    success: false,
                    error: error.message
                };
            }
        });

        // Show error dialog with clickable URL
        this.safeRegisterHandler('show-error-dialog', async (event, options) => {
            try {
                const { BrowserWindow } = require('electron');
                const path = require('path');

                const errorDialog = new BrowserWindow({
                    width: 500,
                    height: 350,
                    modal: true,
                    parent: this.mainWindow,
                    resizable: false,
                    minimizable: false,
                    maximizable: false,
                    webPreferences: {
                        nodeIntegration: true,
                        contextIsolation: false
                    }
                });

                const encodedMessage = encodeURIComponent(options.message || 'An error occurred');
                const encodedUrl = encodeURIComponent(options.url || '');
                const dialogPath = path.join(__dirname, '..', 'errorDialog.html');

                await errorDialog.loadFile(dialogPath, {
                    query: {
                        message: encodedMessage,
                        url: encodedUrl
                    }
                });

                errorDialog.removeMenu();

                return { success: true };
            } catch (error) {
                this.logger.error('Error showing error dialog:', error);
                return { success: false, error: error.message };
            }
        });

        // Show security code dialog
        this.safeRegisterHandler('show-security-code-dialog', async (event, options) => {
            try {
                const { BrowserWindow } = require('electron');
                const path = require('path');

                const codeDialog = new BrowserWindow({
                    width: 480,
                    height: 420,
                    modal: false, // Set to false to avoid blocking main window
                    parent: this.mainWindow,
                    resizable: false,
                    minimizable: false,
                    maximizable: false,
                    alwaysOnTop: false, // Only stay on top of parent window, not other apps
                    webPreferences: {
                        nodeIntegration: true,
                        contextIsolation: false
                    }
                });

                const encodedCode = encodeURIComponent(options.code || 'ERROR');
                const dialogPath = path.join(__dirname, '..', 'securityCodeDialog.html');

                await codeDialog.loadFile(dialogPath, {
                    query: {
                        code: encodedCode
                    }
                });

                codeDialog.removeMenu();

                // Auto-close when main window closes
                if (this.mainWindow) {
                    const mainWindowCloseHandler = () => {
                        if (codeDialog && !codeDialog.isDestroyed()) {
                            console.log('🔐 Main window closing, auto-closing security code dialog');
                            codeDialog.close();
                        }
                    };

                    this.mainWindow.once('close', mainWindowCloseHandler);

                    // Clean up listener when dialog is closed
                    codeDialog.once('closed', () => {
                        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
                            this.mainWindow.removeListener('close', mainWindowCloseHandler);
                        }
                    });
                }

                return { success: true };
            } catch (error) {
                this.logger.error('Error showing security code dialog:', error);
                return { success: false, error: error.message };
            }
        });

        // Show cluster verification result dialog
        this.safeRegisterHandler('show-cluster-verification-dialog', async (event, options) => {
            try {
                const { BrowserWindow } = require('electron');
                const path = require('path');

                this.logger.info('🔍 C-Client IPC: Showing cluster verification dialog');
                this.logger.info('🔍 Verification result:', options.result);

                const verificationDialog = new BrowserWindow({
                    width: 520,
                    height: 480,
                    modal: false,
                    parent: this.mainWindow,
                    resizable: false,
                    minimizable: false,
                    maximizable: false,
                    alwaysOnTop: false,
                    webPreferences: {
                        nodeIntegration: true,
                        contextIsolation: false
                    }
                });

                const encodedResult = encodeURIComponent(JSON.stringify(options.result || {}));
                const dialogPath = path.join(__dirname, '..', 'clusterVerificationDialog.html');

                await verificationDialog.loadFile(dialogPath, {
                    query: {
                        result: encodedResult
                    }
                });

                verificationDialog.removeMenu();

                // Auto-close when main window closes
                if (this.mainWindow) {
                    const mainWindowCloseHandler = () => {
                        if (verificationDialog && !verificationDialog.isDestroyed()) {
                            this.logger.info('🔍 Main window closing, auto-closing verification dialog');
                            verificationDialog.close();
                        }
                    };

                    this.mainWindow.once('close', mainWindowCloseHandler);

                    // Clean up listener when dialog is closed
                    verificationDialog.once('closed', () => {
                        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
                            this.mainWindow.removeListener('close', mainWindowCloseHandler);
                        }
                    });
                }

                this.logger.info('✅ C-Client IPC: Cluster verification dialog shown successfully');
                return { success: true };
            } catch (error) {
                this.logger.error('❌ C-Client IPC: Error showing cluster verification dialog:', error);
                return { success: false, error: error.message };
            }
        });
    }

    /**
     * Register network configuration handlers
     */
    registerNetworkConfigHandlers() {
        // Get current network configuration
        ipcMain.handle('get-network-config', async () => {
            try {
                const config = this.networkConfigManager.getConfigSummary();
                console.log('🌐 IPC: Network config requested:', config);
                return { success: true, config: config };
            } catch (error) {
                console.error('Failed to get network configuration:', error);
                return { success: false, error: error.message };
            }
        });

        // Switch to local IP mode
        ipcMain.handle('switch-to-local-mode', async () => {
            try {
                console.log('🔄 IPC: Switching to local IP mode...');
                const result = await this.networkConfigManager.switchToLocalMode();
                console.log('🌐 IPC: Local mode switch result:', result);
                return result;
            } catch (error) {
                console.error('Failed to switch to local mode:', error);
                return { success: false, error: error.message };
            }
        });

        // Switch to public IP mode
        ipcMain.handle('switch-to-public-mode', async () => {
            try {
                console.log('🔄 IPC: Switching to public IP mode...');
                const result = await this.networkConfigManager.switchToPublicMode();
                console.log('🌐 IPC: Public mode switch result:', result);
                return result;
            } catch (error) {
                console.error('Failed to switch to public mode:', error);
                return { success: false, error: error.message };
            }
        });

        // Update IP addresses
        ipcMain.handle('update-ip-addresses', async (event, { localIp, publicIp }) => {
            try {
                console.log(`🔄 IPC: Updating IP addresses - Local: ${localIp}, Public: ${publicIp}`);
                const success = this.networkConfigManager.updateIpAddresses(localIp, publicIp);
                return { success: success };
            } catch (error) {
                console.error('Failed to update IP addresses:', error);
                return { success: false, error: error.message };
            }
        });
    }

    /**
     * Register NSN response handlers
     */
    registerNSNResponseHandlers() {
        // Handle NSN response processing
        this.safeRegisterHandler('process-nsn-response', async (event, response) => {
            try {
                console.log('🔍 C-Client IPC: Processing NSN response:', response);

                if (response.action === 'connect_websocket') {
                    console.log('🔌 C-Client IPC: Received WebSocket connection request from NSN');
                    console.log(`   WebSocket URL: ${response.websocket_url}`);
                    console.log(`   User ID: ${response.user_id}`);
                    console.log(`   Message: ${response.message}`);

                    if (this.webSocketClient && response.websocket_url) {
                        // Connect to NSN-provided WebSocket server
                        const success = await this.webSocketClient.connectToNSNProvidedWebSocket(response.websocket_url);
                        if (success) {
                            console.log('✅ C-Client IPC: Successfully connected to NSN-provided WebSocket');
                            return { success: true, message: 'WebSocket connected successfully' };
                        } else {
                            console.error('❌ C-Client IPC: Failed to connect to NSN-provided WebSocket');
                            return { success: false, error: 'Failed to connect to WebSocket' };
                        }
                    } else {
                        console.error('❌ C-Client IPC: Missing WebSocket client or URL');
                        return { success: false, error: 'Missing WebSocket client or URL' };
                    }
                } else if (response.action === 'auto_login') {
                    console.log('🔐 C-Client IPC: Received auto-login request from NSN');
                    console.log(`   User ID: ${response.user_id}`);
                    console.log(`   Session Data: ${JSON.stringify(response.session_data)}`);

                    // Handle auto-login with session data
                    // TODO: Implement auto-login logic here
                    return { success: true, message: 'Auto-login request received' };
                } else {
                    console.log('ℹ️ C-Client IPC: Unknown NSN response action:', response.action);
                    return { success: false, error: `Unknown action: ${response.action}` };
                }
            } catch (error) {
                console.error('❌ C-Client IPC: Error processing NSN response:', error);
                return { success: false, error: error.message };
            }
        });
    }

    /**
     * Register new device login handlers
     */
    registerNewDeviceLoginHandlers() {
        console.log('🔐 C-Client IPC: Registering new device login handlers...');

        // Listen for new device login complete event from WebSocket client
        // IMPORTANT: Use arrow function to preserve 'this' context
        const self = this; // Capture 'this' reference
        ipcMain.on('new-device-login-complete', async (event, data) => {
            try {
                const { getCClientLogger } = require('../utils/logger');
                const securityLogger = getCClientLogger('security_code');

                securityLogger.info('🔐 [IPC Handlers] ===== NEW DEVICE LOGIN COMPLETE EVENT =====');
                securityLogger.info('🔐 [IPC Handlers] Event data received');
                securityLogger.info('🔐 [IPC Handlers] user_id:', data.user_id);
                securityLogger.info('🔐 [IPC Handlers] username:', data.username);
                securityLogger.info('🔐 [IPC Handlers] clientId from self:', self.clientId);
                securityLogger.info('🔐 [IPC Handlers] tabManager available:', !!self.tabManager);

                const { user_id, username } = data;

                if (!user_id || !username) {
                    securityLogger.error('❌ [IPC Handlers] Missing user_id or username in event data');
                    return;
                }

                if (!self.clientId) {
                    securityLogger.error('❌ [IPC Handlers] this.clientId is undefined! Cannot proceed.');
                    return;
                }

                securityLogger.info('🔐 [IPC Handlers] Performing user switch operation...');
                securityLogger.info(`🔐 [IPC Handlers] Switching to user: ${username} (${user_id})`);

                // Step 1: Update current user in database using DatabaseManager
                securityLogger.info('🔐 [IPC Handlers] Step 1: Updating current user in database...');
                try {
                    const DatabaseManager = require('../sqlite/databaseManager');
                    const db = require('../sqlite/database');

                    // Remove current client from all users
                    securityLogger.info(`🔐 [IPC Handlers] Removing client ${self.clientId} from all users...`);
                    DatabaseManager.removeClientFromCurrentUsers(self.clientId);

                    // Assign current client to the new user (using existing method)
                    securityLogger.info(`🔐 [IPC Handlers] Assigning client ${self.clientId} to user ${username}...`);
                    DatabaseManager.assignUserToClient(user_id, self.clientId);

                    securityLogger.info('✅ [IPC Handlers] Current user updated in database');

                    // Delete only security code temporary users (8-char alphanumeric usernames)
                    // Regular users (like test2) are preserved even if they have no clients
                    securityLogger.info('🔐 [IPC Handlers] Cleaning up security code temporary users...');
                    const allUsers = db.prepare('SELECT user_id, username, client_ids FROM local_users').all();

                    // Pattern to match security code usernames (8 alphanumeric chars)
                    const securityCodePattern = /^[A-Za-z0-9]{8}$/;

                    let deletedCount = 0;
                    for (const user of allUsers) {
                        if (user.user_id !== user_id) {
                            // Only delete if username looks like a security code
                            if (securityCodePattern.test(user.username)) {
                                securityLogger.info(`🔐 [IPC Handlers] Deleting security code temporary user: ${user.username} (${user.user_id})`);
                                db.prepare('DELETE FROM local_users WHERE user_id = ?').run(user.user_id);
                                deletedCount++;
                            } else {
                                securityLogger.info(`🔐 [IPC Handlers] Preserving regular user: ${user.username} (${user.user_id})`);
                            }
                        }
                    }

                    securityLogger.info(`✅ [IPC Handlers] Deleted ${deletedCount} security code temporary user(s)`);

                } catch (dbError) {
                    securityLogger.error('❌ [IPC Handlers] Error updating database:', dbError);
                    securityLogger.error('❌ [IPC Handlers] Error message:', dbError.message);
                    securityLogger.error('❌ [IPC Handlers] Error stack:', dbError.stack);
                    securityLogger.error('❌ [IPC Handlers] Continuing with user switch...');
                }

                // Step 2: Disconnect WebSocket to notify B-side
                securityLogger.info('🔐 [IPC Handlers] Step 2: Disconnecting WebSocket...');
                if (self.webSocketClient) {
                    securityLogger.info('🔐 [IPC Handlers] WebSocket client available, disconnecting...');
                    self.webSocketClient.disconnect();
                    securityLogger.info('✅ [IPC Handlers] WebSocket disconnected');
                } else {
                    securityLogger.warn('⚠️ [IPC Handlers] WebSocket client not available');
                }

                // Step 3: Clear all sessions
                securityLogger.info('🔐 [IPC Handlers] Step 3: Clearing all sessions...');
                if (self.tabManager) {
                    await self.tabManager.clearAllSessions();
                    securityLogger.info('✅ [IPC Handlers] All sessions cleared');
                } else {
                    securityLogger.warn('⚠️ [IPC Handlers] TabManager not available, skipping session clear');
                }

                // Step 4: Close all tabs and create new default tab
                securityLogger.info('🔐 [IPC Handlers] Step 4: Closing all tabs and creating new default tab...');
                if (self.tabManager) {
                    const allTabs = self.tabManager.getAllTabs();
                    securityLogger.info(`🔐 [IPC Handlers] Found ${allTabs.length} tabs to close`);

                    for (const tab of allTabs) {
                        securityLogger.info(`🔐 [IPC Handlers] Closing tab ${tab.id}...`);
                        await self.tabManager.closeTab(tab.id);
                    }

                    securityLogger.info('✅ [IPC Handlers] All tabs closed');

                    // Create new default tab
                    const defaultUrl = 'https://www.google.com';
                    const newTab = await self.tabManager.createTab(defaultUrl);
                    securityLogger.info(`✅ [IPC Handlers] New default tab created: ${newTab.id}`);
                } else {
                    securityLogger.warn('⚠️ [IPC Handlers] TabManager not available, skipping tab operations');
                }

                // Step 5: Reconnect WebSocket with new user info
                securityLogger.info('🔐 [IPC Handlers] Step 5: Reconnecting WebSocket with new user...');
                if (self.webSocketClient) {
                    // WebSocket will auto-reconnect and register with new user info
                    securityLogger.info('🔐 [IPC Handlers] WebSocket will auto-reconnect with new user info');
                } else {
                    securityLogger.warn('⚠️ [IPC Handlers] WebSocket client not available');
                }

                securityLogger.info('✅ [IPC Handlers] ===== NEW DEVICE LOGIN COMPLETE =====');
                securityLogger.info('✅ [IPC Handlers] User switch operation completed successfully');

            } catch (error) {
                const { getCClientLogger } = require('../utils/logger');
                const securityLogger = getCClientLogger('security_code');
                securityLogger.error('❌ [IPC Handlers] Error handling new device login complete');
                securityLogger.error('❌ [IPC Handlers] Error type:', typeof error);
                securityLogger.error('❌ [IPC Handlers] Error:', error);
                if (error) {
                    securityLogger.error('❌ [IPC Handlers] Error message:', error.message || 'No message');
                    securityLogger.error('❌ [IPC Handlers] Error name:', error.name || 'No name');
                    securityLogger.error('❌ [IPC Handlers] Error code:', error.code || 'No code');
                    securityLogger.error('❌ [IPC Handlers] Error stack:', error.stack || 'No stack');

                    // Try to get more details
                    try {
                        securityLogger.error('❌ [IPC Handlers] Error keys:', Object.keys(error));
                        securityLogger.error('❌ [IPC Handlers] Error string:', String(error));
                    } catch (e) {
                        securityLogger.error('❌ [IPC Handlers] Cannot get error details');
                    }
                }
            }
        });

        console.log('✅ C-Client IPC: New device login handlers registered');
    }

    /**
     * Process NSN response (public method for direct calls)
     * @param {Object} response - NSN response data
     * @returns {Object} Result object
     */
    async processNSNResponse(response) {
        try {
            console.log('🔍 C-Client IPC: Processing NSN response (direct call):', response);

            if (response.action === 'connect_websocket') {
                console.log('🔌 C-Client IPC: Received WebSocket connection request from NSN');
                console.log(`   WebSocket URL: ${response.websocket_url}`);
                console.log(`   User ID: ${response.user_id}`);
                console.log(`   Message: ${response.message}`);

                if (this.webSocketClient && response.websocket_url) {
                    // Connect to NSN-provided WebSocket server
                    const success = await this.webSocketClient.connectToNSNProvidedWebSocket(response.websocket_url);
                    if (success) {
                        console.log('✅ C-Client IPC: Successfully connected to NSN-provided WebSocket');
                        return { success: true, message: 'WebSocket connected successfully' };
                    } else {
                        console.error('❌ C-Client IPC: Failed to connect to NSN-provided WebSocket');
                        return { success: false, error: 'Failed to connect to WebSocket' };
                    }
                } else {
                    console.error('❌ C-Client IPC: Missing WebSocket client or URL');
                    return { success: false, error: 'Missing WebSocket client or URL' };
                }
            } else if (response.action === 'auto_login') {
                console.log('🔐 C-Client IPC: Received auto-login request from NSN');
                console.log(`   User ID: ${response.user_id}`);
                console.log(`   Username: ${response.username}`);
                // Auto-login logic would go here
                return { success: true, message: 'Auto-login processed' };
            } else {
                console.log(`🔍 C-Client IPC: Unknown NSN response action: ${response.action}`);
                return { success: false, error: `Unknown action: ${response.action}` };
            }
        } catch (error) {
            console.error('❌ C-Client IPC: Error processing NSN response (direct call):', error);
            return { success: false, error: error.message };
        }
    }
}

module.exports = IpcHandlers;