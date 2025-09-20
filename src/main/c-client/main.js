const { app, globalShortcut, Menu } = require('electron');
const WindowManager = require('./window/windowManager');
const ViewManager = require('./window/viewManager');
const HistoryManager = require('./history/historyManager');
const IpcHandlers = require('./ipc/ipcHandlers');
const { StartupValidator } = require('./nodeManager');
const ClientManager = require('./clientManager');
const ClientSwitchManager = require('../shared/clientSwitchManager');
const DistributedNodeManager = require('./nodeManager/distributedNodeManager');
const DistributedApiClient = require('./api/distributedApiClient');
const DatabaseManager = require('./sqlite/databaseManager');
const PortManager = require('../utils/portManager');
const CClientApiServer = require('./api/cClientApiServer');

class ElectronApp {
    constructor() {
        // Get C-Client ID from environment variable or generate one
        this.clientId = process.env.C_CLIENT_ID || `c-client-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        this.portManager = new PortManager();
        this.clientPort = null; // Will be set during initialization

        this.clientManager = new ClientManager();
        this.historyManager = new HistoryManager();
        this.windowManager = new WindowManager(this.historyManager, this.clientManager);
        this.startupValidator = new StartupValidator();
        this.viewManager = null;
        this.ipcHandlers = null;
        this.mainWindow = null; // Initialize mainWindow property
        this.isInitialized = false;
        this.pendingTitleUpdates = new Map();
        this.clientSwitchManager = new ClientSwitchManager(); // Unified client switch manager

        // Distributed node management
        this.distributedNodeManager = null;
        this.distributedApiClient = null;
        this.databaseManager = DatabaseManager;

        // C-Client API server
        this.apiServer = null;
        this.reloadCheckInterval = null;

        console.log(`🚀 Starting C-Client: ${this.clientId} (port will be assigned during initialization)`);
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
    startApiServer() {
        try {
            // Use a different port for API server (clientPort + 1000)
            const apiPort = this.clientPort + 1000;
            this.apiServer = new CClientApiServer(apiPort, this.mainWindow);
            this.apiServer.start();
            console.log(`🌐 C-Client: API server started on port ${apiPort}`);

            // Start checking for reload requests
            this.startReloadChecker();
        } catch (error) {
            console.error('❌ C-Client: Failed to start API server:', error);
            // Don't fail initialization if API server fails to start
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

            // Initialize distributed node manager
            this.distributedNodeManager = new DistributedNodeManager(this.databaseManager, {
                heartbeatInterval: 30000,
                electionTimeout: 10000
            });

            // Initialize API client for B-Client communication
            this.distributedApiClient = new DistributedApiClient({
                bClientApiUrl: bClientConfig.url,
                timeout: 10000
            });

            // Register current c-client as a channel node
            const nodeInfo = {
                nodeType: 'channel',
                domainId: 'default-domain',
                clusterId: 'default-cluster',
                channelId: 'default-channel',
                username: this.clientId,
                ipAddress: '127.0.0.1',
                port: this.clientPort,
                capabilities: {
                    browser: true,
                    oauth: true,
                    history: true,
                    localUsers: true
                },
                metadata: {
                    version: '1.0.0',
                    platform: process.platform,
                    arch: process.arch,
                    type: 'c-client',
                    clientId: this.clientId,
                    port: this.clientPort
                }
            };

            // Register node locally
            const localResult = await this.distributedNodeManager.registerNode(nodeInfo);
            if (localResult.success) {
                console.log('✅ C-Client node registered locally:', localResult.nodeId);
            }

            // Check if there are existing domain nodes through B-Client
            console.log('🔍 Checking for existing domain nodes through B-Client...');
            const domainNodesResult = await this.distributedApiClient.getDomainNodes();

            if (domainNodesResult.success && domainNodesResult.data && domainNodesResult.data.length > 0) {
                console.log('🌐 Found existing domain nodes, connecting to domain system...');
                // There are existing domain nodes, connect to them
                // TODO: Implement connection to existing domain nodes
                console.log('📡 Domain nodes found:', domainNodesResult.data);
            } else {
                console.log('🏆 No existing domain nodes found, becoming main node for all levels...');

                // No existing domain nodes, become main node for all levels
                await this.distributedNodeManager.setMainNode('domain', localResult.nodeId);
                console.log('👑 Set as Domain Main Node');

                await this.distributedNodeManager.setMainNode('cluster', localResult.nodeId);
                console.log('👑 Set as Cluster Main Node');

                await this.distributedNodeManager.setMainNode('channel', localResult.nodeId);
                console.log('👑 Set as Channel Main Node');
            }

            // Note: Local user registration is handled by user registration dialog
            // No automatic user creation - users must register manually

            // C-Client communicates with B-Client through NSN, not directly
            // No direct registration with B-Client needed
            console.log('✅ C-Client ready for communication through NSN');

            // Setup event handlers
            this.setupDistributedNodeEventHandlers();

            console.log('✅ Distributed node management initialized');
        } catch (error) {
            console.error('❌ Error initializing distributed node management:', error);
        }
    }

    /**
     * Setup distributed node event handlers
     */
    setupDistributedNodeEventHandlers() {
        if (this.distributedNodeManager) {
            this.distributedNodeManager.on('mainNodeElected', (electionInfo) => {
                console.log('👑 Main node elected:', electionInfo);
                // Handle main node election
                this.handleMainNodeElection(electionInfo);
            });

            this.distributedNodeManager.on('mainNodeChanged', (messageData) => {
                console.log('📢 Main node changed notification received:', messageData);
                // Handle main node change notification
                this.handleMainNodeChanged(messageData);
            });

            this.distributedNodeManager.on('nodeOffline', (nodeId) => {
                console.log('⚠️ Node went offline:', nodeId);
                // Handle node going offline
                this.handleNodeOffline(nodeId);
            });

            this.distributedNodeManager.on('nodeOfflineNotification', (messageData) => {
                console.log('📢 Node offline notification received:', messageData);
                // Handle node offline notification
                this.handleNodeOfflineNotification(messageData);
            });

            this.distributedNodeManager.on('localUserRegistered', (userInfo) => {
                console.log('👤 Local user registered:', userInfo);
                // Handle local user registration
                this.handleLocalUserRegistered(userInfo);
            });
        }

        if (this.distributedApiClient) {
            this.distributedApiClient.on('channelRegistered', (registrationInfo) => {
                console.log('✅ Channel registration completed:', registrationInfo);
                // Handle channel registration completion
                this.handleChannelRegistration(registrationInfo);
            });
        }
    }

    /**
     * Handle main node election
     */
    handleMainNodeElection(electionInfo) {
        // Notify UI about main node election
        if (this.mainWindow && this.mainWindow.webContents) {
            this.mainWindow.webContents.send('main-node-elected', electionInfo);
        }
    }

    /**
     * Handle main node changed notification
     */
    handleMainNodeChanged(messageData) {
        // Notify UI about main node change
        if (this.mainWindow && this.mainWindow.webContents) {
            this.mainWindow.webContents.send('main-node-changed', messageData);
        }
    }

    /**
     * Handle node going offline
     */
    handleNodeOffline(nodeId) {
        // Notify UI about node going offline
        if (this.mainWindow && this.mainWindow.webContents) {
            this.mainWindow.webContents.send('node-offline', { nodeId });
        }
    }

    /**
     * Handle node offline notification
     */
    handleNodeOfflineNotification(messageData) {
        // Notify UI about node offline notification
        if (this.mainWindow && this.mainWindow.webContents) {
            this.mainWindow.webContents.send('node-offline-notification', messageData);
        }
    }

    /**
     * Handle local user registered
     */
    handleLocalUserRegistered(userInfo) {
        // Notify UI about local user registration
        if (this.mainWindow && this.mainWindow.webContents) {
            this.mainWindow.webContents.send('local-user-registered', userInfo);
        }
    }

    /**
     * Handle channel registration completion
     */
    handleChannelRegistration(registrationInfo) {
        // Notify UI about channel registration
        if (this.mainWindow && this.mainWindow.webContents) {
            this.mainWindow.webContents.send('channel-registered', registrationInfo);
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

            // Validate node status on startup
            console.log(`🔄 C-Client: Validating node status on startup...`);
            await this.startupValidator.validateOnStartup();

            // Create main window
            const mainWindow = this.windowManager.createWindow();
            this.mainWindow = mainWindow; // Store reference to main window

            // Wait for window to be ready
            await this.waitForWindowReady(mainWindow);

            // Start C-Client API server (after main window is ready)
            this.startApiServer();

            // Show the window
            mainWindow.show();

            // Calculate API port
            const apiPort = this.clientPort + 1000; // API port is clientPort + 1000

            // Create view manager
            this.viewManager = new ViewManager(this.windowManager, this.historyManager, apiPort);

            // Register IPC handlers
            this.ipcHandlers = new IpcHandlers(this.viewManager, this.historyManager, this.mainWindow, this.clientManager, this.distributedNodeManager, this.startupValidator, apiPort);

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

                // Cleaned up loading records
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

            // Cleaned up pending title updates
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
        app.on('window-all-closed', async () => {
            // Clear all sessions and login states
            if (this.windowManager && this.windowManager.viewManager) {
                try {
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
                    await this.windowManager.viewManager.clearAllSessions();
                } catch (error) {
                    console.error('❌ Error clearing sessions:', error);
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

    async cleanup() {
        if (!this.isInitialized) return;

        // Cleaning up application resources

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

            // Cleanup distributed node manager
            if (this.distributedNodeManager) {
                try {
                    console.log('🧹 Cleaning up distributed node manager...');
                    await this.distributedNodeManager.shutdown();
                    this.distributedNodeManager = null;
                    console.log('✅ Distributed node manager cleaned up');
                } catch (error) {
                    console.error('❌ Error cleaning up distributed node manager:', error);
                }
            }

            // Cleanup distributed API client
            if (this.distributedApiClient) {
                try {
                    console.log('🧹 Cleaning up distributed API client...');
                    await this.distributedApiClient.shutdown();
                    this.distributedApiClient = null;
                    console.log('✅ Distributed API client cleaned up');
                } catch (error) {
                    console.error('❌ Error cleaning up distributed API client:', error);
                }
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
            console.error('Error during cleanup:', error);
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
                console.log(`🔄 C-Client: Received cookie reload request for user: ${reloadData.username}`);
                this.handleCookieReload(reloadData);
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
     * Handle cookie reload with complete session data
     */
    async handleCookieReload(reloadData) {
        try {
            const { user_id, username, cookie, complete_session_data } = reloadData;
            console.log(`🔄 C-Client: Handling cookie reload for user: ${username}`);

            if (complete_session_data) {
                console.log(`🔄 C-Client: Using complete session data for login:`, {
                    nsn_user_id: complete_session_data.nsn_user_id,
                    nsn_username: complete_session_data.nsn_username,
                    nsn_role: complete_session_data.nsn_role,
                    has_nsn_session: !!complete_session_data.nsn_session_data
                });

                // Use complete session data to set up login state
                if (this.mainWindow && !this.mainWindow.isDestroyed()) {
                    console.log(`🔄 C-Client: Setting up session login using complete session data`);

                    // Use complete session data to set up login state
                    const nsnSessionData = complete_session_data.nsn_session_data;
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
                            if (this.viewManager && this.viewManager.currentViewId) {
                                const currentView = this.viewManager.views[this.viewManager.currentViewId];
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

                            const cookieUrl = 'http://localhost:5000'; // NSN URL

                            // Use the original Flask session cookie from B-Client if available
                            // This ensures we use the exact same cookie format that works for manual access
                            let sessionCookieToUse = null;

                            // Check if we have the original cookie from B-Client
                            if (cookie && cookie.includes('session=')) {
                                // Extract the session cookie value from the cookie string
                                const sessionMatch = cookie.match(/session=([^;]+)/);
                                if (sessionMatch) {
                                    sessionCookieToUse = sessionMatch[1];
                                    console.log(`🔄 C-Client: Using original B-Client session cookie: ${sessionCookieToUse.substring(0, 50)}...`);
                                }
                            }

                            // If no original cookie, create one with correct NSN user_id
                            if (!sessionCookieToUse) {
                                const nsnUserId = complete_session_data.nsn_user_id;
                                const nsnUsername = complete_session_data.nsn_username;
                                const nsnRole = complete_session_data.nsn_role;

                                console.log(`🔄 C-Client: No original cookie, creating new one with NSN data`);
                                console.log(`🔄 C-Client: NSN User ID (int): ${nsnUserId}`);
                                console.log(`🔄 C-Client: NSN Username: ${nsnUsername}`);
                                console.log(`🔄 C-Client: NSN Role: ${nsnRole}`);

                                // Create session data with correct NSN user_id
                                const correctedSessionData = {
                                    ...nsnSessionData,
                                    user_id: nsnUserId,
                                    username: nsnUsername,
                                    role: nsnRole
                                };

                                // Create Flask session cookie format (base64 encoded JSON)
                                const sessionJson = JSON.stringify(correctedSessionData);
                                const sessionBase64 = Buffer.from(sessionJson).toString('base64');
                                sessionCookieToUse = `${sessionBase64}.${Date.now()}.${Math.random().toString(36).substring(2)}`;

                                console.log(`🔄 C-Client: Created new session cookie: ${sessionCookieToUse.substring(0, 50)}...`);
                            }

                            console.log(`🔄 C-Client: ===== COOKIE SETTING START =====`);
                            console.log(`🔄 C-Client: Target URL: ${cookieUrl}`);
                            console.log(`🔄 C-Client: C-Client User ID (UUID): ${user_id}`);
                            console.log(`🔄 C-Client: Using session cookie: ${sessionCookieToUse.substring(0, 50)}...`);
                            console.log(`🔄 C-Client: Setting Flask session cookie...`);

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

                            console.log(`🔄 C-Client: Flask session cookie set successfully`);

                            // Also set additional cookies that NSN might need
                            // Get user info from complete_session_data
                            const nsnUserId = complete_session_data.nsn_user_id;
                            const nsnUsername = complete_session_data.nsn_username;
                            const nsnRole = complete_session_data.nsn_role;

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

                            console.log(`🔄 C-Client: Flask session cookies set successfully for user ${nsnUsername}`);

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
                                        await new Promise(resolve => setTimeout(resolve, 200)); // Wait 200ms
                                        retryCount++;
                                    }
                                } catch (error) {
                                    console.log(`🔄 C-Client: Error checking cookies: ${error.message}`);
                                    await new Promise(resolve => setTimeout(resolve, 200));
                                    retryCount++;
                                }
                            }

                            if (!cookiesSet) {
                                console.log(`⚠️ C-Client: Cookies verification failed after ${maxRetries} retries, proceeding anyway`);
                            }

                            // Navigate to NSN root path to trigger auto-login with the new cookies
                            if (this.viewManager && this.viewManager.currentViewId) {
                                console.log(`🔄 C-Client: ===== NAVIGATION START =====`);
                                console.log(`🔄 C-Client: Navigating to NSN root path to trigger auto-login`);
                                const currentView = this.viewManager.views[this.viewManager.currentViewId];
                                if (currentView && currentView.webContents) {
                                    // Navigate to NSN root path to trigger auto-login
                                    const nsnUrl = 'http://localhost:5000/';
                                    console.log(`🔄 C-Client: Loading NSN URL: ${nsnUrl}`);

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
                            console.error(`❌ C-Client: Error setting Flask session cookies:`, error);
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

    async safeQuit() {
        await this.cleanup();
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