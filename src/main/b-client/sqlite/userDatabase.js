// B-Client User Database - For storing user_cookies and user_accounts data
const db = require('./initDatabase');

class UserDatabase {
    constructor() {
        // B-Client only uses user_cookies and user_accounts tables
        // No history tracking needed for B-Client
    }

    // Database transaction methods
    beginTransaction() {
        return db.prepare('BEGIN TRANSACTION').run();
    }

    commitTransaction() {
        return db.prepare('COMMIT').run();
    }

    rollbackTransaction() {
        return db.prepare('ROLLBACK').run();
    }

    // Placeholder methods for compatibility (B-Client doesn't need history tracking)
    addVisitRecord(url, title, timestamp, enterTime, viewId, domain, userId = null) {
        // B-Client doesn't track visit history
        return null;
    }

    updateRecordTitle(visitId, title) {
        // B-Client doesn't track visit history
        return null;
    }

    updateRecordDuration(visitId, stayDuration) {
        // B-Client doesn't track visit history
        return null;
    }

    updateRecordTimestamp(visitId, timestamp) {
        // B-Client doesn't track visit history
        return null;
    }

    getVisitHistory(limit = null, offset = 0, userId = null) {
        // B-Client doesn't track visit history
        return [];
    }

    getActiveRecords() {
        // B-Client doesn't track visit history
        return [];
    }

    getRecentVisitByUrl(url, cutoffTime) {
        // B-Client doesn't track visit history
        return null;
    }

    addActiveRecord(visitId, url, enterTime) {
        // B-Client doesn't track visit history
        return null;
    }

    deleteActiveRecord(activeRecordId) {
        // B-Client doesn't track visit history
        return null;
    }

    clearActiveRecords() {
        // B-Client doesn't track visit history
        return null;
    }

    getVisitStats() {
        // B-Client doesn't track visit history
        return { totalVisits: 0, totalDuration: 0, uniqueDomains: 0 };
    }

    getVisitHistoryCount() {
        // B-Client doesn't track visit history
        return 0;
    }

    getRecentVisitByUrl(url, timeThreshold) {
        // B-Client doesn't track visit history
        return null;
    }

    updateRecordTimestamp(visitId, timestamp) {
        // B-Client doesn't track visit history
        return null;
    }

    addActiveRecord(visitId, url, enterTime, viewId) {
        // B-Client doesn't track active records
        return null;
    }

    getActiveRecords() {
        // B-Client doesn't track active records
        return [];
    }

    clearActiveRecords() {
        // B-Client doesn't track active records
        return 0;
    }

    clearAllActiveRecords() {
        // B-Client doesn't track active records
        return 0;
    }

    removeActiveRecord(viewId) {
        // B-Client doesn't track active records
        return false;
    }

    addShutdownLog(timestamp, reason, platform, version, lastVisitedUrl, sessionDuration) {
        // B-Client doesn't track shutdown logs
        return null;
    }

    getShutdownLogs(limit = 100) {
        // B-Client doesn't track shutdown logs
        return [];
    }

    clearShutdownLogs() {
        // B-Client doesn't track shutdown logs
        return 0;
    }

    // B-Client specific methods for user_cookies and user_accounts
    addUserCookie(userId, username, cookie, autoRefresh = false, refreshTime = null) {
        try {
            const stmt = db.prepare(`
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
            const stmt = db.prepare(`
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
            const stmt = db.prepare(`
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
            const stmt = db.prepare(`
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
            const stmt = db.prepare(`
                INSERT OR REPLACE INTO user_accounts (user_id, username, website, account, password)
                VALUES (?, ?, ?, ?, ?)
            `);
            return stmt.run(userId, username, website, account, password);
        } catch (error) {
            console.error('Error adding user account:', error);
            return null;
        }
    }

    addUserAccountWithDetails(userId, username, website, account, password, email, firstName, lastName, location, registrationMethod = 'auto', autoGenerated = true) {
        try {
            const stmt = db.prepare(`
                INSERT OR REPLACE INTO user_accounts (
                    user_id, username, website, account, password, email, 
                    first_name, last_name, location, registration_method, auto_generated
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);
            return stmt.run(
                userId, username, website, account, password, email,
                firstName, lastName, location, registrationMethod, autoGenerated ? 1 : 0
            );
        } catch (error) {
            console.error('Error adding user account with details:', error);
            return null;
        }
    }

    getUserAccount(userId, username, website, account) {
        try {
            const stmt = db.prepare(`
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
            const stmt = db.prepare(`
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
            const stmt = db.prepare(`
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
            const stmt = db.prepare(`
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
            const stmt = db.prepare(`
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
            const stmt = db.prepare(`
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

    // Get all user cookies that need auto-refresh
    getAutoRefreshCookies() {
        try {
            const stmt = db.prepare(`
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

}

module.exports = UserDatabase;