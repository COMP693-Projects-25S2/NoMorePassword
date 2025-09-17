const db = require('../sqlite/initDatabase');

/**
 * B-Client User Activity Manager
 * Records enterprise user activities based on current user
 */
class BClientUserActivityManager {
    constructor() {
        this.currentUserId = null;
        this.currentUsername = null;
        this.updateCurrentUser();
    }

    /**
     * Update current user information
     * B-Client doesn't use local_users table - it's an enterprise server
     */
    updateCurrentUser() {
        try {
            // B-Client is an enterprise server, it doesn't have local users
            // It manages user_cookies and user_accounts instead
            this.currentUserId = null;
            this.currentUsername = null;
            console.log('UserActivityManager: B-Client is an enterprise server, no local users');
        } catch (error) {
            console.error('Error updating current user:', error);
            this.currentUserId = null;
            this.currentUsername = null;
        }
    }

    /**
     * Get current user information
     * @returns {Object|null} Current user object or null if no user
     */
    getCurrentUser() {
        this.updateCurrentUser();
        if (this.currentUserId) {
            return {
                user_id: this.currentUserId,
                username: this.currentUsername
            };
        }
        return null;
    }

    /**
     * Record user activity
     * @param {string} activityType - Type of activity (visit, navigation, etc.)
     * @param {string} url - URL visited
     * @param {string} title - Page title
     * @param {string} description - Activity description
     * @param {number} startTime - Start timestamp
     * @param {number} endTime - End timestamp (optional)
     * @param {number} duration - Duration in milliseconds (optional)
     */
    recordActivity(activityType, url, title, description, startTime, endTime = null, duration = null) {
        // Update current user info before recording
        this.updateCurrentUser();

        if (!this.currentUserId) {
            console.log('UserActivityManager: No current user, skipping activity recording');
            return null;
        }

        try {
            const stmt = db.prepare(`
                INSERT INTO user_activities (
                    user_id, username, activity_type, url, title, description, 
                    start_time, end_time, duration, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);

            const result = stmt.run(
                this.currentUserId,
                this.currentUsername,
                activityType,
                url,
                title,
                description,
                startTime,
                endTime,
                duration,
                Math.floor(Date.now() / 1000) // Unix timestamp
            );

            console.log(`UserActivityManager: Recorded ${activityType} activity for user ${this.currentUsername}`);
            return { id: result.lastInsertRowid, changes: result.changes };
        } catch (error) {
            console.error('Error recording user activity:', error);
            return null;
        }
    }

    /**
     * Record visit activity
     * @param {string} url - URL visited
     * @param {string} title - Page title
     * @param {number} startTime - Start timestamp
     * @param {number} duration - Duration in milliseconds
     */
    recordVisit(url, title, startTime, duration) {
        return this.recordActivity(
            'visit',
            url,
            title,
            `Visited ${url}`,
            startTime,
            startTime + duration,
            duration
        );
    }

    /**
     * Record navigation activity
     * @param {string} url - URL navigated to
     * @param {string} title - Page title
     * @param {string} navigationType - Type of navigation (back, forward, refresh, etc.)
     */
    recordNavigation(url, title, navigationType) {
        const now = Date.now();
        return this.recordActivity(
            'navigation',
            url,
            title,
            `${navigationType} navigation to ${url}`,
            now,
            now,
            0
        );
    }

    /**
     * Record tab activity
     * @param {string} action - Tab action (create, close, switch)
     * @param {string} url - URL (for create/switch)
     * @param {string} title - Page title (for create/switch)
     */
    recordTabActivity(action, url = null, title = null) {
        const now = Date.now();
        let description = `Tab ${action}`;
        if (url) {
            description += ` to ${url}`;
        }

        return this.recordActivity(
            'tab',
            url,
            title,
            description,
            now,
            now,
            0
        );
    }

    /**
     * Get user activities
     * @param {string} userId - User ID (optional, defaults to current user)
     * @param {number} limit - Number of records to return
     * @returns {Array} Array of user activities
     */
    getUserActivities(userId = null, limit = 100) {
        try {
            const targetUserId = userId || this.currentUserId;
            if (!targetUserId) {
                console.log('UserActivityManager: No user ID provided and no current user');
                return [];
            }

            const stmt = db.prepare(`
                SELECT * FROM user_activities 
                WHERE user_id = ? 
                ORDER BY created_at DESC 
                LIMIT ?
            `);

            return stmt.all(targetUserId, limit);
        } catch (error) {
            console.error('Error getting user activities:', error);
            return [];
        }
    }

    /**
     * Clear activities for current user
     * @returns {Object} Result object with success status and changes count
     */
    clearCurrentUserActivities() {
        try {
            this.updateCurrentUser();
            if (!this.currentUserId) {
                return { success: false, error: 'No current user found' };
            }

            const stmt = db.prepare('DELETE FROM user_activities WHERE user_id = ?');
            const result = stmt.run(this.currentUserId);

            console.log(`UserActivityManager: Cleared ${result.changes} activities for user ${this.currentUsername}`);
            return { success: true, changes: result.changes };
        } catch (error) {
            console.error('Error clearing current user activities:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Clear activities for specific user
     * @param {string} userId - User ID
     * @returns {Object} Result object with success status and changes count
     */
    clearUserActivities(userId) {
        try {
            const stmt = db.prepare('DELETE FROM user_activities WHERE user_id = ?');
            const result = stmt.run(userId);

            console.log(`UserActivityManager: Cleared ${result.changes} activities for user ${userId}`);
            return { success: true, changes: result.changes };
        } catch (error) {
            console.error('Error clearing user activities:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Get activity statistics for current user
     * @returns {Object} Activity statistics
     */
    getCurrentUserStats() {
        try {
            this.updateCurrentUser();
            if (!this.currentUserId) {
                return { totalActivities: 0, activitiesByType: {}, totalDuration: 0 };
            }

            const stmt = db.prepare(`
                SELECT 
                    COUNT(*) as total_activities,
                    activity_type,
                    SUM(duration) as total_duration
                FROM user_activities 
                WHERE user_id = ? 
                GROUP BY activity_type
            `);

            const results = stmt.all(this.currentUserId);

            let totalActivities = 0;
            let totalDuration = 0;
            const activitiesByType = {};

            results.forEach(row => {
                totalActivities += row.total_activities;
                totalDuration += row.total_duration || 0;
                activitiesByType[row.activity_type] = row.total_activities;
            });

            return {
                totalActivities,
                activitiesByType,
                totalDuration
            };
        } catch (error) {
            console.error('Error getting current user stats:', error);
            return { totalActivities: 0, activitiesByType: {}, totalDuration: 0 };
        }
    }
}

module.exports = BClientUserActivityManager;
