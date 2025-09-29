// Unified Client Switch Manager
const path = require('path');

class ClientSwitchManager {
    constructor() {
        this.bClientApiServer = null;
    }

    /**
     * Unified client switch handler
     * This method should be used by both C-Client and B-Client
     */
    async handleClientSwitch(targetClient, context) {
        const { mainWindow, viewManager, historyManager, clientManager, ipcHandlers, startupValidator } = context;

        try {
            console.log(`🔄 ClientSwitchManager: Switching to ${targetClient}`);

            // Update client manager state first
            if (clientManager) {
                clientManager.currentClient = targetClient;
                clientManager.saveClientConfig();
                console.log(`🔄 ClientSwitchManager: Updated client manager state to ${targetClient}`);
            }

            // Update window title
            if (mainWindow && !mainWindow.isDestroyed()) {
                const displayName = targetClient === 'c-client' ? 'Consumer Client' : 'Enterprise Client';
                mainWindow.setTitle(displayName);
            }

            // Note: BrowserView management is handled by individual client IPC handlers
            // The ClientSwitchManager should not directly manage browser views

            // Clean up current IPC handlers
            if (ipcHandlers) {
                try {
                    ipcHandlers.cleanup();
                    console.log('IPC handlers cleaned up');
                } catch (error) {
                    console.error('Error cleaning up IPC handlers:', error);
                }
            }

            // Wait longer to ensure cleanup is complete
            await new Promise(resolve => setTimeout(resolve, 500));

            // Initialize new IPC handlers based on client type
            if (targetClient === 'b-client') {
                console.log('🔄 ClientSwitchManager: Initializing B-Client IPC handlers');

                // Set B-Client environment configuration before starting API server
                if (!process.env.B_CLIENT_ENVIRONMENT) {
                    process.env.B_CLIENT_ENVIRONMENT = 'local'; // Default to local for development
                    console.log('🔄 ClientSwitchManager: Set B-Client environment to local');
                } else {
                    console.log(`🔄 ClientSwitchManager: Using B-Client environment: ${process.env.B_CLIENT_ENVIRONMENT}`);
                }

                // Update apiConfig with current environment
                const apiConfig = require('../discard-b/config/apiConfig');
                apiConfig.setCurrentEnvironment(process.env.B_CLIENT_ENVIRONMENT);
                console.log(`🔄 ClientSwitchManager: Updated apiConfig environment to: ${apiConfig.currentEnvironment}`);

                // Start B-Client API server if not already running
                if (!this.bClientApiServer) {
                    const ApiServer = require('../discard-b/api/apiServer');
                    this.bClientApiServer = new ApiServer(3000);
                    await this.bClientApiServer.start();
                    console.log('B-Client API server started for client switch');
                }

                // Create B-Client's own user manager
                const BClientUserManager = require('../discard-b/userManagement/bClientUserManager');
                const bClientUserManager = new BClientUserManager();
                await bClientUserManager.initialize();

                // Create B-Client's own window manager
                const BClientWindowManager = require('../discard-b/window/bClientWindowManager');
                const bClientWindowManager = new BClientWindowManager(bClientUserManager, clientManager);
                bClientWindowManager.mainWindow = mainWindow; // Set the main window reference
                bClientWindowManager.sendToWindow = (channel, data) => {
                    if (mainWindow && !mainWindow.isDestroyed()) {
                        mainWindow.webContents.send(channel, data);
                    }
                };

                // Create B-Client's own view manager with correct window manager
                const BClientViewManager = require('../discard-b/window/bClientViewManager');
                const bClientViewManager = new BClientViewManager(bClientWindowManager, bClientUserManager);

                const BClientIpcHandlers = require('../discard-b/ipc/bClientIpcHandlers');
                const newIpcHandlers = new BClientIpcHandlers(bClientViewManager, bClientUserManager, mainWindow, clientManager, context.mainApp);
                console.log('🔄 ClientSwitchManager: B-Client IPC handlers initialized');

                // Load B-Client interface
                if (mainWindow && !mainWindow.isDestroyed()) {
                    const dashboardPath = path.join(__dirname, '../discard-b/pages/dashboard.html');
                    mainWindow.loadFile(dashboardPath);
                    console.log('🔄 ClientSwitchManager: B-Client interface loaded');
                }

                return newIpcHandlers;

            } else if (targetClient === 'c-client') {
                console.log('🔄 ClientSwitchManager: Initializing C-Client IPC handlers');

                // Set C-Client environment configuration
                if (!process.env.C_CLIENT_ENVIRONMENT) {
                    process.env.C_CLIENT_ENVIRONMENT = 'local'; // Default to local for development
                    console.log('🔄 ClientSwitchManager: Set C-Client environment to local');
                } else {
                    console.log(`🔄 ClientSwitchManager: Using C-Client environment: ${process.env.C_CLIENT_ENVIRONMENT}`);
                }

                // Update C-Client apiConfig with current environment
                const cClientApiConfig = require('../c-client/config/apiConfig');
                cClientApiConfig.setCurrentEnvironment(process.env.C_CLIENT_ENVIRONMENT);
                console.log(`🔄 ClientSwitchManager: Updated C-Client apiConfig environment to: ${cClientApiConfig.currentEnvironment}`);

                // Stop B-Client API server when switching back to C-Client
                if (this.bClientApiServer) {
                    await this.bClientApiServer.stop();
                    this.bClientApiServer = null;
                    console.log('B-Client API server stopped for client switch');
                }

                // Create C-Client's own history manager
                const CClientHistoryManager = require('../c-client/history/historyManager');
                const cClientHistoryManager = new CClientHistoryManager();
                await cClientHistoryManager.initialize();

                // Create C-Client's own window manager
                const CClientWindowManager = require('../c-client/window/windowManager');
                const cClientWindowManager = new CClientWindowManager(cClientHistoryManager, clientManager);
                cClientWindowManager.mainWindow = mainWindow; // Set the main window reference
                cClientWindowManager.sendToWindow = (channel, data) => {
                    if (mainWindow && !mainWindow.isDestroyed()) {
                        mainWindow.webContents.send(channel, data);
                    }
                };

                // Create C-Client's own view manager with correct window manager
                const CClientViewManager = require('../c-client/window/viewManager');
                const cClientViewManager = new CClientViewManager(cClientWindowManager, cClientHistoryManager);

                const CClientIpcHandlers = require('../c-client/ipc/ipcHandlers');
                // Node management functionality removed
                const newIpcHandlers = new CClientIpcHandlers(cClientViewManager, cClientHistoryManager, mainWindow, clientManager, null);
                console.log('🔄 ClientSwitchManager: C-Client IPC handlers initialized');

                // Load C-Client interface using WindowManager
                if (mainWindow && !mainWindow.isDestroyed()) {
                    // Update webPreferences for C-Client
                    const cClientPreloadPath = path.join(__dirname, '../c-client/pages/preload.js');
                    mainWindow.webContents.session.setPreloads([cClientPreloadPath]);

                    cClientWindowManager.loadClientInterface();
                    console.log('🔄 ClientSwitchManager: C-Client interface loaded');

                    // Wait for page to load and then trigger C-Client initialization
                    mainWindow.webContents.once('did-finish-load', () => {
                        console.log('🔄 ClientSwitchManager: C-Client page finished loading');

                        // Trigger init-tab event to create initial tab
                        setTimeout(() => {
                            if (mainWindow && !mainWindow.isDestroyed()) {
                                mainWindow.webContents.send('init-tab');
                                console.log('🔄 ClientSwitchManager: Sent init-tab event to C-Client');
                            }
                        }, 500);

                        // Skip user registration check during client switch
                        // Only show greeting dialog if we have a valid current user
                        setTimeout(async () => {
                            try {
                                // Check if there's a current user before showing greeting
                                const db = require('../c-client/sqlite/database');
                                const currentUser = db.prepare('SELECT username FROM local_users WHERE is_current = 1').get();

                                if (currentUser && currentUser.username) {
                                    const UserRegistrationDialog = require('../c-client/userManager/userRegistrationDialog');
                                    const userRegistrationDialog = new UserRegistrationDialog();

                                    if (mainWindow && !mainWindow.isDestroyed()) {
                                        await userRegistrationDialog.showGreeting(mainWindow);
                                    }
                                } else {
                                    console.log('🔄 ClientSwitchManager: No current user found, skipping greeting dialog');
                                }
                            } catch (greetingError) {
                                console.error('Error showing greeting dialog for existing user:', greetingError);
                            }
                        }, 1500);
                    });
                }

                return newIpcHandlers;
            }

        } catch (error) {
            console.error(`❌ ClientSwitchManager: Failed to switch to ${targetClient}:`, error);
            throw error;
        }
    }

    /**
     * Cleanup resources
     */
    async cleanup() {
        if (this.bClientApiServer) {
            await this.bClientApiServer.stop();
            this.bClientApiServer = null;
            console.log('ClientSwitchManager: B-Client API server stopped during cleanup');
        }
    }
}

module.exports = ClientSwitchManager;
