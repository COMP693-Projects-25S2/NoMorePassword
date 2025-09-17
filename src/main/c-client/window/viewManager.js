const { BrowserView } = require('electron');
const path = require('path');

// Import modular components
const OAuthHandler = require('./oauthHandler');
const SessionManager = require('./sessionManager');
const ViewOperations = require('./viewOperations');

// BrowserView Manager - Refactored
class ViewManager {
    constructor(mainWindow, historyManager, apiPort = null) {
        this.mainWindow = mainWindow;
        this.historyManager = historyManager;
        this.apiPort = apiPort; // Store API port for C-Client API calls
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

    showAllViews() {
        const { views } = this;
        const mainWindow = this.mainWindow;

        if (!mainWindow || !mainWindow.getMainWindow) {
            return;
        }

        const electronMainWindow = mainWindow.getMainWindow();

        // Show all views by adding them back to the main window
        Object.keys(views).forEach(viewId => {
            const view = views[viewId];
            if (view && !view.webContents.isDestroyed()) {
                try {
                    electronMainWindow.addBrowserView(view);
                    console.log(`🔄 ViewManager: Shown view ${viewId}`);
                } catch (error) {
                    console.log(`⚠️ ViewManager: Error showing view ${viewId}:`, error.message);
                }
            }
        });

        // Set the first available view as current if no current view
        if (!this.currentViewId && Object.keys(views).length > 0) {
            const firstViewId = Object.keys(views)[0];
            this.currentViewId = firstViewId;
            const firstView = views[firstViewId];
            if (firstView && !firstView.webContents.isDestroyed()) {
                electronMainWindow.setBrowserView(firstView);
            }
        }
    }

    /**
     * Close all tabs and create a new default page
     */
    async closeAllTabsAndCreateDefault() {

        try {
            // Close all existing tabs and clear their sessions
            const viewIds = Object.keys(this.views);
            for (const viewId of viewIds) {
                // Clear session data before closing tab
                const view = this.views[viewId];
                if (view && view.webContents) {
                    try {
                        console.log(`🧹 Clearing session data for tab ${viewId} before user switch...`);
                        await view.webContents.session.clearStorageData({
                            storages: ['cookies', 'localStorage', 'sessionStorage', 'cache']
                        });
                        await view.webContents.session.clearCache();
                        console.log(`✅ Session data cleared for tab ${viewId}`);
                    } catch (error) {
                        console.error(`❌ Error clearing session for tab ${viewId}:`, error);
                    }
                }
                this.closeTab(viewId);
            }

            // Clear all views
            this.views = {};
            this.currentViewId = null;
            this.viewCounter = 0;

            // Notify renderer process to close all tabs in UI
            if (this.mainWindow && this.mainWindow.sendToWindow) {
                try {
                    this.mainWindow.sendToWindow('close-all-tabs');
                } catch (error) {
                    console.error('❌ ViewManager: Error sending close-all-tabs event:', error);
                }
            }

            // Create a new default tab with URL parameter injection
            const UrlParameterInjector = require('../utils/urlParameterInjector');
            const urlInjector = new UrlParameterInjector();
            const processedUrl = urlInjector.processUrl('https://www.google.com');

            const defaultView = await this.createBrowserView(processedUrl);

            if (defaultView) {

                // Notify renderer process to create tab UI for the new view
                if (this.mainWindow && this.mainWindow.sendToWindow) {
                    this.mainWindow.sendToWindow('auto-tab-created', {
                        id: defaultView.id,
                        title: 'Google',
                        url: processedUrl
                    });
                }

                return defaultView;
            } else {
                console.error('❌ ViewManager: Failed to create new default page');
                return null;
            }
        } catch (error) {
            console.error('❌ ViewManager: Error closing all tabs and creating default page:', error);
            return null;
        }
    }

    async navigateTo(url) {
        return await this.viewOperations.navigateTo(url);
    }

    goBack() {
        if (this.currentViewId && this.views[this.currentViewId]) {
            const currentView = this.views[this.currentViewId];
            if (currentView.webContents.canGoBack()) {
                currentView.webContents.goBack();
            }
        }
    }

    goForward() {
        if (this.currentViewId && this.views[this.currentViewId]) {
            const currentView = this.views[this.currentViewId];
            if (currentView.webContents.canGoForward()) {
                currentView.webContents.goForward();
            }
        }
    }

    refresh() {
        if (this.currentViewId && this.views[this.currentViewId]) {
            const currentView = this.views[this.currentViewId];
            currentView.webContents.reload();
        }
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
     * Check if URL is NSN
     */
    isNSNUrl(url) {
        if (!url || typeof url !== 'string') return false;
        try {
            const urlObj = new URL(url);
            return urlObj.hostname === 'localhost' && urlObj.port === '5000' ||
                urlObj.hostname === '127.0.0.1' && urlObj.port === '5000' ||
                urlObj.hostname === 'comp639nsn.pythonanywhere.com';
        } catch (error) {
            return false;
        }
    }

    /**
     * Get current user info from database
     */
    async getCurrentUserInfo() {
        try {
            const db = require('../sqlite/database');
            const stmt = db.prepare('SELECT * FROM local_users WHERE is_current = 1 LIMIT 1');
            const user = stmt.get();
            return user;
        } catch (error) {
            console.error('Error getting current user info:', error);
            return null;
        }
    }


    /**
     * Get user cookie from C-Client API (for existing registered users)
     */
    async getUserCookie(userId) {
        try {
            const axios = require('axios');
            const apiPort = this.apiPort || 4001; // Use stored API port or fallback
            const apiUrl = `http://localhost:${apiPort}`;

            const response = await axios.get(`${apiUrl}/api/cookie/${userId}`);
            if (response.data.success && response.data.has_cookie) {
                return response.data.cookie;
            }
            return null;
        } catch (error) {
            console.error('Error getting user cookie:', error);
            return null;
        }
    }

    /**
     * Set cookie in view's session
     */
    async setCookieInView(view, cookie) {
        try {
            // Parse cookie string and set it in the view's session
            const session = view.webContents.session;
            const cookies = session.cookies;

            // Check if this is a Flask session cookie (base64 encoded JSON)
            if (cookie.startsWith('eyJ') || cookie.includes('.')) {
                // This is a Flask session cookie, set it directly
                console.log(`🍪 ViewManager: Setting Flask session cookie: ${cookie.substring(0, 50)}...`);
                await cookies.set({
                    url: 'http://localhost:5000',
                    name: 'session',
                    value: cookie,
                    domain: 'localhost',
                    path: '/',
                    httpOnly: true,
                    secure: false
                });
            } else {
                // Parse the cookie string (format: "session=abc123; user_id=456; role=traveller")
                const cookieParts = cookie.split(';');
                for (const part of cookieParts) {
                    const [name, value] = part.trim().split('=');
                    if (name && value) {
                        await cookies.set({
                            url: 'http://localhost:5000',
                            name: name.trim(),
                            value: value.trim(),
                            domain: 'localhost',
                            path: '/',
                            httpOnly: true,
                            secure: false
                        });
                    }
                }
            }
            console.log(`🍪 ViewManager: Set cookie in view session`);
        } catch (error) {
            console.error('Error setting cookie in view:', error);
        }
    }

    /**
     * Create a new browser view
     */
    async createBrowserView(url = 'https://www.google.com') {
        try {
            // Get current user info and cookie
            const currentUser = await this.getCurrentUserInfo();
            let processedUrl = url;

            // Process URL with parameter injection
            const UrlParameterInjector = require('../utils/urlParameterInjector');
            const urlInjector = new UrlParameterInjector();
            processedUrl = urlInjector.processUrl(url);

            console.log(`🔗 ViewManager: Creating browser view with URL: ${url} -> ${processedUrl}`);

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

            // If this is NSN and we have a user, NSN will query B-Client for cookie
            if (this.isNSNUrl(url) && currentUser) {
                console.log(`🍪 ViewManager: NSN detected, NSN will query B-Client for cookie for user ${currentUser.username}`);
                // NSN will handle cookie querying from B-Client, no need to do it here
            }

            // Load processed URL with injected parameters
            await view.webContents.loadURL(processedUrl);

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
                    preload: path.join(__dirname, '../pages/preload.js')
                }
            });

            const id = ++this.viewCounter;
            this.views[id] = view;

            // Set bounds
            const bounds = this.getViewBounds();
            view.setBounds(bounds);

            // Load history page
            const historyPath = path.join(__dirname, '../pages/history.html');
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
     * Find NSN tab
     */
    findNSNTab() {
        for (const [id, view] of Object.entries(this.views)) {
            const url = view.webContents.getURL();
            if (url.includes('localhost:5000') || url.includes('127.0.0.1:5000')) {
                console.log(`🔍 ViewManager: Found NSN tab with ID ${id}, URL: ${url}`);
                return view;
            }
        }
        console.log(`🔍 ViewManager: No NSN tab found`);
        return null;
    }

    /**
     * Create view with cookie
     */
    createViewWithCookie(url, cookie, username) {
        try {
            console.log(`🔄 ViewManager: Creating new view with cookie for user: ${username}`);

            // Create new view
            const view = new BrowserView({
                webPreferences: {
                    nodeIntegration: false,
                    contextIsolation: true,
                    webSecurity: true
                }
            });

            const id = ++this.viewCounter;
            this.views[id] = view;
            this.currentViewId = id;

            // Set up the view
            this.mainWindow.getMainWindow().setBrowserView(view);
            this.setupViewTitleListeners(view, id);
            this.updateCurrentViewBounds(this.getViewBounds());

            // Set cookie before loading URL
            view.webContents.session.cookies.set({
                url: 'http://localhost:5000',
                name: 'session',
                value: cookie,
                httpOnly: true,
                secure: false
            }).then(() => {
                console.log(`🔄 ViewManager: Cookie set successfully for user: ${username}`);

                // Load the URL
                view.webContents.loadURL(url);
                console.log(`🔄 ViewManager: View created with cookie for user: ${username}`);
            }).catch(error => {
                console.error(`❌ ViewManager: Failed to set cookie for user ${username}:`, error);
                // Still load the URL even if cookie setting fails
                view.webContents.loadURL(url);
            });

            return view;
        } catch (error) {
            console.error(`❌ ViewManager: Error creating view with cookie:`, error);
            return null;
        }
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
