const { app, globalShortcut } = require('electron');
const WindowManager = require('./window/windowManager');
const ViewManager = require('./window/viewManager');
const HistoryManager = require('./history/historyManager');
const IpcHandlers = require('./ipc/ipcHandlers');

class ElectronApp {
    constructor() {
        this.historyManager = new HistoryManager();
        this.windowManager = new WindowManager(this.historyManager);
        this.viewManager = null;
        this.ipcHandlers = null;
        this.isInitialized = false;
        this.pendingTitleUpdates = new Map();
    }

    async initialize() {
        if (this.isInitialized) {
            console.log('Application already initialized');
            return;
        }

        console.log('Initializing Electron application...');

        try {
            // Initialize history manager
            this.historyManager.initialize();
            console.log('History manager initialized');

            // Create main window
            const mainWindow = this.windowManager.createWindow();
            console.log('Main window created');


            // Wait for window to be ready
            await this.waitForWindowReady(mainWindow);

            // Create view manager
            this.viewManager = new ViewManager(this.windowManager, this.historyManager);
            console.log('View manager created');

            // Register IPC handlers
            this.ipcHandlers = new IpcHandlers(this.viewManager, this.historyManager);
            console.log('IPC handlers registered');

            // Set up browsing history monitoring
            this.setupHistoryRecording();
            console.log('History recording setup completed');

            // Register keyboard shortcuts
            this.registerShortcuts();
            console.log('Shortcuts registered');

            // Complete initialization
            this.historyManager.finalizeInitialization();

            // Set up periodic cleanup
            this.setupPeriodicCleanup();

            this.isInitialized = true;
            console.log('Application initialization completed');

            // After IPC handlers are registered, send init-tab event
            mainWindow.webContents.send('init-tab');



        } catch (error) {
            console.error('Failed to initialize application:', error);
            this.cleanup();
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
        console.log('Application started successfully');
    } catch (error) {
        console.error('Failed to start application:', error);
        app.quit();
    }
});

// Set up application event listeners
electronApp.setupAppEvents();

module.exports = electronApp;