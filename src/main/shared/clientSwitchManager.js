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
                } catch (error) {
                    console.error('Error cleaning up IPC handlers:', error);
                }
            }

            // Wait a bit to ensure cleanup is complete
            await new Promise(resolve => setTimeout(resolve, 100));

            // Initialize new IPC handlers based on client type
            if (targetClient === 'b-client') {
                console.log('🔄 ClientSwitchManager: Initializing B-Client IPC handlers');

                // Start B-Client API server if not already running
                if (!this.bClientApiServer) {
                    const ApiServer = require('../b-client/api/apiServer');
                    this.bClientApiServer = new ApiServer(3000);
                    await this.bClientApiServer.start();
                    console.log('B-Client API server started for client switch');
                }

                const BClientIpcHandlers = require('../b-client/ipc/ipcHandlers');
                const newIpcHandlers = new BClientIpcHandlers(viewManager, historyManager, mainWindow, clientManager, context.mainApp);
                console.log('🔄 ClientSwitchManager: B-Client IPC handlers initialized');

                // Load B-Client interface
                if (mainWindow && !mainWindow.isDestroyed()) {
                    const dashboardPath = path.join(__dirname, '../b-client/pages/dashboard.html');
                    mainWindow.loadFile(dashboardPath);
                    console.log('🔄 ClientSwitchManager: B-Client interface loaded');
                }

                return newIpcHandlers;

            } else if (targetClient === 'c-client') {
                console.log('🔄 ClientSwitchManager: Initializing C-Client IPC handlers');

                // Stop B-Client API server when switching back to C-Client
                if (this.bClientApiServer) {
                    await this.bClientApiServer.stop();
                    this.bClientApiServer = null;
                    console.log('B-Client API server stopped for client switch');
                }

                const CClientIpcHandlers = require('../c-client/ipc/ipcHandlers');
                const newIpcHandlers = new CClientIpcHandlers(viewManager, historyManager, mainWindow, clientManager, startupValidator?.nodeManager);
                console.log('🔄 ClientSwitchManager: C-Client IPC handlers initialized');

                // Load C-Client interface
                if (mainWindow && !mainWindow.isDestroyed()) {
                    const cClientPath = path.join(__dirname, '../c-client/pages/index.html');
                    mainWindow.loadFile(cClientPath);
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

                        // Check if user registration is needed for C-Client
                        setTimeout(async () => {
                            try {
                                if (startupValidator?.nodeManager) {
                                    const registrationResult = await startupValidator.nodeManager.registerNewUserIfNeeded(mainWindow);
                                    if (registrationResult) {
                                        // New user registration dialog was shown
                                    } else {
                                        // For existing users, show greeting dialog only if we have a valid current user
                                        try {
                                            // Check if there's a current user before showing greeting
                                            const db = require('../c-client/sqlite/database');
                                            const currentUser = db.prepare('SELECT username FROM local_users WHERE is_current = 1').get();

                                            if (currentUser && currentUser.username) {
                                                const UserRegistrationDialog = require('../c-client/nodeManager/userRegistrationDialog');
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
                                    }
                                }
                            } catch (error) {
                                console.error('Error checking user registration after client switch:', error);
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
