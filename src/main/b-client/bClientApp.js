const { app, globalShortcut, Menu } = require('electron');
const BClientWindowManager = require('./window/bClientWindowManager');
const BClientViewManager = require('./window/bClientViewManager');
const BClientHistoryManager = require('./history/bClientHistoryManager');
const BClientIpcHandlers = require('./ipc/bClientIpcHandlers');
const { BClientStartupValidator } = require('./nodeManager');
const BClientManager = require('./bClientManager');
const ApiServer = require('./api/apiServer');
const ClientSwitchManager = require('../shared/clientSwitchManager');

class BClientApp {
    constructor() {
        this.clientManager = new BClientManager();
        this.historyManager = new BClientHistoryManager();
        this.windowManager = new BClientWindowManager(this.historyManager, this.clientManager);
        this.startupValidator = new BClientStartupValidator();
        this.viewManager = null;
        this.ipcHandlers = null;
        this.mainWindow = null;
        this.isInitialized = false;
        this.pendingTitleUpdates = new Map();
        this.apiServer = new ApiServer(3000); // Start API server on port 3000
        this.openModals = new Set(); // Track open modals
        this.clientSwitchManager = new ClientSwitchManager(); // Unified client switch manager
    }

    async initialize() {
        if (this.isInitialized) {
            console.log('B-Client application already initialized');
            return;
        }

        console.log('Initializing B-Client (Enterprise) application...');

        try {
            // Initialize history manager
            this.historyManager.initialize();
            console.log('B-Client history manager initialized');

            // Validate node status on startup
            await this.startupValidator.validateOnStartup();
            console.log('B-Client node validation completed');

            // Start API server
            await this.apiServer.start();
            console.log('B-Client API server started');

            // Create main window
            const mainWindow = this.windowManager.createWindow();
            this.mainWindow = mainWindow;
            console.log('B-Client main window created');

            // Wait for window to be ready
            await this.waitForWindowReady(mainWindow);

            // Create view manager
            this.viewManager = new BClientViewManager(this.windowManager, this.historyManager);
            console.log('B-Client view manager created');

            // Register IPC handlers
            this.ipcHandlers = new BClientIpcHandlers(this.viewManager, this.historyManager, this.mainWindow, this.clientManager, this);
            console.log('B-Client IPC handlers registered');

            // Set up browsing history monitoring
            this.setupHistoryRecording();
            console.log('B-Client history recording setup completed');

            // Register keyboard shortcuts
            this.registerShortcuts();
            console.log('B-Client shortcuts registered');

            // Create application menu
            this.createApplicationMenu();
            console.log('B-Client application menu created');

            // Complete initialization
            this.historyManager.finalizeInitialization();

            // Set up periodic cleanup
            this.setupPeriodicCleanup();

            this.isInitialized = true;
            console.log('B-Client application initialization completed');

            // Set up IPC listener for user registration dialog
            const { ipcMain } = require('electron');
            ipcMain.on('show-user-registration-dialog', () => {
                console.log('B-Client: Received show-user-registration-dialog event');
                if (this.mainWindow && !this.mainWindow.isDestroyed()) {
                    console.log('B-Client: Sending show-user-registration-dialog to renderer process');
                    this.mainWindow.webContents.send('show-user-registration-dialog');
                }
            });

            // After IPC handlers are registered, send init-tab event
            setTimeout(() => {
                if (this.mainWindow && !this.mainWindow.isDestroyed()) {
                    // Send init-tab event to renderer process
                    this.mainWindow.webContents.send('init-tab');
                }
            }, 500);

            // Skip user registration for direct B-Client launch

        } catch (error) {
            console.error('B-Client: Failed to initialize application:', error);
            await this.cleanup();
            throw error;
        }
    }

    waitForWindowReady(window) {
        return new Promise((resolve) => {
            if (window.webContents.isLoading()) {
                window.webContents.once('did-finish-load', () => {
                    setTimeout(resolve, 500);
                });
            } else {
                setTimeout(resolve, 100);
            }
        });
    }

    setupHistoryRecording() {
        app.on('web-contents-created', (event, contents) => {
            contents.on('did-start-navigation', (event, url, isInPlace, isMainFrame) => {
                if (isMainFrame && !isInPlace) {
                    const UrlUtils = require('./utils/urlUtils');
                    if (!UrlUtils.isValidUrl(url)) {
                        return;
                    }

                    const viewId = this.getViewIdFromWebContents(contents);
                    if (viewId && this.historyManager) {
                        setTimeout(() => {
                            try {
                                if (contents.isDestroyed()) return;

                                let initialTitle = 'Loading...';
                                const currentTitle = contents.getTitle();
                                if (currentTitle && currentTitle.trim() && currentTitle !== url) {
                                    initialTitle = currentTitle;
                                }

                                const record = this.historyManager.recordVisit(url, viewId);
                                if (record) {
                                    if (initialTitle !== 'Loading...') {
                                        this.historyManager.updateRecordTitle(record, initialTitle);
                                    } else {
                                        this.pendingTitleUpdates.set(`${url}-${viewId}`, {
                                            record: record,
                                            url: url,
                                            viewId: viewId,
                                            timestamp: Date.now()
                                        });
                                    }
                                }
                            } catch (error) {
                                console.error('B-Client: Error in did-start-navigation handler:', error);
                            }
                        }, 200);
                    }
                }
            });

            contents.on('did-finish-load', () => {
                try {
                    if (contents.isDestroyed()) return;

                    const url = contents.getURL();
                    const title = contents.getTitle();

                    const UrlUtils = require('./utils/urlUtils');
                    if (!UrlUtils.isValidUrl(url)) {
                        return;
                    }

                    if (url && this.historyManager) {
                        const viewId = this.getViewIdFromWebContents(contents);
                        if (viewId) {
                            this.updateRecordTitle(url, viewId, title);
                        }
                    }
                } catch (error) {
                    console.error('B-Client: Error in did-finish-load handler:', error);
                }
            });

            contents.on('page-title-updated', (event, title) => {
                try {
                    if (contents.isDestroyed()) return;

                    const url = contents.getURL();
                    const UrlUtils = require('./utils/urlUtils');
                    if (!UrlUtils.isValidUrl(url)) {
                        return;
                    }

                    if (url && title && this.historyManager) {
                        const viewId = this.getViewIdFromWebContents(contents);
                        if (viewId) {
                            this.updateRecordTitle(url, viewId, title);
                        }
                    }
                } catch (error) {
                    console.error('B-Client: Error in page-title-updated handler:', error);
                }
            });

            contents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
                try {
                    if (contents.isDestroyed()) return;

                    const UrlUtils = require('./utils/urlUtils');
                    if (!UrlUtils.isValidUrl(validatedURL)) {
                        return;
                    }

                    const viewId = this.getViewIdFromWebContents(contents);
                    if (viewId && validatedURL) {
                        this.updateRecordTitle(validatedURL, viewId, `Failed to load: ${errorDescription}`);
                    }
                } catch (error) {
                    console.error('B-Client: Error in did-fail-load handler:', error);
                }
            });

            contents.on('new-window', (event, navigationUrl) => {
                try {
                    const parsedUrl = new URL(navigationUrl);
                    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
                        event.preventDefault();
                    }
                } catch (error) {
                    event.preventDefault();
                }
            });

            contents.on('will-navigate', (event, navigationUrl) => {
                try {
                    const parsedUrl = new URL(navigationUrl);
                    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
                        event.preventDefault();
                    }
                } catch (error) {
                    event.preventDefault();
                }
            });

            contents.session.setPermissionRequestHandler((webContents, permission, callback) => {
                const allowedPermissions = ['clipboard-read'];
                callback(allowedPermissions.includes(permission));
            });
        });
    }

    updateRecordTitle(url, viewId, title) {
        try {
            const key = `${url}-${viewId}`;
            const pendingUpdate = this.pendingTitleUpdates.get(key);

            if (pendingUpdate) {
                const finalTitle = title || 'Untitled Page';
                this.historyManager.updateRecordTitle(pendingUpdate.record, finalTitle);
                this.pendingTitleUpdates.delete(key);
            } else {
                const recentRecords = this.historyManager.getHistory(10);
                const recentRecord = recentRecords.find(record =>
                    record.url === url &&
                    record.view_id === viewId &&
                    (record.title === 'Loading...' || !record.title || record.title === 'Untitled Page')
                );

                if (recentRecord) {
                    const finalTitle = title || 'Untitled Page';
                    this.historyManager.updateRecordTitle(recentRecord, finalTitle);
                }
            }
        } catch (error) {
            console.error('B-Client: Failed to update record title:', error);
        }
    }

    getViewIdFromWebContents(contents) {
        if (!this.viewManager) return null;

        try {
            const allViews = this.viewManager.getAllViews();
            for (const [viewId, view] of Object.entries(allViews)) {
                if (view.webContents === contents) {
                    return parseInt(viewId);
                }
            }
        } catch (error) {
            console.error('B-Client: Failed to get viewId from WebContents:', error);
        }

        return null;
    }

    setupPeriodicCleanup() {
        setInterval(() => {
            this.cleanupLoadingRecords();
            this.cleanupPendingUpdates();
        }, 5 * 60 * 1000);
    }

    cleanupLoadingRecords() {
        try {
            if (this.historyManager) {
                // B-Client doesn't track visit history
            }
        } catch (error) {
            console.error('B-Client: Failed to cleanup loading records:', error);
        }
    }

    cleanupPendingUpdates() {
        try {
            const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
            let cleanedCount = 0;

            for (const [key, pendingUpdate] of this.pendingTitleUpdates.entries()) {
                if (pendingUpdate.timestamp < fiveMinutesAgo) {
                    this.historyManager.updateRecordTitle(pendingUpdate.record, 'Failed to load');
                    this.pendingTitleUpdates.delete(key);
                    cleanedCount++;
                }
            }

            if (cleanedCount > 0) {
                console.log(`B-Client: Cleaned up ${cleanedCount} pending title updates`);
            }
        } catch (error) {
            console.error('B-Client: Failed to cleanup pending updates:', error);
        }
    }

    registerShortcuts() {
        try {
            globalShortcut.register('CommandOrControl+Shift+I', () => {
                const currentView = this.viewManager ? this.viewManager.getCurrentView() : null;
                if (currentView && !currentView.webContents.isDestroyed()) {
                    currentView.webContents.openDevTools({ mode: 'detach' });
                } else {
                    const mainWindow = this.windowManager.getMainWindow();
                    if (mainWindow && !mainWindow.isDestroyed()) {
                        mainWindow.webContents.openDevTools({ mode: 'detach' });
                    }
                }
            });

            globalShortcut.register('CommandOrControl+T', () => {
                if (this.viewManager) {
                    this.viewManager.createBrowserView().catch(console.error);
                }
            });

            globalShortcut.register('F5', () => {
                if (this.viewManager) {
                    this.viewManager.refresh();
                }
            });

            globalShortcut.register('Alt+Left', () => {
                if (this.viewManager) {
                    this.viewManager.goBack();
                }
            });

            globalShortcut.register('Alt+Right', () => {
                if (this.viewManager) {
                    this.viewManager.goForward();
                }
            });

            globalShortcut.register('CommandOrControl+H', () => {
                if (this.viewManager) {
                    this.viewManager.createHistoryView().catch(console.error);
                }
            });

        } catch (error) {
            console.error('B-Client: Failed to register shortcuts:', error);
        }
    }

    createApplicationMenu() {
        const template = [
            {
                label: 'File',
                submenu: [
                    {
                        label: 'Clear Local Users',
                        accelerator: 'CmdOrCtrl+Shift+L',
                        click: () => {
                            this.clearLocalUsers();
                        }
                    },
                    { type: 'separator' },
                    {
                        label: 'Exit',
                        accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Ctrl+Q',
                        click: () => {
                            app.quit();
                        }
                    }
                ]
            },
            {
                label: 'Edit',
                submenu: [
                    { role: 'undo' },
                    { role: 'redo' },
                    { type: 'separator' },
                    { role: 'cut' },
                    { role: 'copy' },
                    { role: 'paste' }
                ]
            },
            {
                label: 'View',
                submenu: [
                    { role: 'reload' },
                    { role: 'forceReload' },
                    { role: 'toggleDevTools' },
                    { type: 'separator' },
                    { role: 'resetZoom' },
                    { role: 'zoomIn' },
                    { role: 'zoomOut' },
                    { type: 'separator' },
                    { role: 'togglefullscreen' }
                ]
            },
            {
                label: 'Window',
                submenu: [
                    { role: 'minimize' },
                    { role: 'close' }
                ]
            }
        ];

        if (process.platform === 'darwin') {
            template.unshift({
                label: app.getName(),
                submenu: [
                    { role: 'about' },
                    { type: 'separator' },
                    { role: 'services' },
                    { type: 'separator' },
                    { role: 'hide' },
                    { role: 'hideOthers' },
                    { role: 'unhide' },
                    { type: 'separator' },
                    { role: 'quit' }
                ]
            });
        }

        const menu = Menu.buildFromTemplate(template);
        Menu.setApplicationMenu(menu);
    }

    clearLocalUsers() {
        // B-Client doesn't use local_users table
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            this.mainWindow.webContents.send('show-notification', {
                type: 'info',
                message: 'B-Client doesn\'t use local users table'
            });
        }
    }

    setupAppEvents() {
        // Listen for client switch events
        app.on('client-switch', async (targetClient) => {
            console.log(`🔄 B-Client: Received client-switch event for: ${targetClient}`);
            return await this.handleClientSwitch(targetClient);
        });

        app.on('window-all-closed', async () => {
            // Close all open modals
            console.log('🧹 B-Client: Closing all open modals...');
            for (const modal of this.openModals) {
                try {
                    if (modal && typeof modal.close === 'function') {
                        modal.close();
                    }
                } catch (error) {
                    console.error('❌ B-Client: Error closing modal:', error);
                }
            }
            this.openModals.clear();

            // Clear all sessions and login states
            if (this.windowManager && this.windowManager.viewManager) {
                try {
                    console.log('🧹 B-Client: All windows closed, starting to clear all sessions...');
                    await this.windowManager.viewManager.clearAllSessions();
                } catch (error) {
                    console.error('❌ B-Client: Error clearing sessions:', error);
                }
            }

            if (this.historyManager) {
                this.historyManager.logShutdown('window-all-closed');
            }

            if (process.platform !== 'darwin') {
                this.safeQuit();
            }
        });

        app.on('before-quit', async (event) => {
            // Clear all sessions and login states
            if (this.windowManager && this.windowManager.viewManager) {
                try {
                    console.log('🧹 B-Client: Application exiting, starting to clear all sessions...');
                    await this.windowManager.viewManager.clearAllSessions();
                } catch (error) {
                    console.error('❌ B-Client: Error clearing sessions:', error);
                }
            }

            if (this.historyManager) {
                this.historyManager.logShutdown('before-quit');
            }
            await this.cleanup();
        });

        app.on('activate', async () => {
            const mainWindow = this.windowManager.getMainWindow();
            if (!mainWindow || mainWindow.isDestroyed()) {
                try {
                    await this.initialize();
                } catch (error) {
                    console.error('B-Client: Failed to reactivate application:', error);
                }
            } else {
                mainWindow.show();
            }
        });

        app.on('will-quit', (event) => {
            try {
                globalShortcut.unregisterAll();
                if (this.historyManager) {
                    this.historyManager.forceWrite();
                }
            } catch (error) {
                console.error('B-Client: Failed in will-quit handler:', error);
            }
        });

        app.on('certificate-error', (event, webContents, url, error, certificate, callback) => {
            event.preventDefault();
            callback(true);
        });

        app.on('render-process-gone', (event, webContents, details) => {
            if (details.reason === 'crashed' && webContents && !webContents.isDestroyed()) {
                webContents.reload();
            }
        });
    }

    async cleanup() {
        if (!this.isInitialized) return;

        console.log('B-Client: Cleaning up application resources...');

        try {
            // Stop API server
            await this.apiServer.stop();
            console.log('B-Client API server stopped');

            if (this.viewManager) {
                this.viewManager.cleanup();
                this.viewManager = null;
            }

            if (this.ipcHandlers) {
                this.ipcHandlers.cleanup();
                this.ipcHandlers = null;
            }

            if (this.historyManager) {
                this.historyManager.cleanup();
            }

            if (this.windowManager) {
                this.windowManager.cleanup();
                this.windowManager = null;
            }

            // Cleanup unified client switch manager
            if (this.clientSwitchManager) {
                try {
                    await this.clientSwitchManager.cleanup();
                } catch (error) {
                    console.error('Error cleaning up client switch manager:', error);
                }
            }

            // Clear mainWindow reference
            this.mainWindow = null;

            this.pendingTitleUpdates.clear();
            globalShortcut.unregisterAll();
            this.isInitialized = false;

        } catch (error) {
            console.error('B-Client: Error during cleanup:', error);
        }
    }

    async handleClientSwitch(targetClient) {
        try {
            const context = {
                mainWindow: this.mainWindow,
                viewManager: this.viewManager,
                historyManager: this.historyManager,
                clientManager: this.clientManager,
                ipcHandlers: this.ipcHandlers,
                startupValidator: this.startupValidator,
                mainApp: this
            };

            // Use unified client switch manager
            this.ipcHandlers = await this.clientSwitchManager.handleClientSwitch(targetClient, context);

            return { success: true, message: `Successfully switched to ${targetClient}` };

        } catch (error) {
            console.error(`B-Client: Failed to switch to ${targetClient}:`, error);
            return { success: false, error: error.message };
        }
    }

    async safeQuit() {
        await this.cleanup();
        app.quit();
    }
}

// Create B-Client application instance
const bClientApp = new BClientApp();

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    console.error('B-Client: Uncaught Exception:', error);
    if (bClientApp.historyManager) {
        bClientApp.historyManager.logShutdown('uncaught-exception');
    }
    setTimeout(() => process.exit(1), 1000);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('B-Client: Unhandled Rejection:', reason);
    if (bClientApp.historyManager) {
        bClientApp.historyManager.logShutdown('unhandled-rejection');
    }
});

// Initialize when application is ready
app.whenReady().then(async () => {
    try {
        await bClientApp.initialize();
        console.log('B-Client application started successfully');
    } catch (error) {
        console.error('B-Client: Failed to start application:', error);
        app.quit();
    }
});

// Set up application event listeners
bClientApp.setupAppEvents();

module.exports = bClientApp;
