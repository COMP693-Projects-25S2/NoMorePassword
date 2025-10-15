const { app, globalShortcut, Menu } = require('electron');
const WindowManager = require('./window/windowManager');
const ViewManager = require('./window/viewManager');
const HistoryManager = require('./history/historyManager');
const IpcHandlers = require('./ipc/ipcHandlers');
const { StartupValidator } = require('./userManager');
const ClientManager = require('./clientManager');
const ClientSwitchManager = require('../shared/clientSwitchManager');
const PortManager = require('../utils/portManager');
const CClientApiServer = require('./api/cClientApiServer');
const CClientWebSocketClient = require('./websocket/cClientWebSocketClient');
const BClientConfigModal = require('./config/bClientConfigModal');

// Import logging system
const { getCClientLogger, setupConsoleRedirect } = require('./utils/logger');

// Set up console redirection immediately (takes effect on module import)
const appLogger = getCClientLogger('app');
const consoleRedirect = setupConsoleRedirect('app');

// Override global console methods
Object.assign(console, consoleRedirect);

appLogger.info("C-Client application module imported");

class ElectronApp {
    constructor() {
        // Initialize logging system
        this.logger = getCClientLogger('app');

        // Get C-Client ID from environment variable or generate one
        this.clientId = process.env.C_CLIENT_ID || `c-client-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        this.portManager = new PortManager();
        this.clientPort = null; // Will be set during initialization
        this.config = this.loadConfig(); // Load network configuration

        this.clientManager = new ClientManager();
        this.historyManager = new HistoryManager(this.clientId);
        this.windowManager = new WindowManager(this.historyManager, this.clientManager);
        this.startupValidator = new StartupValidator(this.clientId);
        this.viewManager = null;
        this.ipcHandlers = null;
        this.mainWindow = null; // Initialize mainWindow property
        this.isInitialized = false;
        this.pendingTitleUpdates = new Map();
        this.clientSwitchManager = new ClientSwitchManager(); // Unified client switch manager

        // C-Client API server
        this.apiServer = null;
        this.reloadCheckInterval = null;


        // C-Client WebSocket client (to connect to B-Client)
        this.webSocketClient = null;
        this.currentWebSocketUrl = null; // Track current WebSocket URL for connection sharing
        this.websiteWebSocketConnections = new Map(); // Track WebSocket connections per website domain

        // SyncManager for user activity synchronization
        this.syncManager = null;

        // B-Client configuration modal
        this.bClientConfigModal = null;

        // NSN response handler
        this.nsnResponseHandler = null;

        console.log(`🚀 Starting C-Client: ${this.clientId} (port will be assigned during initialization)`);
    }

    // Load network configuration
    loadConfig() {
        try {
            const fs = require('fs');
            const path = require('path');
            const configPath = path.join(__dirname, 'config.json');
            const configData = fs.readFileSync(configPath, 'utf8');
            const config = JSON.parse(configData);
            console.log('🔧 C-Client: Loaded network configuration');
            return config;
        } catch (error) {
            console.log('🔧 C-Client: Using default network configuration (config.json not found)');
            return {
                network: {
                    use_public_ip: false,
                    public_ip: '121.74.37.6',
                    local_ip: '127.0.0.1'
                }
            };
        }
    }

    // Get the appropriate IP address based on configuration
    getConfiguredIpAddress() {
        // Add safety check for config
        if (!this.config || !this.config.network) {
            console.log('⚠️ C-Client: Config not loaded, using default local IP');
            return '127.0.0.1';
        }

        if (this.config.network.use_public_ip) {
            console.log('🌐 C-Client: Using public IP mode');
            return this.config.network.public_ip;
        } else {
            console.log('🏠 C-Client: Using local IP mode');
            return this.config.network.local_ip;
        }
    }

    /**
     * Get client port using port manager
     */
    async getClientPort() {
        try {
            this.clientPort = await this.portManager.findAvailableCClientPort();
            console.log(`🔌 C-Client: Assigned port ${this.clientPort}`);
            return this.clientPort;
        } catch (error) {
            console.error('❌ C-Client: Failed to find available port:', error);
            throw error;
        }
    }

    /**
     * Start C-Client API server
     */
    async startApiServer() {
        try {
            // Start merged C-Client API server with dynamic port
            this.apiServer = new CClientApiServer(null, this.mainWindow);
            const apiPort = await this.apiServer.start();
            console.log(`🌐 C-Client: Merged API server started on port ${apiPort}`);

            // Initialize WebSocket client (but don't connect automatically)
            this.webSocketClient = new CClientWebSocketClient();
            this.webSocketClient.setClientId(this.clientId); // Set client ID
            this.webSocketClient.setMainWindow(this); // Set main window reference for page refresh
            this.webSocketClient.setElectronApp(this); // Set ElectronApp reference for connection sharing
            console.log(`🔌 C-Client: WebSocket client initialized (not connected) with client ID: ${this.clientId}`);

            // Set WebSocket client in NodeManager for sending assignConfirmed
            if (this.nodeManager) {
                this.nodeManager.setWebSocketClient(this.webSocketClient);
                console.log(`🔌 C-Client: WebSocket client set in NodeManager`);
            }

            // Update URL injector with the correct API port
            try {
                const { updateGlobalApiPort } = require('./utils/urlParameterInjector');
                updateGlobalApiPort(apiPort);
                console.log(`🌐 C-Client: Updated URL injector with API port: ${apiPort}`);
            } catch (error) {
                console.error(`🌐 C-Client: Error updating URL injector port:`, error);
            }

            // Create view manager with API port
            console.log(`🌐 C-Client: Creating ViewManager with windowManager: ${!!this.windowManager}, historyManager: ${!!this.historyManager}, apiPort: ${apiPort}`);
            this.viewManager = new ViewManager(this, this.historyManager, apiPort);
            console.log(`🌐 C-Client: Created ViewManager with API port: ${apiPort}`);

            // Verify ViewManager creation
            if (!this.viewManager) {
                console.error(`❌ C-Client: Failed to create ViewManager`);
                throw new Error('ViewManager creation failed');
            }

            console.log(`🌐 C-Client: ViewManager created successfully: ${!!this.viewManager}`);

            // Initialize unified TabManager
            try {
                console.log(`🌐 C-Client: Attempting to create TabManager...`);
                const TabManager = require('./window/tabManager');
                console.log(`🌐 C-Client: TabManager module loaded successfully`);
                this.tabManager = new TabManager(this);
                console.log(`🌐 C-Client: TabManager initialized successfully`);

                // CRITICAL: Update WebSocket client's mainWindow reference after TabManager is created
                if (this.webSocketClient) {
                    this.webSocketClient.setMainWindow(this);
                    console.log(`🔌 C-Client: WebSocket client mainWindow reference updated after TabManager creation`);
                }

                // Set up window resize callback to update tab views
                if (this.windowManager && this.tabManager) {
                    this.windowManager.setResizeCallback((bounds) => {
                        console.log(`🔄 C-Client: Window resized to ${bounds.width}x${bounds.height}, updating all tab views`);
                        this.tabManager.updateAllViewBounds(bounds);
                    });
                    console.log(`🌐 C-Client: Window resize callback configured`);
                }
            } catch (error) {
                console.error(`❌ C-Client: Failed to create TabManager:`, error);
                console.error(`❌ C-Client: TabManager error details:`, {
                    message: error.message,
                    stack: error.stack
                });
                this.tabManager = null;
            }

            // Create IPC handlers with WebSocket client reference (after ViewManager is created)
            this.ipcHandlers = new IpcHandlers(this.viewManager, this.historyManager, this.mainWindow, this.clientManager, null, this.startupValidator, apiPort, this.webSocketClient, this.tabManager, this.clientId);
            console.log(`🌐 C-Client: Created IpcHandlers with WebSocket client reference and TabManager`);

            // Initialize B-Client configuration modal
            this.bClientConfigModal = new BClientConfigModal(this.mainWindow);

            // Add B-Client configuration IPC handler
            const { ipcMain } = require('electron');
            ipcMain.handle('show-b-client-config', () => {
                this.showBClientConfig();
            });

            // Set current user for NodeManager (if available) and update port in database
            try {
                const DatabaseManager = require('./sqlite/databaseManager');
                // Get current user for this specific client
                const currentUser = DatabaseManager.getCurrentLocalUserForClient(this.clientId);
                if (currentUser) {
                    console.log(`🌐 C-Client: Found current user ${currentUser.username} for client_id ${this.clientId}`);

                    // Update the port and IP address in database based on configuration
                    const NetworkConfigManager = require('./config/networkConfigManager');
                    const configuredIp = this.getConfiguredIpAddress();

                    // Note: IP and port tracking has been removed from local_users table
                    console.log(`🌐 C-Client: Using IP and port for user ${currentUser.username}: ${configuredIp}:${apiPort} (${this.config && this.config.network && this.config.network.use_public_ip ? 'public' : 'local'} mode)`);

                    // Also update all node tables with the configured IP address
                    try {
                        const networkManager = new NetworkConfigManager();
                        await networkManager.updateDatabaseIpAddresses();
                        console.log(`🌐 C-Client: Updated all node tables with IP address: ${configuredIp}`);
                    } catch (networkError) {
                        console.error(`🌐 C-Client: Error updating node tables IP address:`, networkError);
                    }

                    this.apiServer.setCurrentUser(currentUser);

                    // Set current user for NodeManager
                    if (this.nodeManager) {
                        this.nodeManager.setCurrentUser(currentUser);
                        console.log(`🌐 C-Client: Set current user for NodeManager: ${currentUser.username}`);
                    } else {
                        console.warn(`⚠️ C-Client: NodeManager not initialized, cannot set current user`);
                    }
                } else {
                    console.log(`🌐 C-Client: No current user found in database`);
                }
            } catch (error) {
                console.error(`🌐 C-Client: Error setting current user for NodeManager:`, error);
            }

            // Start checking for reload requests
            this.startReloadChecker();
        } catch (error) {
            console.error('❌ C-Client: Failed to start API server:', error);
            // Don't fail initialization if API server fails to start
        }
    }



    /**
     * Show B-Client configuration modal
     */
    showBClientConfig() {
        if (this.bClientConfigModal) {
            this.bClientConfigModal.showConfigModal();
        }
    }

    /**
     * Start checking for reload requests from API server
     */
    startReloadChecker() {
        if (this.reloadCheckInterval) {
            clearInterval(this.reloadCheckInterval);
        }

        this.reloadCheckInterval = setInterval(() => {
            // Skip if cleanup is in progress
            if (this.isCleaningUp) return;

            if (this.apiServer && this.apiServer.pendingReload) {
                const reloadData = this.apiServer.pendingReload;
                console.log(`🔄 C-Client: Processing pending reload for user: ${reloadData.username}`);

                // Clear the pending reload
                this.apiServer.pendingReload = null;

                // Handle the reload
                this.handleCookieReload(reloadData);
            }
        }, 1000); // Check every second

        console.log(`🔄 C-Client: Reload checker started`);
    }

    // Old setupCookieReloadListener method removed - using the new version below
    // Old handleCookieReload method removed - using the new version below

    /**
     * Initialize distributed node management system
     */
    async initializeDistributedNodeManagement() {
        try {
            console.log('🔧 Initializing distributed node management...');

            // Initialize NodeManager for node management system
            console.log('🔧 Initializing NodeManager...');
            const NodeManager = require('./nodeManager/nodeManager');
            this.nodeManager = new NodeManager();
            console.log(`✅ NodeManager initialized: ${this.nodeManager.getClientId()}`);
            console.log(`📋 NodeManager available as electronApp.nodeManager`);

            // Set C-Client environment configuration
            if (!process.env.C_CLIENT_ENVIRONMENT) {
                process.env.C_CLIENT_ENVIRONMENT = 'local'; // Default to local for development
                console.log('C-Client: Set default environment to local');
            } else {
                console.log(`C-Client: Using environment from env: ${process.env.C_CLIENT_ENVIRONMENT}`);
            }

            // Update apiConfig with current environment
            const apiConfig = require('./config/apiConfig');
            apiConfig.setCurrentEnvironment(process.env.C_CLIENT_ENVIRONMENT);
            console.log(`C-Client: Updated apiConfig environment to: ${apiConfig.currentEnvironment}`);

            // Get B-Client API configuration based on environment
            const bClientConfig = apiConfig.getCurrentBClientApi();
            console.log(`C-Client: Using B-Client API: ${bClientConfig.name} (${bClientConfig.url})`);

            // C-Client communicates with B-Client through NSN, not directly
            // No direct registration with B-Client needed
            console.log('✅ C-Client ready for communication through NSN');
        } catch (error) {
            console.error('❌ Error initializing distributed node management:', error);
        }
    }

    async assignStartupUser() {
        try {
            console.log(`🔧 C-Client: Starting startup user assignment for client: ${this.clientId}`);

            const DatabaseManager = require('./sqlite/databaseManager');
            const result = DatabaseManager.assignStartupUser(this.clientId);

            if (result.success) {
                console.log(`✅ C-Client: Startup user assignment completed: ${result.message}`);
                if (result.currentUser) {
                    console.log(`✅ C-Client: Assigned user: ${result.currentUser.username} (${result.currentUser.user_id})`);
                }
            } else {
                console.error(`❌ C-Client: Failed to assign startup user: ${result.error}`);
            }

            return result;
        } catch (error) {
            console.error(`❌ C-Client: Error assigning startup user:`, error);
            return { success: false, error: error.message };
        }
    }

    async initialize() {
        if (this.isInitialized) {
            console.log(`🔄 C-Client: Already initialized, skipping...`);
            return;
        }

        try {
            console.log(`🔄 C-Client: Starting initialization...`);

            // Get client port using port manager
            console.log(`🔄 C-Client: Getting client port...`);
            await this.getClientPort();

            // Initialize history manager
            console.log(`🔄 C-Client: Initializing history manager...`);
            this.historyManager.initialize();

            // Initialize distributed node management
            console.log(`🔄 C-Client: Initializing distributed node management...`);
            await this.initializeDistributedNodeManagement();

            // Assign startup user for current client
            console.log(`🔧 C-Client: Assigning startup user for current client...`);
            await this.assignStartupUser();

            // Validate node status on startup
            console.log(`🔄 C-Client: Validating node status on startup...`);
            await this.startupValidator.validateOnStartup();

            // Create main window
            const mainWindow = this.windowManager.createWindow();
            this.mainWindow = mainWindow; // Store reference to main window

            // Wait for window to be ready
            await this.waitForWindowReady(mainWindow);

            // Start C-Client API server (after main window is ready)
            await this.startApiServer();

            // Show the window
            mainWindow.show();

            // Note: ViewManager and IpcHandlers will be created after API server starts
            // to ensure they use the correct dynamic port

            // Set up IPC listeners for cookie reload requests
            console.log(`🔄 C-Client: About to set up cookie reload listener...`);
            this.setupCookieReloadListener();
            console.log(`🔄 C-Client: Cookie reload listener setup completed`);

            // Set up IPC listeners for user registration
            console.log(`🔄 C-Client: About to set up user registration listeners...`);
            this.setupUserRegistrationListeners();
            console.log(`🔄 C-Client: User registration listeners setup completed`);

            // Set up global reference for API server to access main process
            global.cClientMainProcess = this;
            console.log(`🔄 C-Client: Global main process reference set for API server`);

            // Set up browsing history monitoring
            this.setupHistoryRecording();

            // Initialize SyncManager for user activity synchronization
            console.log(`🔄 C-Client: Initializing SyncManager...`);
            await this.initializeSyncManager();
            console.log(`🔄 C-Client: SyncManager initialization completed`);

            // Update IPC handlers with SyncManager reference
            this.ipcHandlers.updateSyncManager(this.syncManager);
            console.log(`🌐 C-Client: Updated IpcHandlers with SyncManager reference`);

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

            // Create initial tab directly using TabManager for faster startup
            setTimeout(async () => {
                if (this.mainWindow && !this.mainWindow.isDestroyed() && this.tabManager) {
                    try {
                        console.log('🚀 C-Client: Creating initial tab using TabManager...');
                        const result = await this.tabManager.createTab('https://www.google.com');
                        if (result) {
                            console.log('✅ C-Client: Initial tab created successfully with ID:', result.id);

                            // Immediately adjust tab bounds to match current window size
                            const bounds = this.windowManager.getViewBounds();
                            console.log(`🔄 C-Client: Adjusting initial tab to window size: ${bounds.width}x${bounds.height}`);
                            this.tabManager.updateAllViewBounds(bounds);
                        } else {
                            console.error('❌ C-Client: Failed to create initial tab');
                        }
                    } catch (error) {
                        console.error('❌ C-Client: Error creating initial tab:', error);
                    }
                }
            }, 50); // Reduced delay for faster startup

            // Check if user registration is needed after main window is ready
            setTimeout(async () => {
                try {
                    const registrationResult = await this.startupValidator.userManager.registerNewUserIfNeeded(this.mainWindow);
                    if (registrationResult) {
                        // New user registration dialog was shown
                    } else {
                        // For existing users, show greeting dialog
                        try {
                            const UserRegistrationDialog = require('./userManager/userRegistrationDialog');
                            const userRegistrationDialog = new UserRegistrationDialog(this.clientId);

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
            }, 100); // Further reduced delay for faster startup

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

        app.on('client-switch', async (targetClient) => {
            return await this.handleClientSwitch(targetClient);
        });
    }

    /**
     * Handle client switch using unified switch manager
     */
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
            console.error(`Main: Failed to switch to ${targetClient}:`, error);
            return { success: false, error: error.message };
        }
    }

    async waitForWindowReady(window) {
        return new Promise((resolve) => {
            if (window.webContents.isLoading()) {
                window.webContents.once('did-finish-load', () => {
                    setTimeout(resolve, 50); // Further reduced from 100ms to 50ms
                });
            } else {
                setTimeout(resolve, 25); // Further reduced from 50ms to 25ms
            }
        });
    }

    setupHistoryRecording() {
        const { getCClientLogger } = require('./utils/logger');
        const historyLogger = getCClientLogger('history');

        app.on('web-contents-created', (event, contents) => {
            contents.on('did-start-navigation', (event, url, isInPlace, isMainFrame) => {
                historyLogger.info(`📍 did-start-navigation: url=${url}, isMainFrame=${isMainFrame}, isInPlace=${isInPlace}`);

                if (!isMainFrame) {
                    historyLogger.info(`⏭️ Skipping: not main frame`);
                    return;
                }

                if (isInPlace) {
                    historyLogger.info(`⏭️ Skipping: in-place navigation (SPA/hash change)`);
                    return;
                }

                const UrlUtils = require('./utils/urlUtils');
                if (!UrlUtils.isValidUrl(url)) {
                    historyLogger.info(`⏭️ Skipping invalid URL: ${url}`);
                    return;
                }

                // Use original URL for history storage (do NOT normalize)
                // URL cleaning is only for display purposes, not storage

                const viewId = this.getViewIdFromWebContents(contents);
                historyLogger.info(`📝 Recording visit for viewId=${viewId}, url=${url}`);

                if (viewId && this.historyManager) {
                    setTimeout(async () => {
                        try {
                            if (contents.isDestroyed()) return;

                            let initialTitle = 'Loading...';
                            const currentTitle = contents.getTitle();
                            if (currentTitle && currentTitle.trim() && currentTitle !== url) {
                                initialTitle = currentTitle;
                            }

                            // Use new recordPageVisitWithContent method to record visit and extract content
                            const record = await this.historyManager.recordPageVisitWithContent(url, viewId, contents);
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
                            historyLogger.error(`Error in did-start-navigation handler: ${error.message}`);
                        }
                    }, 200);
                }
            });

            contents.on('did-finish-load', async () => {
                try {
                    if (contents.isDestroyed()) return;

                    const currentUrl = contents.getURL();
                    const title = contents.getTitle();

                    const UrlUtils = require('./utils/urlUtils');
                    if (!UrlUtils.isValidUrl(currentUrl)) {
                        return;
                    }

                    // Use original URL (do NOT normalize)
                    if (currentUrl && this.historyManager) {
                        const viewId = this.getViewIdFromWebContents(contents);
                        if (viewId) {
                            // Update title
                            this.updateRecordTitle(currentUrl, viewId, title);

                            // After page load completes, extract more complete content info
                            try {
                                const PageContentExtractor = require('./utils/pageContentExtractor');
                                const pageContent = await PageContentExtractor.extractNSNContent(contents, url);

                                // Get recent visit record
                                const recentRecord = this.historyManager.getRecentRecordByViewId(viewId);
                                if (recentRecord) {
                                    // Update description with more complete page content
                                    this.historyManager.updateRecordDescription(recentRecord, JSON.stringify(pageContent));
                                    console.log(`✅ Main: Updated page content after did-finish-load for visit ID: ${recentRecord.id}`);
                                }
                            } catch (error) {
                                console.error('❌ Main: Error extracting content on did-finish-load:', error);
                            }
                        }
                    }
                } catch (error) {
                    console.error('Error in did-finish-load handler:', error);
                }
            });

            contents.on('page-title-updated', (event, title) => {
                try {
                    if (contents.isDestroyed()) return;

                    const currentUrl = contents.getURL();
                    const UrlUtils = require('./utils/urlUtils');
                    if (!UrlUtils.isValidUrl(currentUrl)) {
                        return;
                    }

                    // Use original URL (do NOT normalize)
                    if (currentUrl && title && this.historyManager) {
                        const viewId = this.getViewIdFromWebContents(contents);
                        if (viewId) {
                            this.updateRecordTitle(currentUrl, viewId, title);
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

            // Handle new window requests (popups, target="_blank", window.open)
            contents.setWindowOpenHandler(({ url }) => {
                console.log(`🪟 New window requested: ${url}`);

                try {
                    const parsedUrl = new URL(url);
                    // Only allow http/https protocols
                    if (parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:') {
                        // Open in new tab immediately (synchronously if possible)
                        console.log(`✅ Opening in new tab immediately: ${url}`);

                        if (this.tabManager) {
                            // Create tab immediately without await to avoid blocking
                            this.tabManager.createTab(url).then((result) => {
                                if (result) {
                                    console.log(`✅ New tab created for: ${url}`);
                                } else {
                                    console.error(`❌ Failed to create tab for new window`);
                                }
                            }).catch((error) => {
                                console.error(`❌ Error creating tab for new window:`, error);
                            });
                        }

                        return { action: 'deny' }; // Deny popup, we handle it in tab
                    } else {
                        console.log(`❌ Blocking non-http(s) protocol: ${parsedUrl.protocol}`);
                        return { action: 'deny' };
                    }
                } catch (error) {
                    console.error(`❌ Error parsing new window URL:`, error);
                    return { action: 'deny' };
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
            const { getCClientLogger } = require('./utils/logger');
            const historyLogger = getCClientLogger('history');

            historyLogger.info(`📚 Main.updateRecordTitle: URL=${url}, viewId=${viewId}, title=${title}`);

            const key = `${url}-${viewId}`;
            const pendingUpdate = this.pendingTitleUpdates.get(key);

            historyLogger.info(`📚 Pending update key: ${key}`);
            historyLogger.info(`📚 Pending updates map has ${this.pendingTitleUpdates.size} entries`);

            if (pendingUpdate) {
                historyLogger.info(`✅ Found in pendingUpdates, updating record ID: ${pendingUpdate.record.id}`);
                const finalTitle = title || 'Untitled Page';
                this.historyManager.updateRecordTitle(pendingUpdate.record, finalTitle);
                this.pendingTitleUpdates.delete(key);
                historyLogger.info(`✅ Title updated via pendingUpdates: ${finalTitle}`);
            } else {
                historyLogger.info(`⚠️ Not in pendingUpdates, searching database directly...`);

                // Query directly from database
                // Strategy: Find the most recent record for this viewId with temporary title
                // This handles the timing issue where title update arrives before record creation completes
                try {
                    const db = require('./sqlite/database');

                    // Query: Find most recent record for this viewId with a temporary title
                    // This works regardless of exact URL match (handles redirect chains)
                    const recentRecord = db.prepare(`
                        SELECT * FROM visit_history 
                        WHERE view_id = ?
                        AND (title = 'Loading...' OR title = 'about:blank' OR title = 'Untitled Page' OR title IS NULL)
                        ORDER BY id DESC 
                        LIMIT 1
                    `).get(viewId);

                    if (recentRecord) {
                        historyLogger.info(`✅ Found record: ID=${recentRecord.id}, URL="${recentRecord.url}", old_title="${recentRecord.title}"`);

                        const finalTitle = title || 'Untitled Page';
                        const now = Math.floor(Date.now() / 1000);

                        db.prepare(`
                            UPDATE visit_history 
                            SET title = ?, updated_at = ?
                            WHERE id = ?
                        `).run(finalTitle, now, recentRecord.id);

                        historyLogger.info(`✅ Title updated: "${recentRecord.title}" -> "${finalTitle}"`);
                    } else {
                        historyLogger.warn(`❌ No recent record with temporary title for viewId=${viewId}`);
                    }
                } catch (dbError) {
                    console.error(`📚   ❌ Database query error:`, dbError);
                }
            }
        } catch (error) {
            console.error('Failed to update record title:', error);
        }
    }

    getViewIdFromWebContents(contents) {
        if (!this.tabManager) return null;

        try {
            if (this.tabManager) {
                // Use TabManager to find the tab
                const allTabs = this.tabManager.getAllTabs();
                for (const tab of allTabs) {
                    if (tab.browserView && tab.browserView.webContents === contents) {
                        return tab.id;
                    }
                }
            }
        } catch (error) {
            console.error('Failed to get viewId from WebContents:', error);
        }

        return null;
    }

    /**
     * Send message to main window
     * @param {string} channel Channel name
     * @param {any} data Data
     */
    sendToWindow(channel, data) {
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            this.mainWindow.webContents.send(channel, data);
        }
    }

    setupPeriodicCleanup() {
        // Auto-fetch titles every 2 minutes for recent loading records
        this.cleanupLoadingRecordsInterval = setInterval(async () => {
            await this.cleanupLoadingRecords();
        }, 2 * 60 * 1000);

        // Cleanup pending updates every 5 minutes
        this.cleanupPendingUpdatesInterval = setInterval(() => {
            this.cleanupPendingUpdates();
        }, 5 * 60 * 1000);
    }

    async cleanupLoadingRecords() {
        // Skip if cleanup is in progress
        if (this.isCleaningUp) return;

        try {
            if (this.historyManager) {
                console.log('[Main] Starting auto-fetch for loading records...');
                const result = await this.historyManager.autoFetchTitleForLoadingRecords();
                console.log(`[Main] Auto-fetch completed: ${result.updated}/${result.total} records updated`);
            }
        } catch (error) {
            console.error('Failed to cleanup loading records:', error);
        }
    }

    cleanupPendingUpdates() {
        // Skip if cleanup is in progress
        if (this.isCleaningUp) return;

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

            // Cleaned up pending title updates
        } catch (error) {
            console.error('Failed to cleanup pending updates:', error);
        }
    }

    registerShortcuts() {
        try {
            globalShortcut.register('CommandOrControl+Shift+I', () => {
                // Use TabManager if available, otherwise fallback to ViewManager
                let currentView = null;
                if (this.tabManager) {
                    const currentTab = this.tabManager.getCurrentTab();
                    currentView = currentTab ? currentTab.browserView : null;
                }
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
                if (this.tabManager) {
                    this.tabManager.createTab().catch(console.error);
                }
            });

            globalShortcut.register('F5', () => {
                if (this.tabManager) {
                    this.tabManager.refresh();
                }
            });

            globalShortcut.register('Alt+Left', () => {
                if (this.tabManager) {
                    this.tabManager.goBack();
                }
            });

            globalShortcut.register('Alt+Right', () => {
                if (this.tabManager) {
                    this.tabManager.goForward();
                }
            });

            globalShortcut.register('CommandOrControl+H', () => {
                if (this.tabManager) {
                    // Create history tab using TabManager
                    this.tabManager.createTab('browser://history', { isHistory: true }).catch(console.error);
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
                        label: 'Network Configuration...',
                        accelerator: 'CmdOrCtrl+Shift+N',
                        click: () => {
                            this.showNetworkConfig();
                        }
                    },
                    {
                        label: 'Clear Local Users',
                        accelerator: 'CmdOrCtrl+Shift+L',
                        click: () => {
                            this.clearLocalUsers();
                        }
                    },
                    {
                        label: 'Check Sync Data',
                        accelerator: 'CmdOrCtrl+Shift+S',
                        click: () => {
                            this.showSyncDataViewer();
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

    async showNetworkConfig() {
        try {
            const NetworkConfigDialog = require('./ui/networkConfigDialog');
            const dialog = new NetworkConfigDialog();
            await dialog.show();
        } catch (error) {
            console.error('Error showing network config dialog:', error);
        }
    }

    async showSyncDataViewer() {
        try {
            // Send message to renderer process to show SyncData viewer
            if (this.mainWindow && !this.mainWindow.isDestroyed()) {
                this.mainWindow.webContents.send('show-sync-data-viewer');
            }
        } catch (error) {
            console.error('Error showing sync data viewer:', error);
        }
    }

    clearLocalUsers() {
        try {
            const db = require('./sqlite/database');
            const result = db.prepare('DELETE FROM local_users').run();

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
        // Add global error handlers to prevent crashes
        process.on('uncaughtException', (error) => {
            console.error('🚨 C-Client: Uncaught Exception:', error);
            console.log('⚠️ C-Client: Continuing operation despite error...');
            // Don't exit the process, just log the error
        });

        process.on('unhandledRejection', (reason, promise) => {
            console.error('🚨 C-Client: Unhandled Rejection at:', promise, 'reason:', reason);
            console.log('⚠️ C-Client: Continuing operation despite rejection...');
            // Don't exit the process, just log the error
        });

        app.on('window-all-closed', async () => {
            console.log('🚪 C-Client: All windows closed, starting cleanup...');

            // Clear all sessions and login states (same as user switch)
            if (this.tabManager) {
                try {
                    console.log('🧹 C-Client: Clearing all sessions including persistent partitions...');
                    await this.tabManager.clearAllSessions();
                    console.log('✅ C-Client: All sessions cleared successfully');
                } catch (error) {
                    console.error('❌ C-Client: Error clearing sessions:', error);
                    console.error('❌ C-Client: Error details:', {
                        message: error.message,
                        stack: error.stack
                    });

                    // Fallback: try to clear persistent partitions directly
                    await this.emergencyClearPersistentPartitions();
                }
            } else {
                console.error('❌ C-Client: ViewManager not available for session cleanup');
                // Fallback: try to clear persistent partitions directly
                await this.emergencyClearPersistentPartitions();
            }

            // Disconnect WebSocket if connected
            if (this.webSocketClient && this.webSocketClient.isConnected) {
                try {
                    console.log('🔌 C-Client: Disconnecting WebSocket on window close...');
                    this.webSocketClient.disconnect();
                    console.log('✅ C-Client: WebSocket disconnected successfully');
                } catch (error) {
                    console.error('❌ C-Client: Error disconnecting WebSocket:', error);
                }
            }

            if (this.historyManager) {
                try {
                    this.historyManager.logShutdown('window-all-closed');
                } catch (error) {
                    console.error('❌ C-Client: Error logging shutdown:', error);
                }
            }

            if (process.platform !== 'darwin') {
                this.safeQuit();
            }
        });

        app.on('before-quit', async (event) => {
            console.log('🚪 C-Client: Application quitting, starting cleanup...');

            // Clear all sessions and login states (same as user switch)
            if (this.tabManager) {
                try {
                    console.log('🧹 C-Client: Clearing all sessions including persistent partitions...');
                    await this.tabManager.clearAllSessions();
                    console.log('✅ C-Client: All sessions cleared successfully');
                } catch (error) {
                    console.error('❌ C-Client: Error clearing sessions:', error);
                    console.error('❌ C-Client: Error details:', {
                        message: error.message,
                        stack: error.stack
                    });
                }
            } else {
                console.error('❌ C-Client: ViewManager not available for session cleanup');
            }

            // Disconnect WebSocket if connected
            if (this.webSocketClient && this.webSocketClient.isConnected) {
                try {
                    console.log('🔌 C-Client: Disconnecting WebSocket on app quit...');
                    this.webSocketClient.disconnect();
                    console.log('✅ C-Client: WebSocket disconnected successfully');
                } catch (error) {
                    console.error('❌ C-Client: Error disconnecting WebSocket:', error);
                }
            }

            if (this.historyManager) {
                try {
                    this.historyManager.logShutdown('before-quit');
                } catch (error) {
                    console.error('❌ C-Client: Error logging shutdown:', error);
                }
            }
            await this.cleanup();
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

        app.on('will-quit', async (event) => {
            console.log('🚪 C-Client: Application will quit, performing final cleanup...');

            try {
                // Clear all sessions as final cleanup (same as user switch)
                if (this.tabManager) {
                    try {
                        console.log('🧹 C-Client: Final session cleanup including persistent partitions...');
                        await this.tabManager.clearAllSessions();
                        console.log('✅ C-Client: Final session cleanup completed');
                    } catch (error) {
                        console.error('❌ C-Client: Error in final session cleanup:', error);
                        console.error('❌ C-Client: Error details:', {
                            message: error.message,
                            stack: error.stack
                        });
                    }
                } else {
                    console.error('❌ C-Client: ViewManager not available for final session cleanup');
                }

                // Disconnect WebSocket as final cleanup
                if (this.webSocketClient && this.webSocketClient.isConnected) {
                    try {
                        console.log('🔌 C-Client: Final WebSocket disconnect on will-quit...');
                        this.webSocketClient.disconnect();
                        console.log('✅ C-Client: Final WebSocket disconnect completed');
                    } catch (error) {
                        console.error('❌ C-Client: Error in final WebSocket disconnect:', error);
                    }
                }

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

        // Handle process signals for unexpected termination
        process.on('SIGINT', async () => {
            console.log('🚪 C-Client: Received SIGINT, performing emergency cleanup...');
            await this.emergencyCleanup();
            process.exit(0);
        });

        process.on('SIGTERM', async () => {
            console.log('🚪 C-Client: Received SIGTERM, performing emergency cleanup...');
            await this.emergencyCleanup();
            process.exit(0);
        });

        process.on('uncaughtException', async (error) => {
            console.error('🚨 C-Client: Uncaught exception:', error);
            await this.emergencyCleanup();
            process.exit(1);
        });

        process.on('unhandledRejection', async (reason, promise) => {
            console.error('🚨 C-Client: Unhandled rejection at:', promise, 'reason:', reason);
            await this.emergencyCleanup();
            process.exit(1);
        });

        app.on('render-process-gone', (event, webContents, details) => {
            if (details.reason === 'crashed' && webContents && !webContents.isDestroyed()) {
                webContents.reload();
            }
        });
    }

    async cleanup() {
        if (!this.isInitialized) return;

        // Set cleanup flag to stop all background tasks immediately
        this.isCleaningUp = true;

        // Cleaning up application resources

        try {
            // Clear all timers first
            if (this.reloadCheckInterval) {
                clearInterval(this.reloadCheckInterval);
                this.reloadCheckInterval = null;
                console.log('✅ C-Client: Reload check interval cleared');
            }
            if (this.cleanupLoadingRecordsInterval) {
                clearInterval(this.cleanupLoadingRecordsInterval);
                this.cleanupLoadingRecordsInterval = null;
                console.log('✅ C-Client: Cleanup loading records interval cleared');
            }
            if (this.cleanupPendingUpdatesInterval) {
                clearInterval(this.cleanupPendingUpdatesInterval);
                this.cleanupPendingUpdatesInterval = null;
                console.log('✅ C-Client: Cleanup pending updates interval cleared');
            }

            // Clear all sessions BEFORE destroying ViewManager
            if (this.tabManager) {
                try {
                    console.log('🧹 C-Client: Clearing all sessions before cleanup...');

                    // Add timeout to prevent cleanup from hanging
                    const clearSessionsPromise = this.tabManager.clearAllSessions();
                    const timeoutPromise = new Promise((resolve) => {
                        setTimeout(() => {
                            console.log('⚠️ C-Client: Session clearing timeout (3s), forcing continue...');
                            resolve();
                        }, 3000);
                    });

                    await Promise.race([clearSessionsPromise, timeoutPromise]);
                    console.log('✅ C-Client: All sessions cleared before cleanup');
                } catch (error) {
                    console.error('❌ C-Client: Error clearing sessions during cleanup:', error);
                }

                this.tabManager.cleanup();
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

            // Stop API servers
            if (this.apiServer) {
                this.apiServer.stop();
                this.apiServer = null;
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

            // Close database connection
            try {
                const db = require('./sqlite/database');
                if (db && typeof db.close === 'function') {
                    db.close();
                    console.log('✅ C-Client: Database connection closed');
                }
            } catch (dbError) {
                console.error('❌ C-Client: Error closing database:', dbError);
            }

        } catch (error) {
            console.error('Error during cleanup:', error);
        }
    }

    /**
     * Emergency cleanup for unexpected termination
     */
    async emergencyCleanup() {
        console.log('🚨 C-Client: Starting emergency cleanup...');

        try {
            // Clear all sessions immediately (same as user switch)
            if (this.tabManager) {
                try {
                    console.log('🧹 C-Client: Emergency session cleanup including persistent partitions...');
                    await this.tabManager.clearAllSessions();
                    console.log('✅ C-Client: Emergency session cleanup completed');
                } catch (error) {
                    console.error('❌ C-Client: Error in emergency session cleanup:', error);
                    console.error('❌ C-Client: Error details:', {
                        message: error.message,
                        stack: error.stack
                    });

                    // Fallback: try to clear persistent partitions directly
                    await this.emergencyClearPersistentPartitions();
                }
            } else {
                console.error('❌ C-Client: ViewManager not available for emergency session cleanup');
                // Fallback: try to clear persistent partitions directly
                await this.emergencyClearPersistentPartitions();
            }

            // Disconnect WebSocket immediately
            if (this.webSocketClient && this.webSocketClient.isConnected) {
                try {
                    console.log('🔌 C-Client: Emergency WebSocket disconnect...');
                    this.webSocketClient.disconnect();
                    console.log('✅ C-Client: Emergency WebSocket disconnect completed');
                } catch (error) {
                    console.error('❌ C-Client: Error in emergency WebSocket disconnect:', error);
                }
            }

            // Force write history
            if (this.historyManager) {
                try {
                    this.historyManager.forceWrite();
                    console.log('✅ C-Client: Emergency history write completed');
                } catch (error) {
                    console.error('❌ C-Client: Error in emergency history write:', error);
                }
            }

            console.log('✅ C-Client: Emergency cleanup completed');
        } catch (error) {
            console.error('❌ C-Client: Error during emergency cleanup:', error);
        }
    }

    /**
     * Emergency fallback method to clear persistent partitions directly
     */
    async emergencyClearPersistentPartitions() {
        try {
            console.log('🚨 C-Client: Emergency fallback - clearing persistent partitions directly...');

            const { session } = require('electron');
            const partitionsToClear = ['persist:main', 'persist:nsn'];

            for (const partitionName of partitionsToClear) {
                try {
                    console.log(`🧹 Emergency clearing session partition: ${partitionName}`);
                    const partitionSession = session.fromPartition(partitionName);

                    await partitionSession.clearStorageData({
                        storages: ['cookies', 'localStorage', 'sessionStorage', 'indexeddb', 'websql', 'cache', 'serviceworkers']
                    });

                    await partitionSession.clearCache();
                    console.log(`✅ Emergency session partition cleared: ${partitionName}`);
                } catch (partitionError) {
                    console.error(`❌ Error in emergency clearing session partition ${partitionName}:`, partitionError);
                }
            }

            console.log('✅ C-Client: Emergency persistent partitions cleanup completed');
        } catch (error) {
            console.error('❌ C-Client: Error in emergency persistent partitions cleanup:', error);
        }
    }

    /**
     * Setup IPC listener for cookie reload requests
     */
    setupCookieReloadListener() {
        try {
            console.log(`🔄 C-Client: Setting up cookie reload listener...`);
            const { ipcMain } = require('electron');

            ipcMain.on('cookie-reload-request', (event, reloadData) => {
                console.log(`🔄 C-Client: ===== IPC COOKIE RELOAD REQUEST RECEIVED =====`);
                console.log(`🔄 C-Client: Received cookie reload request for user: ${reloadData.username}`);
                console.log(`🔄 C-Client: Full IPC reloadData received:`, JSON.stringify(reloadData, null, 2));
                console.log(`🔄 C-Client: NSN URL in IPC data: ${reloadData.nsn_url} (type: ${typeof reloadData.nsn_url})`);
                console.log(`🔄 C-Client: NSN Port in IPC data: ${reloadData.nsn_port} (type: ${typeof reloadData.nsn_port})`);
                console.log(`🔄 C-Client: NSN Domain in IPC data: ${reloadData.nsn_domain} (type: ${typeof reloadData.nsn_domain})`);
                console.log(`🔄 C-Client: ===== END IPC COOKIE RELOAD REQUEST =====`);
                this.handleCookieReload(reloadData);
            });

            // Handle logout request
            ipcMain.on('clear-user-session', (event, logoutData) => {
                console.log(`🔓 C-Client: Received logout request for user: ${logoutData.username}`);
                this.handleUserLogout(logoutData);
            });

            console.log(`🔄 C-Client: Cookie reload listener set up successfully`);
        } catch (error) {
            console.error(`❌ C-Client: Error setting up cookie reload listener:`, error);
        }
    }

    /**
     * Setup IPC listeners for user registration
     */
    setupUserRegistrationListeners() {
        try {
            console.log(`🔄 C-Client: Setting up user registration listeners...`);
            const { ipcMain } = require('electron');

            // Handle user registration dialog close request
            ipcMain.on('close-user-registration-dialog', (event) => {
                try {
                    console.log('🔄 C-Client: Closing user registration dialog');

                    // Find and close the registration dialog window
                    const { BrowserWindow } = require('electron');
                    const allWindows = BrowserWindow.getAllWindows();

                    for (const window of allWindows) {
                        if (window.webContents && window.webContents.getURL().includes('data:text/html')) {
                            // This is likely the registration dialog (it uses data URL)
                            console.log('🔄 C-Client: Found registration dialog, closing...');
                            window.close();
                            break;
                        }
                    }
                } catch (error) {
                    console.error('❌ C-Client: Error closing user registration dialog:', error);
                }
            });

            console.log(`🔄 C-Client: User registration listeners set up successfully`);
        } catch (error) {
            console.error(`❌ C-Client: Error setting up user registration listeners:`, error);
        }
    }

    /**
     * Close user registration dialog
     */
    closeUserRegistrationDialog() {
        try {
            console.log('🔄 C-Client: Closing user registration dialog');

            // Find and close the registration dialog window
            const { BrowserWindow } = require('electron');
            const allWindows = BrowserWindow.getAllWindows();

            for (const window of allWindows) {
                if (window.webContents && window.webContents.getURL().includes('data:text/html')) {
                    // This is likely the registration dialog (it uses data URL)
                    console.log('🔄 C-Client: Found registration dialog, closing...');
                    window.close();
                    break;
                }
            }
        } catch (error) {
            console.error('❌ C-Client: Error closing registration dialog:', error);
        }
    }

    /**
     * Get the current WebSocket URL for connection sharing
     * @returns {string|null} - Current WebSocket URL or null if not connected
     */
    getCurrentWebSocketUrl() {
        return this.currentWebSocketUrl;
    }

    /**
     * Extract website domain from WebSocket URL for connection sharing
     * @param {string} websocketUrl - WebSocket URL
     * @returns {string} - Website domain
     */
    extractWebsiteDomainFromWebSocketUrl(websocketUrl) {
        try {
            const url = new URL(websocketUrl);
            // Extract domain from WebSocket URL (e.g., ws://localhost:8766 -> localhost)
            // For production, this would be the B-Client server domain
            return url.hostname;
        } catch (error) {
            console.error('❌ C-Client: Error extracting website domain from WebSocket URL:', error);
            return 'unknown';
        }
    }

    /**
     * Handle NSN response and process WebSocket connection requests
     * @param {Object} response - Response from NSN
     */
    async handleNSNResponse(response) {
        try {
            console.log('🔍 C-Client: ===== PROCESSING NSN RESPONSE =====');
            console.log('🔍 C-Client: Processing NSN response:', response);
            console.log('🔍 C-Client: Response type:', typeof response);
            console.log('🔍 C-Client: Response keys:', Object.keys(response || {}));
            console.log('🔍 C-Client: Response action:', response.action);
            console.log('🔍 C-Client: Response user_id:', response.user_id);
            console.log('🔍 C-Client: Response username:', response.username);
            console.log('🔍 C-Client: Response websocket_url:', response.websocket_url);
            console.log('🔍 C-Client: Response b_client_url:', response.b_client_url);
            console.log('🔍 C-Client: Response needs_registration:', response.needs_registration);
            console.log('🔍 C-Client: Response has_cookie:', response.has_cookie);
            console.log('🔍 C-Client: Response has_node:', response.has_node);

            // Check if WebSocket connection is needed and available
            if (response.websocket_url && this.webSocketClient) {
                console.log('🔍 C-Client: ===== CHECKING WEBSOCKET CONNECTION STATUS =====');
                console.log('🔍 C-Client: WebSocket client exists:', !!this.webSocketClient);
                console.log('🔍 C-Client: WebSocket client connected:', this.webSocketClient.isConnected);
                console.log('🔍 C-Client: WebSocket URL provided:', response.websocket_url);

                // Extract website domain from WebSocket URL for connection sharing
                const websiteDomain = this.extractWebsiteDomainFromWebSocketUrl(response.websocket_url);
                const currentWebSocketUrl = this.getCurrentWebSocketUrl();
                const isSameConnection = currentWebSocketUrl === response.websocket_url;
                const hasConnectionForWebsite = this.websiteWebSocketConnections.has(websiteDomain);

                // Check if WebSocket connection is truly available and valid
                const isWebSocketTrulyConnected = this.webSocketClient.isConnected &&
                    this.webSocketClient.websocket !== null &&
                    this.webSocketClient.websocket.readyState === WebSocket.OPEN;

                // Additional check: if connection was reset due to logout, it's not valid
                const isConnectionReset = !this.webSocketClient.isConnected &&
                    this.webSocketClient.websocket === null;

                // Check if current WebSocket server connection is marked as unavailable
                const isWebSocketServerUnavailable = this.currentWebSocketUrl === null;

                // Check if website connection is marked as unavailable
                const websiteConnectionInfo = this.websiteWebSocketConnections.get(websiteDomain);
                const isWebsiteConnectionUnavailable = websiteConnectionInfo &&
                    websiteConnectionInfo.available === false;

                console.log('🔍 C-Client: Website domain:', websiteDomain);
                console.log('🔍 C-Client: Current WebSocket URL:', currentWebSocketUrl);
                console.log('🔍 C-Client: Requested WebSocket URL:', response.websocket_url);
                console.log('🔍 C-Client: Is same connection:', isSameConnection);
                console.log('🔍 C-Client: Has connection for website:', hasConnectionForWebsite);
                console.log('🔍 C-Client: WebSocket truly connected:', isWebSocketTrulyConnected);
                console.log('🔍 C-Client: Connection was reset:', isConnectionReset);
                console.log('🔍 C-Client: WebSocket server unavailable:', isWebSocketServerUnavailable);
                console.log('🔍 C-Client: Website connection unavailable:', isWebsiteConnectionUnavailable);
                console.log('🔍 C-Client: WebSocket readyState:', this.webSocketClient.websocket ? this.webSocketClient.websocket.readyState : 'null');

                // Check if this is a response from auto-login (avoid reconnecting after successful login)
                const isAutoLoginResponse = response.action === 'auto_login' ||
                    (response.has_cookie === true && response.needs_registration === false);

                if (isAutoLoginResponse) {
                    console.log('🔐 C-Client: ===== AUTO-LOGIN RESPONSE DETECTED =====');
                    console.log('🔐 C-Client: This appears to be an auto-login response, skipping WebSocket reconnection');
                    console.log('🔐 C-Client: WebSocket should already be connected from the login process');
                    console.log('🔐 C-Client: Avoiding unnecessary reconnection that could disrupt the session');
                } else if (hasConnectionForWebsite && isWebSocketTrulyConnected && !isConnectionReset &&
                    !isWebSocketServerUnavailable && !isWebsiteConnectionUnavailable) {
                    console.log('✅ C-Client: ===== SHARING EXISTING WEBSOCKET CONNECTION FOR WEBSITE =====');
                    console.log(`✅ C-Client: Already connected to WebSocket server for website: ${websiteDomain}`);
                    console.log('✅ C-Client: Reusing existing connection for this tab');
                    console.log('✅ C-Client: No need to establish a new connection');
                } else if (!isWebSocketTrulyConnected || !hasConnectionForWebsite || isConnectionReset ||
                    isWebSocketServerUnavailable || isWebsiteConnectionUnavailable) {
                    console.log('🔌 C-Client: ===== WEBSOCKET NOT CONNECTED OR DIFFERENT URL, ATTEMPTING CONNECTION =====');
                    console.log('🔌 C-Client: WebSocket connection needed, attempting to connect...');

                    // Clean up invalid connection records if they exist
                    if (hasConnectionForWebsite && (!isWebSocketTrulyConnected || isConnectionReset ||
                        isWebSocketServerUnavailable || isWebsiteConnectionUnavailable)) {
                        console.log('🧹 C-Client: Cleaning up invalid connection record for website:', websiteDomain);
                        console.log('🧹 C-Client: Reason: WebSocket not connected, connection was reset, server unavailable, or website connection unavailable');
                        this.websiteWebSocketConnections.delete(websiteDomain);
                        this.currentWebSocketUrl = null;
                    }

                    try {
                        const connectSuccess = await this.webSocketClient.connectToNSNProvidedWebSocket(response.websocket_url);
                        if (connectSuccess) {
                            console.log('✅ C-Client: WebSocket connection successful');
                            // Store the current WebSocket URL for future reference
                            this.currentWebSocketUrl = response.websocket_url;
                            // Record connection for this website domain
                            this.websiteWebSocketConnections.set(websiteDomain, {
                                websocketUrl: response.websocket_url,
                                connectedAt: Date.now(),
                                websiteDomain: websiteDomain
                            });
                            console.log(`✅ C-Client: Recorded WebSocket connection for website: ${websiteDomain}`);
                        } else {
                            console.log('⚠️ C-Client: WebSocket connection failed, but continuing with response processing');
                        }
                    } catch (error) {
                        console.error('❌ C-Client: WebSocket connection error:', error);
                        console.log('⚠️ C-Client: Continuing with response processing despite connection failure');
                    }
                } else {
                    console.log('✅ C-Client: WebSocket connection is already active');
                }
            }

            if (response.action === 'connect_websocket') {
                console.log('🔌 C-Client: ===== WEBSOCKET CONNECTION REQUEST =====');
                console.log('🔌 C-Client: Received WebSocket connection request from NSN');
                console.log(`🔌 C-Client: WebSocket URL: ${response.websocket_url}`);
                console.log(`🔌 C-Client: B-Client URL: ${response.b_client_url}`);
                console.log(`🔌 C-Client: User ID: ${response.user_id}`);
                console.log(`🔌 C-Client: Username: ${response.username}`);
                console.log(`🔌 C-Client: Message: ${response.message}`);
                console.log(`🔌 C-Client: Needs Registration: ${response.needs_registration}`);
                console.log(`🔌 C-Client: Has Cookie: ${response.has_cookie}`);
                console.log(`🔌 C-Client: Has Node: ${response.has_node}`);

                if (this.webSocketClient && response.websocket_url) {
                    console.log('🔌 C-Client: ===== WEBSOCKET CLIENT AVAILABLE =====');
                    console.log('🔌 C-Client: WebSocket client available, attempting connection...');
                    console.log('🔌 C-Client: WebSocket client status:', {
                        exists: !!this.webSocketClient,
                        hasMethod: typeof this.webSocketClient.connectToNSNProvidedWebSocket === 'function',
                        isConnected: this.webSocketClient ? this.webSocketClient.isConnected : 'N/A'
                    });

                    // Connect to NSN-provided WebSocket server
                    console.log('🔌 C-Client: ===== INITIATING WEBSOCKET CONNECTION =====');
                    console.log('🔌 C-Client: Calling connectToNSNProvidedWebSocket...');
                    console.log('🔌 C-Client: Target WebSocket URL:', response.websocket_url);

                    const startTime = Date.now();
                    const success = await this.webSocketClient.connectToNSNProvidedWebSocket(response.websocket_url);
                    const endTime = Date.now();
                    const duration = endTime - startTime;

                    console.log('🔌 C-Client: ===== WEBSOCKET CONNECTION RESULT =====');
                    console.log('🔌 C-Client: Connection duration:', duration + 'ms');
                    console.log('🔌 C-Client: Connection success:', success);

                    if (success) {
                        console.log('✅ C-Client: ===== WEBSOCKET CONNECTION SUCCESS =====');
                        console.log('✅ C-Client: Successfully connected to NSN-provided WebSocket');
                        console.log('✅ C-Client: WebSocket URL:', response.websocket_url);
                        console.log('✅ C-Client: Ready to receive messages from B-Client');
                        console.log('✅ C-Client: Auto-registration process can now proceed');

                        // Log WebSocket client status after connection
                        if (this.webSocketClient) {
                            console.log('✅ C-Client: WebSocket client status after connection:', {
                                isConnected: this.webSocketClient.isConnected,
                                readyState: this.webSocketClient.websocket ? this.webSocketClient.websocket.readyState : 'N/A'
                            });
                        }
                    } else {
                        console.error('❌ C-Client: ===== WEBSOCKET CONNECTION FAILED =====');
                        console.error('❌ C-Client: Failed to connect to NSN-provided WebSocket');
                        console.error('❌ C-Client: WebSocket URL:', response.websocket_url);
                        console.error('❌ C-Client: Connection duration:', duration + 'ms');
                        console.error('❌ C-Client: Auto-registration cannot proceed without WebSocket connection');
                    }
                } else {
                    console.error('❌ C-Client: ===== WEBSOCKET CLIENT MISSING =====');
                    console.error('❌ C-Client: Missing WebSocket client or URL');
                    console.error('❌ C-Client: WebSocket client exists:', !!this.webSocketClient);
                    console.error('❌ C-Client: WebSocket URL provided:', !!response.websocket_url);
                    console.error('❌ C-Client: WebSocket URL value:', response.websocket_url);
                    console.error('❌ C-Client: Auto-registration cannot proceed');
                }
            } else if (response.action === 'auto_login') {
                console.log('🔐 C-Client: ===== AUTO-LOGIN REQUEST =====');
                console.log('🔐 C-Client: Received auto-login request from NSN');
                console.log(`🔐 C-Client: User ID: ${response.user_id}`);
                console.log(`🔐 C-Client: Session Data: ${JSON.stringify(response.session_data)}`);

                // Handle auto-login with session data
                console.log('🔐 C-Client: Calling handleAutoLogin...');
                await this.handleAutoLogin(response);
                console.log('✅ C-Client: Auto-login processing completed');
            } else {
                console.log('ℹ️ C-Client: ===== UNKNOWN NSN RESPONSE ACTION =====');
                console.log('ℹ️ C-Client: Unknown NSN response action:', response.action);
                console.log('ℹ️ C-Client: Full response:', response);
                console.log('ℹ️ C-Client: Available actions: connect_websocket, auto_login');
            }

            console.log('✅ C-Client: ===== NSN RESPONSE PROCESSING COMPLETED =====');
        } catch (error) {
            console.error('❌ C-Client: ===== ERROR PROCESSING NSN RESPONSE =====');
            console.error('❌ C-Client: Error processing NSN response:', error);
            console.error('❌ C-Client: Error stack:', error.stack);
            console.error('❌ C-Client: Response that caused error:', response);
        }
    }

    /**
     * Handle auto-login with session data from NSN
     * @param {Object} response - Auto-login response from NSN
     */
    async handleAutoLogin(response) {
        try {
            console.log('🔐 C-Client: Handling auto-login with session data');

            // Extract session data
            const sessionData = response.session_data || {};
            const userId = response.user_id;

            console.log(`🔐 C-Client: Auto-login for user: ${userId}`);
            console.log(`🔐 C-Client: Session data:`, sessionData);

            // TODO: Implement auto-login logic here
            // This would typically involve:
            // 1. Setting up the session in the browser
            // 2. Navigating to the appropriate page
            // 3. Setting cookies or other authentication data

            console.log('✅ C-Client: Auto-login handled successfully');
        } catch (error) {
            console.error('❌ C-Client: Error handling auto-login:', error);
        }
    }

    /**
     * Handle cookie reload with complete session data
     */
    async handleCookieReload(reloadData) {
        try {
            const { user_id, username, cookie, complete_session_data, nsn_url, nsn_port, nsn_domain } = reloadData;
            console.log(`🔄 C-Client: Handling cookie reload for user: ${username}`);

            // Debug: Log all reloadData parameters
            console.log(`🔄 C-Client: ===== RELOAD DATA DEBUG =====`);
            console.log(`🔄 C-Client: Full reloadData received:`, JSON.stringify(reloadData, null, 2));
            console.log(`🔄 C-Client: Extracted parameters:`);
            console.log(`🔄 C-Client:   user_id: ${user_id}`);
            console.log(`🔄 C-Client:   username: ${username}`);
            console.log(`🔄 C-Client:   nsn_url: ${nsn_url} (type: ${typeof nsn_url})`);
            console.log(`🔄 C-Client:   nsn_port: ${nsn_port} (type: ${typeof nsn_port})`);
            console.log(`🔄 C-Client:   nsn_domain: ${nsn_domain} (type: ${typeof nsn_domain})`);
            console.log(`🔄 C-Client: ===== END RELOAD DATA DEBUG =====`);

            // Log NSN information received from B-Client
            if (nsn_url || nsn_port || nsn_domain) {
                console.log(`🔄 C-Client: NSN information from B-Client:`, {
                    nsn_url: nsn_url,
                    nsn_port: nsn_port,
                    nsn_domain: nsn_domain
                });
            }

            if (complete_session_data) {
                console.log(`🔄 C-Client: Using session data for login:`, {
                    nsn_user_id: complete_session_data.nsn_user_id,
                    nsn_username: complete_session_data.nsn_username,
                    nsn_role: complete_session_data.nsn_role,
                    has_nsn_session: !!complete_session_data.nsn_session_data,
                    timestamp: complete_session_data.timestamp
                });

                // Use complete session data to set up login state
                if (this.mainWindow && !this.mainWindow.isDestroyed()) {
                    console.log(`🔄 C-Client: Setting up session login using complete session data`);

                    // Use complete session data to set up login state
                    const nsnSessionData = complete_session_data.nsn_session_data;

                    // Detailed logging for session data parsing
                    console.log(`🔄 C-Client: ===== SESSION DATA PARSING ANALYSIS =====`);
                    console.log(`🔄 C-Client: complete_session_data received:`, JSON.stringify(complete_session_data, null, 2));
                    console.log(`🔄 C-Client: complete_session_data.nsn_session_data:`, JSON.stringify(nsnSessionData, null, 2));
                    console.log(`🔄 C-Client: nsnSessionData exists:`, !!nsnSessionData);
                    console.log(`🔄 C-Client: nsnSessionData.loggedin:`, nsnSessionData ? nsnSessionData.loggedin : 'UNDEFINED');
                    console.log(`🔄 C-Client: nsnSessionData.user_id:`, nsnSessionData ? nsnSessionData.user_id : 'UNDEFINED');
                    console.log(`🔄 C-Client: nsnSessionData.username:`, nsnSessionData ? nsnSessionData.username : 'UNDEFINED');
                    console.log(`🔄 C-Client: nsnSessionData.role:`, nsnSessionData ? nsnSessionData.role : 'UNDEFINED');
                    console.log(`🔄 C-Client: ===== END SESSION DATA PARSING ANALYSIS =====`);

                    if (nsnSessionData && nsnSessionData.loggedin) {
                        console.log(`🔄 C-Client: Using complete session data for login:`, {
                            loggedin: nsnSessionData.loggedin,
                            user_id: nsnSessionData.user_id,
                            username: nsnSessionData.username,
                            role: nsnSessionData.role,
                            nmp_user_id: user_id
                        });

                        try {
                            // Get the current view's session
                            let targetSession = null;
                            if (this.tabManager) {
                                const currentTab = this.tabManager.getCurrentTab();
                                const currentView = currentTab ? currentTab.browserView : null;
                                if (currentView && currentView.webContents) {
                                    targetSession = currentView.webContents.session;
                                    console.log(`🔄 C-Client: Using current view's session for cookie setting`);
                                }
                            }

                            // Fallback to main window session if no current view
                            if (!targetSession) {
                                targetSession = this.mainWindow.webContents.session;
                                console.log(`🔄 C-Client: Using main window's session for cookie setting`);
                            }

                            // Get NSN URL from this specific session's B-Client
                            let cookieUrl;
                            if (nsn_url) {
                                cookieUrl = nsn_url;
                                console.log(`🔄 C-Client: Using NSN URL from originating B-Client for user ${username}: ${cookieUrl}`);
                            } else {
                                // Fallback: if no NSN URL provided, we cannot proceed safely
                                console.error(`❌ C-Client: No NSN URL provided from B-Client for user ${username}, cannot set cookie`);
                                return false;
                            }

                            // Get NSN user info from session data (needed for session cookie)
                            const nsnUserId = complete_session_data.nsn_user_id;
                            const nsnUsername = complete_session_data.nsn_username;
                            const nsnRole = complete_session_data.nsn_role;

                            // Use the original session cookie from B-Client if available
                            // This ensures we use the exact same cookie format that works for manual access
                            let sessionCookieToUse = null;

                            // Check if we have the original cookie from B-Client
                            if (cookie && cookie.includes('session=')) {
                                // Extract the session cookie value from the cookie string
                                const sessionMatch = cookie.match(/session=([^;]+)/);
                                if (sessionMatch) {
                                    const originalCookie = sessionMatch[1];
                                    console.log(`🔄 C-Client: Found original B-Client session cookie: ${originalCookie.substring(0, 50)}...`);

                                    // Use JSON format directly (not Flask session format)
                                    try {
                                        // Try to parse as JSON first (new format)
                                        const sessionData = JSON.parse(originalCookie);
                                        console.log(`🔄 C-Client: Original cookie is JSON format, adding NMP parameters`);

                                        // Add NMP parameters to the original session data
                                        const updatedSessionData = {
                                            ...sessionData,
                                            nmp_user_id: user_id,      // C-Client user ID
                                            nmp_username: username,    // C-Client username
                                            nmp_client_type: 'c-client',  // Hardcoded as requested
                                            nmp_timestamp: Date.now().toString()  // Current timestamp
                                        };

                                        // Use JSON format directly
                                        sessionCookieToUse = JSON.stringify(updatedSessionData);
                                        console.log(`🔄 C-Client: Updated original JSON cookie with NMP parameters`);
                                    } catch (jsonError) {
                                        // If JSON parsing fails, try Flask format (legacy)
                                        try {
                                            const cookieParts = originalCookie.split('.');
                                            if (cookieParts.length >= 1) {
                                                const decodedData = Buffer.from(cookieParts[0], 'base64').toString('utf-8');
                                                const sessionData = JSON.parse(decodedData);

                                                // Add NMP parameters to the original session data
                                                const updatedSessionData = {
                                                    ...sessionData,
                                                    nmp_user_id: user_id,      // C-Client user ID
                                                    nmp_username: username,    // C-Client username
                                                    nmp_client_type: 'c-client',  // Hardcoded as requested
                                                    nmp_timestamp: Date.now().toString()  // Current timestamp
                                                };

                                                // Use JSON format (convert from Flask format)
                                                sessionCookieToUse = JSON.stringify(updatedSessionData);
                                                console.log(`🔄 C-Client: Converted Flask cookie to JSON with NMP parameters`);
                                            } else {
                                                // Fallback to original cookie if parsing fails
                                                sessionCookieToUse = originalCookie;
                                                console.log(`🔄 C-Client: Using original cookie as fallback`);
                                            }
                                        } catch (error) {
                                            // Fallback to original cookie if parsing fails
                                            sessionCookieToUse = originalCookie;
                                            console.log(`🔄 C-Client: Error parsing original cookie, using as-is: ${error.message}`);
                                        }
                                    }
                                }
                            }

                            // If no original cookie, create one with NSN session data
                            if (!sessionCookieToUse) {
                                console.log(`🔄 C-Client: No original cookie, creating new one with NSN session data`);
                                console.log(`🔄 C-Client: Using session data from B-Client:`, {
                                    loggedin: nsnSessionData.loggedin,
                                    user_id: nsnSessionData.user_id,
                                    username: nsnSessionData.username,
                                    role: nsnSessionData.role
                                });

                                // Create session data with correct NSN user_id from complete_session_data
                                // Also include NMP parameters for logout functionality
                                const sessionDataToUse = {
                                    ...nsnSessionData,
                                    user_id: nsnUserId,    // Use NSN user_id from complete_session_data
                                    username: nsnUsername, // Use NSN username from complete_session_data
                                    role: nsnRole,         // Use NSN role from complete_session_data
                                    // Include NMP parameters for logout functionality
                                    nmp_user_id: user_id,      // C-Client user ID
                                    nmp_username: username,    // C-Client username
                                    nmp_client_type: 'c-client',  // Hardcoded as requested
                                    nmp_timestamp: Date.now().toString()  // Current timestamp
                                };

                                // Use JSON format directly (not Flask session format)
                                sessionCookieToUse = JSON.stringify(sessionDataToUse);

                                console.log(`🔄 C-Client: Created new session cookie: ${sessionCookieToUse.substring(0, 50)}...`);
                            }

                            console.log(`🔄 C-Client: ===== COOKIE SETTING START =====`);
                            console.log(`🔄 C-Client: Target URL: ${cookieUrl}`);
                            console.log(`🔄 C-Client: C-Client User ID (UUID): ${user_id}`);
                            console.log(`🔄 C-Client: Using session cookie: ${sessionCookieToUse.substring(0, 50)}...`);
                            console.log(`🔄 C-Client: Setting JSON session cookie...`);

                            await targetSession.cookies.set({
                                url: cookieUrl,
                                name: 'session',
                                value: sessionCookieToUse,
                                domain: 'localhost',
                                path: '/',
                                httpOnly: true,
                                secure: false,
                                sameSite: 'lax'
                            });

                            console.log(`🔄 C-Client: Session cookie set successfully`);

                            // Also set additional cookies that NSN might need for session
                            // These cookies are from NSN's own session data, not exposed sensitive info
                            if (nsnUserId) {
                                console.log(`🔄 C-Client: Setting user_id cookie: ${nsnUserId}`);
                                await targetSession.cookies.set({
                                    url: cookieUrl,
                                    name: 'user_id',
                                    value: nsnUserId.toString(), // Ensure it's a string
                                    domain: 'localhost',
                                    path: '/',
                                    httpOnly: true,
                                    secure: false,
                                    sameSite: 'lax'
                                });
                                console.log(`🔄 C-Client: user_id cookie set successfully`);
                            }

                            if (nsnUsername) {
                                console.log(`🔄 C-Client: Setting username cookie: ${nsnUsername}`);
                                await targetSession.cookies.set({
                                    url: cookieUrl,
                                    name: 'username',
                                    value: nsnUsername,
                                    domain: 'localhost',
                                    path: '/',
                                    httpOnly: true,
                                    secure: false,
                                    sameSite: 'lax'
                                });
                                console.log(`🔄 C-Client: username cookie set successfully`);
                            }

                            if (nsnRole) {
                                console.log(`🔄 C-Client: Setting role cookie: ${nsnRole}`);
                                await targetSession.cookies.set({
                                    url: cookieUrl,
                                    name: 'role',
                                    value: nsnRole,
                                    domain: 'localhost',
                                    path: '/',
                                    httpOnly: true,
                                    secure: false,
                                    sameSite: 'lax'
                                });
                                console.log(`🔄 C-Client: role cookie set successfully`);
                            }

                            console.log(`🔄 C-Client: All cookies set successfully for NSN session`);

                            // Close any open registration dialog
                            console.log(`🔄 C-Client: Closing user registration dialog after successful registration`);
                            this.closeUserRegistrationDialog();

                            // Wait for cookies to be fully set before navigating
                            console.log(`🔄 C-Client: Waiting for cookies to be fully set...`);

                            // Verify cookies are set by checking them
                            let cookiesSet = false;
                            let retryCount = 0;
                            const maxRetries = 5;

                            while (!cookiesSet && retryCount < maxRetries) {
                                try {
                                    console.log(`🔄 C-Client: Checking cookies (attempt ${retryCount + 1}/${maxRetries})...`);
                                    const cookies = await targetSession.cookies.get({ url: cookieUrl });
                                    console.log(`🔄 C-Client: Found ${cookies.length} cookies for ${cookieUrl}:`, cookies.map(c => `${c.name}=${c.value.substring(0, 20)}...`));

                                    const sessionCookie = cookies.find(c => c.name === 'session');
                                    const userIdCookie = cookies.find(c => c.name === 'user_id');
                                    const usernameCookie = cookies.find(c => c.name === 'username');
                                    const roleCookie = cookies.find(c => c.name === 'role');

                                    console.log(`🔄 C-Client: Cookie status:`, {
                                        session: !!sessionCookie,
                                        user_id: !!userIdCookie,
                                        username: !!usernameCookie,
                                        role: !!roleCookie
                                    });

                                    if (sessionCookie && sessionCookie.value) {
                                        console.log(`🔄 C-Client: Session cookie verified: ${sessionCookie.value.substring(0, 50)}...`);
                                        console.log(`🔄 C-Client: Full session cookie value:`, sessionCookie.value);
                                        cookiesSet = true;
                                    } else {
                                        console.log(`🔄 C-Client: Session cookie not found or empty, retrying... (${retryCount + 1}/${maxRetries})`);
                                        await new Promise(resolve => setTimeout(resolve, 50)); // Wait 50ms
                                        retryCount++;
                                    }
                                } catch (error) {
                                    console.log(`🔄 C-Client: Error checking cookies: ${error.message}`);
                                    await new Promise(resolve => setTimeout(resolve, 50));
                                    retryCount++;
                                }
                            }

                            if (!cookiesSet) {
                                console.log(`⚠️ C-Client: Cookies verification failed after ${maxRetries} retries, proceeding anyway`);
                            }

                            // Navigate to NSN root path to trigger auto-login with the new cookies
                            if (this.tabManager) {
                                console.log(`🔄 C-Client: ===== NAVIGATION START =====`);
                                console.log(`🔄 C-Client: Navigating to NSN root path to trigger auto-login`);
                                const currentTab = this.tabManager.getCurrentTab();
                                const currentView = currentTab ? currentTab.browserView : null;
                                if (currentView && currentView.webContents) {
                                    // Get current local user info for NMP parameters (security: use local user info, not B-Client data)
                                    const localUserInfo = await this.tabManager.getCurrentUserInfo();
                                    if (!localUserInfo) {
                                        console.error(`❌ C-Client: Cannot get current local user info for NMP parameters`);
                                        return false;
                                    }

                                    console.log(`🔄 C-Client: Using local user info for NMP parameters:`, {
                                        local_user_id: localUserInfo.user_id,
                                        local_username: localUserInfo.username
                                    });

                                    // Navigate to NSN root path to trigger auto-login with NMP parameters
                                    const nmpParams = new URLSearchParams({
                                        nmp_user_id: localUserInfo.user_id,  // Use local user ID
                                        nmp_username: localUserInfo.username,  // Use local username
                                        nmp_client_type: 'c-client',  // Hardcoded as requested
                                        nmp_timestamp: Date.now().toString(),  // Current timestamp
                                        nmp_bind: 'true',
                                        nmp_bind_type: 'bind',
                                        nmp_auto_refresh: 'true',
                                        nmp_injected: 'true',
                                        nmp_cookie_reload: 'true'  // Add flag to prevent infinite loop
                                    });
                                    // Get NSN URL from this specific session's originating B-Client
                                    let nsnBaseUrl;
                                    if (nsn_url) {
                                        nsnBaseUrl = nsn_url;
                                        console.log(`🔄 C-Client: Using NSN URL from originating B-Client for user ${username} navigation: ${nsnBaseUrl}`);
                                    } else {
                                        // Fallback: if no NSN URL provided, we cannot proceed safely
                                        console.error(`❌ C-Client: No NSN URL provided from B-Client for user ${username}, cannot navigate`);
                                        return false;
                                    }
                                    const nsnUrl = `${nsnBaseUrl}/?${nmpParams.toString()}`;
                                    console.log(`🔄 C-Client: Loading NSN URL with local NMP parameters: ${nsnUrl}`);

                                    // Add page load event listener to check cookies after page loads
                                    const checkCookiesAfterLoad = async () => {
                                        try {
                                            console.log(`🔄 C-Client: ===== POST-LOAD COOKIE CHECK =====`);
                                            const cookies = await currentView.webContents.session.cookies.get({ url: nsnUrl });
                                            console.log(`🔄 C-Client: Cookies after page load:`, cookies.map(c => `${c.name}=${c.value.substring(0, 30)}...`));

                                            // Check if NSN received the cookies
                                            const sessionCookie = cookies.find(c => c.name === 'session');
                                            if (sessionCookie) {
                                                console.log(`🔄 C-Client: NSN received session cookie:`, sessionCookie.value);
                                            } else {
                                                console.log(`⚠️ C-Client: NSN did not receive session cookie!`);
                                            }
                                        } catch (error) {
                                            console.error(`❌ C-Client: Error checking cookies after page load:`, error);
                                        }
                                    };

                                    // Check cookies after page finishes loading
                                    currentView.webContents.once('did-finish-load', checkCookiesAfterLoad);

                                    currentView.webContents.loadURL(nsnUrl);
                                }
                            } else {
                                console.log(`🔄 C-Client: No current view to navigate, session cookies are set`);
                            }
                        } catch (error) {
                            console.error(`❌ C-Client: Error setting session cookies:`, error);
                            console.error(`❌ C-Client: Cannot proceed without valid session cookies`);
                        }
                    } else {
                        console.log(`❌ C-Client: No valid NSN session data found in complete session data`);
                        console.log(`❌ C-Client: nsnSessionData:`, nsnSessionData);
                    }
                }
            } else {
                console.log(`❌ C-Client: No complete session data available, cannot proceed with login`);
                console.log(`❌ C-Client: Expected complete_session_data with nsn_session_data`);
            }

        } catch (error) {
            console.error(`❌ C-Client: Error handling cookie reload:`, error);
        }
    }

    async handleNavigateToNSN(navigationData) {
        try {
            console.log(`🧭 C-Client: ===== HANDLING NAVIGATE TO NSN =====`);
            console.log(`🧭 C-Client: Navigation request for user: ${navigationData.username} (${navigationData.user_id})`);
            console.log(`🧭 C-Client: URL: ${navigationData.url}`);

            if (!navigationData.url) {
                console.error(`❌ C-Client: No URL provided in navigation data`);
                return false;
            }

            // Navigate to the NSN URL with NMP parameters
            if (this.tabManager && this.tabManager.navigateTo) {
                console.log(`🧭 C-Client: Navigating to NSN URL with NMP parameters`);
                await this.tabManager.navigateTo(navigationData.url);
                console.log(`✅ C-Client: Successfully navigated to NSN with NMP parameters`);
                return true;
            } else {
                console.error(`❌ C-Client: TabManager not available for navigation`);
                return false;
            }

        } catch (error) {
            console.error(`❌ C-Client: Error handling navigate to NSN:`, error);
            return false;
        }
    }

    async handleUserLogout(logoutData) {
        try {
            console.log(`🔓 C-Client: Handling logout for user: ${logoutData.username}`);
            const { user_id, username } = logoutData;

            // Get all tabs/views and clear their sessions
            let viewsToClear = [];
            if (this.tabManager) {
                // Use TabManager to get all tabs
                const allTabs = this.tabManager.getAllTabs();
                viewsToClear = allTabs.map(tab => ({
                    id: tab.id,
                    view: tab.browserView
                }));
                console.log(`🔓 C-Client: Found ${viewsToClear.length} tabs to clear (using TabManager)`);
            }

            for (const { id, view } of viewsToClear) {
                if (view && view.webContents && !view.webContents.isDestroyed()) {
                    try {
                        console.log(`🔓 C-Client: Clearing session for tab/view ${id}`);

                        // Clear all storage data for this view
                        await view.webContents.session.clearStorageData({
                            storages: ['cookies', 'localStorage', 'sessionStorage', 'indexeddb', 'websql', 'cache']
                        });

                        // Navigate to a neutral page or refresh
                        const currentUrl = view.webContents.getURL();
                        // Get NSN URL from configuration for comparison and navigation
                        const apiConfig = require('./config/apiConfig');
                        const nsnConfig = apiConfig.getCurrentNsnWebsite();
                        const nsnDomain = nsnConfig.domain;
                        const nsnUrl = nsnConfig.url || apiConfig.getNsnUrl();

                        if (currentUrl && (currentUrl.includes(nsnUrl) || currentUrl.includes(nsnDomain))) {
                            console.log(`🔓 C-Client: Navigating to NSN homepage for view ${viewId}`);
                            // Use navigation method to ensure URL parameter injection
                            if (this.viewOperations) {
                                await this.viewOperations.navigateTo(`${nsnConfig.url}/`);
                            } else {
                                await view.webContents.loadURL(`${nsnConfig.url}/`);
                            }
                        }

                        console.log(`🔓 C-Client: Successfully cleared session for view ${viewId}`);
                    } catch (error) {
                        console.error(`❌ C-Client: Error clearing session for view ${viewId}:`, error);
                    }
                }
            }

            console.log(`🔓 C-Client: Logout completed for user ${username}`);

        } catch (error) {
            console.error(`❌ C-Client: Error handling user logout:`, error);
        }
    }

    async safeQuit() {
        await this.cleanup();
        app.quit();
    }

    /**
     * Initialize SyncManager for user activity synchronization
     */
    async initializeSyncManager() {
        try {
            const SyncManager = require('./syncManager/syncManager');

            // Initialize SyncManager with main window and database instance
            const database = require('./sqlite/database');
            this.syncManager = new SyncManager(this, database);

            // Set main window reference for SyncManager
            if (this.webSocketClient) {
                this.webSocketClient.setMainWindow(this);
            }

            console.log('✅ SyncManager initialized successfully');

        } catch (error) {
            console.error('❌ Failed to initialize SyncManager:', error);
            throw error;
        }
    }

    /**
     * Start sync for current user
     * @param {string} userId - Current user ID
     */
    startSyncForUser(userId) {
        if (this.syncManager) {
            console.log(`🔄 Starting sync for user: ${userId}`);
            this.syncManager.startSync(userId);
        } else {
            console.warn('⚠️ SyncManager not initialized, cannot start sync');
        }
    }

    /**
     * Stop sync for current user
     */
    stopSyncForUser() {
        if (this.syncManager) {
            console.log('🔄 Stopping sync for current user');
            this.syncManager.stopSync();
        } else {
            console.warn('⚠️ SyncManager not initialized, cannot stop sync');
        }
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
// Add command line switches to fix cache and GPU issues
app.commandLine.appendSwitch('--disable-gpu-sandbox');
app.commandLine.appendSwitch('--disable-software-rasterizer');
app.commandLine.appendSwitch('--disable-gpu');
app.commandLine.appendSwitch('--no-sandbox');
app.commandLine.appendSwitch('--disable-web-security');
app.commandLine.appendSwitch('--disable-features', 'VizDisplayCompositor');

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