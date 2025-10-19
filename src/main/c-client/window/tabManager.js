const { BrowserView } = require('electron');
const path = require('path');

// Import logging system
const { getCClientLogger } = require('../utils/logger');
const apiConfig = require('../config/apiConfig');

/**
 * Unified Tab-BrowserView Manager
 * Ensures Tab UI and BrowserView are always synchronized
 * 
 * NOTE: This is now the PRIMARY and ONLY manager for page management.
 * ViewManager is NO LONGER USED - all page management is handled by TabManager.
 */
class TabManager {
    constructor(electronApp) {
        try {
            // Initialize logging system
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

            this.logger.info('✅ TabManager: Initialized unified Tab-BrowserView management');

            // Setup window resize listener for 0x-86 detection
            this.setupWindowResizeListener();
        } catch (error) {
            this.logger.error('❌ TabManager: Constructor failed: ' + error.message);
            throw error;
        }
    }

    /**
     * Create a new tab with synchronized Tab UI and BrowserView
     */
    async createTab(url = 'https://www.google.com', options = {}) {
        this.logger.info(`🆕 TabManager: Creating synchronized tab with URL: ${url}`);

        try {
            // 1. Generate unique ID
            const id = ++this.tabCounter;
            this.logger.info(`🆕 TabManager: Generated tab ID: ${id}`);

            // 2. Determine initial title
            let initialTitle = 'Loading...';
            if (options.isHistory) {
                initialTitle = 'History';
            } else if (url === 'https://www.google.com') {
                initialTitle = 'Google';
            } else if (url === 'about:blank') {
                initialTitle = 'New Tab';
            }

            // 3. Create Tab UI first (fast, for immediate user feedback)
            const tabUI = await this.createTabUI(id, url, options);
            if (!tabUI) {
                throw new Error('Failed to create Tab UI');
            }
            this.logger.info(`✅ TabManager: Tab UI created for tab ${id}`);

            // 4. Create temporary tab data (without BrowserView) and notify UI immediately
            const tempTabData = {
                id,
                browserView: null,  // Will be set later
                tabUI,
                url,
                title: initialTitle,
                createdAt: Date.now(),
                metadata: options,
                isActive: false
            };
            this.tabs.set(id, tempTabData);

            // 5. Notify creation and switch immediately (before loading URL)
            this.notifyTabCreated(id, tempTabData);
            await this.switchTab(id);
            this.logger.info(`✅ TabManager: Tab ${id} UI shown, now loading content...`);

            // 6. Create BrowserView in background (slower, URL loading)
            const browserView = await this.createBrowserView(url, id, options);
            if (!browserView) {
                // Cleanup Tab UI if BrowserView creation failed
                this.removeTabUI(id);
                this.tabs.delete(id);
                throw new Error('Failed to create BrowserView');
            }
            this.logger.info(`✅ TabManager: BrowserView created for tab ${id}`);

            // 7. Update tab data with BrowserView
            tempTabData.browserView = browserView;
            this.logger.info(`✅ TabManager: Tab ${id} fully bound`);

            this.logger.info(`🎉 TabManager: Tab ${id} created and synchronized successfully`);
            return {
                id,
                title: initialTitle,
                url: url,
                tabUI: tabUI,
                metadata: options
            };

        } catch (error) {
            this.logger.error(`❌ TabManager: Failed to create tab: ` + error.message);
            throw error;
        }
    }

    /**
     * Close a tab with synchronized cleanup
     */
    async closeTab(id) {
        this.logger.info(`🗑️ TabManager: Closing synchronized tab ${id}`);

        const tab = this.tabs.get(id);
        if (!tab) {
            this.logger.warn(`⚠️ TabManager: Tab ${id} not found`);
            return false;
        }

        try {
            // 1. Close BrowserView
            this.logger.info(`🧹 TabManager: Closing BrowserView for tab ${id}`);
            await this.closeBrowserView(tab.browserView);
            this.logger.info(`✅ TabManager: BrowserView closed for tab ${id}`);

            // 2. Remove Tab UI
            this.logger.info(`🧹 TabManager: Removing Tab UI for tab ${id}`);
            await this.removeTabUI(tab.tabUI);
            this.logger.info(`✅ TabManager: Tab UI removed for tab ${id}`);

            // 3. Determine next tab BEFORE removing (if this is the current tab)
            let nextTabId = null;
            if (this.currentTabId === id) {
                nextTabId = this.getNextAvailableTabId(id);
                this.logger.info(`📌 TabManager: Next tab to focus after closing ${id}: ${nextTabId}`);
            }

            // 4. Remove from manager
            this.tabs.delete(id);
            this.logger.info(`✅ TabManager: Tab ${id} removed from manager`);

            // 5. Update current tab if needed
            if (this.currentTabId === id) {
                if (nextTabId) {
                    await this.switchTab(nextTabId);
                } else {
                    this.currentTabId = null;
                }
            }

            // 5. Notify closure
            this.notifyTabClosed(id);

            this.logger.info(`🎉 TabManager: Tab ${id} closed and synchronized successfully`);
            return true;

        } catch (error) {
            this.logger.error(`❌ TabManager: Failed to close tab ${id}: ` + error.message);
            return false;
        }
    }

    /**
     * Switch to a specific tab
     */
    async switchTab(id) {
        this.logger.info(`🔄 TabManager: Switching to tab ${id}`);

        const tab = this.tabs.get(id);
        if (!tab) {
            this.logger.warn(`⚠️ TabManager: Tab ${id} not found`);
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

            // 5. Update main window title with current tab title
            if (this.electronApp && this.electronApp.windowManager) {
                // Get the latest title from webContents if available
                let currentTitle = tab.title;
                try {
                    if (tab.browserView && tab.browserView.webContents && !tab.browserView.webContents.isDestroyed()) {
                        const webContentsTitle = tab.browserView.webContents.getTitle();
                        if (webContentsTitle && webContentsTitle.trim() && webContentsTitle !== 'Loading...' && webContentsTitle !== 'Untitled Page') {
                            currentTitle = webContentsTitle;
                            this.logger.info(`🔄 TabManager: Using webContents title for tab ${id}: "${currentTitle}"`);
                        }
                    }
                } catch (error) {
                    this.logger.warn(`⚠️ TabManager: Could not get webContents title for tab ${id}:`, error);
                }

                this.electronApp.windowManager.updateWindowTitle(currentTitle);
            }

            this.logger.info(`✅ TabManager: Switched to tab ${id}`);
            return true;

        } catch (error) {
            this.logger.error(`❌ TabManager: Failed to switch to tab ${id}:`, error);
            return false;
        }
    }

    /**
     * Create BrowserView
     */
    async createBrowserView(url, id, options = {}) {
        try {
            this.logger.info(`🆕 TabManager: Creating BrowserView for tab ${id} with URL: ${url}`);

            // Create BrowserView directly
            const browserView = new BrowserView({
                webPreferences: {
                    nodeIntegration: false,
                    contextIsolation: true,
                    preload: path.join(__dirname, '../pages/preload.js'),
                    webviewTag: true,  // Enable webview tag for embedded page previews in history
                    partition: 'persist:main',  // Use persistent session for cookies
                    session: null  // Will use default session with partition
                }
            });

            // Set a standard browser User-Agent to avoid website detection
            const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
            browserView.webContents.setUserAgent(userAgent);

            // Set bounds
            const bounds = this.getViewBounds();
            browserView.setBounds(bounds);

            // Set metadata
            browserView.tabId = id;
            browserView.tabManager = this;

            // Setup title listeners BEFORE loading URL to catch all events
            this.setupTitleListeners(browserView, id);

            // Setup history recording for this BrowserView
            this.setupHistoryRecording(browserView, id);

            // Load URL
            if (url.startsWith('browser://history')) {
                // Load history page
                const historyPath = path.join(__dirname, '../pages/history.html');
                this.logger.info(`📂 TabManager: Loading history file: ${historyPath}`);
                await browserView.webContents.loadFile(historyPath);
                this.logger.info(`✅ TabManager: History file loaded successfully for tab ${id}`);
            } else {
                // Load regular URL (non-blocking, load in background)
                this.logger.info(`🌐 TabManager: Starting to load URL: ${url} for tab ${id}`);
                browserView.webContents.loadURL(url).catch(loadError => {
                    this.logger.error(`❌ TabManager: Failed to load URL ${url} for tab ${id}:`, loadError);
                    // Set error title
                    this.updateTabTitle(id, `Error loading ${url}`);
                });
                this.logger.info(`✅ TabManager: URL loading started for tab ${id} (non-blocking)`);
            }

            // Add to main window
            const electronMainWindow = this.getElectronMainWindow();
            if (electronMainWindow) {
                electronMainWindow.addBrowserView(browserView);
                this.logger.info(`✅ TabManager: BrowserView ${id} added to main window`);
            }

            // Special handling for history tabs
            if (options.isHistory) {
                this.updateTabTitle(id, 'History');
            }

            return browserView;
        } catch (error) {
            this.logger.error(`❌ TabManager: Error creating BrowserView for tab ${id}:`, error);
            this.logger.error(`❌ TabManager: URL:`, url);
            this.logger.error(`❌ TabManager: Options:`, options);
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
            this.logger.error(`❌ TabManager: Error creating Tab UI for tab ${id}:`, error);
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
                this.logger.error(`❌ TabManager: Error getting title for tab ${id}:`, error);
                this.updateTabTitle(id, 'Error');
            }
        };

        // Set up listeners
        if (browserView.webContents) {
            this.logger.info(`🎯 TabManager: Setting up title listeners for tab ${id}`);
            browserView.webContents.on('page-title-updated', (event, title) => {
                this.logger.info(`🎯 TabManager: page-title-updated event for tab ${id}: "${title}"`);
                sendTitle();

                // Update history record title (use historyLogger)
                try {
                    const { getCClientLogger } = require('../utils/logger');
                    const historyLogger = getCClientLogger('history');

                    const currentURL = browserView.webContents.getURL();

                    // Use original URL (do NOT normalize)
                    historyLogger.info(`📚 [Tab ${id}] page-title-updated: URL=${currentURL}, Title=${title}`);

                    // Update history record if we have electronApp and historyManager
                    if (this.electronApp && this.electronApp.historyManager) {
                        if (currentURL && currentURL !== 'about:blank' && !currentURL.startsWith('browser://') && title) {
                            historyLogger.info(`📚 [Tab ${id}] Calling updateRecordTitle`);
                            this.electronApp.updateRecordTitle(currentURL, id, title);
                        } else {
                            this.logger.info(`📚 TabManager: ⏭️ Skipping update - blank/internal page or no title`);
                        }
                    } else {
                        this.logger.info(`📚 TabManager: ❌ Cannot update - electronApp or historyManager not available`);
                    }
                } catch (titleError) {
                    this.logger.warn(`⚠️ TabManager: Error updating history title for tab ${id}:`, titleError);
                }
            });
            browserView.webContents.on('did-finish-load', () => {
                this.logger.info(`🎯 TabManager: did-finish-load event for tab ${id}`);
                sendTitle();

                // Update history record title (use historyLogger)
                try {
                    const { getCClientLogger } = require('../utils/logger');
                    const historyLogger = getCClientLogger('history');

                    const currentURL = browserView.webContents.getURL();
                    const currentTitle = browserView.webContents.getTitle();

                    // Use original URL (do NOT normalize)
                    historyLogger.info(`📚 [Tab ${id}] did-finish-load: URL=${currentURL}, Title=${currentTitle}`);

                    // Update history record if we have electronApp and historyManager
                    if (this.electronApp && this.electronApp.historyManager) {
                        if (currentURL && currentURL !== 'about:blank' && !currentURL.startsWith('browser://')) {
                            historyLogger.info(`📚 [Tab ${id}] Calling updateRecordTitle`);
                            this.electronApp.updateRecordTitle(currentURL, id, currentTitle);
                        } else {
                            this.logger.info(`📚 TabManager: ⏭️ Skipping update - blank/internal page`);
                        }
                    } else {
                        this.logger.info(`📚 TabManager: ❌ Cannot update - electronApp or historyManager not available`);
                    }
                } catch (titleError) {
                    this.logger.warn(`⚠️ TabManager: Error updating history title for tab ${id}:`, titleError);
                }

                // Check for NSN response after page loads (but skip logout pages)
                const currentURL = browserView.webContents.getURL();
                if (!currentURL.includes('/logout')) {
                    this.logger.info(`🔍 TabManager: Non-logout page detected, checking for NSN response...`);
                    this.detectNSNResponse(browserView, id, 'did-finish-load');
                } else {
                    this.logger.info(`🔍 TabManager: Logout page detected, skipping NSN response detection`);
                }
            });
            browserView.webContents.on('did-navigate', () => {
                this.logger.info(`🎯 TabManager: did-navigate event for tab ${id}`);
                sendTitle();

                // Check for NSN response after navigation (but skip logout pages)
                const currentURL = browserView.webContents.getURL();
                if (!currentURL.includes('/logout')) {
                    this.logger.info(`🔍 TabManager: Non-logout page navigation detected, checking for NSN response...`);
                    this.detectNSNResponse(browserView, id, 'did-navigate');
                } else {
                    this.logger.info(`🔍 TabManager: Logout page navigation detected, skipping NSN response detection`);
                }
            });
            browserView.webContents.on('did-navigate-in-page', () => {
                this.logger.info(`🎯 TabManager: did-navigate-in-page event for tab ${id}`);
                sendTitle();
            });
            browserView.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL, isMainFrame) => {
                // Only show error for main frame load failures
                if (!isMainFrame) {
                    return;
                }

                this.logger.error(`❌ TabManager: did-fail-load event for tab ${id}:`, errorCode, errorDescription, validatedURL);

                // Provide user-friendly error messages
                let userMessage = '';
                if (errorCode === -102) {
                    // ERR_CONNECTION_REFUSED
                    const urlObj = new URL(validatedURL);
                    const hostname = urlObj.hostname;
                    const port = urlObj.port || (urlObj.protocol === 'https:' ? '443' : '80');

                    if (hostname === 'localhost' || hostname === '127.0.0.1') {
                        userMessage = `Cannot connect to local server (${hostname}:${port}). Please make sure the server is running.`;
                    } else {
                        userMessage = `Connection refused: ${hostname}:${port} is not reachable.`;
                    }
                } else if (errorCode === -105) {
                    // ERR_NAME_NOT_RESOLVED
                    userMessage = `Cannot find server: The domain name could not be resolved.`;
                } else if (errorCode === -106) {
                    // ERR_INTERNET_DISCONNECTED
                    userMessage = `No internet connection. Please check your network.`;
                } else if (errorCode === -501) {
                    // ERR_INSECURE_RESPONSE
                    userMessage = `Connection is not secure. SSL/TLS certificate error.`;
                } else {
                    userMessage = `Failed to load: ${errorDescription}`;
                }

                this.updateTabTitle(id, userMessage);

                // Show user-friendly error page in the browser view
                const errorHtml = `
                    <!DOCTYPE html>
                    <html>
                    <head>
                        <meta charset="UTF-8">
                        <style>
                            body {
                                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                                display: flex;
                                justify-content: center;
                                align-items: center;
                                min-height: 100vh;
                                margin: 0;
                                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                            }
                            .error-container {
                                background: white;
                                border-radius: 12px;
                                padding: 40px;
                                max-width: 500px;
                                box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
                                text-align: center;
                            }
                            .error-icon {
                                font-size: 64px;
                                margin-bottom: 20px;
                            }
                            .error-title {
                                font-size: 24px;
                                font-weight: 600;
                                color: #2d3748;
                                margin-bottom: 16px;
                            }
                            .error-message {
                                font-size: 16px;
                                color: #4a5568;
                                line-height: 1.6;
                                margin-bottom: 24px;
                            }
                            .error-url {
                                background: #f7fafc;
                                border: 2px solid #e2e8f0;
                                border-radius: 8px;
                                padding: 12px;
                                font-family: 'Courier New', monospace;
                                font-size: 14px;
                                color: #667eea;
                                word-break: break-all;
                                margin-bottom: 24px;
                            }
                            .error-hint {
                                font-size: 14px;
                                color: #718096;
                                font-style: italic;
                            }
                        </style>
                    </head>
                    <body>
                        <div class="error-container">
                            <div class="error-icon">🚫</div>
                            <div class="error-title">Unable to Load Page</div>
                            <div class="error-message">${userMessage}</div>
                            <div class="error-url">${validatedURL}</div>
                            <div class="error-hint">Error Code: ${errorCode} (${errorDescription})</div>
                        </div>
                    </body>
                    </html>
                `;

                // Load error page
                browserView.webContents.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(errorHtml)}`);
            });
        }

        // Initial title check
        this.logger.info(`🎯 TabManager: Scheduling initial title check for tab ${id} in 100ms`);
        setTimeout(() => {
            this.logger.info(`🎯 TabManager: Running initial title check for tab ${id}`);
            sendTitle();
        }, 100);
    }

    /**
     * Setup history recording for a BrowserView
     */
    setupHistoryRecording(browserView, id) {
        const { getCClientLogger } = require('../utils/logger');
        const historyLogger = getCClientLogger('history');

        const contents = browserView.webContents;

        contents.on('did-start-navigation', (event, url, isInPlace, isMainFrame) => {
            // Skip logging for data: URLs to reduce noise
            if (!url.startsWith('data:')) {
                historyLogger.info(`📍 [Tab ${id}] did-start-navigation: url=${url}, isMainFrame=${isMainFrame}, isInPlace=${isInPlace}`);
            }

            if (!isMainFrame) {
                if (!url.startsWith('data:')) {
                    historyLogger.info(`⏭️ [Tab ${id}] Skipping: not main frame`);
                }
                return;
            }

            if (isInPlace) {
                historyLogger.info(`⏭️ [Tab ${id}] Skipping: in-place navigation (SPA/hash change)`);
                return;
            }

            const UrlUtils = require('../utils/urlUtils');
            if (!UrlUtils.isValidUrl(url)) {
                historyLogger.info(`⏭️ [Tab ${id}] Skipping invalid URL: ${url}`);
                return;
            }

            // Use original URL for history storage (do NOT normalize)
            // Skip logging for data: URLs to reduce noise
            if (!url.startsWith('data:')) {
                historyLogger.info(`📝 [Tab ${id}] Recording visit for viewId=${id}, url=${url}`);
            }

            if (this.electronApp && this.electronApp.historyManager) {
                setTimeout(async () => {
                    try {
                        if (contents.isDestroyed()) return;

                        // Create record first
                        const record = await this.electronApp.historyManager.recordPageVisitWithContent(url, id, contents);
                        if (record) {
                            historyLogger.info(`✅ [Tab ${id}] Visit recorded with ID: ${record.id}, URL: ${url}`);

                            // Immediately try to get the actual title after record creation
                            // Wait a bit for page to load
                            setTimeout(() => {
                                try {
                                    if (contents.isDestroyed()) return;

                                    const currentTitle = contents.getTitle();
                                    historyLogger.info(`🔍 [Tab ${id}] Checking title after record creation: "${currentTitle}"`);

                                    if (currentTitle && currentTitle.trim() &&
                                        currentTitle !== 'Loading...' &&
                                        currentTitle !== 'about:blank' &&
                                        currentTitle !== url) {
                                        // Update title immediately
                                        this.electronApp.historyManager.updateRecordTitle(record, currentTitle);
                                        historyLogger.info(`✅ [Tab ${id}] Title updated immediately after record creation: ${currentTitle}`);
                                    } else {
                                        historyLogger.info(`⏳ [Tab ${id}] Title not ready yet, will update later via events`);
                                    }
                                } catch (titleError) {
                                    historyLogger.error(`Error updating title after record creation: ${titleError.message}`);
                                }
                            }, 1000);  // Wait 1 second for page to load and title to be available
                        } else {
                            historyLogger.warn(`⚠️ [Tab ${id}] Failed to record visit for URL: ${url}`);
                        }
                    } catch (error) {
                        historyLogger.error(`Error in did-start-navigation handler for tab ${id}: ${error.message}`);
                    }
                }, 200);
            }
        });
    }

    /**
     * Update tab title and notify UI
     */
    updateTabTitle(id, title) {
        try {
            this.logger.info(`📝 TabManager: Updating title for tab ${id} to: "${title}"`);

            // Update internal tab data
            const tab = this.tabs.get(id);
            if (tab) {
                const oldTitle = tab.title;
                tab.title = title;
                this.logger.info(`📝 TabManager: Updated internal title for tab ${id}: "${oldTitle}" -> "${title}"`);
            } else {
                this.logger.warn(`⚠️ TabManager: Tab ${id} not found when updating title`);
                return;
            }

            // Notify UI of title update
            if (this.electronApp && this.electronApp.sendToWindow) {
                this.logger.info(`📝 TabManager: Sending tab-title-updated event for tab ${id}`);
                this.electronApp.sendToWindow('tab-title-updated', {
                    id: parseInt(id),
                    title: title
                });
                this.logger.info(`✅ TabManager: tab-title-updated event sent for tab ${id}`);
            } else {
                this.logger.warn(`⚠️ TabManager: electronApp or sendToWindow not available for title update`);
            }

            this.logger.info(`📝 TabManager: Title update completed for tab ${id}: "${title}"`);
        } catch (error) {
            this.logger.error(`❌ TabManager: Error updating title for tab ${id}:`, error);
        }
    }

    /**
     * Close BrowserView
     */
    async closeBrowserView(browserView) {
        try {
            if (browserView && browserView.webContents && !browserView.webContents.isDestroyed()) {
                // Remove all event listeners before destroying
                this.logger.info(`🧹 TabManager: Removing event listeners from BrowserView`);
                browserView.webContents.removeAllListeners();

                // Destroy the webContents
                browserView.webContents.destroy();
                this.logger.info(`✅ TabManager: BrowserView destroyed successfully`);
            }
        } catch (error) {
            this.logger.error(`❌ TabManager: Error closing BrowserView:`, error);
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
            this.logger.error(`❌ TabManager: Error removing Tab UI:`, error);
        }
    }

    /**
     * Show BrowserView
     */
    async showBrowserView(browserView) {
        try {
            const electronMainWindow = this.getElectronMainWindow();

            if (!electronMainWindow) {
                this.logger.error(`❌ TabManager: Main window not available for showing BrowserView`);
                return false;
            }

            if (electronMainWindow.isDestroyed()) {
                this.logger.error(`❌ TabManager: Main window is destroyed, cannot show BrowserView`);
                return false;
            }

            if (typeof electronMainWindow.addBrowserView === 'function') {
                // Add BrowserView to main window
                electronMainWindow.addBrowserView(browserView);

                // Update bounds to ensure proper rendering
                const bounds = this.getViewBounds();
                browserView.setBounds(bounds);
                this.logger.info(`📐 TabManager: Updated bounds for BrowserView: ${bounds.width}x${bounds.height}`);

                // Force focus to ensure proper rendering
                try {
                    electronMainWindow.focus();
                    browserView.webContents.focus();
                    this.logger.info(`🔍 TabManager: Forced focus to BrowserView`);
                } catch (focusError) {
                    this.logger.warn(`⚠️ TabManager: Error forcing focus: ${focusError.message}`);
                }

                // Force refresh and focus for BrowserView (no reload for normal tab switching)
                this.forceRefreshAndFocus(browserView, false);

                this.logger.info(`✅ TabManager: BrowserView added to main window`);
                return true;
            } else {
                this.logger.error(`❌ TabManager: Main window does not support addBrowserView`);
                return false;
            }
        } catch (error) {
            this.logger.error(`❌ TabManager: Error showing BrowserView:`, error);
            return false;
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
            this.logger.error(`❌ TabManager: Error hiding BrowserView:`, error);
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
    getNextAvailableTabId(closedTabId = null) {
        const tabIds = Array.from(this.tabs.keys()).sort((a, b) => a - b);

        if (tabIds.length <= 1) {
            // No tabs or only the tab being closed
            return null;
        }

        // If no closedTabId specified, return the last tab
        if (!closedTabId) {
            return tabIds[tabIds.length - 1];
        }

        // Find the position of the closed tab
        const closedIndex = tabIds.indexOf(closedTabId);

        if (closedIndex === -1) {
            // Closed tab not found, return last tab
            return tabIds[tabIds.length - 1];
        }

        // Try to select the tab to the right (next in array)
        if (closedIndex + 1 < tabIds.length) {
            return tabIds[closedIndex + 1];
        }

        // No tab to the right, select the tab to the left (previous in array)
        if (closedIndex - 1 >= 0) {
            return tabIds[closedIndex - 1];
        }

        // Should not reach here, but return last tab as fallback
        return tabIds[tabIds.length - 1];
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

            // Update main window title if this is the current tab
            if (id === this.currentTabId && this.electronApp && this.electronApp.windowManager) {
                this.electronApp.windowManager.updateWindowTitle(title);
            }
        }
    }

    /**
     * Close all tabs
     */
    async closeAllTabs() {
        this.logger.info(`🗑️ TabManager: Closing all tabs`);

        const tabIds = Array.from(this.tabs.keys());
        for (const id of tabIds) {
            await this.closeTab(id);
        }

        this.currentTabId = null;
        this.logger.info(`✅ TabManager: All tabs closed`);
    }

    /**
     * Event notification methods
     */
    notifyTabCreated(id, tabData) {
        this.logger.info(`📢 TabManager: Notifying tab created - ID: ${id}, Title: ${tabData.title}`);

        if (this.onTabCreated) {
            this.logger.info(`📢 TabManager: Calling onTabCreated callback for tab ${id}`);
            this.onTabCreated(id, tabData);
        }

        // Also send to main window
        if (this.electronApp && this.electronApp.sendToWindow) {
            this.logger.info(`📢 TabManager: Sending tab-created event to renderer for tab ${id}`);
            this.electronApp.sendToWindow('tab-created', {
                id,
                url: tabData.url,
                title: tabData.title,
                metadata: tabData.metadata
            });
            this.logger.info(`✅ TabManager: tab-created event sent successfully for tab ${id}`);
        } else {
            this.logger.error(`❌ TabManager: Cannot send tab-created event - electronApp or sendToWindow not available`);
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

    // ===== ViewManager compatibility methods =====

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
                this.logger.info(`🧭 TabManager: Navigating to URL: ${url}`);

                // Add error handling for navigation
                const webContents = currentTab.browserView.webContents;

                // Set up error handlers for this navigation
                const handleNavigationError = (event, errorCode, errorDescription, validatedURL) => {
                    this.logger.error(`❌ TabManager: Navigation failed: ${errorCode} (${errorDescription}) loading '${validatedURL}'`);
                    this.logger.error(`❌ TabManager: Error details:`, {
                        errorCode,
                        errorDescription,
                        validatedURL,
                        timestamp: new Date().toISOString()
                    });
                };

                const handleNavigationSuccess = () => {
                    this.logger.info(`✅ TabManager: Navigation successful: ${url}`);
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
                this.logger.error(`❌ TabManager: Navigation error for URL ${url}:`, error);
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
        this.logger.info(`🧹 TabManager: Closing all tabs and creating default tab`);

        // Close all tabs
        const allTabs = this.getAllTabs();
        for (const tab of allTabs) {
            await this.closeTab(tab.id);
        }

        // Create new default tab
        await this.createTab();
        this.logger.info(`✅ TabManager: All tabs closed and default tab created`);
    }

    /**
     * Hide all tabs from main window
     */
    hideAllViews() {
        const allTabs = this.getAllTabs();
        const electronMainWindow = this.getElectronMainWindow();

        if (!electronMainWindow) {
            this.logger.warn(`⚠️ TabManager: Cannot hide views - main window not available`);
            return;
        }

        this.logger.info(`🧹 TabManager: Hiding ${allTabs.length} tabs from main window`);

        allTabs.forEach(tab => {
            if (tab.browserView && !tab.browserView.webContents.isDestroyed()) {
                try {
                    electronMainWindow.removeBrowserView(tab.browserView);
                    this.logger.info(`✅ TabManager: Successfully hid tab ${tab.id} from main window`);
                } catch (error) {
                    this.logger.error(`❌ TabManager: Error hiding tab ${tab.id}:`, error);
                }
            }
        });

        // IMPORTANT: Don't clear currentTabId when hiding views
        // This preserves the current tab state for when views are shown again
        this.logger.info(`✅ TabManager: All tabs hidden, currentTabId preserved: ${this.currentTabId}`);
    }

    /**
     * Show all tabs in main window
     */
    async showAllViews() {
        const allTabs = this.getAllTabs();
        const electronMainWindow = this.getElectronMainWindow();

        if (!electronMainWindow) {
            this.logger.warn(`⚠️ TabManager: Cannot show views - main window not available`);
            return;
        }

        this.logger.info(`🔄 TabManager: Showing ${allTabs.length} tabs in main window`);
        this.logger.info(`🔄 TabManager: Main window state - isDestroyed: ${electronMainWindow.isDestroyed()}, isVisible: ${electronMainWindow.isVisible()}, isMinimized: ${electronMainWindow.isMinimized()}`);

        // Log detailed tab information
        allTabs.forEach((tab, index) => {
            this.logger.info(`🔄 TabManager: Tab ${index + 1}/${allTabs.length} - ID: ${tab.id}, URL: ${tab.url}, hasBrowserView: ${!!tab.browserView}, isDestroyed: ${tab.browserView ? tab.browserView.webContents.isDestroyed() : 'N/A'}`);
        });

        // Check and fix window state issues first
        await this.checkAndFixWindowState();

        // Handle the specific 0x-86 window dimension issue
        await this.handleZeroByNegativeEightySixIssue();

        // Detect and fix invalid window dimensions (like 0x-86)
        await this.detectAndFixInvalidWindowDimensions();

        // Detect and fix minimization issues specifically
        await this.detectAndFixMinimizationIssues();

        // Clear cache and fix memory issues
        await this.clearCacheAndFixMemory();

        allTabs.forEach((tab, index) => {
            this.logger.info(`🔄 TabManager: Processing tab ${index + 1}/${allTabs.length} - ID: ${tab.id}`);

            if (tab.browserView && !tab.browserView.webContents.isDestroyed()) {
                try {
                    this.logger.info(`🔄 TabManager: Adding BrowserView for tab ${tab.id} to main window`);

                    // Add BrowserView to main window
                    electronMainWindow.addBrowserView(tab.browserView);
                    this.logger.info(`✅ TabManager: BrowserView added to main window for tab ${tab.id}`);

                    // Update bounds to ensure proper rendering
                    const bounds = this.getViewBounds();
                    tab.browserView.setBounds(bounds);
                    this.logger.info(`📐 TabManager: Updated bounds for tab ${tab.id}: ${bounds.width}x${bounds.height}`);

                    // Force refresh and focus for each tab (with reload)
                    this.logger.info(`🔄 TabManager: Force refreshing tab ${tab.id}...`);
                    this.forceRefreshAndFocus(tab.browserView, true);

                    // Analyze and repair page rendering issues for each tab
                    setTimeout(async () => {
                        this.logger.info(`🔍 TabManager: Analyzing page rendering for tab ${tab.id}...`);
                        // First analyze why page might not be rendering
                        await this.analyzePageRenderingIssues(tab.browserView);
                        // Then detect and repair page rendering issues
                        await this.detectAndRepairPageRendering(tab.browserView);
                        // Also verify and force page rendering
                        await this.verifyAndForcePageRendering(tab.browserView);
                        this.logger.info(`✅ TabManager: Page rendering analysis completed for tab ${tab.id}`);
                    }, 2000); // Wait 2 seconds for page to load

                    this.logger.info(`✅ TabManager: Successfully showed tab ${tab.id} in main window`);
                } catch (error) {
                    this.logger.error(`❌ TabManager: Error showing tab ${tab.id}:`, error);
                }
            } else {
                this.logger.warn(`⚠️ TabManager: Skipping tab ${tab.id} - BrowserView invalid or destroyed`);
                if (tab.browserView) {
                    this.logger.warn(`⚠️ TabManager: Tab ${tab.id} BrowserView destroyed: ${tab.browserView.webContents.isDestroyed()}`);
                } else {
                    this.logger.warn(`⚠️ TabManager: Tab ${tab.id} has no BrowserView`);
                }
            }
        });

        // Restore current active tab if exists
        if (this.currentTabId) {
            const currentTab = this.getCurrentTab();
            if (currentTab && currentTab.browserView) {
                try {
                    // Set the current tab as active BrowserView
                    electronMainWindow.setBrowserView(currentTab.browserView);

                    // Force refresh and focus for current tab (with reload)
                    this.forceRefreshAndFocus(currentTab.browserView, true);

                    // Analyze and repair page rendering issues
                    setTimeout(async () => {
                        // First analyze why page might not be rendering
                        await this.analyzePageRenderingIssues(currentTab.browserView);
                        // Then detect and repair page rendering issues
                        await this.detectAndRepairPageRendering(currentTab.browserView);
                        // Also verify and force page rendering
                        await this.verifyAndForcePageRendering(currentTab.browserView);
                    }, 2000); // Wait 2 seconds for page to load

                    this.logger.info(`✅ TabManager: Restored current tab ${this.currentTabId} as active`);
                } catch (error) {
                    this.logger.error(`❌ TabManager: Error setting current tab ${this.currentTabId}:`, error);
                }
            }
        }

        this.logger.info(`✅ TabManager: All tabs shown in main window, current tab: ${this.currentTabId}`);
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
        // Get bounds from WindowManager (which calculates based on current window size)
        if (this.electronApp && this.electronApp.windowManager && this.electronApp.windowManager.getViewBounds) {
            const bounds = this.electronApp.windowManager.getViewBounds();
            this.logger.info(`📐 TabManager: Getting view bounds from WindowManager: ${bounds.width}x${bounds.height}`);
            return bounds;
        }

        // Fallback: calculate from main window directly
        const mainWindow = this.getElectronMainWindow();
        if (mainWindow) {
            const [width, height] = mainWindow.getContentSize();
            const topOffset = 86; // toolbar 50px + tab bar 36px

            // Check for invalid window dimensions (like 0x-86)
            if (width <= 0 || height <= 0) {
                this.logger.warn(`⚠️ TabManager: Invalid window dimensions detected: ${width}x${height}`);
                this.logger.warn(`⚠️ TabManager: This may cause BrowserView rendering issues`);

                // Force window to have valid dimensions
                try {
                    mainWindow.setSize(1000, 800);
                    this.logger.info(`🔧 TabManager: Forced window size to 1000x800`);

                    // Wait a bit for window to resize
                    setTimeout(() => {
                        const [newWidth, newHeight] = mainWindow.getContentSize();
                        this.logger.info(`🔧 TabManager: Window resized to: ${newWidth}x${newHeight}`);
                    }, 100);
                } catch (error) {
                    this.logger.error(`❌ TabManager: Error resizing window:`, error);
                }

                // Use fallback dimensions
                this.logger.info(`📐 TabManager: Using fallback bounds due to invalid window dimensions`);
                return { x: 0, y: topOffset, width: 1000, height: 714 };
            }

            // Ensure minimum bounds
            const minWidth = 800;
            const minHeight = 600;
            const actualWidth = Math.max(width, minWidth);
            const actualHeight = Math.max(height - topOffset, minHeight);

            const bounds = {
                x: 0,
                y: topOffset,
                width: actualWidth,
                height: actualHeight
            };

            this.logger.info(`📐 TabManager: Calculated view bounds from main window: ${bounds.width}x${bounds.height} (original: ${width}x${height})`);
            return bounds;
        }

        // Default fallback
        this.logger.info(`📐 TabManager: Using default view bounds: 1000x714`);
        return { x: 0, y: 86, width: 1000, height: 714 };
    }

    /**
     * Handle 0x-86 window dimension issue specifically
     */
    async handleZeroByNegativeEightySixIssue() {
        try {
            const electronMainWindow = this.getElectronMainWindow();
            if (!electronMainWindow) {
                this.logger.warn(`⚠️ TabManager: Cannot handle 0x-86 issue - main window not available`);
                return false;
            }

            this.logger.info(`🔍 TabManager: Handling 0x-86 window dimension issue...`);

            // Check for the specific 0x-86 issue
            const [width, height] = electronMainWindow.getContentSize();
            if (width === 0 && height === -86) {
                this.logger.warn(`⚠️ TabManager: Detected 0x-86 window dimension issue`);
                this.logger.warn(`⚠️ TabManager: This is a known Electron issue with window minimization`);

                // Force window to have valid dimensions
                try {
                    // First, ensure window is not minimized
                    if (electronMainWindow.isMinimized()) {
                        electronMainWindow.restore();
                        this.logger.info(`🔧 TabManager: Restored window from minimized state`);
                        await new Promise(resolve => setTimeout(resolve, 100));
                    }

                    // Then show window if not visible
                    if (!electronMainWindow.isVisible()) {
                        electronMainWindow.show();
                        this.logger.info(`🔧 TabManager: Showed window`);
                        await new Promise(resolve => setTimeout(resolve, 100));
                    }

                    // Set valid size with proper dimensions
                    electronMainWindow.setSize(1200, 900);
                    electronMainWindow.center();
                    this.logger.info(`🔧 TabManager: Set valid window size to 1200x900 and centered`);

                    // Wait for window to resize
                    await new Promise(resolve => setTimeout(resolve, 300));

                    // Verify the fix
                    const [newWidth, newHeight] = electronMainWindow.getContentSize();
                    const newIsVisible = electronMainWindow.isVisible();
                    const newIsMinimized = electronMainWindow.isMinimized();

                    this.logger.info(`🔧 TabManager: After fix - size: ${newWidth}x${newHeight}, visible: ${newIsVisible}, minimized: ${newIsMinimized}`);

                    if (newWidth > 0 && newHeight > 0 && newIsVisible && !newIsMinimized) {
                        this.logger.info(`✅ TabManager: 0x-86 window dimension issue fixed successfully`);
                        return true;
                    } else {
                        this.logger.warn(`⚠️ TabManager: 0x-86 window dimension issue not fully resolved`);
                        return false;
                    }
                } catch (error) {
                    this.logger.error(`❌ TabManager: Error fixing 0x-86 window dimension issue:`, error);
                    return false;
                }
            } else {
                this.logger.info(`✅ TabManager: No 0x-86 window dimension issue detected: ${width}x${height}`);
                return true;
            }
        } catch (error) {
            this.logger.error(`❌ TabManager: Error handling 0x-86 window dimension issue:`, error);
            return false;
        }
    }

    /**
     * Handle invalid window dimensions (0x0, 0x-86, negative values, etc.)
     */
    async handleInvalidWindowDimensions(width, height) {
        try {
            const electronMainWindow = this.getElectronMainWindow();
            if (!electronMainWindow) {
                this.logger.warn(`⚠️ TabManager: Cannot handle invalid dimensions - main window not available`);
                return false;
            }

            this.logger.info(`🔍 TabManager: Handling invalid window dimensions: ${width}x${height}`);

            // Force window to have valid dimensions
            try {
                // First, ensure window is not minimized
                if (electronMainWindow.isMinimized()) {
                    electronMainWindow.restore();
                    this.logger.info(`🔧 TabManager: Restored window from minimized state`);
                    await new Promise(resolve => setTimeout(resolve, 100));
                }

                // Then show window if not visible
                if (!electronMainWindow.isVisible()) {
                    electronMainWindow.show();
                    this.logger.info(`🔧 TabManager: Showed window`);
                    await new Promise(resolve => setTimeout(resolve, 100));
                }

                // Set valid size with proper dimensions
                electronMainWindow.setSize(1200, 900);
                electronMainWindow.center();
                this.logger.info(`🔧 TabManager: Set valid window size to 1200x900 and centered`);

                // Wait for window to resize
                await new Promise(resolve => setTimeout(resolve, 300));

                // Verify the fix
                const [newWidth, newHeight] = electronMainWindow.getContentSize();
                const newIsVisible = electronMainWindow.isVisible();
                const newIsMinimized = electronMainWindow.isMinimized();

                this.logger.info(`🔧 TabManager: After fix - size: ${newWidth}x${newHeight}, visible: ${newIsVisible}, minimized: ${newIsMinimized}`);

                if (newWidth > 0 && newHeight > 0 && newIsVisible && !newIsMinimized) {
                    this.logger.info(`✅ TabManager: Invalid window dimensions fixed successfully`);
                    return true;
                } else {
                    this.logger.warn(`⚠️ TabManager: Invalid window dimensions not fully resolved`);
                    return false;
                }
            } catch (error) {
                this.logger.error(`❌ TabManager: Error fixing invalid window dimensions:`, error);
                return false;
            }
        } catch (error) {
            this.logger.error(`❌ TabManager: Error handling invalid window dimensions:`, error);
            return false;
        }
    }

    /**
     * Setup window resize listener to handle 0x-86 issue in real-time
     */
    setupWindowResizeListener() {
        try {
            const electronMainWindow = this.getElectronMainWindow();
            if (!electronMainWindow) {
                this.logger.warn(`⚠️ TabManager: Cannot setup resize listener - main window not available`);
                return false;
            }

            this.logger.info(`🔍 TabManager: Setting up window resize listener for 0x-86 detection...`);

            // Listen for window resize events
            electronMainWindow.on('resize', async () => {
                try {
                    const [width, height] = electronMainWindow.getContentSize();
                    this.logger.info(`🔍 TabManager: Window resized to ${width}x${height}`);

                    // Check for invalid window dimensions (0x0, 0x-86, negative values, etc.)
                    if (width <= 0 || height <= 0 || width < 100 || height < 100) {
                        this.logger.warn(`⚠️ TabManager: Detected invalid window dimensions in resize event: ${width}x${height}`);
                        this.logger.warn(`⚠️ TabManager: Immediately fixing window dimensions...`);

                        // Immediately fix the window dimensions
                        await this.handleInvalidWindowDimensions(width, height);

                        // Also update all BrowserView bounds
                        this.logger.info(`🔍 TabManager: Updating all BrowserView bounds after invalid dimensions fix...`);
                        const allTabs = this.getAllTabs();
                        allTabs.forEach(tab => {
                            if (tab.browserView && !tab.browserView.webContents.isDestroyed()) {
                                try {
                                    const bounds = this.getViewBounds();
                                    tab.browserView.setBounds(bounds);
                                    this.logger.info(`📐 TabManager: Updated bounds for tab ${tab.id}: ${bounds.width}x${bounds.height}`);
                                } catch (error) {
                                    this.logger.error(`❌ TabManager: Error updating bounds for tab ${tab.id}:`, error);
                                }
                            }
                        });
                    }
                } catch (error) {
                    this.logger.error(`❌ TabManager: Error in resize listener:`, error);
                }
            });

            this.logger.info(`✅ TabManager: Window resize listener setup completed`);
            return true;
        } catch (error) {
            this.logger.error(`❌ TabManager: Error setting up window resize listener:`, error);
            return false;
        }
    }

    /**
     * Optimize page rendering for BrowserView
     */
    optimizePageRendering(browserView) {
        try {
            if (!browserView || browserView.webContents.isDestroyed()) {
                this.logger.warn(`⚠️ TabManager: Cannot optimize rendering - BrowserView is invalid`);
                return false;
            }

            // Execute JavaScript to optimize page rendering
            browserView.webContents.executeJavaScript(`
                // Force page visibility and repaint
                if (document.body) {
                    document.body.style.visibility = 'visible';
                    document.body.style.display = 'block';
                }
                
                // Trigger a repaint
                window.dispatchEvent(new Event('resize'));
                
                // Force focus to ensure proper rendering
                if (document.activeElement) {
                    document.activeElement.blur();
                    document.activeElement.focus();
                }
                
                console.log('🔍 BrowserView: Page rendering optimized');
            `).catch(err => {
                this.logger.warn(`⚠️ TabManager: Error optimizing page rendering: ${err.message}`);
            });

            this.logger.info(`✅ TabManager: Page rendering optimized for BrowserView`);
            return true;
        } catch (error) {
            this.logger.error(`❌ TabManager: Error optimizing page rendering:`, error);
            return false;
        }
    }

    /**
     * Force refresh and focus for BrowserView (with optional reload for proper rendering)
     */
    forceRefreshAndFocus(browserView, forceReload = false) {
        try {
            if (!browserView || browserView.webContents.isDestroyed()) {
                this.logger.warn(`⚠️ TabManager: Cannot force refresh - BrowserView is invalid`);
                return false;
            }

            this.logger.info(`🔄 TabManager: Force refreshing and focusing BrowserView (with reload)`);

            // Force focus to main window and BrowserView
            const electronMainWindow = this.getElectronMainWindow();
            if (electronMainWindow) {
                electronMainWindow.focus();
                electronMainWindow.show();
                this.logger.info(`🔍 TabManager: Forced focus to main window`);
            }

            // Force focus to BrowserView
            browserView.webContents.focus();
            this.logger.info(`🔍 TabManager: Forced focus to BrowserView`);

            // Force refresh the page (reload only when necessary for proper rendering)
            if (forceReload) {
                browserView.webContents.reload();
                this.logger.info(`🔄 TabManager: Force reloaded BrowserView`);
            } else {
                this.logger.info(`🔄 TabManager: Skipped reload for normal tab switching`);
            }

            // Execute JavaScript to ensure proper rendering after refresh
            setTimeout(() => {
                browserView.webContents.executeJavaScript(`
                    // Force page visibility and repaint after refresh
                    if (document.body) {
                        document.body.style.visibility = 'visible';
                        document.body.style.display = 'block';
                    }
                    
                    // Trigger a repaint
                    window.dispatchEvent(new Event('resize'));
                    
                    // Force focus to ensure proper rendering
                    if (document.activeElement) {
                        document.activeElement.blur();
                        document.activeElement.focus();
                    }
                    
                    console.log('🔍 BrowserView: Force refresh and focus completed');
                `).catch(err => {
                    this.logger.warn(`⚠️ TabManager: Error executing post-refresh script: ${err.message}`);
                });
            }, 1000); // Wait 1 second for page to load

            this.logger.info(`✅ TabManager: Force refresh and focus completed for BrowserView`);
            return true;
        } catch (error) {
            this.logger.error(`❌ TabManager: Error force refreshing BrowserView:`, error);
            return false;
        }
    }

    /**
     * Analyze why page is not rendering
     */
    async analyzePageRenderingIssues(browserView) {
        try {
            if (!browserView || browserView.webContents.isDestroyed()) {
                this.logger.warn(`⚠️ TabManager: Cannot analyze rendering - BrowserView is invalid`);
                return false;
            }

            this.logger.info(`🔍 TabManager: Analyzing page rendering issues...`);

            // Get comprehensive page state information
            const pageState = await browserView.webContents.executeJavaScript(`
                return {
                    // Basic page info
                    url: window.location.href,
                    title: document.title,
                    readyState: document.readyState,
                    
                    // Content info
                    hasBody: !!document.body,
                    bodyChildren: document.body ? document.body.children.length : 0,
                    bodyHeight: document.body ? document.body.offsetHeight : 0,
                    bodyWidth: document.body ? document.body.offsetWidth : 0,
                    
                    // Visibility info
                    visibilityState: document.visibilityState,
                    hidden: document.hidden,
                    
                    // Style info
                    bodyVisibility: document.body ? getComputedStyle(document.body).visibility : 'unknown',
                    bodyDisplay: document.body ? getComputedStyle(document.body).display : 'unknown',
                    bodyOpacity: document.body ? getComputedStyle(document.body).opacity : 'unknown',
                    
                    // Viewport info
                    viewportWidth: window.innerWidth,
                    viewportHeight: window.innerHeight,
                    
                    // Error info
                    hasErrors: window.console.error ? 'check console' : 'no console',
                    
                    // Network info
                    connectionState: navigator.onLine ? 'online' : 'offline'
                };
            `);

            this.logger.info(`🔍 TabManager: Page state analysis:`, pageState);

            // Analyze the issues
            const issues = [];

            if (!pageState.hasBody) {
                issues.push('No document.body');
            }

            if (pageState.bodyChildren === 0) {
                issues.push('No body children');
            }

            if (pageState.bodyHeight === 0) {
                issues.push('Body height is 0');
            }

            if (pageState.visibilityState !== 'visible') {
                issues.push(`Visibility state: ${pageState.visibilityState}`);
            }

            if (pageState.hidden) {
                issues.push('Document is hidden');
            }

            if (pageState.bodyVisibility === 'hidden') {
                issues.push('Body visibility is hidden');
            }

            if (pageState.bodyDisplay === 'none') {
                issues.push('Body display is none');
            }

            if (pageState.bodyOpacity === '0') {
                issues.push('Body opacity is 0');
            }

            if (pageState.viewportWidth === 0 || pageState.viewportHeight === 0) {
                issues.push(`Invalid viewport: ${pageState.viewportWidth}x${pageState.viewportHeight}`);
            }

            if (pageState.connectionState === 'offline') {
                issues.push('Network is offline');
            }

            this.logger.info(`🔍 TabManager: Detected rendering issues:`, issues);

            if (issues.length > 0) {
                this.logger.warn(`⚠️ TabManager: Page rendering issues found: ${issues.join(', ')}`);
                return { hasIssues: true, issues: issues, pageState: pageState };
            } else {
                this.logger.info(`✅ TabManager: No obvious rendering issues detected`);
                return { hasIssues: false, issues: [], pageState: pageState };
            }
        } catch (error) {
            this.logger.error(`❌ TabManager: Error analyzing page rendering issues:`, error);
            return false;
        }
    }

    /**
     * Force reload BrowserView only when necessary
     */
    async forceReloadBrowserView(browserView) {
        try {
            if (!browserView || browserView.webContents.isDestroyed()) {
                this.logger.warn(`⚠️ TabManager: Cannot force reload - BrowserView is invalid`);
                return false;
            }

            this.logger.info(`🔄 TabManager: Force reloading BrowserView (only when necessary)`);

            // Check if page is already properly rendered
            const renderingCheck = await browserView.webContents.executeJavaScript(`
                return {
                    hasContent: document.body && document.body.children.length > 0,
                    hasVisibleContent: document.body && document.body.offsetHeight > 0,
                    isVisible: document.visibilityState === 'visible',
                    bodyHeight: document.body ? document.body.offsetHeight : 0
                };
            `);

            this.logger.info(`🔍 TabManager: Page rendering check before reload:`, renderingCheck);

            // Only reload if page has rendering issues
            if (!renderingCheck.hasContent || !renderingCheck.hasVisibleContent || !renderingCheck.isVisible) {
                this.logger.warn(`⚠️ TabManager: Page has rendering issues, forcing reload...`);

                // Force reload the page
                browserView.webContents.reload();
                this.logger.info(`🔄 TabManager: Force reloaded BrowserView`);

                // Execute JavaScript to ensure proper rendering after reload
                setTimeout(() => {
                    browserView.webContents.executeJavaScript(`
                        // Force page visibility and repaint after reload
                        if (document.body) {
                            document.body.style.visibility = 'visible';
                            document.body.style.display = 'block';
                        }
                        
                        // Trigger a repaint
                        window.dispatchEvent(new Event('resize'));
                        
                        // Force focus to ensure proper rendering
                        if (document.activeElement) {
                            document.activeElement.blur();
                            document.activeElement.focus();
                        }
                        
                        console.log('🔍 BrowserView: Force reload completed');
                    `).catch(err => {
                        this.logger.warn(`⚠️ TabManager: Error executing post-reload script: ${err.message}`);
                    });
                }, 1000); // Wait 1 second for page to load

                this.logger.info(`✅ TabManager: Force reload completed for BrowserView`);
                return true;
            } else {
                this.logger.info(`✅ TabManager: Page is already properly rendered, skipping reload`);
                return true;
            }
        } catch (error) {
            this.logger.error(`❌ TabManager: Error force reloading BrowserView:`, error);
            return false;
        }
    }

    /**
     * Enhanced page rendering detection and repair
     */
    async detectAndRepairPageRendering(browserView) {
        try {
            if (!browserView || browserView.webContents.isDestroyed()) {
                this.logger.warn(`⚠️ TabManager: Cannot detect rendering - BrowserView is invalid`);
                return false;
            }

            this.logger.info(`🔍 TabManager: Detecting page rendering issues...`);

            // Check if page is properly rendered
            const renderingCheck = await browserView.webContents.executeJavaScript(`
                // Check if page has proper content
                const hasContent = document.body && document.body.children.length > 0;
                const hasVisibleContent = document.body && document.body.offsetHeight > 0;
                const isVisible = document.visibilityState === 'visible';
                const hasTitle = document.title && document.title.length > 0;
                
                return {
                    hasContent: hasContent,
                    hasVisibleContent: hasVisibleContent,
                    isVisible: isVisible,
                    hasTitle: hasTitle,
                    bodyHeight: document.body ? document.body.offsetHeight : 0,
                    bodyChildren: document.body ? document.body.children.length : 0,
                    visibilityState: document.visibilityState,
                    title: document.title
                };
            `);

            this.logger.info(`🔍 TabManager: Page rendering check:`, renderingCheck);

            // If page has rendering issues, attempt repair
            if (!renderingCheck.hasContent || !renderingCheck.hasVisibleContent || !renderingCheck.isVisible) {
                this.logger.warn(`⚠️ TabManager: Page rendering issues detected, attempting repair...`);

                // Force page visibility and content
                await browserView.webContents.executeJavaScript(`
                    // Force page to be visible
                    document.body.style.visibility = 'visible';
                    document.body.style.display = 'block';
                    document.body.style.opacity = '1';
                    
                    // Force viewport to be visible
                    document.documentElement.style.visibility = 'visible';
                    document.documentElement.style.display = 'block';
                    
                    // Trigger multiple events to force rendering
                    window.dispatchEvent(new Event('resize'));
                    window.dispatchEvent(new Event('load'));
                    window.dispatchEvent(new Event('DOMContentLoaded'));
                    
                    // Force focus and blur to trigger repaint
                    if (document.activeElement) {
                        document.activeElement.blur();
                        document.activeElement.focus();
                    }
                    
                    // Force scroll to trigger rendering
                    window.scrollTo(0, 0);
                    window.scrollTo(0, 1);
                    window.scrollTo(0, 0);
                    
                    console.log('🔍 BrowserView: Page rendering repair completed');
                `);

                // Wait a bit and check again
                setTimeout(async () => {
                    const repairCheck = await browserView.webContents.executeJavaScript(`
                        return {
                            hasContent: document.body && document.body.children.length > 0,
                            hasVisibleContent: document.body && document.body.offsetHeight > 0,
                            isVisible: document.visibilityState === 'visible',
                            bodyHeight: document.body ? document.body.offsetHeight : 0
                        };
                    `);

                    this.logger.info(`🔍 TabManager: Page rendering repair check:`, repairCheck);
                }, 500);

                this.logger.info(`✅ TabManager: Page rendering repair attempted`);
            } else {
                this.logger.info(`✅ TabManager: Page rendering is normal`);
            }

            return true;
        } catch (error) {
            this.logger.error(`❌ TabManager: Error detecting page rendering:`, error);
            return false;
        }
    }

    /**
     * Force refresh current tab
     */
    forceRefreshCurrentTab() {
        if (!this.currentTabId) {
            this.logger.warn(`⚠️ TabManager: No current tab to refresh`);
            return false;
        }

        const currentTab = this.getCurrentTab();
        if (!currentTab || !currentTab.browserView) {
            this.logger.warn(`⚠️ TabManager: Current tab ${this.currentTabId} not found or has no BrowserView`);
            return false;
        }

        try {
            this.logger.info(`🔄 TabManager: Force refreshing current tab ${this.currentTabId}`);

            // Force refresh and focus for current tab
            const result = this.forceRefreshAndFocus(currentTab.browserView, true);

            if (result) {
                this.logger.info(`✅ TabManager: Force refreshed current tab ${this.currentTabId}`);
                return true;
            } else {
                this.logger.error(`❌ TabManager: Failed to force refresh current tab ${this.currentTabId}`);
                return false;
            }
        } catch (error) {
            this.logger.error(`❌ TabManager: Error force refreshing current tab ${this.currentTabId}:`, error);
            return false;
        }
    }

    /**
     * Handle page content extraction errors
     */
    async handleContentExtractionError(browserView, error) {
        try {
            this.logger.warn(`⚠️ TabManager: Handling content extraction error: ${error.message}`);

            // Force page visibility and content
            await browserView.webContents.executeJavaScript(`
                // Force page to be visible and have content
                if (document.body) {
                    document.body.style.visibility = 'visible';
                    document.body.style.display = 'block';
                    document.body.style.opacity = '1';
                }
                
                // Force viewport to be visible
                document.documentElement.style.visibility = 'visible';
                document.documentElement.style.display = 'block';
                
                // Trigger events to force rendering
                window.dispatchEvent(new Event('resize'));
                window.dispatchEvent(new Event('load'));
                
                // Force scroll to trigger rendering
                window.scrollTo(0, 0);
                window.scrollTo(0, 1);
                window.scrollTo(0, 0);
                
                console.log('🔍 BrowserView: Content extraction error handled');
            `);

            // Wait and try to extract content again
            setTimeout(async () => {
                try {
                    const content = await browserView.webContents.executeJavaScript(`
                        return {
                            title: document.title,
                            bodyText: document.body ? document.body.innerText : '',
                            bodyHTML: document.body ? document.body.innerHTML : '',
                            hasContent: document.body && document.body.children.length > 0,
                            bodyHeight: document.body ? document.body.offsetHeight : 0
                        };
                    `);

                    this.logger.info(`🔍 TabManager: Content extraction retry result:`, content);
                } catch (retryError) {
                    this.logger.error(`❌ TabManager: Content extraction retry failed:`, retryError);
                }
            }, 1000);

            this.logger.info(`✅ TabManager: Content extraction error handled`);
            return true;
        } catch (error) {
            this.logger.error(`❌ TabManager: Error handling content extraction error:`, error);
            return false;
        }
    }

    /**
     * Check and fix window state issues
     */
    async checkAndFixWindowState() {
        try {
            const electronMainWindow = this.getElectronMainWindow();
            if (!electronMainWindow) {
                this.logger.warn(`⚠️ TabManager: Cannot check window state - main window not available`);
                return false;
            }

            this.logger.info(`🔍 TabManager: Checking window state...`);

            // Check window dimensions
            const [width, height] = electronMainWindow.getContentSize();
            const isVisible = electronMainWindow.isVisible();
            const isMinimized = electronMainWindow.isMinimized();
            const isMaximized = electronMainWindow.isMaximized();

            this.logger.info(`🔍 TabManager: Window state - size: ${width}x${height}, visible: ${isVisible}, minimized: ${isMinimized}, maximized: ${isMaximized}`);

            // Check for invalid dimensions (like 0x-86 from minimization)
            if (width <= 0 || height <= 0) {
                this.logger.warn(`⚠️ TabManager: Invalid window dimensions detected: ${width}x${height}`);
                this.logger.warn(`⚠️ TabManager: This is likely caused by window minimization`);
                this.logger.warn(`⚠️ TabManager: Negative dimensions prevent BrowserView from rendering`);

                // Force window to have valid dimensions
                try {
                    // First, ensure window is not minimized
                    if (isMinimized) {
                        electronMainWindow.restore();
                        this.logger.info(`🔧 TabManager: Restored window from minimized state`);
                        await new Promise(resolve => setTimeout(resolve, 100));
                    }

                    // Then set valid size
                    electronMainWindow.setSize(1000, 800);
                    electronMainWindow.center();
                    this.logger.info(`🔧 TabManager: Forced window size to 1000x800 and centered`);

                    // Wait for window to resize
                    await new Promise(resolve => setTimeout(resolve, 200));

                    const [newWidth, newHeight] = electronMainWindow.getContentSize();
                    this.logger.info(`🔧 TabManager: Window resized to: ${newWidth}x${newHeight}`);
                } catch (error) {
                    this.logger.error(`❌ TabManager: Error resizing window:`, error);
                }
            }

            // Check if window is minimized or not visible
            if (isMinimized || !isVisible) {
                this.logger.warn(`⚠️ TabManager: Window is minimized or not visible`);
                try {
                    electronMainWindow.show();
                    electronMainWindow.focus();
                    this.logger.info(`🔧 TabManager: Forced window to show and focus`);
                } catch (error) {
                    this.logger.error(`❌ TabManager: Error showing window:`, error);
                }
            }

            // Check for cache errors (like "Unable to create cache")
            this.logger.info(`🔍 TabManager: Checking for cache and memory issues...`);

            // Force garbage collection if available
            if (global.gc) {
                try {
                    global.gc();
                    this.logger.info(`🧹 TabManager: Forced garbage collection`);
                } catch (error) {
                    this.logger.warn(`⚠️ TabManager: Error during garbage collection:`, error);
                }
            }

            this.logger.info(`✅ TabManager: Window state check completed`);
            return true;
        } catch (error) {
            this.logger.error(`❌ TabManager: Error checking window state:`, error);
            return false;
        }
    }

    /**
     * Clear cache and fix memory issues
     */
    async clearCacheAndFixMemory() {
        try {
            this.logger.info(`🧹 TabManager: Clearing cache and fixing memory issues...`);

            // Clear browser cache
            const { session } = require('electron');
            const defaultSession = session.defaultSession;

            try {
                await defaultSession.clearCache();
                this.logger.info(`🧹 TabManager: Browser cache cleared`);
            } catch (error) {
                this.logger.warn(`⚠️ TabManager: Error clearing browser cache:`, error);
            }

            // Clear storage data
            try {
                await defaultSession.clearStorageData({
                    storages: ['cookies', 'filesystem', 'indexdb', 'localstorage', 'shadercache', 'websql']
                });
                this.logger.info(`🧹 TabManager: Storage data cleared`);
            } catch (error) {
                this.logger.warn(`⚠️ TabManager: Error clearing storage data:`, error);
            }

            // Force garbage collection
            if (global.gc) {
                try {
                    global.gc();
                    this.logger.info(`🧹 TabManager: Forced garbage collection`);
                } catch (error) {
                    this.logger.warn(`⚠️ TabManager: Error during garbage collection:`, error);
                }
            }

            // Clear memory if possible
            if (process.memoryUsage) {
                const memBefore = process.memoryUsage();
                this.logger.info(`🧹 TabManager: Memory before cleanup:`, memBefore);

                // Force memory cleanup
                if (global.gc) {
                    global.gc();
                }

                const memAfter = process.memoryUsage();
                this.logger.info(`🧹 TabManager: Memory after cleanup:`, memAfter);
            }

            this.logger.info(`✅ TabManager: Cache and memory cleanup completed`);
            return true;
        } catch (error) {
            this.logger.error(`❌ TabManager: Error clearing cache and memory:`, error);
            return false;
        }
    }

    /**
     * Detect and fix invalid window dimensions (like 0x-86)
     */
    async detectAndFixInvalidWindowDimensions() {
        try {
            const electronMainWindow = this.getElectronMainWindow();
            if (!electronMainWindow) {
                this.logger.warn(`⚠️ TabManager: Cannot detect invalid dimensions - main window not available`);
                return false;
            }

            this.logger.info(`🔍 TabManager: Detecting invalid window dimensions...`);

            // Check window dimensions
            const [width, height] = electronMainWindow.getContentSize();
            const isVisible = electronMainWindow.isVisible();
            const isMinimized = electronMainWindow.isMinimized();

            this.logger.info(`🔍 TabManager: Window dimensions - size: ${width}x${height}, visible: ${isVisible}, minimized: ${isMinimized}`);

            // Check for invalid dimensions (like 0x-86, negative values, etc.)
            if (width <= 0 || height <= 0 || width < 100 || height < 100) {
                this.logger.warn(`⚠️ TabManager: Invalid window dimensions detected: ${width}x${height}`);
                this.logger.warn(`⚠️ TabManager: This prevents BrowserView from rendering properly`);

                // Force window to have valid dimensions
                try {
                    // First, ensure window is not minimized
                    if (isMinimized) {
                        electronMainWindow.restore();
                        this.logger.info(`🔧 TabManager: Restored window from minimized state`);
                        await new Promise(resolve => setTimeout(resolve, 100));
                    }

                    // Then show window if not visible
                    if (!isVisible) {
                        electronMainWindow.show();
                        this.logger.info(`🔧 TabManager: Showed window`);
                        await new Promise(resolve => setTimeout(resolve, 100));
                    }

                    // Set valid size with proper dimensions
                    electronMainWindow.setSize(1200, 900);
                    electronMainWindow.center();
                    this.logger.info(`🔧 TabManager: Set valid window size to 1200x900 and centered`);

                    // Wait for window to resize
                    await new Promise(resolve => setTimeout(resolve, 300));

                    // Verify the fix
                    const [newWidth, newHeight] = electronMainWindow.getContentSize();
                    const newIsVisible = electronMainWindow.isVisible();
                    const newIsMinimized = electronMainWindow.isMinimized();

                    this.logger.info(`🔧 TabManager: After fix - size: ${newWidth}x${newHeight}, visible: ${newIsVisible}, minimized: ${newIsMinimized}`);

                    if (newWidth > 0 && newHeight > 0 && newIsVisible && !newIsMinimized) {
                        this.logger.info(`✅ TabManager: Invalid window dimensions fixed successfully`);
                        return true;
                    } else {
                        this.logger.warn(`⚠️ TabManager: Invalid window dimensions not fully resolved`);
                        return false;
                    }
                } catch (error) {
                    this.logger.error(`❌ TabManager: Error fixing invalid window dimensions:`, error);
                    return false;
                }
            } else {
                this.logger.info(`✅ TabManager: Window dimensions are valid: ${width}x${height}`);
                return true;
            }
        } catch (error) {
            this.logger.error(`❌ TabManager: Error detecting invalid window dimensions:`, error);
            return false;
        }
    }

    /**
     * Detect and fix minimization issues
     */
    async detectAndFixMinimizationIssues() {
        try {
            const electronMainWindow = this.getElectronMainWindow();
            if (!electronMainWindow) {
                this.logger.warn(`⚠️ TabManager: Cannot detect minimization issues - main window not available`);
                return false;
            }

            this.logger.info(`🔍 TabManager: Detecting minimization issues...`);

            // Check window state
            const [width, height] = electronMainWindow.getContentSize();
            const isVisible = electronMainWindow.isVisible();
            const isMinimized = electronMainWindow.isMinimized();
            const isMaximized = electronMainWindow.isMaximized();

            this.logger.info(`🔍 TabManager: Window state - size: ${width}x${height}, visible: ${isVisible}, minimized: ${isMinimized}, maximized: ${isMaximized}`);

            // Check for minimization-related issues
            if (isMinimized || !isVisible || width <= 0 || height <= 0) {
                this.logger.warn(`⚠️ TabManager: Minimization issues detected`);
                this.logger.warn(`⚠️ TabManager: Window state - minimized: ${isMinimized}, visible: ${isVisible}, size: ${width}x${height}`);

                // Fix minimization issues
                try {
                    // First, restore window if minimized
                    if (isMinimized) {
                        electronMainWindow.restore();
                        this.logger.info(`🔧 TabManager: Restored window from minimized state`);
                        await new Promise(resolve => setTimeout(resolve, 100));
                    }

                    // Then show window if not visible
                    if (!isVisible) {
                        electronMainWindow.show();
                        this.logger.info(`🔧 TabManager: Showed window`);
                        await new Promise(resolve => setTimeout(resolve, 100));
                    }

                    // Finally, set valid size if dimensions are invalid
                    if (width <= 0 || height <= 0) {
                        electronMainWindow.setSize(1000, 800);
                        electronMainWindow.center();
                        this.logger.info(`🔧 TabManager: Set valid window size and centered`);
                        await new Promise(resolve => setTimeout(resolve, 200));
                    }

                    // Verify fix
                    const [newWidth, newHeight] = electronMainWindow.getContentSize();
                    const newIsVisible = electronMainWindow.isVisible();
                    const newIsMinimized = electronMainWindow.isMinimized();

                    this.logger.info(`🔧 TabManager: After fix - size: ${newWidth}x${newHeight}, visible: ${newIsVisible}, minimized: ${newIsMinimized}`);

                    if (newWidth > 0 && newHeight > 0 && newIsVisible && !newIsMinimized) {
                        this.logger.info(`✅ TabManager: Minimization issues fixed successfully`);
                        return true;
                    } else {
                        this.logger.warn(`⚠️ TabManager: Minimization issues not fully resolved`);
                        return false;
                    }
                } catch (error) {
                    this.logger.error(`❌ TabManager: Error fixing minimization issues:`, error);
                    return false;
                }
            } else {
                this.logger.info(`✅ TabManager: No minimization issues detected`);
                return true;
            }
        } catch (error) {
            this.logger.error(`❌ TabManager: Error detecting minimization issues:`, error);
            return false;
        }
    }

    /**
     * Verify and force page rendering
     */
    async verifyAndForcePageRendering(browserView) {
        try {
            if (!browserView || browserView.webContents.isDestroyed()) {
                this.logger.warn(`⚠️ TabManager: Cannot verify rendering - BrowserView is invalid`);
                return false;
            }

            this.logger.info(`🔍 TabManager: Verifying page rendering...`);

            // Check if page is properly rendered
            const renderingCheck = await browserView.webContents.executeJavaScript(`
                // Check if page has proper content and is visible
                const hasContent = document.body && document.body.children.length > 0;
                const hasVisibleContent = document.body && document.body.offsetHeight > 0;
                const isVisible = document.visibilityState === 'visible';
                const hasTitle = document.title && document.title.length > 0;
                const bodyHeight = document.body ? document.body.offsetHeight : 0;
                const bodyWidth = document.body ? document.body.offsetWidth : 0;
                
                return {
                    hasContent: hasContent,
                    hasVisibleContent: hasVisibleContent,
                    isVisible: isVisible,
                    hasTitle: hasTitle,
                    bodyHeight: bodyHeight,
                    bodyWidth: bodyWidth,
                    visibilityState: document.visibilityState,
                    title: document.title
                };
            `);

            this.logger.info(`🔍 TabManager: Page rendering check:`, renderingCheck);

            // If page has rendering issues, force rendering
            if (!renderingCheck.hasContent || !renderingCheck.hasVisibleContent || !renderingCheck.isVisible) {
                this.logger.warn(`⚠️ TabManager: Page rendering issues detected, forcing rendering...`);

                // Force page to be visible and have content
                await browserView.webContents.executeJavaScript(`
                    // Force page to be visible
                    document.body.style.visibility = 'visible';
                    document.body.style.display = 'block';
                    document.body.style.opacity = '1';
                    document.body.style.height = '100%';
                    document.body.style.width = '100%';
                    
                    // Force viewport to be visible
                    document.documentElement.style.visibility = 'visible';
                    document.documentElement.style.display = 'block';
                    document.documentElement.style.height = '100%';
                    document.documentElement.style.width = '100%';
                    
                    // Force all elements to be visible
                    const allElements = document.querySelectorAll('*');
                    allElements.forEach(el => {
                        if (el.style) {
                            el.style.visibility = 'visible';
                            el.style.display = el.style.display === 'none' ? 'block' : el.style.display;
                        }
                    });
                    
                    // Trigger multiple events to force rendering
                    window.dispatchEvent(new Event('resize'));
                    window.dispatchEvent(new Event('load'));
                    window.dispatchEvent(new Event('DOMContentLoaded'));
                    window.dispatchEvent(new Event('pageshow'));
                    
                    // Force focus and blur to trigger repaint
                    if (document.activeElement) {
                        document.activeElement.blur();
                        document.activeElement.focus();
                    }
                    
                    // Force scroll to trigger rendering
                    window.scrollTo(0, 0);
                    window.scrollTo(0, 1);
                    window.scrollTo(0, 0);
                    
                    console.log('🔍 BrowserView: Page rendering forced');
                `);

                // Wait and check again
                setTimeout(async () => {
                    const repairCheck = await browserView.webContents.executeJavaScript(`
                        return {
                            hasContent: document.body && document.body.children.length > 0,
                            hasVisibleContent: document.body && document.body.offsetHeight > 0,
                            isVisible: document.visibilityState === 'visible',
                            bodyHeight: document.body ? document.body.offsetHeight : 0,
                            bodyWidth: document.body ? document.body.offsetWidth : 0
                        };
                    `);

                    this.logger.info(`🔍 TabManager: Page rendering repair check:`, repairCheck);
                }, 500);

                this.logger.info(`✅ TabManager: Page rendering forced`);
            } else {
                this.logger.info(`✅ TabManager: Page rendering is normal`);
            }

            return true;
        } catch (error) {
            this.logger.error(`❌ TabManager: Error verifying page rendering:`, error);
            return false;
        }
    }

    /**
     * Handle successful content extraction but failed rendering
     */
    async handleContentExtractionSuccessButRenderingFailed(browserView) {
        try {
            this.logger.info(`🔍 TabManager: Handling content extraction success but rendering failure...`);

            // Force page to be visible and properly rendered
            await browserView.webContents.executeJavaScript(`
                // Force page to be visible and have proper dimensions
                document.body.style.visibility = 'visible';
                document.body.style.display = 'block';
                document.body.style.opacity = '1';
                document.body.style.height = '100%';
                document.body.style.width = '100%';
                document.body.style.minHeight = '100vh';
                document.body.style.minWidth = '100vw';
                
                // Force viewport to be visible
                document.documentElement.style.visibility = 'visible';
                document.documentElement.style.display = 'block';
                document.documentElement.style.height = '100%';
                document.documentElement.style.width = '100%';
                document.documentElement.style.minHeight = '100vh';
                document.documentElement.style.minWidth = '100vw';
                
                // Force all elements to be visible and have proper dimensions
                const allElements = document.querySelectorAll('*');
                allElements.forEach(el => {
                    if (el.style) {
                        el.style.visibility = 'visible';
                        el.style.display = el.style.display === 'none' ? 'block' : el.style.display;
                        if (el.offsetHeight === 0 && el.offsetWidth === 0) {
                            el.style.minHeight = '1px';
                            el.style.minWidth = '1px';
                        }
                    }
                });
                
                // Trigger multiple events to force rendering
                window.dispatchEvent(new Event('resize'));
                window.dispatchEvent(new Event('load'));
                window.dispatchEvent(new Event('DOMContentLoaded'));
                window.dispatchEvent(new Event('pageshow'));
                window.dispatchEvent(new Event('focus'));
                
                // Force focus and blur to trigger repaint
                if (document.activeElement) {
                    document.activeElement.blur();
                    document.activeElement.focus();
                }
                
                // Force scroll to trigger rendering
                window.scrollTo(0, 0);
                window.scrollTo(0, 1);
                window.scrollTo(0, 0);
                
                console.log('🔍 BrowserView: Content extraction success but rendering failure handled');
            `);

            // Wait and verify rendering
            setTimeout(async () => {
                const renderingCheck = await browserView.webContents.executeJavaScript(`
                    return {
                        hasContent: document.body && document.body.children.length > 0,
                        hasVisibleContent: document.body && document.body.offsetHeight > 0,
                        isVisible: document.visibilityState === 'visible',
                        bodyHeight: document.body ? document.body.offsetHeight : 0,
                        bodyWidth: document.body ? document.body.offsetWidth : 0,
                        title: document.title
                    };
                `);

                this.logger.info(`🔍 TabManager: Content extraction success but rendering failure check:`, renderingCheck);
            }, 1000);

            this.logger.info(`✅ TabManager: Content extraction success but rendering failure handled`);
            return true;
        } catch (error) {
            this.logger.error(`❌ TabManager: Error handling content extraction success but rendering failure:`, error);
            return false;
        }
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
        this.logger.warn('⚠️ TabManager: checkOAuthProgress not implemented');
        return null;
    }

    /**
     * Trigger Google sign in (not implemented)
     */
    async triggerGoogleSignIn(view, id) {
        this.logger.warn('⚠️ TabManager: triggerGoogleSignIn not implemented');
        return null;
    }

    /**
     * Check login status (not implemented)
     */
    async checkLoginStatus(view, id) {
        this.logger.warn('⚠️ TabManager: checkLoginStatus not implemented');
        return null;
    }

    /**
     * Check OAuth status for popup (not implemented)
     */
    async checkOAuthStatusForPopup(view, id, isPopupMode = false) {
        this.logger.warn('⚠️ TabManager: checkOAuthStatusForPopup not implemented');
        return null;
    }

    /**
     * Force redirect to X (not implemented)
     */
    async forceRedirectToX(view, id) {
        this.logger.warn('⚠️ TabManager: forceRedirectToX not implemented');
        return null;
    }

    /**
     * Verify OAuth success and redirect (not implemented)
     */
    async verifyOAuthSuccessAndRedirect(view, id, url) {
        this.logger.warn('⚠️ TabManager: verifyOAuthSuccessAndRedirect not implemented');
        return null;
    }

    /**
     * Cleanup session (not implemented)
     */
    async cleanupSession(view, id) {
        this.logger.warn('⚠️ TabManager: cleanupSession not implemented');
        return null;
    }

    /**
     * Clear all sessions
     */
    async clearAllSessions() {
        try {
            this.logger.info('🧹 TabManager: ===== CLEARING ALL SESSIONS =====');

            // Helper function to add timeout to async operations
            const withTimeout = (promise, timeoutMs = 2000) => {
                return Promise.race([
                    promise,
                    new Promise((resolve) => setTimeout(() => {
                        this.logger.warn(`⚠️ TabManager: Operation timeout (${timeoutMs}ms), continuing...`);
                        resolve();
                    }, timeoutMs))
                ]);
            };

            // Close all tabs and clear their sessions
            const tabIds = Array.from(this.tabs.keys());
            this.logger.info(`🧹 TabManager: Closing ${tabIds.length} tabs during session clear...`);

            for (const tabId of tabIds) {
                const tabData = this.tabs.get(tabId);
                if (tabData && tabData.browserView && tabData.browserView.webContents && !tabData.browserView.webContents.isDestroyed()) {
                    try {
                        // Clear session data before closing tab
                        this.logger.info(`🧹 TabManager: Clearing session data for tab ${tabId}...`);
                        if (tabData.browserView.webContents && tabData.browserView.webContents.session) {
                            await withTimeout(
                                tabData.browserView.webContents.session.clearStorageData({
                                    storages: ['cookies', 'localStorage', 'sessionStorage', 'cache']
                                })
                            );
                            await withTimeout(
                                tabData.browserView.webContents.session.clearCache()
                            );
                            this.logger.info(`✅ TabManager: Session data cleared for tab ${tabId}`);
                        } else {
                            this.logger.info(`⚠️ TabManager: No session available for tab ${tabId}`);
                        }
                    } catch (sessionError) {
                        this.logger.error(`❌ TabManager: Error clearing session for tab ${tabId}:`, sessionError);
                    }
                }
            }

            // Clear persistent session partitions (same as original SessionManager)
            this.logger.info('🧹 TabManager: Clearing persistent session partitions...');
            await this.clearPersistentSessionPartitions();
            this.logger.info('✅ TabManager: Persistent session partitions cleared');

            // Close all tabs
            this.logger.info(`🧹 TabManager: Closing ${tabIds.length} tabs...`);
            for (const tabId of tabIds) {
                this.logger.info(`🧹 TabManager: Closing tab ${tabId}...`);
                await this.closeTab(tabId);
                this.logger.info(`✅ TabManager: Tab ${tabId} closed`);
            }
            this.logger.info('✅ TabManager: All tabs closed');

            this.logger.info('✅ TabManager: All sessions cleared successfully');
            return true;
        } catch (error) {
            this.logger.error('❌ TabManager: Error clearing all sessions:', error);
            return false;
        }
    }

    /**
     * Clear NSN sessions only
     */
    async clearNSNSessions() {
        try {
            this.logger.info('🧹 TabManager: ===== CLEARING NSN SESSIONS =====');

            let nsnTabsCleared = 0;
            const tabIds = Array.from(this.tabs.keys());

            // Clear session data only for NSN tabs
            for (const tabId of tabIds) {
                const tabData = this.tabs.get(tabId);
                if (tabData && tabData.browserView && tabData.browserView.webContents && !tabData.browserView.webContents.isDestroyed()) {
                    try {
                        const currentURL = tabData.browserView.webContents.getURL();
                        if (this.isNSNUrl(currentURL)) {
                            this.logger.info(`🧹 TabManager: Clearing NSN session for tab ${tabId} (${currentURL})`);

                            // Clear session data
                            if (tabData.browserView.webContents.session) {
                                await tabData.browserView.webContents.session.clearStorageData({
                                    storages: ['cookies', 'localStorage', 'sessionStorage', 'cache']
                                });
                                await tabData.browserView.webContents.session.clearCache();
                                this.logger.info(`✅ TabManager: NSN session cleared for tab ${tabId}`);
                            } else {
                                this.logger.info(`⚠️ TabManager: No session available for NSN tab ${tabId}`);
                            }

                            nsnTabsCleared++;
                        } else {
                            this.logger.info(`ℹ️ TabManager: Skipping non-NSN tab ${tabId} (${currentURL})`);
                        }
                    } catch (error) {
                        this.logger.error(`❌ TabManager: Error clearing NSN session for tab ${tabId}:`, error);
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
                            this.logger.info('🔓 TabManager: Navigating NSN tab to logout URL...');

                            // Add error handling for logout navigation
                            const webContents = tabData.browserView.webContents;

                            // Set up error handlers for logout navigation
                            const handleLogoutNavigationError = (event, errorCode, errorDescription, validatedURL) => {
                                if (errorCode === -3) { // ERR_ABORTED
                                    this.logger.info(`⚠️ TabManager: Logout navigation aborted for tab ${tabId} (this is often normal during logout)`);
                                } else {
                                    this.logger.error(`❌ TabManager: Logout navigation failed for tab ${tabId}: ${errorCode} (${errorDescription})`);
                                }
                            };

                            const handleLogoutNavigationSuccess = () => {
                                this.logger.info(`✅ TabManager: Logout navigation successful for tab ${tabId}`);
                            };

                            // Add temporary event listeners
                            webContents.once('did-fail-load', handleLogoutNavigationError);
                            webContents.once('did-finish-load', handleLogoutNavigationSuccess);

                            // Perform logout navigation with timeout
                            const logoutPromise = webContents.loadURL(`${apiConfig.getNsnUrl()}/logout`);
                            const timeoutPromise = new Promise((_, reject) => {
                                setTimeout(() => reject(new Error('Logout navigation timeout')), 5000); // 5 second timeout
                            });

                            try {
                                await Promise.race([logoutPromise, timeoutPromise]);
                            } catch (error) {
                                if (error.message === 'Logout navigation timeout') {
                                    this.logger.info(`⚠️ TabManager: Logout navigation timeout for tab ${tabId}, but this is often normal`);
                                } else {
                                    this.logger.error(`❌ TabManager: Logout navigation error for tab ${tabId}:`, error);
                                }
                            }

                            // Clean up event listeners
                            webContents.removeListener('did-fail-load', handleLogoutNavigationError);
                            webContents.removeListener('did-finish-load', handleLogoutNavigationSuccess);
                        }
                    } catch (error) {
                        this.logger.error(`❌ TabManager: Error navigating to logout for tab ${tabId}:`, error);
                    }
                }
            }

            this.logger.info(`✅ TabManager: NSN sessions cleared (${nsnTabsCleared} tabs, 1 partition)`);
            return true;
        } catch (error) {
            this.logger.error('❌ TabManager: Error clearing NSN sessions:', error);
            return false;
        }
    }

    /**
     * Clear persistent session partitions (same as original SessionManager)
     */
    async clearPersistentSessionPartitions() {
        try {
            this.logger.info('🧹 TabManager: Clearing persistent session partitions...');

            const { session } = require('electron');

            // Helper function to add timeout to async operations
            const withTimeout = (promise, timeoutMs = 2000) => {
                return Promise.race([
                    promise,
                    new Promise((resolve) => setTimeout(() => {
                        this.logger.warn(`⚠️ TabManager: Partition clear timeout (${timeoutMs}ms), continuing...`);
                        resolve();
                    }, timeoutMs))
                ]);
            };

            // List of persistent session partitions to clear (same as original SessionManager)
            const partitionsToClear = ['persist:main', 'persist:nsn', 'persist:registered'];

            for (const partitionName of partitionsToClear) {
                try {
                    this.logger.info(`🧹 TabManager: Clearing session partition: ${partitionName}`);

                    // Get the session from partition
                    const partitionSession = session.fromPartition(partitionName);

                    // Clear all storage data (same as original SessionManager)
                    await withTimeout(
                        partitionSession.clearStorageData({
                            storages: [
                                'cookies',
                                'localStorage',
                                'sessionStorage',
                                'indexeddb',
                                'websql',
                                'cache',
                                'serviceworkers'
                            ]
                        })
                    );

                    // Clear cache
                    await withTimeout(
                        partitionSession.clearCache()
                    );

                    this.logger.info(`✅ TabManager: Session partition cleared: ${partitionName}`);
                } catch (partitionError) {
                    this.logger.error(`❌ TabManager: Error clearing session partition ${partitionName}:`, partitionError);
                }
            }

            this.logger.info('✅ TabManager: All persistent session partitions cleared');
        } catch (error) {
            this.logger.error('❌ TabManager: Error clearing persistent session partitions:', error);
        }
    }

    /**
     * Clear only NSN persistent session partition
     */
    async clearNSNPersistentSessionPartition() {
        try {
            this.logger.info('🧹 TabManager: Clearing NSN persistent session partition...');

            const { session } = require('electron');

            // Only clear NSN partition
            const partitionName = 'persist:nsn';

            try {
                this.logger.info(`🧹 TabManager: Clearing NSN session partition: ${partitionName}`);

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

                this.logger.info(`✅ TabManager: NSN session partition cleared: ${partitionName}`);

            } catch (error) {
                this.logger.error(`❌ TabManager: Error clearing NSN session partition ${partitionName}:`, error);
            }

        } catch (error) {
            this.logger.error('❌ TabManager: Error clearing NSN persistent session partition:', error);
        }
    }

    /**
     * Auto cleanup loading titles (not implemented)
     */
    autoCleanupLoadingTitles() {
        this.logger.warn('⚠️ TabManager: autoCleanupLoadingTitles not implemented');
        return null;
    }

    /**
     * Find NSN tab
     */
    findNSNTab() {
        try {
            this.logger.info('🔍 TabManager: Looking for NSN tab...');

            for (const [tabId, tabData] of this.tabs.entries()) {
                if (tabData && tabData.browserView && tabData.browserView.webContents && !tabData.browserView.webContents.isDestroyed()) {
                    const currentURL = tabData.browserView.webContents.getURL();
                    if (this.isNSNUrl(currentURL)) {
                        this.logger.info(`✅ TabManager: Found NSN tab ${tabId} with URL: ${currentURL}`);
                        return tabData;
                    }
                }
            }

            this.logger.info('⚠️ TabManager: No NSN tab found');
            return null;
        } catch (error) {
            this.logger.error('❌ TabManager: Error finding NSN tab:', error);
            return null;
        }
    }

    /**
     * Find all tabs for a specific website based on website config
     */
    findAllTabsForWebsite(websiteConfig) {
        try {
            this.logger.info('🔍 TabManager: Looking for all tabs for website:', websiteConfig?.name || 'Unknown');
            const websiteTabs = [];

            if (!websiteConfig || !websiteConfig.root_url) {
                this.logger.info('⚠️ TabManager: No website config or root_url provided');
                return websiteTabs;
            }

            const rootUrl = websiteConfig.root_url;
            this.logger.info('🔍 TabManager: Looking for tabs with root URL:', rootUrl);

            for (const [tabId, tabData] of this.tabs.entries()) {
                if (tabData && tabData.browserView && tabData.browserView.webContents && !tabData.browserView.webContents.isDestroyed()) {
                    const currentURL = tabData.browserView.webContents.getURL();
                    if (this.isUrlForWebsite(currentURL, rootUrl)) {
                        this.logger.info(`✅ TabManager: Found ${websiteConfig.name} tab ${tabId} with URL: ${currentURL}`);
                        websiteTabs.push({ id: tabId, ...tabData });
                    }
                }
            }

            this.logger.info(`🔍 TabManager: Found ${websiteTabs.length} ${websiteConfig.name} tabs`);
            return websiteTabs;
        } catch (error) {
            this.logger.error('❌ TabManager: Error finding tabs for website:', error);
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
            this.logger.error('❌ TabManager: Error checking URL for website:', error);
            return false;
        }
    }

    /**
     * Register website configuration
     */
    registerWebsite(websiteConfig) {
        try {
            this.logger.info('🌐 TabManager: Registering website configuration:', websiteConfig);

            if (!this.registeredWebsites) {
                this.registeredWebsites = [];
            }

            // Add website configuration to registered websites
            this.registeredWebsites.push(websiteConfig);
            this.logger.info('✅ TabManager: Website configuration registered successfully');

            return true;
        } catch (error) {
            this.logger.error('❌ TabManager: Error registering website configuration:', error);
            return false;
        }
    }

    /**
     * Check if URL is NSN URL
     */
    isNSNUrl(url) {
        if (!url) return false;
        return url.includes(apiConfig.getNsnHost()) || url.includes(`127.0.0.1:${apiConfig.getNsnPort()}`);
    }

    /**
     * Is registered website URL (not implemented)
     */
    isRegisteredWebsiteUrl(url) {
        this.logger.warn('⚠️ TabManager: isRegisteredWebsiteUrl not implemented');
        return false;
    }

    /**
     * Get website config (not implemented)
     */
    getWebsiteConfig(url) {
        this.logger.warn('⚠️ TabManager: getWebsiteConfig not implemented');
        return null;
    }

    /**
     * Get session partition for website (not implemented)
     */
    getSessionPartitionForWebsite(url) {
        this.logger.warn('⚠️ TabManager: getSessionPartitionForWebsite not implemented');
        return 'persist:main';
    }



    /**
     * Get current user info (not implemented)
     */
    async getCurrentUserInfo() {
        this.logger.warn('⚠️ TabManager: getCurrentUserInfo not implemented');
        return null;
    }

    /**
     * Get user cookie (not implemented)
     */
    async getUserCookie(userId) {
        this.logger.warn('⚠️ TabManager: getUserCookie not implemented');
        return null;
    }

    /**
     * Set cookie in view (not implemented)
     */
    async setCookieInView(view, cookie, nsnUrl = null) {
        this.logger.warn('⚠️ TabManager: setCookieInView not implemented');
        return null;
    }

    /**
     * Get tab info (not implemented)
     */
    getTabInfo(id) {
        try {
            this.logger.info(`🔍 TabManager: getTabInfo called for tab ${id}`);
            const tabData = this.tabs.get(id);
            if (!tabData) {
                this.logger.warn(`⚠️ TabManager: Tab ${id} not found`);
                return null;
            }

            const browserView = tabData.browserView;
            if (!browserView || !browserView.webContents) {
                this.logger.warn(`⚠️ TabManager: BrowserView not available for tab ${id}`);
                return {
                    id: id,
                    url: tabData.url || '',
                    title: tabData.title || 'Loading...'
                };
            }

            // Get current URL from webContents
            const currentUrl = browserView.webContents.getURL();
            const title = browserView.webContents.getTitle();

            // Clean URL for address bar display (remove NMP parameters)
            let displayUrl = currentUrl || tabData.url || '';

            // Special handling for about:blank - show empty string
            if (displayUrl === 'about:blank' || displayUrl === '') {
                displayUrl = '';
            } else {
                try {
                    const urlObj = new URL(displayUrl);
                    // Remove NMP parameters for cleaner address bar display
                    urlObj.searchParams.delete('nmp_user_id');
                    urlObj.searchParams.delete('nmp_username');
                    urlObj.searchParams.delete('nmp_client_type');
                    urlObj.searchParams.delete('nmp_timestamp');
                    urlObj.searchParams.delete('nmp_injected');
                    urlObj.searchParams.delete('nmp_client_id');
                    urlObj.searchParams.delete('nmp_node_id');
                    urlObj.searchParams.delete('nmp_domain_id');
                    urlObj.searchParams.delete('nmp_cluster_id');
                    urlObj.searchParams.delete('nmp_channel_id');

                    // If no other parameters remain, show clean URL without '?'
                    displayUrl = urlObj.searchParams.toString() ? urlObj.toString() : `${urlObj.origin}${urlObj.pathname}`;

                    // Final check: if result is 'nullblank' or similar, use empty string
                    if (displayUrl === 'nullblank' || displayUrl === 'null' || displayUrl.startsWith('null')) {
                        displayUrl = '';
                    }
                } catch (error) {
                    // If URL parsing fails, use empty string for special URLs
                    this.logger.warn(`⚠️ TabManager: Failed to clean URL for tab ${id}:`, error);
                    if (displayUrl.includes('about:') || displayUrl.includes('null')) {
                        displayUrl = '';
                    }
                }
            }

            return {
                id: id,
                url: displayUrl, // Show clean URL without NMP parameters in address bar
                title: title || tabData.title || 'Loading...',
                isActive: this.currentTabId === id
            };
        } catch (error) {
            this.logger.error(`❌ TabManager: Error getting tab info for ${id}:`, error);
            return null;
        }
    }


    /**
     * Create view with cookie (not implemented)
     */
    createViewWithCookie(url, cookie, username, nsnUrl = null) {
        this.logger.warn('⚠️ TabManager: createViewWithCookie not implemented');
        return null;
    }

    /**
     * Setup website response detection (not implemented)
     */
    setupWebsiteResponseDetection(view, id) {
        this.logger.warn('⚠️ TabManager: setupWebsiteResponseDetection not implemented');
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
            this.logger.info(`🔍 TabManager: ===== EXECUTING JAVASCRIPT DETECTION (${trigger}) =====`);
            this.logger.info(`🔍 TabManager: Tab ID: ${id}`);
            this.logger.info(`🔍 TabManager: Current URL: ${browserView.webContents.getURL()}`);
            this.logger.info(`🔍 TabManager: Executing JavaScript to check for NSN response...`);

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
                this.logger.info(`🔍 TabManager: NSN response detected (${trigger}): ${responseData.action}`);
                // Process the NSN response
                await this.processNSNResponse(responseData, id, trigger);
            } else {
                this.logger.info(`🔍 TabManager: No NSN response data (${trigger})`);
            }

        } catch (error) {
            this.logger.error(`❌ TabManager: ===== ERROR IN DETECTION (${trigger}) =====`);
            this.logger.error(`❌ TabManager: Error detecting NSN response for tab ${id}: ${error.message}`);
            this.logger.error(`❌ TabManager: Error stack: ${error.stack}`);
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
        this.logger.warn('⚠️ TabManager: cleanup not implemented');
        return null;
    }
}

module.exports = TabManager;
