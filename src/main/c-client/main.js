const { app, globalShortcut, Menu } = require('electron');
const WindowManager = require('./window/windowManager');
const ViewManager = require('./window/viewManager');
const HistoryManager = require('./history/historyManager');
const IpcHandlers = require('./ipc/ipcHandlers');
const { StartupValidator } = require('./nodeManager');
const ClientManager = require('./clientManager');

class ElectronApp {
    constructor() {
        this.clientManager = new ClientManager();
        this.historyManager = new HistoryManager();
        this.windowManager = new WindowManager(this.historyManager, this.clientManager);
        this.startupValidator = new StartupValidator();
        this.viewManager = null;
        this.ipcHandlers = null;
        this.mainWindow = null; // Initialize mainWindow property
        this.isInitialized = false;
        this.pendingTitleUpdates = new Map();
    }

    async initialize() {
        if (this.isInitialized) {
            console.log('Application already initialized');
            return;
        }


        try {
            // Initialize history manager
            this.historyManager.initialize();

            // Validate node status on startup
            await this.startupValidator.validateOnStartup();

            // Create main window
            const mainWindow = this.windowManager.createWindow();
            this.mainWindow = mainWindow; // Store reference to main window


            // Wait for window to be ready
            await this.waitForWindowReady(mainWindow);

            // Show the window
            mainWindow.show();

            // Create view manager
            this.viewManager = new ViewManager(this.windowManager, this.historyManager);

            // Register IPC handlers
            this.ipcHandlers = new IpcHandlers(this.viewManager, this.historyManager, this.mainWindow, this.clientManager, this.startupValidator.nodeManager);

            // Set up browsing history monitoring
            this.setupHistoryRecording();

            // Register keyboard shortcuts
            this.registerShortcuts();

            // Create application menu
            this.createApplicationMenu();

            // Complete initialization
            this.historyManager.finalizeInitialization();

            // Set up periodic cleanup
            this.setupPeriodicCleanup();

            this.isInitialized = true;

            // Listen for client switch events
            this.setupClientSwitchListener();

            // After IPC handlers are registered and listeners are set up, send init-tab event
            // Add a longer delay to ensure everything is ready
            setTimeout(() => {
                if (this.mainWindow && !this.mainWindow.isDestroyed()) {
                    this.mainWindow.webContents.send('init-tab');
                }
            }, 500); // Increased delay to ensure IPC handlers are fully registered

            // Check if user registration is needed after main window is ready
            setTimeout(async () => {
                try {
                    const registrationResult = await this.startupValidator.nodeManager.registerNewUserIfNeeded(this.mainWindow);
                    if (registrationResult) {
                        // New user registration dialog was shown
                    } else {
                        // For existing users, show greeting dialog
                        try {
                            const UserRegistrationDialog = require('./nodeManager/userRegistrationDialog');
                            const userRegistrationDialog = new UserRegistrationDialog();

                            if (this.mainWindow && !this.mainWindow.isDestroyed()) {
                                await userRegistrationDialog.showGreeting(this.mainWindow);
                            }
                        } catch (greetingError) {
                            console.error('Error showing greeting dialog for existing user:', greetingError);
                        }
                    }
                } catch (error) {
                    console.error('Error checking user registration after main window loaded:', error);
                }
            }, 1500); // Wait 1.5 seconds after main window is ready to ensure everything is loaded

        } catch (error) {
            console.error('Failed to initialize application:', error);
            throw error;
        }
    }

    /**
     * Setup client switch event listener
     */
    setupClientSwitchListener() {
        const { app } = require('electron');

        app.on('client-switch', (targetClient) => {
            this.handleClientSwitch(targetClient);
        });
    }

    /**
     * Handle client switch
     */
    async handleClientSwitch(targetClient) {
        try {

            // Update window title and properties
            if (this.mainWindow) {
                const displayName = this.clientManager.getClientDisplayName();
                this.mainWindow.setTitle(displayName);
            }

            // Hide all browser views when switching to B-Client
            if (targetClient === 'b-client' && this.viewManager) {
                this.viewManager.hideAllViews();
            }

            // Reinitialize IPC handlers for the new client
            if (this.ipcHandlers) {
                try {
                    this.ipcHandlers.cleanup();
                } catch (error) {
                    console.log(`Main: Error cleaning up old IPC handlers:`, error.message);
                }
            }

            // Initialize new IPC handlers based on client type
            try {
                if (targetClient === 'b-client') {
                    const BClientIpcHandlers = require('../b-client/ipc/ipcHandlers');
                    this.ipcHandlers = new BClientIpcHandlers(this.viewManager, this.historyManager, this.mainWindow, this.clientManager);
                } else {
                    const CClientIpcHandlers = require('./ipc/ipcHandlers');
                    this.ipcHandlers = new CClientIpcHandlers(this.viewManager, this.historyManager, this.mainWindow, this.clientManager);
                }
            } catch (error) {
                console.error(`❌ Main: Error initializing ${targetClient} IPC handlers:`, error);
                throw error;
            }

            // Reload the main window with new client interface
            if (this.mainWindow && this.windowManager) {
                try {
                    this.windowManager.reloadClientInterface();

                    // Wait for page to load completely
                    await this.waitForWindowReady(this.mainWindow);

                    // Trigger client-specific initialization after page load
                    if (targetClient === 'c-client') {

                        // Send init-tab event to renderer process
                        setTimeout(() => {
                            if (this.mainWindow && !this.mainWindow.isDestroyed()) {
                                this.mainWindow.webContents.send('init-tab');
                            }
                        }, 500);

                        // Check if user registration is needed
                        setTimeout(async () => {
                            try {
                                await this.startupValidator.nodeManager.registerNewUserIfNeeded(this.mainWindow);
                            } catch (error) {
                                console.error('Error checking user registration after client switch:', error);
                            }
                        }, 1500);

                    } else if (targetClient === 'b-client') {
                        // B-Client specific initialization
                        setTimeout(async () => {
                            try {
                                await this.startupValidator.nodeManager.registerNewUserIfNeeded(this.mainWindow);
                            } catch (error) {
                                console.error('B-Client: Error checking user registration after client switch:', error);
                            }
                        }, 1000);
                    }

                } catch (error) {
                    console.error(`❌ Main: Error reloading interface for ${targetClient}:`, error);
                    throw error;
                }
            }

        } catch (error) {
            console.error(`Main: Failed to switch to ${targetClient}:`, error);
        }
    }

    async waitForWindowReady(window) {
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
                                console.error('Error in did-start-navigation handler:', error);
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
                    console.error('Error in did-finish-load handler:', error);
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
                    console.error('Error in page-title-updated handler:', error);
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
                    console.error('Error in did-fail-load handler:', error);
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
            console.error('Failed to update record title:', error);
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
            console.error('Failed to get viewId from WebContents:', error);
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
                const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
                const db = require('./sqlite/database');
                const result = db.prepare(`
                    UPDATE visit_history 
                    SET title = 'Failed to load' 
                    WHERE title = 'Loading...' AND enter_time < ?
                `).run(fiveMinutesAgo);

                if (result.changes > 0) {
                    console.log(`Cleaned up ${result.changes} loading records`);
                }
            }
        } catch (error) {
            console.error('Failed to cleanup loading records:', error);
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
                console.log(`Cleaned up ${cleanedCount} pending title updates`);
            }
        } catch (error) {
            console.error('Failed to cleanup pending updates:', error);
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
            console.error('Failed to register shortcuts:', error);
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
        try {
            console.log('Clearing local_users table...');
            const db = require('./sqlite/database');
            const result = db.prepare('DELETE FROM local_users').run();
            console.log(`Cleared ${result.changes} users from local_users table`);

            // Show confirmation to user
            if (this.mainWindow && !this.mainWindow.isDestroyed()) {
                this.mainWindow.webContents.send('show-notification', {
                    type: 'success',
                    message: `Successfully cleared ${result.changes} users from local_users table`
                });
            }
        } catch (error) {
            console.error('Error clearing local_users table:', error);

            // Show error to user
            if (this.mainWindow && !this.mainWindow.isDestroyed()) {
                this.mainWindow.webContents.send('show-notification', {
                    type: 'error',
                    message: `Failed to clear local_users table: ${error.message}`
                });
            }
        }
    }

    setupAppEvents() {
        app.on('window-all-closed', async () => {
            // Clear all sessions and login states
            if (this.windowManager && this.windowManager.viewManager) {
                try {
                    console.log('🧹 All windows closed, starting to clear all sessions...');
                    await this.windowManager.viewManager.clearAllSessions();
                } catch (error) {
                    console.error('❌ Error clearing sessions:', error);
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
                    console.log('🧹 Application exiting, starting to clear all sessions...');
                    await this.windowManager.viewManager.clearAllSessions();
                } catch (error) {
                    console.error('❌ Error clearing sessions:', error);
                }
            }

            if (this.historyManager) {
                this.historyManager.logShutdown('before-quit');
            }
            this.cleanup();
        });

        app.on('activate', async () => {
            const mainWindow = this.windowManager.getMainWindow();
            if (!mainWindow || mainWindow.isDestroyed()) {
                try {
                    await this.initialize();
                } catch (error) {
                    console.error('Failed to reactivate application:', error);
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
                console.error('Failed in will-quit handler:', error);
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

    cleanup() {
        if (!this.isInitialized) return;

        console.log('Cleaning up application resources...');

        try {
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

            // Clear mainWindow reference
            this.mainWindow = null;

            this.pendingTitleUpdates.clear();
            globalShortcut.unregisterAll();
            this.isInitialized = false;

        } catch (error) {
            console.error('Error during cleanup:', error);
        }
    }

    safeQuit() {
        this.cleanup();
        app.quit();
    }
}

// Create application instance
const electronApp = new ElectronApp();

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    if (electronApp.historyManager) {
        electronApp.historyManager.logShutdown('uncaught-exception');
    }
    setTimeout(() => process.exit(1), 1000);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection:', reason);
    if (electronApp.historyManager) {
        electronApp.historyManager.logShutdown('unhandled-rejection');
    }
});

// Initialize when application is ready
app.whenReady().then(async () => {
    try {
        await electronApp.initialize();
    } catch (error) {
        console.error('Failed to start application:', error);
        app.quit();
    }
});

// Set up application event listeners
electronApp.setupAppEvents();

module.exports = electronApp;