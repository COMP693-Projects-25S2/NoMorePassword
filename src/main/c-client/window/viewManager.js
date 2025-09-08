const { BrowserView } = require('electron');
const path = require('path');

// Import modular components
const OAuthHandler = require('./oauthHandler');
const SessionManager = require('./sessionManager');
const ViewOperations = require('./viewOperations');

// BrowserView Manager - Refactored
class ViewManager {
    constructor(mainWindow, historyManager) {
        this.mainWindow = mainWindow;
        this.historyManager = historyManager;
        this.views = {};
        this.currentViewId = null;
        this.viewCounter = 0;

        // Initialize modular components
        this.oauthHandler = new OAuthHandler(this);
        this.sessionManager = new SessionManager(this);
        this.viewOperations = new ViewOperations(this);

        // Set window resize callbacks
        if (mainWindow && mainWindow.setResizeCallback) {
            mainWindow.setResizeCallback((bounds) => this.viewOperations.updateCurrentViewBounds(bounds));
            mainWindow.setMoveCallback((bounds) => this.viewOperations.updateAllViewBounds(bounds));
        }
    }

    // Delegate methods to modular components
    updateCurrentViewBounds(bounds) {
        return this.viewOperations.updateCurrentViewBounds(bounds);
    }

    updateAllViewBounds(bounds) {
        return this.viewOperations.updateAllViewBounds(bounds);
    }

    getViewBounds() {
        return this.viewOperations.getViewBounds();
    }

    setupViewTitleListeners(view, id) {
        return this.viewOperations.setupViewTitleListeners(view, id);
    }

    updateViewTitle(id, title) {
        return this.viewOperations.updateViewTitle(id, title);
    }

    switchToView(id) {
        return this.viewOperations.switchToView(id);
    }

    closeTab(id) {
        return this.viewOperations.closeTab(id);
    }

    hideAllViews() {
        const { views } = this;
        const mainWindow = this.mainWindow;

        if (!mainWindow || !mainWindow.getMainWindow) {
            return;
        }

        const electronMainWindow = mainWindow.getMainWindow();

        // Hide all views by removing them from the main window
        Object.keys(views).forEach(viewId => {
            const view = views[viewId];
            if (view && !view.webContents.isDestroyed()) {
                try {
                    electronMainWindow.removeBrowserView(view);
                } catch (error) {
                    console.log(`⚠️ ViewManager: Error hiding view ${viewId}:`, error.message);
                }
            }
        });

        this.currentViewId = null;
    }

    async navigateTo(url) {
        return await this.viewOperations.navigateTo(url);
    }

    // OAuth related methods
    async checkOAuthProgress(view, id) {
        return await this.oauthHandler.checkOAuthProgress(view, id);
    }

    async triggerGoogleSignIn(view, id) {
        return await this.oauthHandler.triggerGoogleSignIn(view, id);
    }

    async checkLoginStatus(view, id) {
        return await this.oauthHandler.checkLoginStatus(view, id);
    }

    async checkOAuthStatusForPopup(view, id, isPopupMode = false) {
        return await this.oauthHandler.checkOAuthStatusForPopup(view, id, isPopupMode);
    }

    async forceRedirectToX(view, id) {
        return await this.oauthHandler.forceRedirectToX(view, id);
    }

    async verifyOAuthSuccessAndRedirect(view, id, url) {
        return await this.oauthHandler.verifyOAuthSuccessAndRedirect(view, id, url);
    }

    // Session related methods
    async cleanupSession(view, id) {
        return await this.sessionManager.cleanupSession(view, id);
    }

    async clearAllSessions() {
        return await this.sessionManager.clearAllSessions();
    }

    autoCleanupLoadingTitles() {
        return this.sessionManager.autoCleanupLoadingTitles();
    }

    /**
     * Create a new browser view
     */
    async createBrowserView(url = 'https://www.google.com') {
        try {
            const view = new BrowserView({
                webPreferences: {
                    nodeIntegration: false,
                    contextIsolation: true,
                    webSecurity: true,
                    allowRunningInsecureContent: false,
                    experimentalFeatures: false,
                    // Add network configuration
                    partition: 'persist:main',
                    cache: false
                }
            });

            const id = ++this.viewCounter;
            this.views[id] = view;

            // Set bounds
            const bounds = this.getViewBounds();
            view.setBounds(bounds);

            // Load URL
            await view.webContents.loadURL(url);

            // Setup listeners
            this.setupViewTitleListeners(view, id);
            this.viewOperations.setupNavigationListeners(view, id);

            // Add to main window and switch to it
            this.mainWindow.getMainWindow().addBrowserView(view);
            this.currentViewId = id;

            // Send to renderer
            if (this.mainWindow && this.mainWindow.sendToWindow) {
                this.mainWindow.sendToWindow('tab-created', {
                    id: id,
                    url: url,
                    title: 'Loading...'
                });
            }

            return { id, view };

        } catch (error) {
            console.error('Error creating browser view:', error);
            throw error;
        }
    }

    /**
     * Create history view
     */
    async createHistoryView() {
        try {
            const view = new BrowserView({
                webPreferences: {
                    nodeIntegration: false,
                    contextIsolation: true,
                    preload: path.join(__dirname, '../../../pages/preload.js')
                }
            });

            const id = ++this.viewCounter;
            this.views[id] = view;

            // Set bounds
            const bounds = this.getViewBounds();
            view.setBounds(bounds);

            // Load history page
            const historyPath = path.join(__dirname, '../../../pages/history.html');
            await view.webContents.loadFile(historyPath);

            // Setup listeners
            this.setupViewTitleListeners(view, id);

            // Add to main window and switch to it
            this.mainWindow.getMainWindow().addBrowserView(view);
            this.currentViewId = id;

            // Send to renderer
            if (this.mainWindow && this.mainWindow.sendToWindow) {
                this.mainWindow.sendToWindow('tab-created', {
                    id: id,
                    url: 'history://local',
                    title: 'History'
                });
            }

            console.log(`✅ Created history view with ID: ${id}`);
            return { id, view };

        } catch (error) {
            console.error('Error creating history view:', error);
            throw error;
        }
    }

    /**
     * Create OAuth view for x.com
     */
    async createOAuthView(url = 'https://x.com') {
        try {
            console.log('🔐 Creating OAuth view for x.com...');

            const view = new BrowserView({
                webPreferences: {
                    nodeIntegration: false,
                    contextIsolation: true,
                    webSecurity: true,
                    allowRunningInsecureContent: false,
                    experimentalFeatures: false,
                    partition: 'persist:oauth-session' // Isolated session for OAuth
                }
            });

            const id = ++this.viewCounter;
            this.views[id] = view;

            // Store OAuth return URL
            view._oauthReturnUrl = url;
            view._isOAuthView = true;

            // Set bounds
            const bounds = this.getViewBounds();
            view.setBounds(bounds);

            // Setup listeners
            this.setupViewTitleListeners(view, id);
            this.viewOperations.setupNavigationListeners(view, id);

            // Setup OAuth-specific listeners
            view.webContents.on('did-navigate', async (event, navigationUrl) => {
                console.log(`🌐 OAuth navigation: ${navigationUrl}`);

                // Check for OAuth completion
                if (navigationUrl.includes('code=') || navigationUrl.includes('access_token=')) {
                    console.log('✅ OAuth success detected in navigation');
                    await this.verifyOAuthSuccessAndRedirect(view, id, navigationUrl);
                }
            });

            // Load URL
            await view.webContents.loadURL(url);

            // Add to main window and switch to it
            this.mainWindow.getMainWindow().addBrowserView(view);
            this.currentViewId = id;

            // Send to renderer
            if (this.mainWindow && this.mainWindow.sendToWindow) {
                this.mainWindow.sendToWindow('tab-created', {
                    id: id,
                    url: url,
                    title: 'OAuth Login'
                });
            }

            console.log(`✅ Created OAuth view with ID: ${id}`);
            return { id, view };

        } catch (error) {
            console.error('Error creating OAuth view:', error);
            throw error;
        }
    }

    /**
     * Auto-create new tab for x.com login
     */
    async autoCreateTabForXLogin() {
        try {
            console.log('🔐 Auto-creating new tab for x.com login...');
            const result = await this.createOAuthView('https://x.com');
            console.log('✅ Auto-created x.com login tab:', result.id);
            return result;
        } catch (error) {
            console.error('❌ Error auto-creating x.com login tab:', error);
            throw error;
        }
    }

    /**
     * Get all views
     */
    getAllViews() {
        return { ...this.views };
    }

    /**
     * Switch to tab
     */
    switchTab(id) {
        return this.viewOperations.switchToView(id);
    }

    /**
     * Get tab info
     */
    getTabInfo(id) {
        const view = this.views[id];
        if (view && !view.webContents.isDestroyed()) {
            return {
                url: view.webContents.getURL(),
                title: view.webContents.getTitle()
            };
        }
        return null;
    }

    /**
     * Cleanup all views
     */
    cleanup() {
        Object.keys(this.views).forEach(id => {
            this.closeTab(parseInt(id));
        });
    }
}

module.exports = ViewManager;
