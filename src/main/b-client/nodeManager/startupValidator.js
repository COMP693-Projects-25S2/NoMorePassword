// /src/main/nodeManager/startupValidator.js
const NodeManager = require('./nodeManager');

class StartupValidator {
    constructor() {
        this.nodeManager = new NodeManager();
    }

    /**
     * Execute all necessary validations on project startup
     */
    async validateOnStartup() {
        try {
            console.log('=== Starting startup node validation ===');

            // Validate current node status
            const nodeValidationResult = await this.nodeManager.validateCurrentNodeOnStartup();

            if (nodeValidationResult) {
                console.log('✅ Node status validation passed');
            } else {
                console.error('❌ Node status validation failed');
            }

            console.log('=== Startup node validation completed ===');
            return nodeValidationResult;

        } catch (error) {
            console.error('Error occurred during startup node validation:', error);
            return false;
        }
    }

    /**
     * Get detailed startup validation status report
     */
    async getStartupStatus() {
        try {
            const status = {
                timestamp: new Date().toISOString(),
                nodeValidation: false,
                currentNode: null,
                totalUsers: 0,
                currentUsers: 0
            };

            // Validate node status
            status.nodeValidation = await this.nodeManager.validateCurrentNodeOnStartup();

            // Get current node information
            status.currentNode = this.nodeManager.getCurrentNode();

            // Get user statistics
            const users = this.nodeManager.db.prepare('SELECT COUNT(*) as total FROM local_users').get();
            status.totalUsers = users.total;

            const currentUsers = this.nodeManager.db.prepare('SELECT COUNT(*) as current FROM local_users WHERE is_current = 1').get();
            status.currentUsers = currentUsers.current;

            return status;

        } catch (error) {
            console.error('Error occurred while getting startup status:', error);
            return {
                timestamp: new Date().toISOString(),
                error: error.message,
                nodeValidation: false
            };
        }
    }
}

module.exports = StartupValidator;
