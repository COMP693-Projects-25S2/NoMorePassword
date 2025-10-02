// /src/main/userManager/startupValidator.js
const UserManager = require('./userManager');

class StartupValidator {
    constructor(clientId = null) {
        this.clientId = clientId;
        this.userManager = new UserManager(clientId);
    }

    /**
     * Execute all necessary validations on project startup
     */
    async validateOnStartup() {
        try {

            // Validate current node status
            const nodeValidationResult = await this.userManager.validateCurrentNodeOnStartup();

            if (nodeValidationResult) {
            } else {
                console.error('❌ Node status validation failed');
            }

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
            status.nodeValidation = await this.userManager.validateCurrentNodeOnStartup();

            // Get current node information
            status.currentNode = this.userManager.getCurrentNode();

            // Get user statistics
            const users = this.userManager.db.prepare('SELECT COUNT(*) as total FROM local_users').get();
            status.totalUsers = users.total;

            // In multi-client environment, multiple users can be current for different clients
            const DatabaseManager = require('../sqlite/databaseManager');
            const currentUsers = this.userManager.db.prepare('SELECT COUNT(*) as count FROM local_users WHERE is_current = 1').get();
            status.currentUsers = currentUsers.count;

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
