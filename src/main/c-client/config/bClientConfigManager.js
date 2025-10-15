const fs = require('fs');
const path = require('path');

class BClientConfigManager {
    constructor() {
        this.configPath = path.join(__dirname, '..', 'config.json');
        this.config = this.loadConfig();
    }

    loadConfig() {
        try {
            if (fs.existsSync(this.configPath)) {
                const configData = fs.readFileSync(this.configPath, 'utf8');
                return JSON.parse(configData);
            } else {
                return this.getDefaultConfig();
            }
        } catch (error) {
            console.error('[B-Client Config] Error loading config:', error);
            return this.getDefaultConfig();
        }
    }

    getDefaultConfig() {
        return {
            b_client_websocket: {
                enabled: true,
                host: "localhost",
                port: 8766,
                auto_reconnect: true,
                reconnect_interval: 30
            },
            b_client_environment: {
                current: "local",
                local: {
                    name: "Local B-Client",
                    host: "localhost",
                    port: 8766,
                    description: "Connect to local B-Client for development"
                },
                production: {
                    name: "Production B-Client",
                    host: "comp693nsnproject.pythonanywhere.com",
                    port: 8766,
                    description: "Connect to production B-Client server"
                }
            }
        };
    }

    saveConfig() {
        try {
            fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2));
            console.log('[B-Client Config] Configuration saved successfully');
            return true;
        } catch (error) {
            console.error('[B-Client Config] Error saving config:', error);
            return false;
        }
    }

    getCurrentEnvironment() {
        return this.config.b_client_environment?.current || 'local';
    }

    setCurrentEnvironment(environment) {
        if (!this.config.b_client_environment) {
            this.config.b_client_environment = {};
        }
        this.config.b_client_environment.current = environment;
        this.saveConfig();
    }

    getEnvironmentConfig(environment = null) {
        const env = environment || this.getCurrentEnvironment();
        return this.config.b_client_environment?.[env] || this.config.b_client_environment?.local;
    }

    getAvailableEnvironments() {
        const envs = this.config.b_client_environment || {};
        return Object.keys(envs).filter(key => key !== 'current');
    }

    getWebSocketConfig() {
        const currentEnv = this.getCurrentEnvironment();
        const envConfig = this.getEnvironmentConfig(currentEnv);
        const wsConfig = this.config.b_client_websocket || {};

        return {
            enabled: wsConfig.enabled !== false,
            host: envConfig?.host || 'localhost',
            port: envConfig?.port || 8766,
            auto_reconnect: wsConfig.auto_reconnect !== false,
            reconnect_interval: wsConfig.reconnect_interval || 30,
            environment: currentEnv,
            environment_name: envConfig?.name || `${currentEnv} B-Client`
        };
    }

    updateEnvironmentConfig(environment, config) {
        if (!this.config.b_client_environment) {
            this.config.b_client_environment = {};
        }
        this.config.b_client_environment[environment] = {
            ...this.config.b_client_environment[environment],
            ...config
        };
        this.saveConfig();
    }

    updateWebSocketConfig(config) {
        this.config.b_client_websocket = {
            ...this.config.b_client_websocket,
            ...config
        };
        this.saveConfig();
    }
}

module.exports = BClientConfigManager;
