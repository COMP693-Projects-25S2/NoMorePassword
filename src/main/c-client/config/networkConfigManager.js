// Network Configuration Manager for C-Client
// Handles switching between local and public IP modes

const fs = require('fs');
const path = require('path');
const DatabaseManager = require('../sqlite/databaseManager');

class NetworkConfigManager {
    constructor() {
        this.configPath = path.join(__dirname, '..', 'config.json');
        this.config = this.loadConfig();
    }

    // Load configuration from config.json
    loadConfig() {
        try {
            const configData = fs.readFileSync(this.configPath, 'utf8');
            const config = JSON.parse(configData);
            console.log('🔧 NetworkConfigManager: Loaded network configuration');
            return config;
        } catch (error) {
            console.log('🔧 NetworkConfigManager: Using default network configuration (config.json not found)');
            return {
                network: {
                    use_public_ip: false,
                    public_ip: '121.74.37.6',
                    local_ip: '127.0.0.1'
                }
            };
        }
    }

    // Save configuration to config.json
    saveConfig() {
        try {
            fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2));
            console.log('🔧 NetworkConfigManager: Configuration saved successfully');
            return true;
        } catch (error) {
            console.error('🔧 NetworkConfigManager: Error saving configuration:', error);
            return false;
        }
    }

    // Get current network mode
    getCurrentMode() {
        // Add null checks for network configuration
        if (!this.config || !this.config.network) {
            console.log('⚠️ NetworkConfigManager: Network config not available, using default local mode');
            return 'local';
        }

        return this.config.network.use_public_ip ? 'public' : 'local';
    }

    // Get current IP address based on configuration
    getCurrentIpAddress() {
        // Add null checks for network configuration
        if (!this.config || !this.config.network) {
            console.log('⚠️ NetworkConfigManager: Network config not available, using default local IP');
            return '127.0.0.1';
        }

        return this.config.network.use_public_ip ?
            this.config.network.public_ip :
            this.config.network.local_ip;
    }

    // Switch to local IP mode
    async switchToLocalMode() {
        try {
            console.log('🔄 NetworkConfigManager: Switching to local IP mode...');

            // Update configuration
            this.config.network.use_public_ip = false;
            this.saveConfig();

            // Update database
            await this.updateDatabaseIpAddresses();

            console.log('✅ NetworkConfigManager: Successfully switched to local IP mode');
            return {
                success: true,
                mode: 'local'
            };
        } catch (error) {
            console.error('❌ NetworkConfigManager: Error switching to local mode:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // Switch to public IP mode
    async switchToPublicMode() {
        try {
            console.log('🔄 NetworkConfigManager: Switching to public IP mode...');

            // Update configuration
            this.config.network.use_public_ip = true;
            this.saveConfig();

            // Update database
            await this.updateDatabaseIpAddresses();

            console.log('✅ NetworkConfigManager: Successfully switched to public IP mode');
            return {
                success: true,
                mode: 'public'
            };
        } catch (error) {
            console.error('❌ NetworkConfigManager: Error switching to public mode:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // Update IP addresses in database for current node
    async updateDatabaseIpAddresses() {
        try {
            const currentNodeId = DatabaseManager.getCurrentNodeId();
            if (!currentNodeId) {
                console.log('⚠️ NetworkConfigManager: No current node ID found, skipping database update');
                return {
                    success: true,
                    message: 'No current node found, configuration updated only'
                };
            }

            const newIpAddress = this.getCurrentIpAddress();
            const result = DatabaseManager.updateAllNodeIpAddresses(currentNodeId, newIpAddress);

            if (result.success) {
                console.log(`✅ NetworkConfigManager: Database updated successfully - ${result.totalChanges} records changed`);
                return result;
            } else {
                throw new Error(result.error);
            }
        } catch (error) {
            console.error('❌ NetworkConfigManager: Error updating database:', error);
            throw error;
        }
    }

    // Get configuration summary
    getConfigSummary() {
        return {
            current_mode: this.getCurrentMode(),
            current_ip: this.getCurrentIpAddress(),
            public_ip: this.config.network.public_ip,
            local_ip: this.config.network.local_ip,
            use_public_ip: this.config.network.use_public_ip
        };
    }

    // Update IP addresses (for manual IP updates)
    updateIpAddresses(localIp, publicIp) {
        try {
            this.config.network.local_ip = localIp;
            this.config.network.public_ip = publicIp;
            this.saveConfig();
            console.log(`✅ NetworkConfigManager: IP addresses updated - Local: ${localIp}, Public: ${publicIp}`);
            return true;
        } catch (error) {
            console.error('❌ NetworkConfigManager: Error updating IP addresses:', error);
            return false;
        }
    }
}

module.exports = NetworkConfigManager;
