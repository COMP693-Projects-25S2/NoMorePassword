const { app } = require('electron');
const path = require('path');
const fs = require('fs');

class ClientManager {
    constructor() {
        this.currentClient = 'b-client';
        this.clientConfigFile = path.join(app.getPath('userData'), 'b-client-config.json');
        this.loadClientConfig();
    }

    /**
     * Get current client type
     */
    getCurrentClient() {
        return this.currentClient;
    }

    /**
     * Load client configuration from file
     */
    loadClientConfig() {
        try {
            if (fs.existsSync(this.clientConfigFile)) {
                const configData = fs.readFileSync(this.clientConfigFile, 'utf8');
                const config = JSON.parse(configData);
                this.currentClient = config.clientType || 'b-client';
            }
        } catch (error) {
            console.error('Failed to load client config:', error);
            this.currentClient = 'b-client';
        }
    }

    /**
     * Save client configuration to file
     */
    saveClientConfig() {
        try {
            const config = {
                clientType: this.currentClient,
                lastUpdated: new Date().toISOString()
            };
            fs.writeFileSync(this.clientConfigFile, JSON.stringify(config, null, 2));
        } catch (error) {
            console.error('Failed to save client config:', error);
        }
    }

    /**
     * Switch to a different client
     */
    switchClient(newClient) {
        if (!['c-client', 'b-client'].includes(newClient)) {
            console.error(`B-Client: Invalid client type: ${newClient}`);
            return false;
        }

        if (newClient === this.currentClient) {
            console.log(`B-Client: Already using ${newClient}`);
            return true;
        }

        console.log(`B-Client: Switching from ${this.currentClient} to ${newClient}`);
        
        // Update current client
        this.currentClient = newClient;
        this.saveClientConfig();
        
        // Emit client switch event
        const { app } = require('electron');
        app.emit('client-switch', newClient);
        
        return true;
    }

    /**
     * Get client configuration
     */
    getClientConfig() {
        return {
            clientType: this.currentClient,
            configFile: this.clientConfigFile
        };
    }

    /**
     * Get client-specific window configuration
     */
    getClientWindowConfig() {
        return {
            width: 1200,
            height: 800,
            minWidth: 800,
            minHeight: 600,
            title: 'NoMorePassword - B-Client (Enterprise)',
            show: false,
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
                enableRemoteModule: false,
                preload: require('path').join(__dirname, 'pages', 'preload.js')
            }
        };
    }

    /**
     * Get client-specific constants
     */
    getClientConstants() {
        return {
            WINDOW_CONFIG: this.getClientWindowConfig(),
            BLOCKED_DOMAINS: [],
            ALLOWED_PROTOCOLS: ['http:', 'https:']
        };
    }

    /**
     * Check if current client is enterprise (b-client)
     */
    isEnterpriseClient() {
        return true;
    }

    /**
     * Check if current client is consumer (c-client)
     */
    isConsumerClient() {
        return false;
    }

    /**
     * Get client display name
     */
    getClientDisplayName() {
        return 'Enterprise Client';
    }

    /**
     * Get client window title
     */
    getClientWindowTitle() {
        return 'NoMorePassword - B-Client (Enterprise)';
    }
}

module.exports = ClientManager;
