const { ipcMain } = require('electron');

// IPC handlers
class IpcHandlers {
    constructor(viewManager, historyManager, mainWindow = null, clientManager = null, nodeManager = null) {
        this.viewManager = viewManager;
        this.historyManager = historyManager;
        this.mainWindow = mainWindow; // Store reference to main window
        this.clientManager = clientManager; // Store reference to client manager
        this.nodeManager = nodeManager; // Store reference to node manager
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
    }

    /**
     * Register tab-related handlers
     */
    registerTabHandlers() {
        // Create new tab
        ipcMain.handle('create-tab', async (_, url) => {
            try {
                const view = await this.viewManager.createBrowserView(url);
                if (view && url && this.historyManager) {
                    // Record visit start
                    const viewId = view.id || Date.now(); // Ensure viewId exists
                    const record = this.historyManager.recordVisit(url, viewId);
                    if (record) {
                    }
                }
                return view;
            } catch (error) {
                console.error('Failed to create tab:', error);
                return null;
            }
        });



        // Create history tab
        ipcMain.handle('create-history-tab', async () => {
            try {
                return await this.viewManager.createHistoryView();
            } catch (error) {
                console.error('Failed to create history tab:', error);
                return null;
            }
        });



        // Switch tab
        ipcMain.handle('switch-tab', (_, id) => {
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
        ipcMain.handle('close-tab', (_, id) => {
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
        ipcMain.handle('get-tab-info', (_, id) => {
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
        ipcMain.handle('get-visit-history', (_, limit) => {
            try {
                return this.historyManager.getHistory(limit);
            } catch (error) {
                console.error('Failed to get visit history:', error);
                return [];
            }
        });

        // Get visit statistics
        ipcMain.handle('get-visit-stats', () => {
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
        ipcMain.handle('get-history-data', (_, limit) => {
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
        ipcMain.handle('get-current-user', () => {
            try {
                return this.historyManager.userActivityManager.getCurrentUser();
            } catch (error) {
                console.error('Failed to get current user:', error);
                return null;
            }
        });

        // Get shutdown history
        ipcMain.handle('get-shutdown-history', () => {
            try {
                return this.historyManager.getShutdownHistory();
            } catch (error) {
                console.error('Failed to get shutdown history:', error);
                return [];
            }
        });

        // Manually trigger shutdown log (for testing)
        ipcMain.handle('trigger-shutdown-log', (_, reason) => {
            try {
                this.historyManager.logShutdown(reason || 'manual');
                return true;
            } catch (error) {
                console.error('Failed to trigger shutdown log:', error);
                return false;
            }
        });

        // Get active records information
        ipcMain.handle('get-active-records', () => {
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
        ipcMain.handle('get-history-by-date-range', (_, startDate, endDate) => {
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
        ipcMain.handle('get-top-domains', (_, limit) => {
            try {
                return this.historyManager.getTopDomains(limit || 10);
            } catch (error) {
                console.error('Failed to get top domains:', error);
                return [];
            }
        });

        // Export history data
        ipcMain.handle('export-history-data', (_, limit) => {
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
        ipcMain.handle('record-manual-visit', (_, url, viewId) => {
            try {
                if (!url || !viewId) {
                    throw new Error('URL and viewId are required');
                }
                const record = this.historyManager.recordVisit(url, viewId);
                return record;
            } catch (error) {
                console.error('Failed to record manual visit:', error);
                return null;
            }
        });

        // Update record title (for frontend manual update)
        ipcMain.handle('update-record-title', (_, recordId, title) => {
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
    }

    /**
     * Register navigation-related handlers
     */
    registerNavigationHandlers() {
        // Navigate to specified URL
        ipcMain.handle('navigate-to', async (_, url) => {
            try {
                await this.viewManager.navigateTo(url);

                // Record new visit
                if (url && this.historyManager) {
                    const currentView = this.viewManager.getCurrentView();
                    if (currentView) {
                        const viewId = currentView.id || Date.now();
                        const record = this.historyManager.recordVisit(url, viewId);
                        // Recorded navigation visit

                        // Record navigation activity
                        this.historyManager.recordNavigationActivity(url, 'Loading...', 'navigate');
                    }
                }

                return true;
            } catch (error) {
                console.error('Failed to navigate to URL:', error);
                return false;
            }
        });

        // Go back
        ipcMain.handle('go-back', () => {
            try {
                const result = this.viewManager.goBack();

                // Record back navigation
                if (result && this.historyManager) {
                    const currentView = this.viewManager.getCurrentView();
                    if (currentView && currentView.webContents) {
                        const url = currentView.webContents.getURL();
                        const viewId = currentView.id || Date.now();
                        if (url) {
                            this.historyManager.recordVisit(url, viewId);

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
        ipcMain.handle('go-forward', () => {
            try {
                const result = this.viewManager.goForward();

                // Record forward navigation
                if (result && this.historyManager) {
                    const currentView = this.viewManager.getCurrentView();
                    if (currentView && currentView.webContents) {
                        const url = currentView.webContents.getURL();
                        const viewId = currentView.id || Date.now();
                        if (url) {
                            this.historyManager.recordVisit(url, viewId);

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
        ipcMain.handle('refresh', () => {
            try {
                const result = this.viewManager.refresh();

                // Record page refresh
                if (result && this.historyManager) {
                    const currentView = this.viewManager.getCurrentView();
                    if (currentView && currentView.webContents) {
                        const url = currentView.webContents.getURL();
                        const viewId = currentView.id || Date.now();
                        if (url) {
                            this.historyManager.recordVisit(url, viewId);

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
        ipcMain.handle('hide-browser-view', () => {
            try {
                return this.viewManager.hideBrowserView();
            } catch (error) {
                console.error('Failed to hide browser view:', error);
                return false;
            }
        });

        // Show current BrowserView
        ipcMain.handle('show-browser-view', () => {
            try {
                return this.viewManager.showBrowserView();
            } catch (error) {
                console.error('Failed to show browser view:', error);
                return false;
            }
        });

        // Get current view information
        ipcMain.handle('get-current-view-info', () => {
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
        ipcMain.handle('get-all-views-info', () => {
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
        ipcMain.handle('get-database-stats', () => {
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
        ipcMain.handle('cleanup-old-data', (_, daysToKeep) => {
            try {
                const days = daysToKeep || 30;
                return this.historyManager.cleanupOldData(days);
            } catch (error) {
                console.error('Failed to cleanup old data:', error);
                return { changes: 0 };
            }
        });

        // Force write data (mainly for testing)
        ipcMain.handle('force-write-data', () => {
            try {
                this.historyManager.forceWrite();
                return true;
            } catch (error) {
                console.error('Failed to force write data:', error);
                return false;
            }
        });

        // Clear local users
        ipcMain.handle('clear-local-users', () => {
            try {
                const db = require('../sqlite/database');
                const result = db.prepare('DELETE FROM local_users').run();
                return { success: true, changes: result.changes };
            } catch (error) {
                console.error('Error clearing local_users table:', error);
                return { success: false, error: error.message };
            }
        });

        // Exit application
        ipcMain.handle('exit-app', () => {
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
        ipcMain.handle('clear-current-user-activities', () => {
            try {
                if (this.historyManager) {
                    const result = this.historyManager.clearCurrentUserActivities();
                    return result;
                } else {
                    return { success: false, error: 'History manager not available' };
                }
            } catch (error) {
                console.error('Error clearing current user activities:', error);
                return { success: false, error: error.message };
            }
        });



        // Get browser session information
        ipcMain.handle('get-session-info', () => {
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
        ipcMain.handle('submit-username', async (event, username) => {
            try {

                if (!username || username.trim() === '') {
                    throw new Error('Username cannot be empty');
                }

                // Generate user ID and get public IP
                const { v4: uuidv4 } = require('uuid');
                const userId = uuidv4();

                // Get public IP
                let ipAddress = '127.0.0.1';
                try {
                    const response = await fetch('https://api.ipify.org?format=json');
                    const data = await response.json();
                    ipAddress = data.ip;
                } catch (byteError) {
                    console.error('Failed to get public IP:', byteError);
                }

                const userData = {
                    username: username.trim(),
                    userId: userId,
                    domainId: null,
                    clusterId: null,
                    channelId: null,
                    ipAddress: ipAddress,
                    isCurrent: 1
                };

                // User data prepared

                // Insert new user into database
                const db = require('../sqlite/database');

                // First, set all existing users to not current
                db.prepare('UPDATE local_users SET is_current = 0').run();

                // Then insert the new user as current
                const insertStmt = db.prepare(`
                    INSERT INTO local_users (
                        user_id, username, domain_id, cluster_id, channel_id, ip_address, is_current
                    ) VALUES (?, ?, ?, ?, ?, ?, ?)
                `);

                const result = insertStmt.run(
                    userData.userId,
                    userData.username,
                    userData.domainId,
                    userData.clusterId,
                    userData.channelId,
                    userData.ipAddress,
                    userData.isCurrent
                );

                if (result.changes > 0) {
                    // Registration successful, close any open registration dialog first
                    try {
                        if (this.nodeManager && this.nodeManager.userRegistrationDialog) {
                            this.nodeManager.userRegistrationDialog.closeFromExternalRequest();
                        }
                    } catch (closeError) {
                        console.error('Error closing registration dialog:', closeError);
                    }

                    // Then show greeting dialog
                    try {
                        const UserRegistrationDialog = require('../nodeManager/userRegistrationDialog');
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
                    const UserRegistrationDialog = require('../nodeManager/userRegistrationDialog');
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
        ipcMain.handle('open-config-modal', async (event) => {
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

        // Handle user selector modal open request
        ipcMain.handle('open-user-selector', async (event) => {
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
        ipcMain.handle('switch-user', async (event, userId) => {
            try {

                const db = require('../sqlite/database');

                // First, set all users to not current
                db.prepare('UPDATE local_users SET is_current = 0').run();

                // Then set the selected user as current
                const result = db.prepare('UPDATE local_users SET is_current = 1 WHERE user_id = ?').run(userId);

                if (result.changes > 0) {

                    // Get the new current user info
                    const newUser = db.prepare('SELECT * FROM local_users WHERE user_id = ?').get(userId);

                    // Show greeting dialog for the switched user
                    try {
                        const UserRegistrationDialog = require('../nodeManager/userRegistrationDialog');
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
                } else {
                    throw new Error('User not found or switch failed');
                }
            } catch (error) {
                console.error('Error switching user:', error);
                return { success: false, error: error.message };
            }
        });

        // Handle new user registration request
        ipcMain.handle('open-user-registration', async (event) => {
            try {
                const UserRegistrationDialog = require('../nodeManager/userRegistrationDialog');
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

        ];

        handlers.forEach(handler => {
            try {
                ipcMain.removeHandler(handler);
            } catch (error) {
                // Warning: Failed to remove handler
            }
        });

        // IPC handlers cleaned up
    }

    /**
     * Register client management handlers
     */
    registerClientHandlers() {
        // Switch client (show selector modal)
        ipcMain.handle('switch-client', async () => {
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
        ipcMain.handle('switch-to-client', async (_, targetClient) => {
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

                const result = this.clientManager.switchClient(targetClient);
                return result;
            } catch (error) {
                console.error('C-Client IPC: Exception during switch to specific client:', error);
                return { success: false, error: error.message };
            }
        });

        // Get current client
        ipcMain.handle('get-current-client', async () => {
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
        ipcMain.handle('get-client-info', async () => {
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
    }
}

module.exports = IpcHandlers;