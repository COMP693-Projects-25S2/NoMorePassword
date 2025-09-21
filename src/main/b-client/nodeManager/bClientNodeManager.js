// B-Client Node Manager - Simplified for user_cookies and user_accounts only
const db = require('../sqlite/initDatabase');

class BClientNodeManager {
    constructor() {
        this.db = db;
    }

    /**
     * B-Client doesn't use local_users table
     * This method is kept for compatibility but does nothing
     */
    validateCurrentNodeStatus() {
        // B-Client doesn't track current node status
        return true;
    }

    /**
     * B-Client doesn't use local_users table
     * This method is kept for compatibility but does nothing
     */
    async validateCurrentNodeOnStartup() {
        // B-Client doesn't track current node status
        return true;
    }

    /**
     * B-Client doesn't use local_users table
     * This method is kept for compatibility but does nothing
     */
    resetAllCurrentNodes() {
        // B-Client doesn't track current node status
        return true;
    }

    /**
     * B-Client doesn't use local_users table
     * This method is kept for compatibility but does nothing
     */
    setCurrentNode(userId) {
        // B-Client doesn't track current node status
        return true;
    }

    /**
     * B-Client doesn't use local_users table
     * This method is kept for compatibility but does nothing
     */
    getCurrentNode() {
        // B-Client doesn't track current node status
        return null;
    }

    /**
     * B-Client doesn't use local_users table
     * This method is kept for compatibility but does nothing
     */
    clearCurrentNode() {
        // B-Client doesn't track current node status
        return true;
    }

    /**
     * B-Client doesn't use local_users table
     * This method is kept for compatibility but does nothing
     */
    async registerNewUserIfNeeded(mainWindow) {
        // B-Client doesn't track local users
        return false;
    }

    /**
     * B-Client doesn't use local_users table
     * This method is kept for compatibility but does nothing
     */
    getUserCount() {
        // B-Client doesn't track local users
        return 0;
    }

    // B-Client specific methods for user_cookies and user_accounts
    addUserCookie(userId, username, nodeId = null, cookie, autoRefresh = false, refreshTime = null) {
        try {
            // Delete all existing cookies for this user_id before inserting new one
            console.log(`[NodeManager] Deleting existing cookies for user_id: ${userId}`);
            const deleteStmt = this.db.prepare(`
                DELETE FROM user_cookies WHERE user_id = ?
            `);
            const deleteResult = deleteStmt.run(userId);
            console.log(`[NodeManager] Deleted ${deleteResult.changes} existing cookie records for user_id: ${userId}`);

            // Insert new cookie record
            const stmt = this.db.prepare(`
                INSERT INTO user_cookies (user_id, username, node_id, cookie, auto_refresh, refresh_time)
                VALUES (?, ?, ?, ?, ?, ?)
            `);
            const result = stmt.run(userId, username, nodeId, cookie, autoRefresh ? 1 : 0, refreshTime);
            console.log(`[NodeManager] Inserted new cookie record for user_id: ${userId}, username: ${username}`);
            return result;
        } catch (error) {
            console.error('Error adding user cookie:', error);
            return null;
        }
    }

    // Add user cookie with target website username (for compatibility with existing API calls)
    addUserCookieWithTargetUsername(userId, cClientUsername, targetUsername, nodeId = null, cookie, autoRefresh = false, refreshTime = null) {
        try {
            // First, ensure the target username exists in user_accounts table
            const accountExists = this.getUserAccountByTargetUsername(userId, cClientUsername, targetUsername);
            if (!accountExists) {
                console.warn(`Target username ${targetUsername} not found in user_accounts for user ${userId}`);
            }

            // Delete all existing cookies for this user_id before inserting new one
            console.log(`[NodeManager] Deleting existing cookies for user_id: ${userId}`);
            const deleteStmt = this.db.prepare(`
                DELETE FROM user_cookies WHERE user_id = ?
            `);
            const deleteResult = deleteStmt.run(userId);
            console.log(`[NodeManager] Deleted ${deleteResult.changes} existing cookie records for user_id: ${userId}`);

            // Insert new cookie record
            const stmt = this.db.prepare(`
                INSERT INTO user_cookies (user_id, username, node_id, cookie, auto_refresh, refresh_time)
                VALUES (?, ?, ?, ?, ?, ?)
            `);
            const result = stmt.run(userId, targetUsername, nodeId, cookie, autoRefresh ? 1 : 0, refreshTime);
            console.log(`[NodeManager] Inserted new cookie record for user_id: ${userId}, targetUsername: ${targetUsername}`);
            return result;
        } catch (error) {
            console.error('Error adding user cookie with target username:', error);
            return null;
        }
    }

    getUserCookie(userId, username) {
        try {
            const stmt = this.db.prepare(`
                SELECT * FROM user_cookies 
                WHERE user_id = ? AND username = ?
            `);
            return stmt.get(userId, username);
        } catch (error) {
            console.error('Error getting user cookie:', error);
            return null;
        }
    }

    // Get user cookie by target website username
    getUserCookieByTargetUsername(userId, targetUsername) {
        try {
            const stmt = this.db.prepare(`
                SELECT * FROM user_cookies 
                WHERE user_id = ? AND username = ?
            `);
            return stmt.get(userId, targetUsername);
        } catch (error) {
            console.error('Error getting user cookie by target username:', error);
            return null;
        }
    }

    updateUserCookie(userId, username, nodeId = null, cookie, autoRefresh = false, refreshTime = null) {
        try {
            const stmt = this.db.prepare(`
                UPDATE user_cookies 
                SET node_id = COALESCE(?, node_id), cookie = ?, auto_refresh = ?, refresh_time = ?
                WHERE user_id = ? AND username = ?
            `);
            return stmt.run(nodeId, cookie, autoRefresh ? 1 : 0, refreshTime, userId, username);
        } catch (error) {
            console.error('Error updating user cookie:', error);
            return null;
        }
    }

    deleteUserCookie(userId, username) {
        try {
            const stmt = this.db.prepare(`
                DELETE FROM user_cookies 
                WHERE user_id = ? AND username = ?
            `);
            return stmt.run(userId, username);
        } catch (error) {
            console.error('Error deleting user cookie:', error);
            return null;
        }
    }

    addUserAccount(userId, username, website, account, password) {
        try {
            const stmt = this.db.prepare(`
                INSERT OR REPLACE INTO user_accounts (user_id, username, website, account, password)
                VALUES (?, ?, ?, ?, ?)
            `);
            return stmt.run(userId, username, website, account, password);
        } catch (error) {
            console.error('Error adding user account:', error);
            return null;
        }
    }

    addUserAccountWithDetails(userId, username, nodeId = null, website, account, password, email, firstName, lastName, location, registrationMethod = 'auto', autoGenerated = true) {
        try {
            const stmt = this.db.prepare(`
                INSERT OR REPLACE INTO user_accounts (
                    user_id, username, node_id, website, account, password, email, 
                    first_name, last_name, location, registration_method, auto_generated
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);
            return stmt.run(
                userId, username, nodeId, website, account, password, email,
                firstName, lastName, location, registrationMethod, autoGenerated ? 1 : 0
            );
        } catch (error) {
            console.error('Error adding user account with details:', error);
            return null;
        }
    }

    getUserAccount(userId, username, website, account) {
        try {
            const stmt = this.db.prepare(`
                SELECT * FROM user_accounts 
                WHERE user_id = ? AND username = ? AND website = ? AND account = ?
            `);
            return stmt.get(userId, username, website, account);
        } catch (error) {
            console.error('Error getting user account:', error);
            return null;
        }
    }

    getUserAccountsByWebsite(userId, username, website) {
        try {
            const stmt = this.db.prepare(`
                SELECT * FROM user_accounts 
                WHERE user_id = ? AND username = ? AND website = ?
                ORDER BY create_time DESC
            `);
            return stmt.all(userId, username, website);
        } catch (error) {
            console.error('Error getting user accounts by website:', error);
            return [];
        }
    }

    // Get user account by target username (account field in user_accounts table)
    getUserAccountByTargetUsername(userId, cClientUsername, targetUsername) {
        try {
            const stmt = this.db.prepare(`
                SELECT * FROM user_accounts 
                WHERE user_id = ? AND username = ? AND account = ?
                ORDER BY create_time DESC
                LIMIT 1
            `);
            return stmt.get(userId, cClientUsername, targetUsername);
        } catch (error) {
            console.error('Error getting user account by target username:', error);
            return null;
        }
    }

    updateUserAccount(userId, username, website, account, password) {
        try {
            const stmt = this.db.prepare(`
                UPDATE user_accounts 
                SET password = ?
                WHERE user_id = ? AND username = ? AND website = ? AND account = ?
            `);
            return stmt.run(password, userId, username, website, account);
        } catch (error) {
            console.error('Error updating user account:', error);
            return null;
        }
    }

    deleteUserAccount(userId, username, website, account) {
        try {
            const stmt = this.db.prepare(`
                DELETE FROM user_accounts 
                WHERE user_id = ? AND username = ? AND website = ? AND account = ?
            `);
            return stmt.run(userId, username, website, account);
        } catch (error) {
            console.error('Error deleting user account:', error);
            return null;
        }
    }

    getAllUserCookies(userId) {
        try {
            console.log(`[BClientNodeManager] getAllUserCookies called with userId: "${userId}" (type: ${typeof userId})`);

            const stmt = this.db.prepare(`
                SELECT * FROM user_cookies 
                WHERE user_id = ?
                ORDER BY create_time DESC
            `);

            const results = stmt.all(userId);
            console.log(`[BClientNodeManager] SQL query returned ${results.length} results for userId: "${userId}"`);

            if (results.length > 0) {
                results.forEach((cookie, index) => {
                    console.log(`[BClientNodeManager]   Result ${index + 1}: user_id="${cookie.user_id}" (type: ${typeof cookie.user_id}), username=${cookie.username}`);
                });
            }

            return results;
        } catch (error) {
            console.error('Error getting all user cookies:', error);
            return [];
        }
    }

    deleteAllUserCookies(userId) {
        try {
            const stmt = this.db.prepare(`
                DELETE FROM user_cookies 
                WHERE user_id = ?
            `);
            const result = stmt.run(userId);
            console.log(`Deleted ${result.changes} cookies for user ${userId}`);
            return result.changes > 0;
        } catch (error) {
            console.error('Error deleting all user cookies:', error);
            return false;
        }
    }

    getAllUserAccounts(userId) {
        try {
            const stmt = this.db.prepare(`
                SELECT * FROM user_accounts 
                WHERE user_id = ?
                ORDER BY create_time DESC
            `);
            return stmt.all(userId);
        } catch (error) {
            console.error('Error getting all user accounts:', error);
            return [];
        }
    }

    // Get all user accounts (for dashboard stats)
    getAllUserAccountsForStats() {
        try {
            const stmt = this.db.prepare(`
                SELECT * FROM user_accounts 
                ORDER BY create_time DESC
            `);
            return stmt.all();
        } catch (error) {
            console.error('Error getting all user accounts for stats:', error);
            return [];
        }
    }

    // Get all user cookies that need auto-refresh
    getAutoRefreshCookies() {
        try {
            const stmt = this.db.prepare(`
                SELECT * FROM user_cookies 
                WHERE auto_refresh = 1
                ORDER BY create_time DESC
            `);
            return stmt.all();
        } catch (error) {
            console.error('Error getting auto-refresh cookies:', error);
            return [];
        }
    }

    // Get all user cookies (for dashboard stats)
    getAllUserCookies() {
        try {
            const stmt = this.db.prepare(`
                SELECT * FROM user_cookies 
                ORDER BY create_time DESC
            `);
            return stmt.all();
        } catch (error) {
            console.error('Error getting all user cookies:', error);
            return [];
        }
    }
}

module.exports = BClientNodeManager;