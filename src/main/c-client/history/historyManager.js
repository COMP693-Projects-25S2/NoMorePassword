const VisitTracker = require('./visitTracker');
const HistoryDatabase = require('../sqlite/historyDatabase');
const UserActivityManager = require('./userActivityManager');

// History Manager - Database version
class HistoryManager {
    constructor() {
        this.historyDB = new HistoryDatabase();
        this.visitTracker = new VisitTracker();
        this.userActivityManager = new UserActivityManager();
        this.sessionStartTime = Date.now();
        this.isFullyInitialized = false;
    }

    /**
     * Initialize history manager
     */
    initialize() {
        try {
            this.visitTracker.loadActiveRecords();
            const totalRecords = this.historyDB.getVisitHistoryCount();
            this.isFullyInitialized = true;
            this.autoCleanupOnStartup();
            return true;
        } catch (error) {
            console.error('Failed to initialize history manager:', error);
            return false;
        }
    }

    /**
     * Finalize initialization
     */
    finalizeInitialization() {
        try {
            if (!this.isFullyInitialized) {
                return false;
            }

            // ShutdownLogger removed

            return true;
        } catch (error) {
            console.error('Failed to finalize history manager initialization:', error);
            return false;
        }
    }

    /**
     * Load history
     */
    loadHistory() {
        return this.initialize();
    }

    /**
     * Save history
     */
    saveHistory() {
        try {
            const stats = this.getStats();
            return true;
        } catch (error) {
            console.error('Failed to check history status:', error);
            return false;
        }
    }

    /**
     * Record visit
     */
    async recordVisit(url, viewId) {
        try {
            // Get current user ID for visit tracking
            const currentUser = this.userActivityManager ? this.userActivityManager.getCurrentUser() : null;
            const userId = currentUser ? currentUser.user_id : null;

            // Only record visits if user is logged in
            if (!userId) {
                console.log('No current user found, skipping visit recording');
                return null;
            }

            const result = await this.visitTracker.recordVisit(url, viewId, userId);

            // Also record user activity if we have a current user
            if (result && this.userActivityManager) {
                this.userActivityManager.recordTabActivity('visit', url, 'Loading...');
            }

            return result;
        } catch (error) {
            console.error('Failed to record visit:', error);
            return null;
        }
    }

    /**
     * Update record title
     */
    updateRecordTitle(record, title) {
        try {
            this.visitTracker.updateRecordTitle(record, title);
        } catch (error) {
            console.error('Failed to update record title:', error);
        }
    }

    /**
     * Get recent record by view ID
     */
    getRecentRecordByViewId(viewId) {
        try {
            if (!viewId) return null;

            // Get the most recent active record for this view
            const activeRecords = this.visitTracker.activeRecords;
            const viewRecords = activeRecords.filter(record => record.viewId === viewId);

            if (viewRecords.length === 0) return null;

            // Return the most recent record (highest ID)
            return viewRecords.reduce((latest, current) => {
                return (current.index > latest.index) ? current : latest;
            });
        } catch (error) {
            console.error('Failed to get recent record by view ID:', error);
            return null;
        }
    }

    /**
     * Get recent record by URL
     */
    getRecentRecordByUrl(url) {
        try {
            if (!url) return null;

            // Get the most recent record for this URL
            const activeRecords = this.visitTracker.activeRecords;
            const urlRecords = activeRecords.filter(record => record.url === url);

            if (urlRecords.length === 0) return null;

            // Return the most recent record (highest ID)
            return urlRecords.reduce((latest, current) => {
                return (current.index > latest.index) ? current : latest;
            });
        } catch (error) {
            console.error('Failed to get recent record by URL:', error);
            return null;
        }
    }

    /**
     * Finish active records
     */
    finishActiveRecords(viewId, endTime = Date.now()) {
        try {
            this.visitTracker.finishActiveRecordsByViewId(viewId, endTime);
        } catch (error) {
            console.error('Failed to finish active records:', error);
        }
    }

    /**
     * Get visit stats
     */
    getStats() {
        try {
            // Get current user ID for filtering
            const currentUser = this.userActivityManager ? this.userActivityManager.getCurrentUser() : null;
            const userId = currentUser ? currentUser.user_id : null;

            // If no user is logged in, return empty stats
            if (!userId) {
                console.log('No current user found, returning empty stats');
                return {
                    totalVisits: 0,
                    totalTime: 0,
                    averageStayTime: 0,
                    topPages: {},
                    activeRecords: 0
                };
            }

            return this.historyDB.getVisitStats(userId);
        } catch (error) {
            console.error('Failed to get visit stats:', error);
            return {
                totalVisits: 0,
                totalTime: 0,
                averageStayTime: 0,
                topPages: {},
                activeRecords: 0
            };
        }
    }

    /**
     * Get visit history
     */
    getHistory(limit = null) {
        try {
            // Get current user ID for filtering
            const currentUser = this.userActivityManager ? this.userActivityManager.getCurrentUser() : null;
            const userId = currentUser ? currentUser.user_id : null;

            // If no user is logged in, return empty history
            if (!userId) {
                console.log('No current user found, returning empty history');
                return [];
            }

            return this.historyDB.getVisitHistory(limit, 0, userId);
        } catch (error) {
            console.error('Failed to get history from database:', error);
            return [];
        }
    }

    /**
     * Get history data
     */
    getHistoryData(historyLimit = 100) {
        try {
            const stats = this.getStats();
            const historyData = this.getHistory(historyLimit);
            return { stats, history: historyData };
        } catch (error) {
            console.error('Failed to get history data:', error);
            return {
                stats: {
                    totalVisits: 0,
                    totalTime: 0,
                    averageStayTime: 0,
                    topPages: {},
                    activeRecords: 0
                },
                history: []
            };
        }
    }

    /**
     * Get active records info
     */
    getActiveRecordsInfo() {
        try {
            return this.visitTracker.getActiveRecordsInfo();
        } catch (error) {
            console.error('Failed to get active records info:', error);
            return {
                activeRecords: [],
                totalActive: 0,
                maxActive: 50
            };
        }
    }

    /**
     * Get shutdown history
     */
    getShutdownHistory() {
        try {
            return this.historyDB.getShutdownHistory();
        } catch (error) {
            console.error('Failed to get shutdown history:', error);
            return [];
        }
    }

    /**
     * Log shutdown
     */
    logShutdown(reason = 'normal') {
        // ShutdownLogger removed
    }

    /**
     * Force write
     */
    forceWrite() {
        try {
            const stats = this.getStats();
            return true;
        } catch (error) {
            console.error('Failed to force write:', error);
            return false;
        }
    }

    /**
     * Cleanup resources
     */
    cleanup() {
        try {
            // ShutdownLogger removed

            const now = Date.now();
            this.visitTracker.clearAllActiveRecords(now);
        } catch (error) {
            console.error('Failed to cleanup HistoryManager:', error);
        }
    }

    /**
     * Cleanup old data
     */
    cleanupOldData(daysToKeep = 30) {
        try {
            const result = this.historyDB.cleanupOldData(daysToKeep);
            return result;
        } catch (error) {
            console.error('Failed to cleanup old data:', error);
            return { changes: 0 };
        }
    }

    /**
     * Get database stats
     */
    getDatabaseStats() {
        try {
            return this.historyDB.getDatabaseStats();
        } catch (error) {
            console.error('Failed to get database stats:', error);
            return {
                visitHistory: 0,
                activeRecords: 0,
                shutdownLogs: 0
            };
        }
    }

    /**
     * Export history data
     */
    exportHistoryData(limit = null) {
        try {
            const history = this.getHistory(limit);
            const stats = this.getStats();
            const shutdownHistory = this.getShutdownHistory();
            const dbStats = this.getDatabaseStats();

            return {
                exportTime: new Date().toISOString(),
                sessionStartTime: new Date(this.sessionStartTime).toISOString(),
                databaseSource: true,
                stats,
                history,
                shutdownHistory,
                databaseStats: dbStats,
                totalRecords: history.length
            };
        } catch (error) {
            console.error('Failed to export history data:', error);
            return {
                exportTime: new Date().toISOString(),
                error: error.message,
                databaseSource: true,
                stats: {},
                history: [],
                shutdownHistory: [],
                databaseStats: {},
                totalRecords: 0
            };
        }
    }

    /**
     * Get history by date range
     */
    getHistoryByDateRange(startDate, endDate) {
        try {
            const startTime = startDate.getTime();
            const endTime = endDate.getTime();

            const allHistory = this.historyDB.getVisitHistory();
            const filteredHistory = allHistory.filter(record => {
                const recordTime = record.enter_time;
                return recordTime >= startTime && recordTime <= endTime;
            });

            return filteredHistory;
        } catch (error) {
            console.error('Failed to get history by date range:', error);
            return [];
        }
    }

    /**
     * Get top domains
     */
    getTopDomains(limit = 10) {
        try {
            const stats = this.getStats();
            const topPages = stats.topPages || {};

            const topDomains = Object.entries(topPages)
                .sort(([, a], [, b]) => b - a)
                .slice(0, limit)
                .map(([domain, count]) => ({ domain, count }));

            return topDomains;
        } catch (error) {
            console.error('Failed to get top domains:', error);
            return [];
        }
    }

    /**
     * Search history
     */
    searchHistory(searchQuery, limit = 50) {
        try {
            const allHistory = this.historyDB.getVisitHistory();
            const query = searchQuery.toLowerCase();

            const matchingRecords = allHistory.filter(record => {
                return record.url.toLowerCase().includes(query) ||
                    (record.title && record.title.toLowerCase().includes(query)) ||
                    (record.domain && record.domain.toLowerCase().includes(query));
            }).slice(0, limit);

            return matchingRecords;
        } catch (error) {
            console.error('Failed to search history:', error);
            return [];
        }
    }

    /**
     * Get session stats
     */
    getSessionStats() {
        try {
            const stats = this.getStats();
            const sessionDuration = Math.round((Date.now() - this.sessionStartTime) / 1000);

            return {
                sessionStartTime: new Date(this.sessionStartTime).toISOString(),
                sessionDuration: sessionDuration,
                sessionDurationFormatted: this.formatDuration(sessionDuration),
                totalVisits: stats.totalVisits,
                totalTime: stats.totalTime,
                activeRecords: stats.activeRecords,
                averageStayTime: stats.averageStayTime
            };
        } catch (error) {
            console.error('Failed to get session stats:', error);
            return {
                sessionStartTime: new Date(this.sessionStartTime).toISOString(),
                sessionDuration: 0,
                sessionDurationFormatted: '0 seconds',
                totalVisits: 0,
                totalTime: 0,
                activeRecords: 0,
                averageStayTime: 0
            };
        }
    }

    /**
     * Format duration
     */
    formatDuration(seconds) {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;

        if (hours > 0) {
            return `${hours}h ${minutes}m ${secs}s`;
        } else if (minutes > 0) {
            return `${minutes}m ${secs}s`;
        } else {
            return `${secs}s`;
        }
    }

    /**
     * Auto-cleanup on startup
     */
    autoCleanupOnStartup() {
        try {
            setTimeout(() => {
                try {
                    const result = this.cleanupLoadingTitles();
                    if (result.updated > 0) {
                    }
                } catch (error) {
                    console.error('Startup cleanup failed:', error);
                }
            }, 5000);

        } catch (error) {
            console.error('Error in startup cleanup:', error);
        }
    }

    /**
     * Cleanup Loading... titles
     */
    cleanupLoadingTitles() {
        try {
            const db = require('../sqlite/database');

            const loadingRecords = db.prepare(`
                SELECT id, url, title, view_id, domain 
                FROM visit_history 
                WHERE title = 'Loading...' OR title = 'Untitled Page' OR title IS NULL
                ORDER BY enter_time DESC
            `).all();

            let updatedCount = 0;

            for (const record of loadingRecords) {
                try {
                    let newTitle = '';

                    if (record.url && record.url !== 'about:blank') {
                        if (record.domain && record.domain !== 'localhost') {
                            newTitle = record.domain.charAt(0).toUpperCase() + record.domain.slice(1);
                        } else {
                            try {
                                const url = new URL(record.url);
                                if (url.hostname && url.hostname !== 'localhost') {
                                    newTitle = url.hostname.charAt(0).toUpperCase() + url.hostname.slice(1);
                                }
                            } catch (err) {
                                console.error(`Failed to parse URL: ${record.url}`, err);
                            }
                        }

                        if (!newTitle && record.url) {
                            const pathParts = record.url.split('/').filter(part => part && part !== 'http:' && part !== 'https:');
                            if (pathParts.length > 0) {
                                const lastPart = pathParts[pathParts.length - 1];
                                if (lastPart && lastPart !== 'localhost' && !lastPart.includes('.')) {
                                    newTitle = lastPart.charAt(0).toUpperCase() + lastPart.slice(1);
                                }
                            }
                        }
                    }

                    if (!newTitle) {
                        newTitle = 'Untitled Page';
                    }

                    if (newTitle !== record.title) {
                        db.prepare(`
                            UPDATE visit_history 
                            SET title = ?, updated_at = ?
                            WHERE id = ?
                        `).run(newTitle, Date.now(), record.id);

                        updatedCount++;
                    }

                } catch (err) {
                    console.error(`Failed to update record ${record.id}:`, err);
                }
            }

            return { updated: updatedCount, total: loadingRecords.length };

        } catch (error) {
            console.error('Failed to cleanup loading titles:', error);
            return { updated: 0, total: 0 };
        }
    }

    /**
     * Auto-fetch title for loading records
     */
    async autoFetchTitleForLoadingRecords() {
        try {
            const db = require('../sqlite/database');
            const axios = require('axios');

            const loadingRecords = db.prepare(`
                SELECT id, url, title, view_id, domain, enter_time
                FROM visit_history 
                WHERE title = 'Loading...' OR title = 'Untitled Page' OR title IS NULL
                ORDER BY enter_time DESC
                LIMIT 10
            `).all();

            let updatedCount = 0;

            for (const record of loadingRecords) {
                try {
                    if (!record.url || record.url === 'about:blank') {
                        continue;
                    }

                    console.log(`[HistoryManager] Auto-fetching title for URL: ${record.url}`);

                    // Try to fetch the page and extract title
                    const response = await axios.get(record.url, {
                        timeout: 10000,
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                        }
                    });

                    if (response.data) {
                        let newTitle = this.extractTitleFromHTML(response.data);

                        if (!newTitle) {
                            // Fallback to domain name
                            try {
                                const url = new URL(record.url);
                                newTitle = url.hostname.charAt(0).toUpperCase() + url.hostname.slice(1);
                            } catch (err) {
                                newTitle = 'Untitled Page';
                            }
                        }

                        if (newTitle && newTitle !== record.title) {
                            db.prepare(`
                                UPDATE visit_history 
                                SET title = ?, updated_at = ?
                                WHERE id = ?
                            `).run(newTitle, Date.now(), record.id);

                            updatedCount++;
                            console.log(`[HistoryManager] Updated title for record ${record.id}: ${newTitle}`);
                        }
                    }

                } catch (error) {
                    console.log(`[HistoryManager] Failed to fetch title for ${record.url}:`, error.message);

                    // Mark as failed to load if it's been more than 5 minutes
                    const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
                    if (record.enter_time < fiveMinutesAgo) {
                        db.prepare(`
                            UPDATE visit_history 
                            SET title = 'Failed to load', updated_at = ?
                            WHERE id = ?
                        `).run(Date.now(), record.id);
                        updatedCount++;
                    }
                }

                // Add small delay to avoid overwhelming the server
                await new Promise(resolve => setTimeout(resolve, 1000));
            }

            return { updated: updatedCount, total: loadingRecords.length };

        } catch (error) {
            console.error('Failed to auto-fetch titles:', error);
            return { updated: 0, total: 0 };
        }
    }

    /**
     * Extract title from HTML content
     */
    extractTitleFromHTML(html) {
        try {
            // Extract title from <title> tag
            const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
            if (titleMatch && titleMatch[1]) {
                let title = titleMatch[1].trim();
                if (title && title !== 'Loading...' && title !== 'Untitled Page') {
                    return title;
                }
            }

            // Try Open Graph title
            const ogTitleMatch = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']*)["'][^>]*>/i);
            if (ogTitleMatch && ogTitleMatch[1]) {
                let title = ogTitleMatch[1].trim();
                if (title && title !== 'Loading...' && title !== 'Untitled Page') {
                    return title;
                }
            }

            // Try Twitter title
            const twitterTitleMatch = html.match(/<meta[^>]*name=["']twitter:title["'][^>]*content=["']([^"']*)["'][^>]*>/i);
            if (twitterTitleMatch && twitterTitleMatch[1]) {
                let title = twitterTitleMatch[1].trim();
                if (title && title !== 'Loading...' && title !== 'Untitled Page') {
                    return title;
                }
            }

            return null;
        } catch (error) {
            console.error('Error extracting title from HTML:', error);
            return null;
        }
    }

    /**
     * Get initialization status
     */
    getInitializationStatus() {
        return {
            basicInitialized: this.isFullyInitialized,
            shutdownLoggerInitialized: false, // ShutdownLogger removed
            visitTrackerReady: this.visitTracker ? true : false,
            databaseReady: this.historyDB ? true : false,
            userActivityManagerReady: this.userActivityManager ? true : false
        };
    }

    /**
     * Record user navigation activity
     */
    recordNavigationActivity(url, title, navigationType) {
        try {
            if (this.userActivityManager) {
                return this.userActivityManager.recordNavigation(url, title, navigationType);
            }
            return null;
        } catch (error) {
            console.error('Failed to record navigation activity:', error);
            return null;
        }
    }

    /**
     * Record user tab activity
     */
    recordTabActivity(action, url = null, title = null) {
        try {
            if (this.userActivityManager) {
                return this.userActivityManager.recordTabActivity(action, url, title);
            }
            return null;
        } catch (error) {
            console.error('Failed to record tab activity:', error);
            return null;
        }
    }

    /**
     * Get current user activities
     */
    getCurrentUserActivities(limit = 100) {
        try {
            if (this.userActivityManager) {
                return this.userActivityManager.getUserActivities(null, limit);
            }
            return [];
        } catch (error) {
            console.error('Failed to get current user activities:', error);
            return [];
        }
    }

    /**
     * Clear current user activities
     */
    clearCurrentUserActivities() {
        try {
            if (this.userActivityManager) {
                return this.userActivityManager.clearCurrentUserActivities();
            }
            return { success: false, error: 'User activity manager not available' };
        } catch (error) {
            console.error('Failed to clear current user activities:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Get current user activity stats
     */
    getCurrentUserActivityStats() {
        try {
            if (this.userActivityManager) {
                return this.userActivityManager.getCurrentUserStats();
            }
            return { totalActivities: 0, activitiesByType: {}, totalDuration: 0 };
        } catch (error) {
            console.error('Failed to get current user activity stats:', error);
            return { totalActivities: 0, activitiesByType: {}, totalDuration: 0 };
        }
    }
}

module.exports = HistoryManager;