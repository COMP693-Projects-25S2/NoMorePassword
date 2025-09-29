// /src/main/userManager/userManager.js
const db = require('../sqlite/database');
const UserRegistrationDialog = require('./userRegistrationDialog');

class UserManager {
    constructor() {
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

            // Count records with is_current=1
            const currentUsers = allUsers.filter(user => user.is_current === 1);
            const currentCount = currentUsers.length;


            if (currentCount === 0) {
                return true;
            }

            if (currentCount === 1) {
                return true;
            }

            // If more than 1 user marked as current node, need to fix
            if (currentCount > 1) {
                console.warn(`Found ${currentCount} users marked as current node, starting to fix...`);
                await this.fixMultipleCurrentNodes();
                return true;
            }

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
            // Get all users with is_current=1
            const currentUsers = this.db.prepare(
                'SELECT user_id FROM local_users WHERE is_current = 1'
            ).all();

            if (currentUsers.length <= 1) {
                return;
            }

            console.log(`Found ${currentUsers.length} users marked as current node, starting to fix...`);

            // Set all users' is_current to 0, indicating no user login state
            const resetAllResult = this.db.prepare('UPDATE local_users SET is_current = 0').run();
            console.log(`Set all ${resetAllResult.changes} users' is_current field to 0, now no user is logged in`);

            console.log('Fix completed, all users are set to non-current node state');

        } catch (error) {
            console.error('Error occurred while fixing multiple current nodes:', error);
            throw error;
        }
    }

    /**
     * Set specified user as current node
     */
    setCurrentNode(userId) {
        try {
            // First set all users' is_current to 0
            this.db.prepare('UPDATE local_users SET is_current = 0').run();

            // Set specified user's is_current to 1
            const result = this.db.prepare(
                'UPDATE local_users SET is_current = 1 WHERE user_id = ?'
            ).run(userId);

            if (result.changes > 0) {
                console.log(`User ${userId} has been set as current node`);
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
    getCurrentNode() {
        try {
            const currentUser = this.db.prepare(
                'SELECT * FROM local_users WHERE is_current = 1'
            ).get();

            return currentUser || null;
        } catch (error) {
            console.error('Error occurred while getting current node information:', error);
            return null;
        }
    }

    /**
     * Clear current node marker
     */
    clearCurrentNode() {
        try {
            const result = this.db.prepare('UPDATE local_users SET is_current = 0').run();
            console.log(`Cleared all current node markers, affected ${result.changes} records`);
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
                            this.userRegistrationDialog = new UserRegistrationDialog();
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
