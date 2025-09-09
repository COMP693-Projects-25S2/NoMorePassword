// B-Client Node Manager - Simplified for user_cookies and user_accounts only
const db = require('../sqlite/database');

class NodeManager {
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
    addUserCookie(userId, username, cookie, autoRefresh = false, refreshTime = null) {
        try {
            const stmt = this.db.prepare(`
                INSERT OR REPLACE INTO user_cookies (user_id, username, cookie, auto_refresh, refresh_time)
                VALUES (?, ?, ?, ?, ?)
            `);
            return stmt.run(userId, username, cookie, autoRefresh ? 1 : 0, refreshTime);
        } catch (error) {
            console.error('Error adding user cookie:', error);
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

    updateUserCookie(userId, username, cookie, autoRefresh = false, refreshTime = null) {
        try {
            const stmt = this.db.prepare(`
                UPDATE user_cookies 
                SET cookie = ?, auto_refresh = ?, refresh_time = ?
                WHERE user_id = ? AND username = ?
            `);
            return stmt.run(cookie, autoRefresh ? 1 : 0, refreshTime, userId, username);
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
            const stmt = this.db.prepare(`
                SELECT * FROM user_cookies 
                WHERE user_id = ?
                ORDER BY create_time DESC
            `);
            return stmt.all(userId);
        } catch (error) {
            console.error('Error getting all user cookies:', error);
            return [];
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
}

module.exports = NodeManager;