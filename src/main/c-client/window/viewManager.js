const { BrowserView } = require('electron');
const path = require('path');

// Import modular components
const OAuthHandler = require('./oauthHandler');
const SessionManager = require('./sessionManager');
const ViewOperations = require('./viewOperations');

// BrowserView Manager - Refactored
class ViewManager {
    constructor(mainWindow, historyManager, apiPort = null) {
        // Handle both ElectronApp instance and BrowserWindow instance
        if (mainWindow && mainWindow.mainWindow) {
            // If mainWindow is ElectronApp instance, get the actual BrowserWindow
            this.mainWindow = mainWindow.mainWindow;
            this.electronApp = mainWindow; // Store reference to ElectronApp for handleNSNResponse
        } else {
            // If mainWindow is already BrowserWindow instance
            this.mainWindow = mainWindow;
            this.electronApp = null;
        }

        // Initialize registered websites array
        this.registeredWebsites = [];

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
        if (this.mainWindow && this.mainWindow.setResizeCallback) {
            this.mainWindow.setResizeCallback((bounds) => this.viewOperations.updateCurrentViewBounds(bounds));
            this.mainWindow.setMoveCallback((bounds) => this.viewOperations.updateAllViewBounds(bounds));
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

        if (!mainWindow || !mainWindow.windowManager || !mainWindow.windowManager.getMainWindow) {
            console.warn(`⚠️ ViewManager: Cannot hide views - mainWindow not available`);
            return;
        }

        const electronMainWindow = mainWindow.windowManager.getMainWindow();
        const viewIds = Object.keys(views);

        console.log(`🧹 ViewManager: Hiding ${viewIds.length} views from main window`);

        // Hide all views by removing them from the main window
        viewIds.forEach(viewId => {
            const view = views[viewId];
            if (view && !view.webContents.isDestroyed()) {
                try {
                    electronMainWindow.removeBrowserView(view);
                    console.log(`✅ ViewManager: Successfully hid view ${viewId} from main window`);
                } catch (error) {
                    console.error(`❌ ViewManager: Error hiding view ${viewId}:`, error);
                }
            } else {
                console.warn(`⚠️ ViewManager: View ${viewId} is already destroyed or not available`);
            }
        });

        this.currentViewId = null;
        console.log(`✅ ViewManager: All views hidden, currentViewId set to null`);
    }

    showAllViews() {
        const { views } = this;
        const mainWindow = this.mainWindow;

        if (!mainWindow || !mainWindow.windowManager || !mainWindow.windowManager.getMainWindow) {
            return;
        }

        const electronMainWindow = mainWindow.windowManager.getMainWindow();

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
        console.log(`🔄 ViewManager: Starting closeAllTabsAndCreateDefault process...`);
        console.log(`📊 ViewManager: Current state before closing:`);
        console.log(`   - Total views: ${Object.keys(this.views).length}`);
        console.log(`   - Current view ID: ${this.currentViewId}`);
        console.log(`   - View counter: ${this.viewCounter}`);
        console.log(`   - View IDs: [${Object.keys(this.views).join(', ')}]`);

        try {
            // First, hide all views from the main window
            console.log(`🧹 ViewManager: Step 1 - Hiding all views from main window...`);
            this.hideAllViews();

            // Close all existing tabs and clear their sessions
            const viewIds = Object.keys(this.views);
            console.log(`🧹 ViewManager: Step 2 - Closing ${viewIds.length} tabs during user switch...`);

            if (viewIds.length === 0) {
                console.log(`ℹ️ ViewManager: No views to close, proceeding to create default page`);
            } else {
                for (const viewId of viewIds) {
                    console.log(`🔍 ViewManager: Processing view ${viewId}...`);
                    try {
                        const view = this.views[viewId];
                        console.log(`   - View exists: ${!!view}`);
                        console.log(`   - View has webContents: ${!!(view && view.webContents)}`);
                        console.log(`   - View webContents destroyed: ${view && view.webContents ? view.webContents.isDestroyed() : 'N/A'}`);

                        // Clear session data before closing tab
                        if (view && view.webContents && !view.webContents.isDestroyed()) {
                            console.log(`🧹 ViewManager: Clearing session data for view ${viewId}...`);
                            try {
                                await view.webContents.session.clearStorageData({
                                    storages: ['cookies', 'localStorage', 'sessionStorage', 'cache']
                                });
                                await view.webContents.session.clearCache();
                                console.log(`✅ ViewManager: Session data cleared for view ${viewId}`);
                            } catch (sessionError) {
                                console.error(`❌ ViewManager: Error clearing session for view ${viewId}:`, sessionError);
                            }
                        } else {
                            console.log(`⚠️ ViewManager: Skipping session cleanup for view ${viewId} - view or webContents not available`);
                        }

                        // Close the tab
                        console.log(`🗑️ ViewManager: Closing view ${viewId}...`);
                        this.closeTab(viewId);
                        console.log(`✅ ViewManager: View ${viewId} closed successfully`);

                        // Verify the view was removed from views object
                        if (this.views[viewId]) {
                            console.warn(`⚠️ ViewManager: View ${viewId} still exists in views object after closeTab`);
                        } else {
                            console.log(`✅ ViewManager: View ${viewId} successfully removed from views object`);
                        }

                    } catch (error) {
                        console.error(`❌ ViewManager: Error closing view ${viewId}:`, error);
                        console.error(`   - Error message: ${error.message}`);
                        console.error(`   - Error stack: ${error.stack}`);
                    }
                }
            }

            // Clear all views
            console.log(`🧹 ViewManager: Step 3 - Clearing views object and resetting state...`);
            const remainingViews = Object.keys(this.views).length;
            console.log(`   - Views remaining before clear: ${remainingViews}`);

            this.views = {};
            this.currentViewId = null;
            this.viewCounter = 0;

            console.log(`✅ ViewManager: Views object cleared and state reset`);
            console.log(`   - Views after clear: ${Object.keys(this.views).length}`);
            console.log(`   - Current view ID after clear: ${this.currentViewId}`);
            console.log(`   - View counter after clear: ${this.viewCounter}`);

            // Notify renderer process to close all tabs in UI
            console.log(`🧹 ViewManager: Step 4 - Notifying renderer process to close all tabs in UI...`);
            if (this.electronApp && this.electronApp.sendToWindow) {
                try {
                    this.electronApp.sendToWindow('close-all-tabs');
                    console.log(`✅ ViewManager: Sent close-all-tabs notification to renderer`);
                } catch (error) {
                    console.error(`❌ ViewManager: Error sending close-all-tabs notification:`, error);
                }
            } else {
                console.warn(`⚠️ ViewManager: Electron app or sendToWindow method not available for UI notification`);
            }

            // Create a new default tab with URL parameter injection
            console.log(`🔄 ViewManager: Step 5 - Creating new default page...`);
            try {
                const { getUrlParameterInjector } = require('../utils/urlParameterInjector');
                const urlInjector = getUrlParameterInjector();
                console.log(`   - URL injector available: ${!!urlInjector}`);

                const processedUrl = await urlInjector.processUrl('https://www.google.com');
                console.log(`   - Original URL: https://www.google.com`);
                console.log(`   - Processed URL: ${processedUrl}`);
                console.log(`   - URL injection successful: ${!!processedUrl}`);

                const defaultView = await this.createBrowserView(processedUrl);
                console.log(`   - createBrowserView result: ${!!defaultView}`);
                console.log(`   - Default view ID: ${defaultView ? defaultView.id : 'N/A'}`);

                if (defaultView) {
                    console.log(`✅ ViewManager: New default page created successfully`);
                    console.log(`   - Default view ID: ${defaultView.id}`);
                    console.log(`   - Default view exists in views object: ${!!this.views[defaultView.id]}`);
                    console.log(`   - Current view ID set to: ${this.currentViewId}`);
                    console.log(`   - Total views after creation: ${Object.keys(this.views).length}`);

                    // Notify renderer process to create tab UI for the new view
                    console.log(`📡 ViewManager: Sending tab UI notification for new default page...`);
                    if (this.electronApp && this.electronApp.sendToWindow) {
                        try {
                            this.electronApp.sendToWindow('auto-tab-created', {
                                id: defaultView.id,
                                title: 'Google',
                                url: processedUrl
                            });
                            console.log(`✅ ViewManager: Tab UI notification sent for new default page`);
                        } catch (error) {
                            console.error(`❌ ViewManager: Error sending tab UI notification:`, error);
                        }
                    } else {
                        console.warn(`⚠️ ViewManager: Electron app or sendToWindow method not available for tab UI notification`);
                    }

                    console.log(`🎉 ViewManager: closeAllTabsAndCreateDefault completed successfully`);
                    return defaultView;
                } else {
                    console.error(`❌ ViewManager: Failed to create default page - createBrowserView returned null/undefined`);
                    console.error(`   - Views object after failed creation: ${Object.keys(this.views).length}`);
                    console.error(`   - Current view ID after failed creation: ${this.currentViewId}`);
                    return null;
                }
            } catch (error) {
                console.error(`❌ ViewManager: Error creating default page:`, error);
                console.error(`   - Error message: ${error.message}`);
                console.error(`   - Error stack: ${error.stack}`);
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

    /**
     * Clear only NSN-related sessions (views and partitions)
     */
    async clearNSNSessions() {
        return await this.sessionManager.clearNSNSessions();
    }

    autoCleanupLoadingTitles() {
        return this.sessionManager.autoCleanupLoadingTitles();
    }

    /**
     * Check if URL belongs to a registered website (based on B-client configuration)
     */
    isRegisteredWebsiteUrl(url) {
        if (!url || typeof url !== 'string') {
            console.log(`🔍 ViewManager: isRegisteredWebsiteUrl - Invalid URL:`, url);
            return false;
        }
        try {
            const urlObj = new URL(url);
            const currentOrigin = urlObj.origin;
            console.log(`🔍 ViewManager: isRegisteredWebsiteUrl - Checking URL:`, url);
            console.log(`🔍 ViewManager: isRegisteredWebsiteUrl - Current origin:`, currentOrigin);
            console.log(`🔍 ViewManager: isRegisteredWebsiteUrl - Registered websites:`, this.registeredWebsites);

            // Check against registered website root paths
            if (this.registeredWebsites && Array.isArray(this.registeredWebsites)) {
                const isRegistered = this.registeredWebsites.some(website => {
                    try {
                        const websiteUrl = new URL(website.rootPath);
                        console.log(`🔍 ViewManager: isRegisteredWebsiteUrl - Comparing with:`, websiteUrl.origin);
                        return websiteUrl.origin === currentOrigin;
                    } catch (error) {
                        console.warn('Invalid website root path:', website.rootPath);
                        return false;
                    }
                });
                console.log(`🔍 ViewManager: isRegisteredWebsiteUrl - Is registered via config:`, isRegistered);
                if (isRegistered) return true;
            }

            // Fallback to hardcoded NSN URLs for backward compatibility
            const isNSNUrl = urlObj.hostname === 'localhost' && urlObj.port === '5000' ||
                urlObj.hostname === '127.0.0.1' && urlObj.port === '5000' ||
                urlObj.hostname === 'comp639nsn.pythonanywhere.com';
            console.log(`🔍 ViewManager: isRegisteredWebsiteUrl - Is NSN URL (fallback):`, isNSNUrl);
            console.log(`🔍 ViewManager: isRegisteredWebsiteUrl - Hostname:`, urlObj.hostname);
            console.log(`🔍 ViewManager: isRegisteredWebsiteUrl - Port:`, urlObj.port);
            return isNSNUrl;
        } catch (error) {
            console.error(`❌ ViewManager: isRegisteredWebsiteUrl - Error:`, error);
            return false;
        }
    }

    /**
     * Get website configuration for a given URL
     */
    getWebsiteConfig(url) {
        if (!url || typeof url !== 'string') return null;
        try {
            const urlObj = new URL(url);
            const currentOrigin = urlObj.origin;

            if (this.registeredWebsites && Array.isArray(this.registeredWebsites)) {
                return this.registeredWebsites.find(website => {
                    try {
                        const websiteUrl = new URL(website.rootPath);
                        return websiteUrl.origin === currentOrigin;
                    } catch (error) {
                        return false;
                    }
                });
            }

            return null;
        } catch (error) {
            return null;
        }
    }

    /**
     * Get session partition name for a website
     */
    getSessionPartitionForWebsite(url) {
        const websiteConfig = this.getWebsiteConfig(url);
        if (websiteConfig && websiteConfig.sessionPartition) {
            return websiteConfig.sessionPartition;
        }

        // Default partition for registered websites
        if (this.isRegisteredWebsiteUrl(url)) {
            return 'persist:registered';
        }

        // Default partition for other websites
        return 'persist:main';
    }

    /**
     * Register website configuration from B-client
     */
    registerWebsite(websiteConfig) {
        if (!this.registeredWebsites) {
            this.registeredWebsites = [];
        }

        // Check if website already registered
        const existingIndex = this.registeredWebsites.findIndex(w => w.rootPath === websiteConfig.rootPath);
        if (existingIndex >= 0) {
            // Update existing configuration
            this.registeredWebsites[existingIndex] = websiteConfig;
        } else {
            // Add new website configuration
            this.registeredWebsites.push(websiteConfig);
        }

        console.log('🌐 ViewManager: Website registered:', websiteConfig);
        console.log('🌐 ViewManager: Total registered websites:', this.registeredWebsites.length);
    }

    /**
     * Legacy method for backward compatibility - checks if URL is NSN
     * @deprecated Use isRegisteredWebsiteUrl instead
     */
    isNSNUrl(url) {
        // For backward compatibility, check if it's a registered website
        return this.isRegisteredWebsiteUrl(url);
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
            const apiPort = this.apiPort; // Use stored NodeManager API port
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
    async setCookieInView(view, cookie, nsnUrl = null) {
        try {
            // Parse cookie string and set it in the view's session
            const session = view.webContents.session;
            const cookies = session.cookies;

            // Get NSN URL - prefer provided parameter, fallback to configuration for backward compatibility
            let targetUrl, targetDomain;
            if (nsnUrl) {
                targetUrl = nsnUrl;
                try {
                    const urlObj = new URL(nsnUrl);
                    targetDomain = urlObj.hostname;
                    console.log(`🍪 ViewManager: Using provided NSN URL: ${targetUrl}, domain: ${targetDomain}`);
                } catch (error) {
                    console.error(`🍪 ViewManager: Invalid NSN URL provided: ${nsnUrl}`);
                    return false;
                }
            } else {
                // Fallback to configuration (should be avoided in multi-tenant scenarios)
                const apiConfig = require('../config/apiConfig');
                const nsnConfig = apiConfig.getCurrentNsnWebsite();
                targetUrl = nsnConfig.url;
                targetDomain = nsnConfig.domain.split(':')[0];
                console.warn(`🍪 ViewManager: Using configuration NSN URL (not recommended for multi-tenant): ${targetUrl}`);
            }

            // Check if this is a JSON session cookie or Flask session cookie
            if (cookie.startsWith('{') || cookie.startsWith('eyJ') || cookie.includes('.')) {
                // This is a JSON or Flask session cookie, set it directly
                if (cookie.startsWith('{')) {
                    console.log(`🍪 ViewManager: Setting JSON session cookie: ${cookie.substring(0, 50)}...`);
                } else {
                    console.log(`🍪 ViewManager: Setting Flask session cookie: ${cookie.substring(0, 50)}...`);
                }
                await cookies.set({
                    url: targetUrl,
                    name: 'session',
                    value: cookie,
                    domain: targetDomain,
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
                            url: targetUrl,
                            name: name.trim(),
                            value: value.trim(),
                            domain: targetDomain,
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
            const { getUrlParameterInjector } = require('../utils/urlParameterInjector');
            const urlInjector = getUrlParameterInjector();
            processedUrl = await urlInjector.processUrl(url);

            console.log(`🔗 ViewManager: Creating browser view with URL: ${url} -> ${processedUrl}`);

            // Determine which session partition to use based on URL
            const sessionPartition = this.getSessionPartitionForWebsite(processedUrl);
            console.log(`🔗 ViewManager: Using session partition '${sessionPartition}' for URL: ${processedUrl}`);

            const view = new BrowserView({
                webPreferences: {
                    nodeIntegration: false,
                    contextIsolation: true,
                    webSecurity: true,
                    allowRunningInsecureContent: false,
                    experimentalFeatures: false,
                    // Use appropriate session partition
                    partition: sessionPartition,
                    cache: false
                }
            });

            const id = ++this.viewCounter;
            this.views[id] = view;

            // Set bounds
            const bounds = this.getViewBounds();
            view.setBounds(bounds);

            // If this is a registered website and we have a user, website will query B-Client for cookie
            if (this.isRegisteredWebsiteUrl(url) && currentUser) {
                const websiteConfig = this.getWebsiteConfig(url);
                console.log(`🍪 ViewManager: Registered website detected (${websiteConfig?.name || 'Unknown'}), will query B-Client for cookie for user ${currentUser.username}`);

                // Check WebSocket connection status for registered websites
                if (this.electronApp && this.electronApp.webSocketClient) {
                    console.log(`🔍 ViewManager: Checking WebSocket connection status for registered website...`);
                    console.log(`🔍 ViewManager: WebSocket client exists:`, !!this.electronApp.webSocketClient);
                    console.log(`🔍 ViewManager: WebSocket client connected:`, this.electronApp.webSocketClient.isConnected);

                    if (!this.electronApp.webSocketClient.isConnected) {
                        console.log(`⚠️ ViewManager: WebSocket connection is not active for registered website`);
                        console.log(`⚠️ ViewManager: This may cause issues with B-Client communication`);
                        console.log(`⚠️ ViewManager: WebSocket will be reconnected when NSN response is detected`);
                    } else {
                        console.log(`✅ ViewManager: WebSocket connection is active for registered website`);
                    }
                }
                // Website will handle cookie querying from B-Client, no need to do it here
            }

            // Load processed URL with injected parameters
            await view.webContents.loadURL(processedUrl);

            // Setup listeners
            this.setupViewTitleListeners(view, id);
            this.viewOperations.setupNavigationListeners(view, id);

            // Add website response detection for registered website URLs
            console.log(`🔍 ViewManager: Checking if URL needs website response detection:`, url);
            const needsDetection = this.isRegisteredWebsiteUrl(url);
            console.log(`🔍 ViewManager: URL needs website response detection:`, needsDetection);
            if (needsDetection) {
                console.log(`🔍 ViewManager: Setting up website response detection for view ${id}`);
                this.setupWebsiteResponseDetection(view, id);
            } else {
                console.log(`🔍 ViewManager: Skipping website response detection for view ${id} - not a registered website`);
            }

            // Add to main window and switch to it
            try {
                // Get the actual Electron BrowserWindow instance
                const electronMainWindow = this.mainWindow.windowManager ? this.mainWindow.windowManager.getMainWindow() : this.mainWindow;
                if (electronMainWindow && typeof electronMainWindow.addBrowserView === 'function') {
                    electronMainWindow.addBrowserView(view);
                    console.log(`✅ ViewManager: Successfully added view ${id} to main window`);
                } else {
                    console.error(`❌ ViewManager: Cannot add view ${id} to main window - addBrowserView not available`);
                }
            } catch (error) {
                console.error(`❌ ViewManager: Error adding view ${id} to main window:`, error);
            }
            this.currentViewId = id;

            // Send to renderer
            if (this.electronApp && this.electronApp.sendToWindow) {
                this.electronApp.sendToWindow('tab-created', {
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
            this.mainWindow.addBrowserView(view);
            this.currentViewId = id;

            // Send to renderer
            if (this.electronApp && this.electronApp.sendToWindow) {
                this.electronApp.sendToWindow('tab-created', {
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
            this.mainWindow.windowManager.getMainWindow().addBrowserView(view);
            this.currentViewId = id;

            // Send to renderer
            if (this.electronApp && this.electronApp.sendToWindow) {
                this.electronApp.sendToWindow('tab-created', {
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
     * Get current view
     */
    getCurrentView() {
        if (this.currentViewId && this.views[this.currentViewId]) {
            const view = this.views[this.currentViewId];
            if (!view.webContents.isDestroyed()) {
                return {
                    id: this.currentViewId,
                    webContents: view.webContents,
                    view: view
                };
            }
        }
        return null;
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
        // Get NSN URL from configuration for comparison
        const apiConfig = require('../config/apiConfig');
        const nsnConfig = apiConfig.getCurrentNsnWebsite();
        const nsnDomain = nsnConfig.domain;

        for (const [id, view] of Object.entries(this.views)) {
            const url = view.webContents.getURL();
            if (url.includes('localhost:5000') || url.includes('127.0.0.1:5000') || url.includes(nsnDomain)) {
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
    createViewWithCookie(url, cookie, username, nsnUrl = null) {
        try {
            console.log(`🔄 ViewManager: Creating new view with cookie for user: ${username}`);

            // Determine which session partition to use based on URL
            let sessionPartition = 'persist:main';
            if (this.isNSNUrl(url)) {
                sessionPartition = 'persist:nsn';
                console.log(`🔄 ViewManager: Using NSN session partition for cookie view: ${url}`);
            }

            // Create new view
            const view = new BrowserView({
                webPreferences: {
                    nodeIntegration: false,
                    contextIsolation: true,
                    webSecurity: true,
                    // Use appropriate session partition
                    partition: sessionPartition
                }
            });

            const id = ++this.viewCounter;
            this.views[id] = view;
            this.currentViewId = id;

            // Set up the view
            this.mainWindow.windowManager.getMainWindow().setBrowserView(view);
            this.setupViewTitleListeners(view, id);
            this.updateCurrentViewBounds(this.getViewBounds());

            // Set cookie before loading URL
            // Get NSN URL - prefer provided parameter, fallback to configuration
            let targetUrl;
            if (nsnUrl) {
                targetUrl = nsnUrl;
                console.log(`🔄 ViewManager: Using provided NSN URL for cookie: ${targetUrl}`);
            } else {
                const apiConfig = require('../config/apiConfig');
                const nsnConfig = apiConfig.getCurrentNsnWebsite();
                targetUrl = nsnConfig.url;
                console.warn(`🔄 ViewManager: Using configuration NSN URL (not recommended for multi-tenant): ${targetUrl}`);
            }

            view.webContents.session.cookies.set({
                url: targetUrl,
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
     * Setup NSN response detection for WebSocket connection
     * @param {BrowserView} view - Browser view instance
     * @param {number} id - View ID
     */
    setupWebsiteResponseDetection(view, id) {
        try {
            console.log(`🔍 ViewManager: ===== SETTING UP NSN RESPONSE DETECTION =====`);
            console.log(`🔍 ViewManager: Setting up NSN response detection for view ${id}`);
            console.log(`🔍 ViewManager: View object:`, !!view);
            console.log(`🔍 ViewManager: WebContents object:`, !!view.webContents);
            console.log(`🔍 ViewManager: Current URL:`, view.webContents.getURL());

            // Start detection immediately when DOM content is loaded
            console.log(`🔍 ViewManager: Adding DOM-ready event listener for immediate detection...`);
            view.webContents.once('dom-ready', async () => {
                console.log(`🔍 ViewManager: ===== DOM-READY EVENT TRIGGERED =====`);
                console.log(`🔍 ViewManager: DOM content loaded for view ${id}`);
                console.log(`🔍 ViewManager: Current URL: ${view.webContents.getURL()}`);

                // Wait a short time for any dynamic content to be injected
                console.log(`🔍 ViewManager: Waiting 50ms for dynamic content injection...`);
                await new Promise(resolve => setTimeout(resolve, 50));

                await this.detectNSNResponse(view, id, 'DOM-READY');
            });

            // Add backup event listener for page load completion
            console.log(`🔍 ViewManager: Adding did-finish-load event listener as backup...`);
            view.webContents.once('did-finish-load', async () => {
                console.log(`🔍 ViewManager: ===== DID-FINISH-LOAD EVENT TRIGGERED (BACKUP) =====`);
                console.log(`🔍 ViewManager: Page load completed for view ${id}`);
                console.log(`🔍 ViewManager: Current URL: ${view.webContents.getURL()}`);

                await this.detectNSNResponse(view, id, 'DID-FINISH-LOAD');
            });

            // Add another backup event listener for page load stop
            console.log(`🔍 ViewManager: Adding did-stop-loading event listener as backup...`);
            view.webContents.once('did-stop-loading', async () => {
                console.log(`🔍 ViewManager: ===== DID-STOP-LOADING EVENT TRIGGERED (BACKUP) =====`);
                console.log(`🔍 ViewManager: Page stopped loading for view ${id}`);
                console.log(`🔍 ViewManager: Current URL: ${view.webContents.getURL()}`);

                await this.detectNSNResponse(view, id, 'DID-STOP-LOADING');
            });

            // Add error event listener
            console.log(`🔍 ViewManager: Adding did-fail-load event listener...`);
            view.webContents.once('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
                console.error(`❌ ViewManager: ===== PAGE LOAD FAILED =====`);
                console.error(`❌ ViewManager: View ${id} failed to load`);
                console.error(`❌ ViewManager: Error code: ${errorCode}`);
                console.error(`❌ ViewManager: Error description: ${errorDescription}`);
                console.error(`❌ ViewManager: URL: ${validatedURL}`);
            });

            console.log(`🔍 ViewManager: ===== NSN RESPONSE DETECTION SETUP COMPLETED =====`);
        } catch (error) {
            console.error(`❌ ViewManager: ===== ERROR SETTING UP NSN RESPONSE DETECTION =====`);
            console.error(`❌ ViewManager: Error setting up NSN response detection:`, error);
        }
    }

    /**
     * Detect NSN response in the page
     * @param {BrowserView} view - Browser view instance
     * @param {number} id - View ID
     * @param {string} trigger - Event that triggered the detection
     */
    async detectNSNResponse(view, id, trigger) {
        try {
            console.log(`🔍 ViewManager: ===== EXECUTING JAVASCRIPT DETECTION (${trigger}) =====`);
            console.log(`🔍 ViewManager: View ID: ${id}`);
            console.log(`🔍 ViewManager: Current URL: ${view.webContents.getURL()}`);
            console.log(`🔍 ViewManager: Executing JavaScript to check for NSN response...`);

            const responseData = await view.webContents.executeJavaScript(`
                (() => {
                    try {
                        console.log('🔍 JavaScript: ===== STARTING NSN RESPONSE DETECTION (${trigger}) =====');
                        console.log('🔍 JavaScript: Document ready state:', document.readyState);
                        console.log('🔍 JavaScript: Document title:', document.title);
                        console.log('🔍 JavaScript: Document URL:', window.location.href);
                        
                        // Look for the c-client-responses div
                        console.log('🔍 JavaScript: Looking for c-client-responses div...');
                        const cClientResponsesDiv = document.getElementById('c-client-responses');
                        console.log('🔍 JavaScript: c-client-responses div found:', !!cClientResponsesDiv);
                        
                        if (cClientResponsesDiv) {
                            console.log('🔍 JavaScript: ===== FOUND C-CLIENT-RESPONSES DIV (${trigger}) =====');
                            console.log('🔍 JavaScript: Div element:', cClientResponsesDiv);
                            console.log('🔍 JavaScript: Div style display:', cClientResponsesDiv.style.display);
                            console.log('🔍 JavaScript: Div innerHTML length:', cClientResponsesDiv.innerHTML.length);
                            
                            const jsonText = cClientResponsesDiv.textContent.trim();
                            console.log('🔍 JavaScript: JSON text length:', jsonText.length);
                            console.log('🔍 JavaScript: JSON text preview:', jsonText.substring(0, 200));
                            console.log('🔍 JavaScript: Full JSON text:', jsonText);
                            
                            try {
                                const parsed = JSON.parse(jsonText);
                                console.log('🔍 JavaScript: ===== JSON PARSING SUCCESS (${trigger}) =====');
                                console.log('🔍 JavaScript: Parsed JSON object:', parsed);
                                console.log('🔍 JavaScript: Action:', parsed.action);
                                console.log('🔍 JavaScript: WebSocket URL:', parsed.websocket_url);
                                console.log('🔍 JavaScript: User ID:', parsed.user_id);
                                console.log('🔍 JavaScript: Username:', parsed.username);
                                console.log('🔍 JavaScript: Needs Registration:', parsed.needs_registration);
                                console.log('🔍 JavaScript: ===== RETURNING PARSED DATA (${trigger}) =====');
                                return parsed;
                            } catch (e) {
                                console.log('🔍 JavaScript: ===== JSON PARSING FAILED (${trigger}) =====');
                                console.log('🔍 JavaScript: Parse error:', e.message);
                                console.log('🔍 JavaScript: Error stack:', e.stack);
                                console.log('🔍 JavaScript: Raw JSON text:', jsonText);
                                return null;
                            }
                        }
                        
                        // Fallback: Check if the page contains NSN response data in body text
                        console.log('🔍 JavaScript: ===== FALLBACK: CHECKING BODY TEXT (${trigger}) =====');
                        console.log('🔍 JavaScript: No c-client-responses div found, checking body text...');
                        const bodyText = document.body ? document.body.innerText : '';
                        console.log('🔍 JavaScript: Body text length:', bodyText.length);
                        console.log('🔍 JavaScript: Body text preview:', bodyText.substring(0, 300));
                        
                        // Use regex to find JSON in body text
                        const jsonMatch = bodyText.match(/\\{[\\s\\S]*?"action"[\\s\\S]*?\\}/);
                        console.log('🔍 JavaScript: JSON match found in body:', !!jsonMatch);
                        
                        if (jsonMatch) {
                            console.log('🔍 JavaScript: ===== FOUND JSON IN BODY TEXT (${trigger}) =====');
                            console.log('🔍 JavaScript: Matched text:', jsonMatch[0]);
                            try {
                                const parsed = JSON.parse(jsonMatch[0]);
                                console.log('🔍 JavaScript: Successfully parsed JSON from body text:', parsed);
                                return parsed;
                            } catch (e) {
                                console.log('🔍 JavaScript: Failed to parse JSON from body:', e.message);
                                return null;
                            }
                        }
                        
                        console.log('🔍 JavaScript: ===== NO NSN RESPONSE FOUND (${trigger}) =====');
                        console.log('🔍 JavaScript: No c-client-responses div and no JSON in body text');
                        return null;
                    } catch (error) {
                        console.error('❌ JavaScript: ===== ERROR IN DETECTION (${trigger}) =====');
                        console.error('❌ JavaScript: Error checking for NSN response:', error);
                        console.error('❌ JavaScript: Error stack:', error.stack);
                        return null;
                    }
                })()
            `);

            console.log(`🔍 ViewManager: ===== JAVASCRIPT EXECUTION COMPLETED (${trigger}) =====`);
            console.log(`🔍 ViewManager: Response data type:`, typeof responseData);
            console.log(`🔍 ViewManager: Response data:`, responseData);
            console.log(`🔍 ViewManager: Response data is null:`, responseData === null);
            console.log(`🔍 ViewManager: Response data is undefined:`, responseData === undefined);

            if (responseData && responseData.action) {
                console.log(`🔍 ViewManager: ===== NSN RESPONSE DETECTED (${trigger}) =====`);
                console.log(`🔍 ViewManager: Detected NSN response:`, responseData);
                console.log(`🔍 ViewManager: Action: ${responseData.action}`);
                console.log(`🔍 ViewManager: User ID: ${responseData.user_id}`);
                console.log(`🔍 ViewManager: Username: ${responseData.username}`);
                console.log(`🔍 ViewManager: WebSocket URL: ${responseData.websocket_url}`);
                console.log(`🔍 ViewManager: B-Client URL: ${responseData.b_client_url}`);
                console.log(`🔍 ViewManager: Needs Registration: ${responseData.needs_registration}`);
                console.log(`🔍 ViewManager: Has Cookie: ${responseData.has_cookie}`);
                console.log(`🔍 ViewManager: Has Node: ${responseData.has_node}`);
                console.log(`🔍 ViewManager: Message: ${responseData.message}`);

                // Process the NSN response
                if (this.electronApp && this.electronApp.handleNSNResponse) {
                    console.log(`🔍 ViewManager: ===== CALLING ELECTRON APP HANDLER (${trigger}) =====`);
                    console.log(`🔍 ViewManager: Electron app available:`, !!this.electronApp);
                    console.log(`🔍 ViewManager: handleNSNResponse method available:`, typeof this.electronApp.handleNSNResponse === 'function');
                    console.log(`🔍 ViewManager: Calling electron app handleNSNResponse...`);

                    try {
                        await this.electronApp.handleNSNResponse(responseData);
                        console.log(`✅ ViewManager: ===== NSN RESPONSE PROCESSED SUCCESSFULLY (${trigger}) =====`);
                        console.log(`✅ ViewManager: Auto-registration process initiated`);
                    } catch (error) {
                        console.error(`❌ ViewManager: ===== ERROR PROCESSING NSN RESPONSE (${trigger}) =====`);
                        console.error(`❌ ViewManager: Error in handleNSNResponse:`, error);
                        console.error(`❌ ViewManager: Error stack:`, error.stack);
                    }
                } else {
                    console.error(`❌ ViewManager: ===== ELECTRON APP HANDLER NOT AVAILABLE (${trigger}) =====`);
                    console.error(`🔍 ViewManager: Electron app available:`, !!this.electronApp);
                    console.error(`🔍 ViewManager: handleNSNResponse method available:`, this.electronApp ? typeof this.electronApp.handleNSNResponse === 'function' : 'N/A');
                }
            } else {
                console.log(`🔍 ViewManager: ===== NO NSN RESPONSE DETECTED (${trigger}) =====`);
                console.log(`🔍 ViewManager: No NSN response detected in page content`);
                console.log(`🔍 ViewManager: Response data:`, responseData);
                console.log(`🔍 ViewManager: Response data action:`, responseData ? responseData.action : 'N/A');
                console.log(`🔍 ViewManager: This might be a normal NSN page without WebSocket connection request`);
                console.log(`🔍 ViewManager: Or the user might not need registration`);
            }

            console.log(`🔍 ViewManager: ===== DETECTION COMPLETED (${trigger}) =====`);
        } catch (error) {
            console.error(`❌ ViewManager: ===== ERROR IN DETECTION (${trigger}) =====`);
            console.error(`❌ ViewManager: Error detecting NSN response:`, error);
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
