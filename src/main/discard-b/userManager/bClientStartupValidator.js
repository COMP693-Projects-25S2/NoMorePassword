// /src/main/discard-b/userManager/bClientStartupValidator.js
const BClientUserManager = require('./bClientUserManager');

class BClientStartupValidator {
    constructor() {
        this.userManager = new BClientUserManager();
    }

    /**
     * Execute all necessary validations on project startup
     */
    async validateOnStartup() {
        try {
            console.log('=== Starting startup node validation ===');

            // Validate current node status
            const nodeValidationResult = await this.userManager.validateCurrentNodeOnStartup();

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
            status.nodeValidation = await this.userManager.validateCurrentNodeOnStartup();

            // Get current node information
            status.currentNode = this.userManager.getCurrentNode();

            // B-Client doesn't use local_users table
            status.totalUsers = 0;
            status.currentUsers = 0;

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

module.exports = BClientStartupValidator;
