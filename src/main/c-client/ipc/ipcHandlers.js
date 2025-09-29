const { ipcMain } = require('electron');
const NetworkConfigManager = require('../config/networkConfigManager');

// IPC handlers
class IpcHandlers {
    constructor(viewManager, historyManager, mainWindow = null, clientManager = null, nodeManager = null, startupValidator = null, apiPort = null, webSocketClient = null) {
        this.viewManager = viewManager;
        this.historyManager = historyManager;
        this.mainWindow = mainWindow; // Store reference to main window
        this.clientManager = clientManager; // Store reference to client manager
        this.nodeManager = nodeManager; // Store reference to node manager
        this.startupValidator = startupValidator; // Store reference to startup validator
        this.apiPort = apiPort; // Store API port for C-Client API calls
        this.webSocketClient = webSocketClient; // Store reference to WebSocket client
        this.networkConfigManager = new NetworkConfigManager(); // Network configuration manager
        this.registerHandlers();
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
            if (this.viewManager) {
                const nsnTab = this.viewManager.findNSNTab();
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
                        this.viewManager.createViewWithCookie(nsn_url, cookie, username, nsn_url);
                    } else {
                        // Fallback to configuration (should be avoided in multi-tenant scenarios)
                        const apiConfig = require('../config/apiConfig');
                        const nsnConfig = apiConfig.getCurrentNsnWebsite();
                        console.warn(`🔄 C-Client IPC: No NSN URL from B-Client, using configuration: ${nsnConfig.url}`);
                        this.viewManager.createViewWithCookie(nsnConfig.url, cookie, username);
                    }
                }
            } else {
                console.error(`❌ C-Client IPC: ViewManager not available for reload with cookie`);
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
        // Create new tab
        this.safeRegisterHandler('create-tab', async (_, url) => {
            try {
                console.log(`\n📝 C-Client IPC: Creating new tab with URL: ${url}`);

                // Get global URL parameter injector instance
                const { getUrlParameterInjector } = require('../utils/urlParameterInjector');
                const urlInjector = getUrlParameterInjector(this.apiPort);

                // Process URL and inject parameters if needed
                console.log('🔧 C-Client IPC: Processing URL for parameter injection...');
                const processedUrl = await urlInjector.processUrl(url);

                console.log(`🔧 C-Client IPC: URL processing completed:`);
                console.log(`   Input URL:  ${url}`);
                console.log(`   Output URL: ${processedUrl}`);

                // Check if viewManager is available
                console.log(`🔍 C-Client IPC: ViewManager status: ${!!this.viewManager}`);
                console.log(`🔍 C-Client IPC: ViewManager type: ${typeof this.viewManager}`);
                if (this.viewManager) {
                    console.log(`🔍 C-Client IPC: ViewManager methods: ${Object.getOwnPropertyNames(Object.getPrototypeOf(this.viewManager))}`);
                }

                if (!this.viewManager) {
                    console.error('❌ C-Client IPC: ViewManager not available for creating browser view');
                    return { success: false, error: 'ViewManager not available' };
                }

                const view = await this.viewManager.createBrowserView(processedUrl);
                if (view && url && this.historyManager) {
                    // Record visit start (use original URL for history)
                    const viewId = view.id || Date.now(); // Ensure viewId exists
                    const record = await this.historyManager.recordVisit(url, viewId);
                    if (record) {
                        console.log(`📊 C-Client IPC: Visit recorded for view ${viewId}`);
                    }
                }

                console.log(`✅ C-Client IPC: Tab created successfully with view ID: ${view?.id}`);
                return view;
            } catch (error) {
                console.error('❌ C-Client IPC: Failed to create tab:', error);
                return null;
            }
        });



        // Create history tab
        this.safeRegisterHandler('create-history-tab', async () => {
            try {
                return await this.viewManager.createHistoryView();
            } catch (error) {
                console.error('Failed to create history tab:', error);
                return null;
            }
        });



        // Switch tab
        this.safeRegisterHandler('switch-tab', (_, id) => {
            try {
                const result = this.viewManager.switchTab(id);

                // When switching tabs, end previous tab's active records
                if (result && this.historyManager) {
                    const now = Date.now();
                    // Get all views, end active records except current view
                    const allViews = this.viewManager.getAllViews();
                    Object.keys(allViews).forEach(viewId => {
                        if (parseInt(viewId) !== parseInt(id)) {
                            this.historyManager.finishActiveRecords(parseInt(viewId), now);
                        }
                    });
                }

                return result;
            } catch (error) {
                console.error('Failed to switch tab:', error);
                return false;
            }
        });

        // Close tab
        this.safeRegisterHandler('close-tab', (_, id) => {
            try {
                // End this tab's active records
                if (this.historyManager) {
                    this.historyManager.finishActiveRecords(id, Date.now());
                }

                return this.viewManager.closeTab(id);
            } catch (error) {
                console.error('Failed to close tab:', error);
                return null;
            }
        });

        // Get tab info
        this.safeRegisterHandler('get-tab-info', (_, id) => {
            try {
                return this.viewManager.getTabInfo(id);
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
                const processedUrl = await urlInjector.processUrl(url);

                console.log(`🔧 C-Client IPC: URL processing completed:`);
                console.log(`   Input URL:  ${url}`);
                console.log(`   Output URL: ${processedUrl}`);

                await this.viewManager.navigateTo(processedUrl);

                // Record new visit (use original URL for history)
                if (url && this.historyManager) {
                    const currentView = this.viewManager.getCurrentView();
                    if (currentView) {
                        const viewId = currentView.id || Date.now();
                        const record = await this.historyManager.recordVisit(url, viewId);
                        console.log(`📊 C-Client IPC: Navigation visit recorded for view ${viewId}`);

                        // Record navigation activity
                        this.historyManager.recordNavigationActivity(url, 'Loading...', 'navigate');
                    }
                }

                console.log(`✅ C-Client IPC: Navigation completed successfully`);
                return true;
            } catch (error) {
                console.error('❌ C-Client IPC: Failed to navigate to URL:', error);
                return false;
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
                await this.viewManager.navigateTo(navigationData.url);

                // Record new visit
                if (navigationData.url && this.historyManager) {
                    const currentView = this.viewManager.getCurrentView();
                    if (currentView) {
                        const viewId = currentView.id || Date.now();
                        const record = await this.historyManager.recordVisit(navigationData.url, viewId);
                        console.log(`📊 C-Client IPC: NSN navigation visit recorded for view ${viewId}`);
                    }
                }

                console.log(`✅ C-Client IPC: NSN navigation completed successfully`);
                return true;
            } catch (error) {
                console.error('❌ C-Client IPC: Failed to navigate to NSN:', error);
                return false;
            }
        });

        // Go back
        this.safeRegisterHandler('go-back', async () => {
            try {
                const result = this.viewManager.goBack();

                // Record back navigation
                if (result && this.historyManager) {
                    const currentView = this.viewManager.getCurrentView();
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

                return result;
            } catch (error) {
                console.error('Failed to go back:', error);
                return false;
            }
        });

        // Go forward
        this.safeRegisterHandler('go-forward', async () => {
            try {
                const result = this.viewManager.goForward();

                // Record forward navigation
                if (result && this.historyManager) {
                    const currentView = this.viewManager.getCurrentView();
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

                return result;
            } catch (error) {
                console.error('Failed to go forward:', error);
                return false;
            }
        });

        // Refresh page
        this.safeRegisterHandler('refresh', async () => {
            try {
                const result = this.viewManager.refresh();

                // Record page refresh
                if (result && this.historyManager) {
                    const currentView = this.viewManager.getCurrentView();
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

                return result;
            } catch (error) {
                console.error('Failed to refresh page:', error);
                return false;
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
                return this.viewManager.hideBrowserView();
            } catch (error) {
                console.error('Failed to hide browser view:', error);
                return false;
            }
        });

        // Show current BrowserView
        this.safeRegisterHandler('show-browser-view', () => {
            try {
                return this.viewManager.showBrowserView();
            } catch (error) {
                console.error('Failed to show browser view:', error);
                return false;
            }
        });

        // Get current view information
        this.safeRegisterHandler('get-current-view-info', () => {
            try {
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
                return null;
            } catch (error) {
                console.error('Failed to get current view info:', error);
                return null;
            }
        });

        // Get all views information
        this.safeRegisterHandler('get-all-views-info', () => {
            try {
                const allViews = this.viewManager.getAllViews();
                const viewsInfo = {};

                Object.entries(allViews).forEach(([viewId, view]) => {
                    if (view && view.webContents) {
                        viewsInfo[viewId] = {
                            id: viewId,
                            url: view.webContents.getURL(),
                            title: view.webContents.getTitle(),
                            canGoBack: view.webContents.canGoBack(),
                            canGoForward: view.webContents.canGoForward()
                        };
                    }
                });

                return viewsInfo;
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
                const result = DatabaseManager.clearCurrentUserActivities();
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

                // First, set all existing users to not current
                const db = require('../sqlite/database');
                db.prepare('UPDATE local_users SET is_current = 0').run();

                // Then insert the new user as current using DatabaseManager (which handles node_id consistency)
                const result = DatabaseManager.addLocalUser(
                    userData.userId,
                    userData.username,
                    userData.domainId,
                    userData.clusterId,
                    userData.channelId,
                    null, // nodeId will be handled by addLocalUser method
                    userData.ipAddress,
                    1 // isCurrent = 1
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
                                console.log(`🔄 C-Client IPC: Re-registering user with updated info after registration...`);
                                // Re-register instead of disconnecting to maintain session continuity
                                const reRegisterResult = await this.webSocketClient.reRegisterUser();
                                if (reRegisterResult) {
                                    console.log(`✅ C-Client IPC: Successfully re-registered after user registration`);
                                } else {
                                    console.warn(`⚠️ C-Client IPC: Failed to re-register after user registration`);
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
                        // Also try the current nodeManager as fallback
                        else if (this.nodeManager && this.nodeManager.userRegistrationDialog) {
                            console.log('🔄 C-Client IPC: Closing dialog from current nodeManager');
                            this.nodeManager.userRegistrationDialog.closeFromExternalRequest();
                        }

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
                    if (this.viewManager) {
                        try {
                            console.log('🔄 C-Client IPC: Clearing all sessions and closing all tabs after user registration...');
                            console.log('🔍 C-Client IPC: ViewManager available:', !!this.viewManager);
                            console.log('🔍 C-Client IPC: clearAllSessions method available:', typeof this.viewManager.clearAllSessions);
                            console.log('🔍 C-Client IPC: closeAllTabsAndCreateDefault method available:', typeof this.viewManager.closeAllTabsAndCreateDefault);

                            // First, clear all sessions (including persistent partitions) - same as user switch
                            console.log('🧹 C-Client IPC: Clearing all sessions including persistent partitions...');
                            await this.viewManager.clearAllSessions();
                            console.log('✅ C-Client IPC: All sessions cleared after user registration');

                            // Then close all tabs and create new default page
                            await this.viewManager.closeAllTabsAndCreateDefault();
                            console.log('✅ C-Client IPC: All tabs closed and new default page created after registration');
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
                        const userRegistrationDialog = new UserRegistrationDialog();

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
            // Close the registration dialog
            if (this.nodeManager && this.nodeManager.userRegistrationDialog) {
                this.nodeManager.userRegistrationDialog.closeFromExternalRequest();

                // After closing registration dialog, show greeting dialog
                try {
                    const UserRegistrationDialog = require('../userManager/userRegistrationDialog');
                    const userRegistrationDialog = new UserRegistrationDialog();

                    // Use the stored main window reference
                    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
                        await userRegistrationDialog.showGreeting(this.mainWindow);
                    } else {
                        console.warn('Main window not available for greeting dialog');
                    }
                } catch (greetingError) {
                    console.error('Error showing greeting dialog after registration:', greetingError);
                }
            } else {
                console.warn('NodeManager or userRegistrationDialog not available');
            }
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

        // Handle user selector modal open request
        this.safeRegisterHandler('open-user-selector', async (event) => {
            try {
                const UserSelectorModal = require('../userSelectorModal');
                const userSelectorModal = new UserSelectorModal();

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

                // First, set all users to not current
                const clearResult = DatabaseManager.clearAllCurrentUsers();
                if (!clearResult.success) {
                    throw new Error(`Failed to clear current users: ${clearResult.error}`);
                }

                // Then set the selected user as current
                const updateResult = DatabaseManager.updateLocalUserWithCurrent(userId, null, null, null, null, null, 1);
                if (!updateResult.success) {
                    throw new Error(`Failed to update user: ${updateResult.error}`);
                }

                // Get the new current user info
                const newUser = DatabaseManager.getLocalUserById(userId);
                if (!newUser) {
                    throw new Error('User not found after switch');
                }

                console.log(`✅ C-Client IPC: User switched to: ${newUser.username}`);

                // Re-register with WebSocket service to ensure accurate counting (instead of disconnecting)
                try {
                    if (this.webSocketClient) {
                        console.log(`🔄 C-Client IPC: Handling WebSocket connection during user switch...`);
                        console.log(`🔍 C-Client IPC: WebSocket client details:`);
                        console.log(`   WebSocket client available: ${!!this.webSocketClient}`);
                        console.log(`   WebSocket connected: ${this.webSocketClient.isConnected}`);
                        console.log(`   WebSocket ready state: ${this.webSocketClient.websocket ? this.webSocketClient.websocket.readyState : 'null'}`);
                        console.log(`   Client ID: ${this.webSocketClient.clientId}`);

                        if (this.webSocketClient.isConnected) {
                            console.log(`🔄 C-Client IPC: Re-registering user with updated info after user switch...`);
                            // Re-register instead of disconnecting to maintain session continuity
                            const reRegisterResult = await this.webSocketClient.reRegisterUser();
                            if (reRegisterResult) {
                                console.log(`✅ C-Client IPC: Successfully re-registered after user switch`);
                            } else {
                                console.warn(`⚠️ C-Client IPC: Failed to re-register after user switch`);
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

                // Clear all sessions and close all existing tabs before creating new default page
                if (this.viewManager) {
                    try {
                        console.log('🔄 C-Client IPC: Clearing all sessions and closing all tabs...');
                        console.log('🔍 C-Client IPC: ViewManager available:', !!this.viewManager);
                        console.log('🔍 C-Client IPC: clearAllSessions method available:', typeof this.viewManager.clearAllSessions);
                        console.log('🔍 C-Client IPC: closeAllTabsAndCreateDefault method available:', typeof this.viewManager.closeAllTabsAndCreateDefault);

                        // First, clear all sessions (including persistent partitions)
                        console.log('🧹 C-Client IPC: Clearing all sessions including persistent partitions...');
                        await this.viewManager.clearAllSessions();
                        console.log('✅ C-Client IPC: All sessions cleared');

                        // Then close all tabs and create new default page
                        await this.viewManager.closeAllTabsAndCreateDefault();
                        console.log('✅ C-Client IPC: All tabs closed and new default page created');
                    } catch (viewError) {
                        console.error('❌ C-Client IPC: Error managing views during user switch:', viewError);
                        console.error('❌ C-Client IPC: ViewError details:', {
                            message: viewError.message,
                            stack: viewError.stack
                        });
                        // Don't fail the user switch if view management fails
                    }
                } else {
                    console.error('❌ C-Client IPC: ViewManager not available for user switch');
                }

                // Close user selector modal if it exists
                try {
                    // Send message to close any open user selector modal
                    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
                        this.mainWindow.webContents.send('close-user-selector-modal');
                    }
                } catch (modalCloseError) {
                    console.error('Error closing user selector modal:', modalCloseError);
                    // Don't fail the user switch if modal close fails
                }

                // Show greeting dialog for the switched user
                try {
                    const UserRegistrationDialog = require('../userManager/userRegistrationDialog');
                    const greetingDialog = new UserRegistrationDialog();

                    // Use the stored main window reference instead of event.sender
                    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
                        await greetingDialog.showGreeting(this.mainWindow);
                    } else {
                        console.warn('Main window not available for greeting dialog');
                    }
                } catch (greetingError) {
                    console.error('Error showing greeting dialog:', greetingError);
                    // Don't fail the user switch if greeting fails
                }

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
                const userRegistrationDialog = new UserRegistrationDialog();

                // Store the dialog instance in nodeManager so it can be closed later
                if (this.nodeManager) {
                    this.nodeManager.userRegistrationDialog = userRegistrationDialog;
                }

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
                if (targetClient !== 'c-client' && this.viewManager) {
                    this.viewManager.hideAllViews();
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
                        await this.viewManager.closeAllTabsAndCreateDefault();
                        console.log('✅ C-Client IPC: Default page created with URL parameter injection');
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
}

module.exports = IpcHandlers;