const { app } = require('electron');
const path = require('path');
const fs = require('fs');

class ClientManager {
    constructor() {
        this.clientConfigFile = path.join(app.getPath('userData'), 'client-config.json');
        this.currentClient = this.getInitialClientType();
        this.loadClientConfig();
    }

    /**
     * Get current client type
     */
    getCurrentClient() {
        return this.currentClient;
    }

    /**
     * Get initial client type from command line args
     */
    getInitialClientType() {
        // Check environment variable first
        if (process.env.CLIENT_TYPE) {
            return process.env.CLIENT_TYPE;
        }

        // Check command line arguments
        const args = process.argv;
        if (args.includes('--b-client') || args.includes('--enterprise')) {
            return 'b-client';
        }
        if (args.includes('--c-client') || args.includes('--consumer')) {
            return 'c-client';
        }

        // Default to c-client
        return 'c-client';
    }

    /**
     * Load client configuration from file
     */
    loadClientConfig() {
        try {
            if (fs.existsSync(this.clientConfigFile)) {
                const config = JSON.parse(fs.readFileSync(this.clientConfigFile, 'utf8'));
                const configClient = config.currentClient || 'c-client';
                // Don't override the current client type detected from command line args
                // Only use config for other settings if needed
            } else {
                // Create default config
                console.log(`📁 ClientManager: No config file found, creating default config for: ${this.currentClient}`);
                this.saveClientConfig();
            }
        } catch (error) {
            console.error('❌ ClientManager: Failed to load client configuration:', error);
            // Don't override currentClient on error, keep the one from command line args
        }
    }

    /**
     * Save client configuration to file
     */
    saveClientConfig() {
        try {
            const config = {
                currentClient: this.currentClient,
                lastUpdated: new Date().toISOString()
            };
            fs.writeFileSync(this.clientConfigFile, JSON.stringify(config, null, 2));
            console.log(`Client configuration saved: ${this.currentClient}`);
        } catch (error) {
            console.error('Failed to save client configuration:', error);
        }
    }

    /**
     * Switch to different client
     */
    switchClient(targetClient) {
        if (targetClient === this.currentClient) {
            return { success: true, message: `Already using ${targetClient}` };
        }

        if (!['c-client', 'b-client'].includes(targetClient)) {
            console.error(`ClientManager: Invalid client type: ${targetClient}`);
            return { success: false, error: 'Invalid client type' };
        }

        // Save target client configuration
        this.currentClient = targetClient;
        this.saveClientConfig();

        // Emit client switch event for other components to handle
        const { app } = require('electron');
        app.emit('client-switch', targetClient);

        return { success: true, message: `Switching to ${targetClient}` };
    }


    /**
     * Get the other client type
     */
    getOtherClient() {
        return this.currentClient === 'c-client' ? 'b-client' : 'c-client';
    }

    /**
     * Get previous client (for logging)
     */
    getPreviousClient() {
        return this.currentClient === 'c-client' ? 'b-client' : 'c-client';
    }

    /**
     * Check if current client is enterprise (b-client)
     */
    isEnterpriseClient() {
        return this.currentClient === 'b-client';
    }

    /**
     * Check if current client is consumer (c-client)
     */
    isConsumerClient() {
        return this.currentClient === 'c-client';
    }

    /**
     * Get client display name
     */
    getClientDisplayName() {
        return this.currentClient === 'b-client' ? 'Enterprise Client' : 'Consumer Client';
    }

    /**
     * Get client-specific database path
     */
    getClientDatabasePath() {
        if (this.isEnterpriseClient()) {
            return path.join(__dirname, 'b-client', 'sqlite', 'b_client_secure.db');
        } else {
            return path.join(__dirname, 'sqlite', 'secure.db');
        }
    }

    /**
     * Get client-specific constants
     */
    getClientConstants() {
        if (this.isEnterpriseClient()) {
            return require(path.join(__dirname, '..', 'b-client', 'config', 'constants'));
        } else {
            return require('./config/constants');
        }
    }

    /**
     * Get client-specific database module
     */
    getClientDatabase() {
        if (this.isEnterpriseClient()) {
            return require(path.join(__dirname, '..', 'b-client', 'sqlite', 'database'));
        } else {
            return require('./sqlite/database');
        }
    }

    /**
     * Get client-specific file utils
     */
    getClientFileUtils() {
        if (this.isEnterpriseClient()) {
            return require(path.join(__dirname, '..', 'b-client', 'utils', 'fileUtils'));
        } else {
            return require('./utils/fileUtils');
        }
    }

    /**
     * Get client-specific URL utils
     */
    getClientUrlUtils() {
        if (this.isEnterpriseClient()) {
            return require(path.join(__dirname, '..', 'b-client', 'utils', 'urlUtils'));
        } else {
            return require('./utils/urlUtils');
        }
    }

    /**
     * Get client-specific window title
     */
    getClientWindowTitle() {
        const baseTitle = 'NoMorePassword Browser';
        const clientName = this.getClientDisplayName();
        return `${baseTitle} - ${clientName}`;
    }

    /**
     * Get client-specific window configuration
     */
    getClientWindowConfig() {
        const constants = this.getClientConstants();
        return constants.WINDOW_CONFIG;
    }

    /**
     * Get client-specific blocked domains
     */
    getClientBlockedDomains() {
        const constants = this.getClientConstants();
        return constants.BLOCKED_DOMAINS;
    }

    /**
     * Get client-specific features
     */
    getClientFeatures() {
        const constants = this.getClientConstants();
        return constants.ENTERPRISE_FEATURES || {};
    }
}

module.exports = ClientManager;
