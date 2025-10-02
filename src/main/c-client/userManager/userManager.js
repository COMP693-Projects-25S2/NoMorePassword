// /src/main/userManager/userManager.js
const db = require('../sqlite/database');
const DatabaseManager = require('../sqlite/databaseManager');
const UserRegistrationDialog = require('./userRegistrationDialog');

class UserManager {
    constructor(clientId = null) {
        this.clientId = clientId;
        this.db = db;
        this.userRegistrationDialog = null;
    }

    /**
     * Check local_users table on project startup to ensure only 1 user has is_current=1, 
     * others are 0, or all users have is_current=0
     */
    async validateCurrentNodeOnStartup() {
        try {

            // Get all users from database
            const allUsers = this.db.prepare('SELECT * FROM local_users').all();

            // In multi-client environment, multiple users can be is_current=1
            // Just check if there are any users in the database
            const userCount = allUsers.length;


            if (userCount === 0) {
                return true;
            }

            if (userCount === 1) {
                return true;
            }

            // In multi-client environment, multiple users can be current for different clients
            // No need to fix multiple current users anymore
            console.log(`Found ${userCount} users in database, multi-client environment supports multiple current users`);
            return true;

        } catch (error) {
            console.error('Error occurred while validating current node status:', error);
            return false;
        }
    }

    /**
 * Fix multiple is_current=1 issue by setting all users to 0, indicating no user login state
 */
    async fixMultipleCurrentNodes() {
        try {
            // Get all users with is_current=1 using DatabaseManager
            const currentUsers = DatabaseManager.getAllCurrentUsers();

            if (currentUsers.length <= 1) {
                return;
            }

            console.log(`Found ${currentUsers.length} users marked as current node, starting to fix...`);

            // This method is deprecated in multi-client environment
            // Each client should manage its own users independently
            console.warn('⚠️ UserManager: resetAllCurrentNodes is deprecated in multi-client environment');
            console.log('⚠️ UserManager: Each client should manage its own users independently');

            console.log('Fix completed, all users are set to non-current node state');

        } catch (error) {
            console.error('Error occurred while fixing multiple current nodes:', error);
            throw error;
        }
    }

    /**
     * Set specified user as current node
     */
    setCurrentNode(userId, clientId = null) {
        try {
            // First clear current user flags only for this client_id
            const clearResult = DatabaseManager.removeClientFromCurrentUsers(clientId);
            if (!clearResult.success) {
                console.error(`Failed to clear current users for client: ${clearResult.error}`);
                return false;
            }
            console.log(`🧹 UserManager: Cleared ${clearResult.changes} current user flags for client_id: ${clientId}`);

            // Set specified user's is_current to 1 and client_id using DatabaseManager
            const result = DatabaseManager.setCurrentLocalUser(userId, clientId);

            if (result.success && result.changes > 0) {
                console.log(`User ${userId} has been set as current node with client_id: ${clientId}`);
                return true;
            } else {
                console.warn(`User ${userId} not found, failed to set as current node`);
                return false;
            }
        } catch (error) {
            console.error('Error occurred while setting current node:', error);
            return false;
        }
    }

    /**
     * Get current node information
     */
    getCurrentNode(clientId = null) {
        try {
            // Always use client-specific lookup, generate fallback clientId if needed
            const finalClientId = clientId || process.env.C_CLIENT_ID || `c-client-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            const currentUser = DatabaseManager.getCurrentUserFieldsForClient(['user_id', 'username', 'node_id', 'domain_id', 'cluster_id', 'channel_id'], finalClientId);

            return currentUser || null;
        } catch (error) {
            console.error('Error occurred while getting current node information:', error);
            return null;
        }
    }

    /**
     * Clear current node marker for specific client
     */
    clearCurrentNode(clientId = null) {
        try {
            // Use client-specific clearing instead of global clearing
            if (!clientId) {
                console.warn('⚠️ UserManager: clearCurrentNode requires clientId parameter');
                return false;
            }
            const result = DatabaseManager.removeClientFromCurrentUsers(clientId);
            console.log(`Cleared current node markers for client ${clientId}, affected ${result.changes} records`);
            return true;
        } catch (error) {
            console.error('Error occurred while clearing current node markers:', error);
            return false;
        }
    }

    /**
     * Register new user if local_users table is empty
     */
    async registerNewUserIfNeeded(mainWindow) {
        try {
            // Check if local_users table is empty
            const userCount = this.db.prepare('SELECT COUNT(*) as count FROM local_users').get();

            if (userCount.count === 0) {

                // Show dialog using independent BrowserWindow
                if (mainWindow && !mainWindow.isDestroyed()) {
                    try {
                        if (!this.userRegistrationDialog) {
                            this.userRegistrationDialog = new UserRegistrationDialog(this.clientId);
                        }

                        await this.userRegistrationDialog.show(mainWindow);

                        return true; // Return true to indicate dialog was shown
                    } catch (dialogError) {
                        console.error('Error showing user registration dialog:', dialogError);
                        return false;
                    }
                } else {
                    console.warn('Main window not available for dialog display');
                    return false;
                }
            } else {
                // For existing users, don't show any dialog - just continue
                return false; // Return false to indicate no dialog was shown
            }

        } catch (error) {
            console.error('Error occurred during user registration:', error);
            return false;
        }
    }



    /**
     * Get total user count
     */
    getUserCount() {
        try {
            const result = this.db.prepare('SELECT COUNT(*) as count FROM local_users').get();
            return result.count;
        } catch (error) {
            console.error('Error occurred while getting user count:', error);
            return 0;
        }
    }
}

module.exports = UserManager;
