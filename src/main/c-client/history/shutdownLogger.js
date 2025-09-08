const { app } = require('electron');
const HistoryDatabase = require('../sqlite/historyDatabase');

// Shutdown time logging class - Pure database version (Fixed auto-shutdown issue)
class ShutdownLogger {
    constructor(visitTracker) {
        this.visitTracker = visitTracker;
        this.historyDB = new HistoryDatabase();

        // Record app start time for session duration calculation
        this.appStartTime = Date.now();

        // Mark whether event listeners have been initialized
        this.eventsInitialized = false;

    }

    /**
     * Initialize event listeners (called after app is fully started)
     */
    initialize() {
        if (this.eventsInitialized) {
            console.log('ShutdownLogger events already initialized');
            return;
        }

        this.setupEventListeners();
        this.eventsInitialized = true;
    }

    /**
     * Record shutdown log to database
     * @param {string} reason Shutdown reason
     */
    log(reason = 'normal') {
        const shutdownTime = Date.now();
        const logEntry = {
            timestamp: new Date(shutdownTime).toISOString(),
            timestampMs: shutdownTime,
            reason: reason,
            platform: process.platform,
            version: app.getVersion(),
            lastVisitedUrl: this.getLastActiveUrl(),
            sessionDuration: this.calculateSessionDuration(shutdownTime)
        };

        try {
            console.log('Recording shutdown to database:', {
                timestamp: logEntry.timestamp,
                reason: logEntry.reason,
                sessionDuration: `${logEntry.sessionDuration}s`
            });

            // Save to database
            this.historyDB.addShutdownLog(
                logEntry.timestamp,
                logEntry.timestampMs,
                logEntry.reason,
                logEntry.platform,
                logEntry.version,
                logEntry.lastVisitedUrl,
                logEntry.sessionDuration
            );

            // Clean up old logs, keep only the latest 50
            this.historyDB.cleanupShutdownLogs(50);

            console.log('Shutdown log saved to database successfully');

            // Process all active records
            this.recordFinalShutdown(shutdownTime);

        } catch (error) {
            console.error('Failed to record shutdown to database:', error);
        }
    }

    /**
     * Get last visited URL (from database and cache)
     * @returns {string|null} Last visited URL
     */
    getLastActiveUrl() {
        try {
            // First try to get from active records cache
            if (this.visitTracker && this.visitTracker.activeRecordsCache.length > 0) {
                const lastActive = this.visitTracker.activeRecordsCache[this.visitTracker.activeRecordsCache.length - 1];
                console.log('Last active URL from cache:', lastActive.url);
                return lastActive.url;
            }

            // Get recent visit records from database
            const recentVisits = this.historyDB.getVisitHistory(1);
            if (recentVisits.length > 0) {
                console.log('Last visited URL from database:', recentVisits[0].url);
                return recentVisits[0].url;
            }

            console.log('No last visited URL found');
            return null;
        } catch (error) {
            console.error('Failed to get last active URL:', error);
            return null;
        }
    }

    /**
     * Calculate session duration (using database records)
     * @param {number} shutdownTime Shutdown time
     * @returns {number} Session duration (seconds)
     */
    calculateSessionDuration(shutdownTime) {
        try {
            // Method 1: Calculate using app start time
            const sessionDuration = Math.round((shutdownTime - this.appStartTime) / 1000);

            // Method 2: Calculate from first database record (for verification)
            const allVisits = this.historyDB.getVisitHistory();
            if (allVisits.length > 0) {
                const firstVisit = allVisits[allVisits.length - 1]; // Earliest record is at the end
                const firstVisitTime = new Date(firstVisit.timestamp).getTime();
                const dbSessionDuration = Math.round((shutdownTime - firstVisitTime) / 1000);

                console.log('Session duration calculation:', {
                    fromAppStart: `${sessionDuration}s`,
                    fromFirstVisit: `${dbSessionDuration}s`,
                    firstVisitUrl: firstVisit.url
                });

                // Return the larger value to ensure accuracy
                return Math.max(sessionDuration, dbSessionDuration);
            }

            console.log(`Session duration: ${sessionDuration}s (from app start)`);
            return sessionDuration;
        } catch (error) {
            console.error('Failed to calculate session duration:', error);
            return Math.round((shutdownTime - this.appStartTime) / 1000);
        }
    }

    /**
     * Handle final shutdown, complete all active records and save to database
     * @param {number} shutdownTime Shutdown time
     */
    recordFinalShutdown(shutdownTime) {
        if (!this.visitTracker) {
            console.log('No visit tracker available for final shutdown processing');
            return;
        }

        console.log('=== Final shutdown processing - saving to database ===');
        console.log('Shutdown time:', new Date(shutdownTime).toISOString());
        console.log(`Processing ${this.visitTracker.activeRecordsCache.length} active records`);

        try {
            // Begin database transaction
            this.historyDB.beginTransaction();

            // End all active records and save to database
            let processedCount = 0;
            let totalDuration = 0;

            this.visitTracker.activeRecordsCache.forEach(activeRecord => {
                const finalStayDuration = (shutdownTime - activeRecord.enterTime) / 1000;
                if (finalStayDuration >= 0) {
                    // Update stay duration in database
                    this.historyDB.updateRecordDuration(activeRecord.visitId, finalStayDuration);
                    processedCount++;
                    totalDuration += finalStayDuration;

                    console.log(`Saved final record to database: ${activeRecord.url} - ${finalStayDuration.toFixed(2)}s`);
                }
            });

            console.log(`Processed ${processedCount} active records during shutdown`);
            console.log(`Total browsing time in final session: ${totalDuration.toFixed(2)}s`);

            // Clear active records table (database)
            this.historyDB.clearActiveRecords();

            // Clear visit tracker cache
            if (this.visitTracker.activeRecordsCache) {
                this.visitTracker.activeRecordsCache = [];
            }

            // Commit database transaction
            this.historyDB.commitTransaction();
            console.log('Final shutdown processing completed - all data saved to database');

        } catch (error) {
            // Rollback transaction
            this.historyDB.rollbackTransaction();
            console.error('Failed to process shutdown records in database:', error);
        }
    }

    /**
     * Set up app event listeners (only called after initialization)
     */
    setupEventListeners() {
        if (!app.isReady()) {
            console.log('App not ready, deferring event listener setup');
            app.whenReady().then(() => {
                this.setupActualEventListeners();
            });
        } else {
            this.setupActualEventListeners();
        }
    }

    /**
     * Actually set up event listeners
     */
    setupActualEventListeners() {

        // Note: Do not set window-all-closed and before-quit events here
        // These should be managed by the main app to avoid conflicts

        // Exception shutdown handling
        process.on('uncaughtException', (error) => {
            console.error('Uncaught Exception:', error);
            this.log('uncaught-exception');
            // Give database some time to save
            setTimeout(() => process.exit(1), 1000);
        });

        process.on('unhandledRejection', (reason, promise) => {
            console.error('Unhandled Rejection:', reason);
            this.log('unhandled-rejection');
        });

        // System signal handling (Linux/macOS)
        if (process.platform !== 'win32') {
            process.on('SIGINT', () => {
                console.log('System signal: SIGINT');
                this.log('SIGINT');
                // Do not call app.quit() here, let main app handle it
            });

            process.on('SIGTERM', () => {
                console.log('System signal: SIGTERM');
                this.log('SIGTERM');
                // Do not call app.quit() here, let main app handle it
            });
        }

        // Windows specific handling
        if (process.platform === 'win32') {
            process.on('message', (msg) => {
                if (msg === 'shutdown') {
                    console.log('Windows shutdown message received');
                    this.log('windows-shutdown');
                    // Do not call app.quit() here, let main app handle it
                }
            });
        }

    }

    /**
     * Manually record shutdown (called by main app)
     * @param {string} reason Shutdown reason
     */
    recordShutdown(reason = 'normal') {
        this.log(reason);
    }

    /**
     * Get shutdown history (from database)
     * @param {number} limit Limit return count
     * @returns {array} Shutdown history array
     */
    getShutdownHistory(limit = 50) {
        try {
            const history = this.historyDB.getShutdownHistory(limit);
            console.log(`Retrieved ${history.length} shutdown records from database`);
            return history;
        } catch (error) {
            console.error('Failed to get shutdown history from database:', error);
            return [];
        }
    }

    /**
     * 获取关闭统计信息（从数据库）
     * @returns {object} 关闭统计
     */
    getShutdownStats() {
        try {
            const history = this.getShutdownHistory();

            // Statistics by shutdown reason
            const reasonStats = {};
            let totalSessions = history.length;
            let totalSessionTime = 0;

            history.forEach(record => {
                // Count reasons
                reasonStats[record.reason] = (reasonStats[record.reason] || 0) + 1;

                // Accumulate session time
                if (record.session_duration) {
                    totalSessionTime += record.session_duration;
                }
            });

            const avgSessionTime = totalSessions > 0 ? totalSessionTime / totalSessions : 0;

            console.log('Shutdown statistics calculated from database:', {
                totalSessions,
                avgSessionTime: `${avgSessionTime.toFixed(1)}s`,
                reasonBreakdown: reasonStats
            });

            return {
                totalSessions,
                totalSessionTime,
                averageSessionTime: avgSessionTime,
                reasonBreakdown: reasonStats,
                lastShutdown: history.length > 0 ? history[0] : null
            };
        } catch (error) {
            console.error('Failed to calculate shutdown stats:', error);
            return {
                totalSessions: 0,
                totalSessionTime: 0,
                averageSessionTime: 0,
                reasonBreakdown: {},
                lastShutdown: null
            };
        }
    }

    /**
     * Clean up old shutdown logs
     * @param {number} keepCount Keep count
     * @returns {object} Cleanup result
     */
    cleanupOldShutdownLogs(keepCount = 50) {
        try {
            const result = this.historyDB.cleanupShutdownLogs(keepCount);
            console.log(`Cleaned up old shutdown logs, kept recent ${keepCount} records`);
            return result;
        } catch (error) {
            console.error('Failed to cleanup old shutdown logs:', error);
            return { changes: 0 };
        }
    }

    /**
     * Manually trigger shutdown record (for testing)
     * @param {string} reason Shutdown reason
     * @returns {boolean} Whether successful
     */
    manualShutdownLog(reason = 'manual-test') {
        try {
            this.log(reason);
            return true;
        } catch (error) {
            console.error('Failed to create manual shutdown log:', error);
            return false;
        }
    }

    /**
     * Check if already initialized
     * @returns {boolean} Whether already initialized
     */
    isInitialized() {
        return this.eventsInitialized;
    }
}

module.exports = ShutdownLogger;