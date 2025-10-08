const { BrowserView } = require('electron');
const path = require('path');

// 导入日志系统
const { getCClientLogger } = require('../utils/logger');

/**
 * Unified Tab-BrowserView Manager
 * Ensures Tab UI and BrowserView are always synchronized
 */
class TabManager {
    constructor(electronApp) {
        try {
            // 初始化日志系统
            this.logger = getCClientLogger('tabmanager');

            // Store reference to ElectronApp instance for sendToWindow functionality
            this.electronApp = electronApp;
            this.mainWindow = null; // Will be set later when main window is available

            // Unified tab management
            this.tabs = new Map(); // id -> { browserView, tabUI, metadata }
            this.currentTabId = null;
            this.tabCounter = 0;

            // Event callbacks
            this.onTabCreated = null;
            this.onTabClosed = null;
            this.onTabSwitched = null;
            this.onTabTitleUpdated = null;

            console.log('✅ TabManager: Initialized unified Tab-BrowserView management');
        } catch (error) {
            console.error('❌ TabManager: Constructor failed:', error);
            throw error;
        }
    }

    /**
     * Create a new tab with synchronized Tab UI and BrowserView
     */
    async createTab(url = 'https://www.google.com', options = {}) {
        console.log(`🆕 TabManager: Creating synchronized tab with URL: ${url}`);

        try {
            // 1. Generate unique ID
            const id = ++this.tabCounter;
            console.log(`🆕 TabManager: Generated tab ID: ${id}`);

            // 2. Create BrowserView first
            const browserView = await this.createBrowserView(url, id, options);
            if (!browserView) {
                throw new Error('Failed to create BrowserView');
            }
            console.log(`✅ TabManager: BrowserView created for tab ${id}`);

            // 3. Create Tab UI
            const tabUI = await this.createTabUI(id, url, options);
            if (!tabUI) {
                // Cleanup BrowserView if Tab UI creation failed
                await this.closeBrowserView(browserView);
                throw new Error('Failed to create Tab UI');
            }
            console.log(`✅ TabManager: Tab UI created for tab ${id}`);

            // 4. Establish binding relationship
            let initialTitle = 'Loading...';
            if (options.isHistory) {
                initialTitle = 'History';
            } else if (url === 'https://www.google.com') {
                initialTitle = 'Google';
            } else if (url === 'about:blank') {
                initialTitle = 'New Tab';
            }
            const tabData = {
                id,
                browserView,
                tabUI,
                url,
                title: initialTitle,
                createdAt: Date.now(),
                metadata: options,
                isActive: false
            };

            this.tabs.set(id, tabData);
            console.log(`✅ TabManager: Tab ${id} bound successfully`);

            // 5. Notify creation first (so renderer can create tab UI)
            this.notifyTabCreated(id, tabData);

            // 6. Then switch to the newly created tab
            await this.switchTab(id);

            console.log(`🎉 TabManager: Tab ${id} created and synchronized successfully`);
            return {
                id,
                title: initialTitle,
                url: url,
                tabUI: tabUI,
                metadata: options
            };

        } catch (error) {
            console.error(`❌ TabManager: Failed to create tab:`, error);
            throw error;
        }
    }

    /**
     * Close a tab with synchronized cleanup
     */
    async closeTab(id) {
        console.log(`🗑️ TabManager: Closing synchronized tab ${id}`);

        const tab = this.tabs.get(id);
        if (!tab) {
            console.warn(`⚠️ TabManager: Tab ${id} not found`);
            return false;
        }

        try {
            // 1. Close BrowserView
            console.log(`🧹 TabManager: Closing BrowserView for tab ${id}`);
            await this.closeBrowserView(tab.browserView);
            console.log(`✅ TabManager: BrowserView closed for tab ${id}`);

            // 2. Remove Tab UI
            console.log(`🧹 TabManager: Removing Tab UI for tab ${id}`);
            await this.removeTabUI(tab.tabUI);
            console.log(`✅ TabManager: Tab UI removed for tab ${id}`);

            // 3. Remove from manager
            this.tabs.delete(id);
            console.log(`✅ TabManager: Tab ${id} removed from manager`);

            // 4. Update current tab if needed
            if (this.currentTabId === id) {
                const nextTabId = this.getNextAvailableTabId();
                if (nextTabId) {
                    await this.setCurrentTab(nextTabId);
                } else {
                    this.currentTabId = null;
                }
            }

            // 5. Notify closure
            this.notifyTabClosed(id);

            console.log(`🎉 TabManager: Tab ${id} closed and synchronized successfully`);
            return true;

        } catch (error) {
            console.error(`❌ TabManager: Failed to close tab ${id}:`, error);
            return false;
        }
    }

    /**
     * Switch to a specific tab
     */
    async switchTab(id) {
        console.log(`🔄 TabManager: Switching to tab ${id}`);

        const tab = this.tabs.get(id);
        if (!tab) {
            console.warn(`⚠️ TabManager: Tab ${id} not found`);
            return false;
        }

        try {
            // 1. Hide current tab's BrowserView
            if (this.currentTabId && this.currentTabId !== id) {
                const currentTab = this.tabs.get(this.currentTabId);
                if (currentTab) {
                    await this.hideBrowserView(currentTab.browserView);
                    currentTab.isActive = false;
                }
            }

            // 2. Show target tab's BrowserView
            await this.showBrowserView(tab.browserView);
            tab.isActive = true;

            // 3. Update current tab ID
            this.currentTabId = id;

            // 4. Notify switch
            this.notifyTabSwitched(id, tab);

            console.log(`✅ TabManager: Switched to tab ${id}`);
            return true;

        } catch (error) {
            console.error(`❌ TabManager: Failed to switch to tab ${id}:`, error);
            return false;
        }
    }

    /**
     * Create BrowserView
     */
    async createBrowserView(url, id, options = {}) {
        try {
            console.log(`🆕 TabManager: Creating BrowserView for tab ${id} with URL: ${url}`);

            // Create BrowserView directly
            const browserView = new BrowserView({
                webPreferences: {
                    nodeIntegration: false,
                    contextIsolation: true,
                    preload: path.join(__dirname, '../pages/preload.js')
                }
            });

            // Set bounds
            const bounds = this.getViewBounds();
            browserView.setBounds(bounds);

            // Set metadata
            browserView.tabId = id;
            browserView.tabManager = this;

            // Load URL
            if (url.startsWith('browser://history')) {
                // Load history page
                const historyPath = path.join(__dirname, '../pages/history.html');
                console.log(`📂 TabManager: Loading history file: ${historyPath}`);
                await browserView.webContents.loadFile(historyPath);
                console.log(`✅ TabManager: History file loaded successfully for tab ${id}`);
            } else {
                // Load regular URL
                console.log(`🌐 TabManager: Loading URL: ${url} for tab ${id}`);
                try {
                    await browserView.webContents.loadURL(url);
                    console.log(`✅ TabManager: URL loaded successfully for tab ${id}`);
                } catch (loadError) {
                    console.error(`❌ TabManager: Failed to load URL ${url} for tab ${id}:`, loadError);
                    // Set error title
                    this.updateTabTitle(id, `Error loading ${url}`);
                    throw loadError;
                }
            }

            // Setup title listeners
            this.setupTitleListeners(browserView, id);

            // Add to main window
            const electronMainWindow = this.getElectronMainWindow();
            if (electronMainWindow) {
                electronMainWindow.addBrowserView(browserView);
                console.log(`✅ TabManager: BrowserView ${id} added to main window`);
            }

            // Special handling for history tabs
            if (options.isHistory) {
                this.updateTabTitle(id, 'History');
            }

            return browserView;
        } catch (error) {
            console.error(`❌ TabManager: Error creating BrowserView for tab ${id}:`, error);
            console.error(`❌ TabManager: URL:`, url);
            console.error(`❌ TabManager: Options:`, options);
            return null;
        }
    }

    /**
     * Create Tab UI
     */
    async createTabUI(id, url, options = {}) {
        try {
            // Determine initial title based on options
            let initialTitle = 'Loading...';
            if (options.isHistory) {
                initialTitle = 'History';
            }

            // Tab UI will be created when notifyTabCreated is called
            // No need to send separate create-tab-ui event
            return { id, url, title: initialTitle }; // Return tab UI data
        } catch (error) {
            console.error(`❌ TabManager: Error creating Tab UI for tab ${id}:`, error);
            return null;
        }
    }

    /**
     * Setup title listeners for a BrowserView
     */
    setupTitleListeners(browserView, id) {
        const sendTitle = async () => {
            try {
                let title = '';

                // Check if this is an about:blank page
                const currentUrl = browserView.webContents.getURL();
                if (currentUrl === 'about:blank') {
                    // For blank pages, keep the title as "New Tab" and don't update
                    title = 'New Tab';
                    this.updateTabTitle(id, title);
                    return;
                }

                // Method 1: Get from webContents directly
                try {
                    title = browserView.webContents.getTitle();
                } catch (err) {
                    // Ignore error, try other methods
                }

                // Method 2: Use URL domain if method 1 fails
                if (!title || title === 'Loading...' || title === 'Untitled Page') {
                    try {
                        const url = browserView.webContents.getURL();
                        const domain = new URL(url).hostname;
                        title = domain && domain !== 'localhost' ?
                            domain.charAt(0).toUpperCase() + domain.slice(1) :
                            'Page';
                    } catch (executeError) {
                        title = 'Loading...';
                    }
                }

                // Fallback: Use URL if still no title
                if (!title || title === 'Loading...' || title === 'Untitled Page') {
                    try {
                        const url = browserView.webContents.getURL();
                        if (url && url !== 'about:blank') {
                            const hostname = new URL(url).hostname;
                            title = hostname || 'New Tab';
                        } else {
                            title = 'New Tab';
                        }
                    } catch (urlError) {
                        title = 'New Tab';
                    }
                }

                // Update title in TabManager and notify UI
                this.updateTabTitle(id, title);

            } catch (error) {
                console.error(`❌ TabManager: Error getting title for tab ${id}:`, error);
                this.updateTabTitle(id, 'Error');
            }
        };

        // Set up listeners
        if (browserView.webContents) {
            console.log(`🎯 TabManager: Setting up title listeners for tab ${id}`);
            browserView.webContents.on('page-title-updated', (event, title) => {
                console.log(`🎯 TabManager: page-title-updated event for tab ${id}: "${title}"`);
                sendTitle();
            });
            browserView.webContents.on('did-finish-load', () => {
                console.log(`🎯 TabManager: did-finish-load event for tab ${id}`);
                sendTitle();

                // Check for NSN response after page loads (but skip logout pages)
                const currentURL = browserView.webContents.getURL();
                if (!currentURL.includes('/logout')) {
                    console.log(`🔍 TabManager: Non-logout page detected, checking for NSN response...`);
                    this.detectNSNResponse(browserView, id, 'did-finish-load');
                } else {
                    console.log(`🔍 TabManager: Logout page detected, skipping NSN response detection`);
                }
            });
            browserView.webContents.on('did-navigate', () => {
                console.log(`🎯 TabManager: did-navigate event for tab ${id}`);
                sendTitle();

                // Check for NSN response after navigation (but skip logout pages)
                const currentURL = browserView.webContents.getURL();
                if (!currentURL.includes('/logout')) {
                    console.log(`🔍 TabManager: Non-logout page navigation detected, checking for NSN response...`);
                    this.detectNSNResponse(browserView, id, 'did-navigate');
                } else {
                    console.log(`🔍 TabManager: Logout page navigation detected, skipping NSN response detection`);
                }
            });
            browserView.webContents.on('did-navigate-in-page', () => {
                console.log(`🎯 TabManager: did-navigate-in-page event for tab ${id}`);
                sendTitle();
            });
            browserView.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
                console.error(`❌ TabManager: did-fail-load event for tab ${id}:`, errorCode, errorDescription, validatedURL);
                this.updateTabTitle(id, `Failed to load: ${errorDescription}`);
            });
        }

        // Initial title check
        console.log(`🎯 TabManager: Scheduling initial title check for tab ${id} in 100ms`);
        setTimeout(() => {
            console.log(`🎯 TabManager: Running initial title check for tab ${id}`);
            sendTitle();
        }, 100);
    }

    /**
     * Update tab title and notify UI
     */
    updateTabTitle(id, title) {
        try {
            console.log(`📝 TabManager: Updating title for tab ${id} to: "${title}"`);

            // Update internal tab data
            const tab = this.tabs.get(id);
            if (tab) {
                const oldTitle = tab.title;
                tab.title = title;
                console.log(`📝 TabManager: Updated internal title for tab ${id}: "${oldTitle}" -> "${title}"`);
            } else {
                console.warn(`⚠️ TabManager: Tab ${id} not found when updating title`);
                return;
            }

            // Notify UI of title update
            if (this.electronApp && this.electronApp.sendToWindow) {
                console.log(`📝 TabManager: Sending tab-title-updated event for tab ${id}`);
                this.electronApp.sendToWindow('tab-title-updated', {
                    id: parseInt(id),
                    title: title
                });
                console.log(`✅ TabManager: tab-title-updated event sent for tab ${id}`);
            } else {
                console.warn(`⚠️ TabManager: electronApp or sendToWindow not available for title update`);
            }

            console.log(`📝 TabManager: Title update completed for tab ${id}: "${title}"`);
        } catch (error) {
            console.error(`❌ TabManager: Error updating title for tab ${id}:`, error);
        }
    }

    /**
     * Close BrowserView
     */
    async closeBrowserView(browserView) {
        try {
            if (browserView && browserView.webContents && !browserView.webContents.isDestroyed()) {
                // Remove all event listeners before destroying
                console.log(`🧹 TabManager: Removing event listeners from BrowserView`);
                browserView.webContents.removeAllListeners();

                // Destroy the webContents
                browserView.webContents.destroy();
                console.log(`✅ TabManager: BrowserView destroyed successfully`);
            }
        } catch (error) {
            console.error(`❌ TabManager: Error closing BrowserView:`, error);
        }
    }

    /**
     * Remove Tab UI
     */
    async removeTabUI(tabUI) {
        try {
            if (this.electronApp && this.electronApp.sendToWindow) {
                this.electronApp.sendToWindow('remove-tab-ui', {
                    id: tabUI.id
                });
            }
        } catch (error) {
            console.error(`❌ TabManager: Error removing Tab UI:`, error);
        }
    }

    /**
     * Show BrowserView
     */
    async showBrowserView(browserView) {
        try {
            const electronMainWindow = this.getElectronMainWindow();

            if (electronMainWindow && typeof electronMainWindow.addBrowserView === 'function') {
                electronMainWindow.addBrowserView(browserView);
            }
        } catch (error) {
            console.error(`❌ TabManager: Error showing BrowserView:`, error);
        }
    }

    /**
     * Hide BrowserView
     */
    async hideBrowserView(browserView) {
        try {
            const electronMainWindow = this.getElectronMainWindow();

            if (electronMainWindow && typeof electronMainWindow.removeBrowserView === 'function') {
                electronMainWindow.removeBrowserView(browserView);
            }
        } catch (error) {
            console.error(`❌ TabManager: Error hiding BrowserView:`, error);
        }
    }

    /**
     * Set current tab
     */
    async setCurrentTab(id) {
        const tab = this.tabs.get(id);
        if (!tab) return false;

        this.currentTabId = id;
        tab.isActive = true;

        // Show the tab's BrowserView
        await this.showBrowserView(tab.browserView);

        // Notify switch
        this.notifyTabSwitched(id, tab);

        return true;
    }

    /**
     * Get next available tab ID
     */
    getNextAvailableTabId() {
        const tabIds = Array.from(this.tabs.keys());
        return tabIds.length > 0 ? tabIds[0] : null;
    }

    /**
     * Get all tabs
     */
    getAllTabs() {
        return Array.from(this.tabs.values());
    }

    /**
     * Get tab by ID
     */
    getTab(id) {
        return this.tabs.get(id);
    }

    /**
     * Update tab title
     */
    updateTabTitle(id, title) {
        const tab = this.tabs.get(id);
        if (tab) {
            tab.title = title;
            this.notifyTabTitleUpdated(id, title);
        }
    }

    /**
     * Close all tabs
     */
    async closeAllTabs() {
        console.log(`🗑️ TabManager: Closing all tabs`);

        const tabIds = Array.from(this.tabs.keys());
        for (const id of tabIds) {
            await this.closeTab(id);
        }

        this.currentTabId = null;
        console.log(`✅ TabManager: All tabs closed`);
    }

    /**
     * Event notification methods
     */
    notifyTabCreated(id, tabData) {
        console.log(`📢 TabManager: Notifying tab created - ID: ${id}, Title: ${tabData.title}`);

        if (this.onTabCreated) {
            console.log(`📢 TabManager: Calling onTabCreated callback for tab ${id}`);
            this.onTabCreated(id, tabData);
        }

        // Also send to main window
        if (this.electronApp && this.electronApp.sendToWindow) {
            console.log(`📢 TabManager: Sending tab-created event to renderer for tab ${id}`);
            this.electronApp.sendToWindow('tab-created', {
                id,
                url: tabData.url,
                title: tabData.title,
                metadata: tabData.metadata
            });
            console.log(`✅ TabManager: tab-created event sent successfully for tab ${id}`);
        } else {
            console.error(`❌ TabManager: Cannot send tab-created event - electronApp or sendToWindow not available`);
        }
    }

    notifyTabClosed(id) {
        if (this.onTabClosed) {
            this.onTabClosed(id);
        }

        // Also send to main window
        if (this.electronApp && this.electronApp.sendToWindow) {
            this.electronApp.sendToWindow('tab-closed', { id });
        }
    }

    notifyTabSwitched(id, tabData) {
        if (this.onTabSwitched) {
            this.onTabSwitched(id, tabData);
        }

        // Also send to main window
        if (this.electronApp && this.electronApp.sendToWindow) {
            this.electronApp.sendToWindow('tab-switched', { id });
        }
    }

    notifyTabTitleUpdated(id, title) {
        if (this.onTabTitleUpdated) {
            this.onTabTitleUpdated(id, title);
        }

        // Also send to main window
        if (this.electronApp && this.electronApp.sendToWindow) {
            this.electronApp.sendToWindow('tab-title-updated', { id, title });
        }
    }

    /**
     * Set event callbacks
     */
    setEventCallbacks(callbacks) {
        this.onTabCreated = callbacks.onTabCreated;
        this.onTabClosed = callbacks.onTabClosed;
        this.onTabSwitched = callbacks.onTabSwitched;
        this.onTabTitleUpdated = callbacks.onTabTitleUpdated;
    }

    // ===== ViewManager兼容方法 =====

    /**
     * Get current tab data
     */
    getCurrentTab() {
        if (this.currentTabId && this.tabs.has(this.currentTabId)) {
            return this.tabs.get(this.currentTabId);
        }
        return null;
    }

    /**
     * Navigate current tab to URL
     */
    async navigateTo(url) {
        const currentTab = this.getCurrentTab();
        if (currentTab && currentTab.browserView && currentTab.browserView.webContents) {
            try {
                console.log(`🧭 TabManager: Navigating to URL: ${url}`);

                // Add error handling for navigation
                const webContents = currentTab.browserView.webContents;

                // Set up error handlers for this navigation
                const handleNavigationError = (event, errorCode, errorDescription, validatedURL) => {
                    console.error(`❌ TabManager: Navigation failed: ${errorCode} (${errorDescription}) loading '${validatedURL}'`);
                    console.error(`❌ TabManager: Error details:`, {
                        errorCode,
                        errorDescription,
                        validatedURL,
                        timestamp: new Date().toISOString()
                    });
                };

                const handleNavigationSuccess = () => {
                    console.log(`✅ TabManager: Navigation successful: ${url}`);
                };

                // Add temporary event listeners
                webContents.once('did-fail-load', handleNavigationError);
                webContents.once('did-finish-load', handleNavigationSuccess);

                // Perform navigation with timeout
                const navigationPromise = webContents.loadURL(url);
                const timeoutPromise = new Promise((_, reject) => {
                    setTimeout(() => reject(new Error('Navigation timeout')), 10000); // 10 second timeout
                });

                await Promise.race([navigationPromise, timeoutPromise]);

                // Clean up event listeners
                webContents.removeListener('did-fail-load', handleNavigationError);
                webContents.removeListener('did-finish-load', handleNavigationSuccess);

                return true;
            } catch (error) {
                console.error(`❌ TabManager: Navigation error for URL ${url}:`, error);
                return false;
            }
        }
        return false;
    }

    /**
     * Go back in current tab
     */
    goBack() {
        const currentTab = this.getCurrentTab();
        if (currentTab && currentTab.browserView && currentTab.browserView.webContents) {
            if (currentTab.browserView.webContents.canGoBack()) {
                currentTab.browserView.webContents.goBack();
                return true;
            }
        }
        return false;
    }

    /**
     * Go forward in current tab
     */
    goForward() {
        const currentTab = this.getCurrentTab();
        if (currentTab && currentTab.browserView && currentTab.browserView.webContents) {
            if (currentTab.browserView.webContents.canGoForward()) {
                currentTab.browserView.webContents.goForward();
                return true;
            }
        }
        return false;
    }

    /**
     * Refresh current tab
     */
    refresh() {
        const currentTab = this.getCurrentTab();
        if (currentTab && currentTab.browserView && currentTab.browserView.webContents) {
            currentTab.browserView.webContents.reload();
            return true;
        }
        return false;
    }

    /**
     * Close all tabs and create a new default tab
     */
    async closeAllTabsAndCreateDefault() {
        console.log(`🧹 TabManager: Closing all tabs and creating default tab`);

        // Close all tabs
        const allTabs = this.getAllTabs();
        for (const tab of allTabs) {
            await this.closeTab(tab.id);
        }

        // Create new default tab
        await this.createTab();
        console.log(`✅ TabManager: All tabs closed and default tab created`);
    }

    /**
     * Hide all tabs from main window
     */
    hideAllViews() {
        const allTabs = this.getAllTabs();
        const electronMainWindow = this.getElectronMainWindow();

        console.log(`🧹 TabManager: Hiding ${allTabs.length} tabs from main window`);

        allTabs.forEach(tab => {
            if (tab.browserView && !tab.browserView.webContents.isDestroyed()) {
                try {
                    electronMainWindow.removeBrowserView(tab.browserView);
                    console.log(`✅ TabManager: Successfully hid tab ${tab.id} from main window`);
                } catch (error) {
                    console.error(`❌ TabManager: Error hiding tab ${tab.id}:`, error);
                }
            }
        });

        this.currentTabId = null;
        console.log(`✅ TabManager: All tabs hidden, currentTabId set to null`);
    }

    /**
     * Show all tabs in main window
     */
    showAllViews() {
        const allTabs = this.getAllTabs();
        const electronMainWindow = this.getElectronMainWindow();

        if (!electronMainWindow) {
            return;
        }

        allTabs.forEach(tab => {
            if (tab.browserView && !tab.browserView.webContents.isDestroyed()) {
                try {
                    electronMainWindow.addBrowserView(tab.browserView);
                    console.log(`✅ TabManager: Successfully showed tab ${tab.id} in main window`);
                } catch (error) {
                    console.error(`❌ TabManager: Error showing tab ${tab.id}:`, error);
                }
            }
        });

        console.log(`✅ TabManager: All tabs shown in main window`);
    }

    /**
     * Get current view (for compatibility)
     */
    getCurrentView() {
        const currentTab = this.getCurrentTab();
        if (currentTab && currentTab.browserView) {
            return {
                id: currentTab.id,
                webContents: currentTab.browserView.webContents
            };
        }
        return null;
    }

    /**
     * Get all views (for compatibility)
     */
    getAllViews() {
        const allTabs = this.getAllTabs();
        const views = {};
        allTabs.forEach(tab => {
            if (tab.browserView) {
                views[tab.id] = tab.browserView;
            }
        });
        return views;
    }

    /**
     * Switch to view by ID (for compatibility)
     */
    switchToView(id) {
        return this.switchTab(id);
    }

    /**
     * Update current view bounds
     */
    updateCurrentViewBounds(bounds) {
        const currentTab = this.getCurrentTab();
        if (currentTab && currentTab.browserView) {
            currentTab.browserView.setBounds(bounds);
        }
    }

    /**
     * Update all view bounds
     */
    updateAllViewBounds(bounds) {
        const allTabs = this.getAllTabs();
        allTabs.forEach(tab => {
            if (tab.browserView && !tab.browserView.webContents.isDestroyed()) {
                tab.browserView.setBounds(bounds);
            }
        });
    }

    /**
     * Get view bounds
     */
    getViewBounds() {
        const mainWindow = this.getElectronMainWindow();
        if (mainWindow && mainWindow.getViewBounds) {
            return mainWindow.getViewBounds();
        }
        return { x: 0, y: 86, width: 1000, height: 714 };
    }

    /**
     * Setup view title listeners (compatibility method)
     */
    setupViewTitleListeners(browserView, id) {
        this.setupTitleListeners(browserView, id);
    }

    /**
     * Update view title
     */
    updateViewTitle(id, title) {
        this.updateTabTitle(id, title);
    }

    /**
     * Get Electron main window
     */
    getElectronMainWindow() {
        if (this.electronApp && this.electronApp.windowManager && this.electronApp.windowManager.getMainWindow) {
            return this.electronApp.windowManager.getMainWindow();
        } else if (this.electronApp && this.electronApp.mainWindow) {
            return this.electronApp.mainWindow;
        }
        return null;
    }

    /**
     * Create history view (using TabManager)
     */
    async createHistoryView() {
        return await this.createTab('browser://history', { isHistory: true });
    }

    /**
     * Create OAuth view (using TabManager)
     */
    async createOAuthView(url = 'https://x.com') {
        return await this.createTab(url, { isOAuth: true });
    }

    /**
     * Auto create tab for X login (using TabManager)
     */
    async autoCreateTabForXLogin() {
        return await this.createTab('https://x.com', { isOAuth: true });
    }

    /**
     * Check OAuth progress (not implemented)
     */
    async checkOAuthProgress(view, id) {
        console.warn('⚠️ TabManager: checkOAuthProgress not implemented');
        return null;
    }

    /**
     * Trigger Google sign in (not implemented)
     */
    async triggerGoogleSignIn(view, id) {
        console.warn('⚠️ TabManager: triggerGoogleSignIn not implemented');
        return null;
    }

    /**
     * Check login status (not implemented)
     */
    async checkLoginStatus(view, id) {
        console.warn('⚠️ TabManager: checkLoginStatus not implemented');
        return null;
    }

    /**
     * Check OAuth status for popup (not implemented)
     */
    async checkOAuthStatusForPopup(view, id, isPopupMode = false) {
        console.warn('⚠️ TabManager: checkOAuthStatusForPopup not implemented');
        return null;
    }

    /**
     * Force redirect to X (not implemented)
     */
    async forceRedirectToX(view, id) {
        console.warn('⚠️ TabManager: forceRedirectToX not implemented');
        return null;
    }

    /**
     * Verify OAuth success and redirect (not implemented)
     */
    async verifyOAuthSuccessAndRedirect(view, id, url) {
        console.warn('⚠️ TabManager: verifyOAuthSuccessAndRedirect not implemented');
        return null;
    }

    /**
     * Cleanup session (not implemented)
     */
    async cleanupSession(view, id) {
        console.warn('⚠️ TabManager: cleanupSession not implemented');
        return null;
    }

    /**
     * Clear all sessions
     */
    async clearAllSessions() {
        try {
            console.log('🧹 TabManager: ===== CLEARING ALL SESSIONS =====');

            // Close all tabs and clear their sessions
            const tabIds = Array.from(this.tabs.keys());
            console.log(`🧹 TabManager: Closing ${tabIds.length} tabs during session clear...`);

            for (const tabId of tabIds) {
                const tabData = this.tabs.get(tabId);
                if (tabData && tabData.browserView && tabData.browserView.webContents && !tabData.browserView.webContents.isDestroyed()) {
                    try {
                        // Clear session data before closing tab
                        console.log(`🧹 TabManager: Clearing session data for tab ${tabId}...`);
                        if (tabData.browserView.webContents && tabData.browserView.webContents.session) {
                            await tabData.browserView.webContents.session.clearStorageData({
                                storages: ['cookies', 'localStorage', 'sessionStorage', 'cache']
                            });
                            await tabData.browserView.webContents.session.clearCache();
                            console.log(`✅ TabManager: Session data cleared for tab ${tabId}`);
                        } else {
                            console.log(`⚠️ TabManager: No session available for tab ${tabId}`);
                        }
                    } catch (sessionError) {
                        console.error(`❌ TabManager: Error clearing session for tab ${tabId}:`, sessionError);
                    }
                }
            }

            // Clear persistent session partitions (same as original SessionManager)
            console.log('🧹 TabManager: Clearing persistent session partitions...');
            await this.clearPersistentSessionPartitions();
            console.log('✅ TabManager: Persistent session partitions cleared');

            // Close all tabs
            console.log(`🧹 TabManager: Closing ${tabIds.length} tabs...`);
            for (const tabId of tabIds) {
                console.log(`🧹 TabManager: Closing tab ${tabId}...`);
                await this.closeTab(tabId);
                console.log(`✅ TabManager: Tab ${tabId} closed`);
            }
            console.log('✅ TabManager: All tabs closed');

            console.log('✅ TabManager: All sessions cleared successfully');
            return true;
        } catch (error) {
            console.error('❌ TabManager: Error clearing all sessions:', error);
            return false;
        }
    }

    /**
     * Clear NSN sessions only
     */
    async clearNSNSessions() {
        try {
            console.log('🧹 TabManager: ===== CLEARING NSN SESSIONS =====');

            let nsnTabsCleared = 0;
            const tabIds = Array.from(this.tabs.keys());

            // Clear session data only for NSN tabs
            for (const tabId of tabIds) {
                const tabData = this.tabs.get(tabId);
                if (tabData && tabData.browserView && tabData.browserView.webContents && !tabData.browserView.webContents.isDestroyed()) {
                    try {
                        const currentURL = tabData.browserView.webContents.getURL();
                        if (this.isNSNUrl(currentURL)) {
                            console.log(`🧹 TabManager: Clearing NSN session for tab ${tabId} (${currentURL})`);

                            // Clear session data
                            if (tabData.browserView.webContents.session) {
                                await tabData.browserView.webContents.session.clearStorageData({
                                    storages: ['cookies', 'localStorage', 'sessionStorage', 'cache']
                                });
                                await tabData.browserView.webContents.session.clearCache();
                                console.log(`✅ TabManager: NSN session cleared for tab ${tabId}`);
                            } else {
                                console.log(`⚠️ TabManager: No session available for NSN tab ${tabId}`);
                            }

                            nsnTabsCleared++;
                        } else {
                            console.log(`ℹ️ TabManager: Skipping non-NSN tab ${tabId} (${currentURL})`);
                        }
                    } catch (error) {
                        console.error(`❌ TabManager: Error clearing NSN session for tab ${tabId}:`, error);
                    }
                }
            }

            // Clear only NSN persistent session partition
            await this.clearNSNPersistentSessionPartition();

            // Navigate NSN tabs to logout URL with error handling
            for (const tabId of tabIds) {
                const tabData = this.tabs.get(tabId);
                if (tabData && tabData.browserView && tabData.browserView.webContents && !tabData.browserView.webContents.isDestroyed()) {
                    try {
                        const currentURL = tabData.browserView.webContents.getURL();
                        if (this.isNSNUrl(currentURL)) {
                            console.log('🔓 TabManager: Navigating NSN tab to logout URL...');

                            // Add error handling for logout navigation
                            const webContents = tabData.browserView.webContents;

                            // Set up error handlers for logout navigation
                            const handleLogoutNavigationError = (event, errorCode, errorDescription, validatedURL) => {
                                if (errorCode === -3) { // ERR_ABORTED
                                    console.log(`⚠️ TabManager: Logout navigation aborted for tab ${tabId} (this is often normal during logout)`);
                                } else {
                                    console.error(`❌ TabManager: Logout navigation failed for tab ${tabId}: ${errorCode} (${errorDescription})`);
                                }
                            };

                            const handleLogoutNavigationSuccess = () => {
                                console.log(`✅ TabManager: Logout navigation successful for tab ${tabId}`);
                            };

                            // Add temporary event listeners
                            webContents.once('did-fail-load', handleLogoutNavigationError);
                            webContents.once('did-finish-load', handleLogoutNavigationSuccess);

                            // Perform logout navigation with timeout
                            const logoutPromise = webContents.loadURL('http://localhost:5000/logout');
                            const timeoutPromise = new Promise((_, reject) => {
                                setTimeout(() => reject(new Error('Logout navigation timeout')), 5000); // 5 second timeout
                            });

                            try {
                                await Promise.race([logoutPromise, timeoutPromise]);
                            } catch (error) {
                                if (error.message === 'Logout navigation timeout') {
                                    console.log(`⚠️ TabManager: Logout navigation timeout for tab ${tabId}, but this is often normal`);
                                } else {
                                    console.error(`❌ TabManager: Logout navigation error for tab ${tabId}:`, error);
                                }
                            }

                            // Clean up event listeners
                            webContents.removeListener('did-fail-load', handleLogoutNavigationError);
                            webContents.removeListener('did-finish-load', handleLogoutNavigationSuccess);
                        }
                    } catch (error) {
                        console.error(`❌ TabManager: Error navigating to logout for tab ${tabId}:`, error);
                    }
                }
            }

            console.log(`✅ TabManager: NSN sessions cleared (${nsnTabsCleared} tabs, 1 partition)`);
            return true;
        } catch (error) {
            console.error('❌ TabManager: Error clearing NSN sessions:', error);
            return false;
        }
    }

    /**
     * Clear persistent session partitions (same as original SessionManager)
     */
    async clearPersistentSessionPartitions() {
        try {
            console.log('🧹 TabManager: Clearing persistent session partitions...');

            const { session } = require('electron');

            // List of persistent session partitions to clear (same as original SessionManager)
            const partitionsToClear = ['persist:main', 'persist:nsn', 'persist:registered'];

            for (const partitionName of partitionsToClear) {
                try {
                    console.log(`🧹 TabManager: Clearing session partition: ${partitionName}`);

                    // Get the session from partition
                    const partitionSession = session.fromPartition(partitionName);

                    // Clear all storage data (same as original SessionManager)
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

                    console.log(`✅ TabManager: Session partition cleared: ${partitionName}`);
                } catch (partitionError) {
                    console.error(`❌ TabManager: Error clearing session partition ${partitionName}:`, partitionError);
                }
            }

            console.log('✅ TabManager: All persistent session partitions cleared');
        } catch (error) {
            console.error('❌ TabManager: Error clearing persistent session partitions:', error);
        }
    }

    /**
     * Clear only NSN persistent session partition
     */
    async clearNSNPersistentSessionPartition() {
        try {
            console.log('🧹 TabManager: Clearing NSN persistent session partition...');

            const { session } = require('electron');

            // Only clear NSN partition
            const partitionName = 'persist:nsn';

            try {
                console.log(`🧹 TabManager: Clearing NSN session partition: ${partitionName}`);

                // Get the session from partition
                const partitionSession = session.fromPartition(partitionName);

                // Clear all storage data (same as original SessionManager)
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

                console.log(`✅ TabManager: NSN session partition cleared: ${partitionName}`);

            } catch (error) {
                console.error(`❌ TabManager: Error clearing NSN session partition ${partitionName}:`, error);
            }

        } catch (error) {
            console.error('❌ TabManager: Error clearing NSN persistent session partition:', error);
        }
    }

    /**
     * Auto cleanup loading titles (not implemented)
     */
    autoCleanupLoadingTitles() {
        console.warn('⚠️ TabManager: autoCleanupLoadingTitles not implemented');
        return null;
    }

    /**
     * Find NSN tab
     */
    findNSNTab() {
        try {
            console.log('🔍 TabManager: Looking for NSN tab...');

            for (const [tabId, tabData] of this.tabs.entries()) {
                if (tabData && tabData.browserView && tabData.browserView.webContents && !tabData.browserView.webContents.isDestroyed()) {
                    const currentURL = tabData.browserView.webContents.getURL();
                    if (this.isNSNUrl(currentURL)) {
                        console.log(`✅ TabManager: Found NSN tab ${tabId} with URL: ${currentURL}`);
                        return tabData;
                    }
                }
            }

            console.log('⚠️ TabManager: No NSN tab found');
            return null;
        } catch (error) {
            console.error('❌ TabManager: Error finding NSN tab:', error);
            return null;
        }
    }

    /**
     * Find all tabs for a specific website based on website config
     */
    findAllTabsForWebsite(websiteConfig) {
        try {
            console.log('🔍 TabManager: Looking for all tabs for website:', websiteConfig?.name || 'Unknown');
            const websiteTabs = [];

            if (!websiteConfig || !websiteConfig.root_url) {
                console.log('⚠️ TabManager: No website config or root_url provided');
                return websiteTabs;
            }

            const rootUrl = websiteConfig.root_url;
            console.log('🔍 TabManager: Looking for tabs with root URL:', rootUrl);

            for (const [tabId, tabData] of this.tabs.entries()) {
                if (tabData && tabData.browserView && tabData.browserView.webContents && !tabData.browserView.webContents.isDestroyed()) {
                    const currentURL = tabData.browserView.webContents.getURL();
                    if (this.isUrlForWebsite(currentURL, rootUrl)) {
                        console.log(`✅ TabManager: Found ${websiteConfig.name} tab ${tabId} with URL: ${currentURL}`);
                        websiteTabs.push({ id: tabId, ...tabData });
                    }
                }
            }

            console.log(`🔍 TabManager: Found ${websiteTabs.length} ${websiteConfig.name} tabs`);
            return websiteTabs;
        } catch (error) {
            console.error('❌ TabManager: Error finding tabs for website:', error);
            return [];
        }
    }

    /**
     * Check if URL belongs to a specific website
     */
    isUrlForWebsite(url, rootUrl) {
        try {
            if (!url || !rootUrl) return false;

            // Parse URLs to compare domains
            const urlObj = new URL(url);
            const rootUrlObj = new URL(rootUrl);

            // Check if same domain and port
            return urlObj.hostname === rootUrlObj.hostname && urlObj.port === rootUrlObj.port;
        } catch (error) {
            console.error('❌ TabManager: Error checking URL for website:', error);
            return false;
        }
    }

    /**
     * Register website configuration
     */
    registerWebsite(websiteConfig) {
        try {
            console.log('🌐 TabManager: Registering website configuration:', websiteConfig);

            if (!this.registeredWebsites) {
                this.registeredWebsites = [];
            }

            // Add website configuration to registered websites
            this.registeredWebsites.push(websiteConfig);
            console.log('✅ TabManager: Website configuration registered successfully');

            return true;
        } catch (error) {
            console.error('❌ TabManager: Error registering website configuration:', error);
            return false;
        }
    }

    /**
     * Check if URL is NSN URL
     */
    isNSNUrl(url) {
        if (!url) return false;
        return url.includes('localhost:5000') || url.includes('127.0.0.1:5000');
    }

    /**
     * Is registered website URL (not implemented)
     */
    isRegisteredWebsiteUrl(url) {
        console.warn('⚠️ TabManager: isRegisteredWebsiteUrl not implemented');
        return false;
    }

    /**
     * Get website config (not implemented)
     */
    getWebsiteConfig(url) {
        console.warn('⚠️ TabManager: getWebsiteConfig not implemented');
        return null;
    }

    /**
     * Get session partition for website (not implemented)
     */
    getSessionPartitionForWebsite(url) {
        console.warn('⚠️ TabManager: getSessionPartitionForWebsite not implemented');
        return 'persist:main';
    }



    /**
     * Get current user info (not implemented)
     */
    async getCurrentUserInfo() {
        console.warn('⚠️ TabManager: getCurrentUserInfo not implemented');
        return null;
    }

    /**
     * Get user cookie (not implemented)
     */
    async getUserCookie(userId) {
        console.warn('⚠️ TabManager: getUserCookie not implemented');
        return null;
    }

    /**
     * Set cookie in view (not implemented)
     */
    async setCookieInView(view, cookie, nsnUrl = null) {
        console.warn('⚠️ TabManager: setCookieInView not implemented');
        return null;
    }

    /**
     * Get tab info (not implemented)
     */
    getTabInfo(id) {
        try {
            console.log(`🔍 TabManager: getTabInfo called for tab ${id}`);
            const tabData = this.tabs.get(id);
            if (!tabData) {
                console.warn(`⚠️ TabManager: Tab ${id} not found`);
                return null;
            }

            const browserView = tabData.browserView;
            if (!browserView || !browserView.webContents) {
                console.warn(`⚠️ TabManager: BrowserView not available for tab ${id}`);
                return {
                    id: id,
                    url: tabData.url || '',
                    title: tabData.title || 'Loading...'
                };
            }

            // Get current URL from webContents
            const currentUrl = browserView.webContents.getURL();
            const title = browserView.webContents.getTitle();

            // Show full URL with NMP parameters in address bar
            const fullUrl = currentUrl || tabData.url || '';

            return {
                id: id,
                url: fullUrl, // Show full URL with NMP parameters in address bar
                title: title || tabData.title || 'Loading...',
                isActive: this.currentTabId === id
            };
        } catch (error) {
            console.error(`❌ TabManager: Error getting tab info for ${id}:`, error);
            return null;
        }
    }


    /**
     * Create view with cookie (not implemented)
     */
    createViewWithCookie(url, cookie, username, nsnUrl = null) {
        console.warn('⚠️ TabManager: createViewWithCookie not implemented');
        return null;
    }

    /**
     * Setup website response detection (not implemented)
     */
    setupWebsiteResponseDetection(view, id) {
        console.warn('⚠️ TabManager: setupWebsiteResponseDetection not implemented');
        return null;
    }

    /**
     * Detect NSN response in the page
     * @param {BrowserView} browserView - Browser view instance
     * @param {number} id - Tab ID
     * @param {string} trigger - Event that triggered the detection
     */
    async detectNSNResponse(browserView, id, trigger) {
        try {
            console.log(`🔍 TabManager: ===== EXECUTING JAVASCRIPT DETECTION (${trigger}) =====`);
            console.log(`🔍 TabManager: Tab ID: ${id}`);
            console.log(`🔍 TabManager: Current URL: ${browserView.webContents.getURL()}`);
            console.log(`🔍 TabManager: Executing JavaScript to check for NSN response...`);

            const responseData = await browserView.webContents.executeJavaScript(`
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

            if (responseData && responseData.action) {
                console.log(`🔍 TabManager: NSN response detected (${trigger}): ${responseData.action}`);
                // Process the NSN response
                await this.processNSNResponse(responseData, id, trigger);
            } else {
                console.log(`🔍 TabManager: No NSN response data (${trigger})`);
            }

        } catch (error) {
            console.error(`❌ TabManager: ===== ERROR IN DETECTION (${trigger}) =====`);
            console.error(`❌ TabManager: Error detecting NSN response for tab ${id}:`, error);
            console.error(`❌ TabManager: Error stack:`, error.stack);
        }
    }

    /**
     * Process NSN response data
     * @param {Object} responseData - Parsed NSN response data
     * @param {number} id - Tab ID
     * @param {string} trigger - Event that triggered the detection
     */
    async processNSNResponse(responseData, id, trigger) {
        try {
            this.logger.info(`🔍 TabManager: ===== PROCESSING NSN RESPONSE (${trigger}) =====`);
            this.logger.info(`🔍 TabManager: Action: ${responseData.action}`);
            this.logger.info(`🔍 TabManager: WebSocket URL: ${responseData.websocket_url}`);
            this.logger.info(`🔍 TabManager: User ID: ${responseData.user_id}`);
            this.logger.info(`🔍 TabManager: Username: ${responseData.username}`);

            // Check if WebSocket is already connected to avoid duplicate connections
            if (responseData.action === 'connect_websocket') {
                if (this.electronApp && this.electronApp.webSocketClient) {
                    const wsClient = this.electronApp.webSocketClient;

                    // More intelligent connection check: verify both status flags AND actual WebSocket state
                    const hasValidWebSocket = wsClient.websocket && wsClient.websocket.readyState === 1; // WebSocket.OPEN
                    const hasValidStatus = wsClient.isConnected && wsClient.isRegistered;

                    // Log detailed connection status for debugging
                    this.logger.info(`🔍 TabManager: Checking WebSocket connection status:`);
                    this.logger.info(`   hasWebSocket: ${!!wsClient.websocket}`);
                    this.logger.info(`   readyState: ${wsClient.websocket ? wsClient.websocket.readyState : 'N/A'}`);
                    this.logger.info(`   isConnected: ${wsClient.isConnected}`);
                    this.logger.info(`   isRegistered: ${wsClient.isRegistered}`);
                    this.logger.info(`   hasValidWebSocket: ${hasValidWebSocket}`);
                    this.logger.info(`   hasValidStatus: ${hasValidStatus}`);

                    // Only skip if both status and actual WebSocket are valid
                    const isActuallyConnected = hasValidStatus && hasValidWebSocket;

                    if (isActuallyConnected) {
                        this.logger.info(`✅ TabManager: WebSocket already connected and registered, skipping reconnection`);
                        return;
                    } else {
                        this.logger.info(`⚠️ TabManager: WebSocket connection needed`);
                        this.logger.info(`   Reason: isActuallyConnected=${isActuallyConnected} (hasValidStatus=${hasValidStatus} && hasValidWebSocket=${hasValidWebSocket})`);
                    }
                } else {
                    this.logger.warn(`⚠️ TabManager: ElectronApp or WebSocketClient not available`);
                }
            }

            if (responseData.action === 'connect_websocket') {
                this.logger.info(`🔌 TabManager: Connecting to WebSocket: ${responseData.websocket_url}`);

                if (responseData.websocket_url) {
                    try {
                        if (this.electronApp && this.electronApp.ipcHandlers) {
                            const result = await this.electronApp.ipcHandlers.processNSNResponse(responseData);
                            this.logger.info(`✅ TabManager: WebSocket connection result: ${result.success ? 'Success' : 'Failed'}`);
                        } else {
                            this.logger.error(`❌ TabManager: IpcHandlers not available`);
                        }
                    } catch (error) {
                        this.logger.error(`❌ TabManager: Error connecting to WebSocket: ${error.message}`);
                        // Don't let WebSocket errors crash the application
                        this.logger.warn(`⚠️ TabManager: WebSocket connection failed, but continuing normal operation`);
                    }
                } else {
                    this.logger.warn(`⚠️ TabManager: No WebSocket URL provided in NSN response`);
                }
            } else {
                this.logger.info(`🔍 TabManager: Unknown NSN response action: ${responseData.action}`);
            }

        } catch (error) {
            this.logger.error(`❌ TabManager: Error processing NSN response: ${error.message}`);
        }
    }

    /**
     * Cleanup (not implemented)
     */
    cleanup() {
        console.warn('⚠️ TabManager: cleanup not implemented');
        return null;
    }
}

module.exports = TabManager;
