const UrlUtils = require('../utils/urlUtils');
const HistoryDatabase = require('../sqlite/historyDatabase');
const { MAX_ACTIVE_RECORDS, MERGE_THRESHOLD, WRITE_INTERVAL } = require('../config/constants');

// Visit record tracker - Pure database version
class VisitTracker {
    constructor() {
        this.historyDB = new HistoryDatabase();

        // Remove write timer and save callback, database version saves in real-time
        this.writeTimer = null;

        // In-memory cache for active records, for fast access and performance optimization
        this.activeRecordsCache = [];

    }

    /**
     * Load active records from database to memory cache
     */
    loadActiveRecords() {
        try {

            const dbActiveRecords = this.historyDB.getActiveRecords();
            this.activeRecordsCache = dbActiveRecords.map(record => ({
                id: record.id,
                visitId: record.visit_id,
                index: record.visit_id, // Compatible with original index field
                url: record.url,
                enterTime: record.enter_time,
                viewId: record.view_id
            }));


            // Validate cache data integrity
            this.validateCacheIntegrity();

        } catch (error) {
            console.error('Failed to load active records from database:', error);
            this.activeRecordsCache = [];
        }
    }

    /**
     * Validate cache data integrity
     */
    validateCacheIntegrity() {
        try {
            const dbCount = this.historyDB.getActiveRecords().length;
            const cacheCount = this.activeRecordsCache.length;

            if (dbCount !== cacheCount) {
                console.warn(`Cache integrity issue: DB has ${dbCount} records, cache has ${cacheCount}`);
                // Reload cache
                this.loadActiveRecords();
            } else {
            }
        } catch (error) {
            console.error('Failed to validate cache integrity:', error);
        }
    }

    /**
     * Check if need to merge with recent record (query from database)
     */
    shouldMergeWithLastRecord(url, currentTime) {
        try {
            const cutoffTime = currentTime - MERGE_THRESHOLD;
            const recentRecord = this.historyDB.getRecentVisitByUrl(url, cutoffTime);

            if (!recentRecord) return false;

            const timeDiff = currentTime - recentRecord.enter_time;
            const shouldMerge = timeDiff < MERGE_THRESHOLD && recentRecord.stay_duration === null;

            if (shouldMerge) {
            }

            return shouldMerge;
        } catch (error) {
            console.error('Error checking merge condition:', error);
            return false;
        }
    }

    /**
     * Update last record timestamp (database operation)
     */
    updateLastRecordTimestamp(url, currentTime) {
        try {
            const cutoffTime = currentTime - MERGE_THRESHOLD;
            const recentRecord = this.historyDB.getRecentVisitByUrl(url, cutoffTime);

            if (recentRecord) {
                const timestamp = new Date(currentTime).toISOString();
                this.historyDB.updateRecordTimestamp(recentRecord.id, timestamp);
                return recentRecord.id;
            }
            return null;
        } catch (error) {
            console.error('Failed to update record timestamp in database:', error);
            return null;
        }
    }

    /**
     * Complete record and save to database
     */
    finishRecord(visitId, endTime) {
        try {
            // Find active record from cache
            const activeRecord = this.activeRecordsCache.find(ar => ar.visitId === visitId);
            if (!activeRecord) {
                console.warn(`Active record not found in cache for visitId: ${visitId}`);
                return;
            }

            const stayDuration = (endTime - activeRecord.enterTime) / 1000;
            if (stayDuration >= 0) {
                // Update stay duration in database
                this.historyDB.updateRecordDuration(visitId, stayDuration);

                // Delete from active records table
                this.historyDB.deleteActiveRecord(activeRecord.id);

                // Remove from cache
                const index = this.activeRecordsCache.indexOf(activeRecord);
                if (index > -1) {
                    this.activeRecordsCache.splice(index, 1);
                }

            }
        } catch (error) {
            console.error('Failed to finish record in database:', error);
        }
    }

    /**
     * Complete oldest active record
     */
    finishOldestActiveRecord(endTime) {
        if (this.activeRecordsCache.length === 0) return;

        try {
            // Sort by enter time, complete earliest record
            this.activeRecordsCache.sort((a, b) => a.enterTime - b.enterTime);
            const oldest = this.activeRecordsCache[0];

            this.finishRecord(oldest.visitId, endTime);
            console.log(`Finished oldest active record (limit reached): ${oldest.url}`);
        } catch (error) {
            console.error('Failed to finish oldest record:', error);
        }
    }

    /**
     * Complete active records by view ID
     */
    finishActiveRecordsByViewId(viewId, endTime) {
        try {
            const toFinish = this.activeRecordsCache.filter(record => record.viewId === viewId);

            toFinish.forEach(record => {
                this.finishRecord(record.visitId, endTime);
            });

            const finishedCount = toFinish.length;
            if (finishedCount > 0) {
            }
        } catch (error) {
            console.error('Failed to finish active records by viewId:', error);
        }
    }

    /**
     * Create new visit record and save to database
     */
    createNewVisitRecord(url, viewId, currentTime, userId = null) {
        try {
            const timestamp = new Date(currentTime).toISOString();
            const domain = UrlUtils.extractDomain(url);


            // Insert into database and get ID
            const visitId = this.historyDB.addVisitRecord(
                url,
                'Loading...',
                timestamp,
                currentTime,
                viewId,
                domain,
                userId
            );

            if (!visitId) {
                throw new Error('Failed to get visit ID from database');
            }

            const newRecord = {
                id: visitId,
                url,
                title: 'Loading...',
                timestamp,
                enterTime: currentTime,
                stayDuration: null,
                viewId: viewId,
                domain
            };

            return newRecord;
        } catch (error) {
            console.error('Failed to create new visit record in database:', error);
            return null;
        }
    }

    /**
     * Main visit record method - all using database
     */
    recordVisit(url, viewId, userId = null) {
        // Skip special URLs
        if (!UrlUtils.isValidUrl(url)) {
            console.log(`Skipping invalid URL: ${url}`);
            return null;
        }

        // Additional check if it's a history page
        if (UrlUtils.isHistoryRelatedPage(url)) {
            return null;
        }

        const now = Date.now();

        try {
            // Begin database transaction
            this.historyDB.beginTransaction();

            // 1. Check if need to merge records
            if (this.shouldMergeWithLastRecord(url, now)) {
                const visitId = this.updateLastRecordTimestamp(url, now);
                this.historyDB.commitTransaction();
                return { id: visitId };
            }

            // 2. Manage active records count limit
            if (this.activeRecordsCache.length >= MAX_ACTIVE_RECORDS) {
                console.log(`Active records limit reached (${MAX_ACTIVE_RECORDS}), finishing oldest`);
                this.finishOldestActiveRecord(now);
            }

            // 3. End current view's active records (one view can only have one active page)
            this.finishActiveRecordsByViewId(viewId, now);

            // 4. Create new record
            const newRecord = this.createNewVisitRecord(url, viewId, now, userId);
            if (!newRecord) {
                throw new Error('Failed to create new visit record');
            }

            // 5. Add to active records table and cache
            const activeRecordId = this.historyDB.addActiveRecord(
                newRecord.id,
                url,
                now,
                viewId
            );

            // Update memory cache
            this.activeRecordsCache.push({
                id: activeRecordId,
                visitId: newRecord.id,
                index: newRecord.id, // Compatibility
                url: url,
                enterTime: now,
                viewId: viewId
            });

            // Commit database transaction
            this.historyDB.commitTransaction();


            return newRecord;

        } catch (error) {
            // Rollback transaction
            this.historyDB.rollbackTransaction();
            console.error('Failed to record visit in database:', error);
            return null;
        }
    }

    /**
     * Rebuild active records index (reload from database)
     */
    rebuildActiveRecords() {
        console.log('Rebuilding active records from database...');
        this.loadActiveRecords();
    }

    /**
     * Update record title (database operation)
     */
    updateRecordTitle(record, title) {
        try {
            if (record && record.id) {
                const finalTitle = title || 'Untitled Page';
                this.historyDB.updateRecordTitle(record.id, finalTitle);
            } else {
                console.warn('Invalid record object for title update:', record);
            }
        } catch (error) {
            console.error('Failed to update record title in database:', error);
        }
    }

    /**
     * Get visit statistics (directly from database)
     */
    getVisitStats() {
        console.log('Calculating visit stats from database...');

        try {
            const stats = this.historyDB.getVisitStats();

            // Add active records count (from cache, better performance)
            stats.activeRecords = this.activeRecordsCache.length;

            console.log('Visit stats calculated from database:', {
                totalVisits: stats.totalVisits,
                totalTimeMinutes: `${(stats.totalTime / 60).toFixed(1)} min`,
                averageStayTime: `${stats.averageStayTime.toFixed(1)} sec`,
                topPagesCount: Object.keys(stats.topPages).length,
                activeRecords: stats.activeRecords
            });

            return stats;
        } catch (error) {
            console.error('Failed to get visit stats from database:', error);
            return {
                totalVisits: 0,
                totalTime: 0,
                averageStayTime: 0,
                topPages: {},
                activeRecords: this.activeRecordsCache.length
            };
        }
    }

    /**
     * Get active records information
     */
    getActiveRecordsInfo() {
        try {
            return {
                activeRecords: this.activeRecordsCache.map(ar => ({
                    url: ar.url,
                    enterTime: new Date(ar.enterTime).toISOString(),
                    viewId: ar.viewId,
                    duration: Math.round((Date.now() - ar.enterTime) / 1000) + 's'
                })),
                totalActive: this.activeRecordsCache.length,
                maxActive: MAX_ACTIVE_RECORDS
            };
        } catch (error) {
            console.error('Failed to get active records info:', error);
            return {
                activeRecords: [],
                totalActive: 0,
                maxActive: MAX_ACTIVE_RECORDS
            };
        }
    }

    /**
     * Get visit history (directly from database)
     */
    get visitHistory() {
        try {
            return this.historyDB.getVisitHistory(1000);
        } catch (error) {
            console.error('Failed to get visit history from database:', error);
            return [];
        }
    }

    /**
     * Get active records (compatibility property)
     */
    get activeRecords() {
        return this.activeRecordsCache.map(ar => ({
            index: ar.visitId,
            url: ar.url,
            enterTime: ar.enterTime,
            viewId: ar.viewId
        }));
    }

    /**
     * Clear all active records and save to database
     */
    clearAllActiveRecords(endTime = Date.now()) {
        console.log('Clearing all active records and saving to database...');

        try {
            this.historyDB.beginTransaction();

            // End all active records
            let processedCount = 0;
            this.activeRecordsCache.forEach(activeRecord => {
                const stayDuration = (endTime - activeRecord.enterTime) / 1000;
                if (stayDuration >= 0) {
                    this.historyDB.updateRecordDuration(activeRecord.visitId, stayDuration);
                    processedCount++;
                }
            });

            console.log(`Updated ${processedCount} records with final duration in database`);

            // Clear active records table in database
            this.historyDB.clearActiveRecords();

            // Clear memory cache
            this.activeRecordsCache = [];

            this.historyDB.commitTransaction();
            console.log('All active records cleared and saved to database successfully');

        } catch (error) {
            this.historyDB.rollbackTransaction();
            console.error('Failed to clear active records in database:', error);
        }
    }

    /**
     * Force write (not needed for database version, kept for compatibility)
     */
    forceWrite() {
        console.log('Force write requested - database version saves in real-time');

        // Validate data integrity
        this.validateCacheIntegrity();

        const stats = this.getVisitStats();
        console.log('Current database status:', {
            totalRecords: stats.totalVisits,
            activeRecords: stats.activeRecords
        });
    }

    /**
     * Get database status
     */
    getDatabaseStatus() {
        try {
            const visitHistoryCount = this.historyDB.getVisitHistoryCount();
            const activeRecordsCount = this.historyDB.getActiveRecords().length;
            const cacheCount = this.activeRecordsCache.length;

            return {
                visitHistoryCount,
                activeRecordsInDb: activeRecordsCount,
                activeRecordsInCache: cacheCount,
                cacheInSync: activeRecordsCount === cacheCount,
                maxActiveRecords: MAX_ACTIVE_RECORDS
            };
        } catch (error) {
            console.error('Failed to get database status:', error);
            return {
                visitHistoryCount: 0,
                activeRecordsInDb: 0,
                activeRecordsInCache: this.activeRecordsCache.length,
                cacheInSync: false,
                maxActiveRecords: MAX_ACTIVE_RECORDS
            };
        }
    }
}

module.exports = VisitTracker;