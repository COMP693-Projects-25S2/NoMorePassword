// /src/main/sqlite/historyDatabase.js
const db = require('./database');

class HistoryDatabase {
    constructor() {
        this.initTables();
    }

    // Initialize browsing history related tables
    initTables() {
        // Disable foreign key constraints for simpler data management
        db.pragma('foreign_keys = OFF');
        // Create browsing history table
        db.exec(`
            CREATE TABLE IF NOT EXISTS visit_history (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id     VARCHAR(50),
                url         TEXT NOT NULL,
                title       TEXT DEFAULT 'Loading...',
                timestamp   TEXT NOT NULL,
                enter_time  INTEGER NOT NULL,
                stay_duration REAL,
                view_id     INTEGER,
                domain      TEXT,
                created_at  INTEGER DEFAULT (strftime('%s', 'now') * 1000),
                updated_at  INTEGER DEFAULT (strftime('%s', 'now') * 1000)
            )
        `);

        // Create active records table (for tracking incomplete visits)
        db.exec(`
            CREATE TABLE IF NOT EXISTS active_records (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                visit_id    INTEGER NOT NULL,
                url         TEXT NOT NULL,
                enter_time  INTEGER NOT NULL,
                view_id     INTEGER,
                created_at  INTEGER DEFAULT (strftime('%s', 'now') * 1000)
            )
        `);

        // Create shutdown logs table
        db.exec(`
            CREATE TABLE IF NOT EXISTS shutdown_logs (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp       TEXT NOT NULL,
                timestamp_ms    INTEGER NOT NULL,
                reason          TEXT DEFAULT 'normal',
                platform        TEXT,
                version         TEXT,
                last_visited_url TEXT,
                session_duration INTEGER DEFAULT 0,
                created_at      INTEGER DEFAULT (strftime('%s', 'now') * 1000)
            )
        `);

        // Add user_id column to existing visit_history table if it doesn't exist
        try {
            db.exec(`ALTER TABLE visit_history ADD COLUMN user_id VARCHAR(50)`);
            console.log('Added user_id column to visit_history table');
        } catch (error) {
            // Column might already exist, which is fine
            console.log('user_id column already exists or table is new');
        }

        // Add timestamp column to existing visit_history table if it doesn't exist
        try {
            db.exec(`ALTER TABLE visit_history ADD COLUMN timestamp TEXT`);
            console.log('Added timestamp column to visit_history table');
        } catch (error) {
            // Column might already exist, which is fine
            console.log('timestamp column already exists or table is new');
        }

        // Add created_at column to existing visit_history table if it doesn't exist
        try {
            db.exec(`ALTER TABLE visit_history ADD COLUMN created_at INTEGER`);
            console.log('Added created_at column to visit_history table');
        } catch (error) {
            // Column might already exist, which is fine
            console.log('created_at column already exists or table is new');
        }

        // Add updated_at column to existing visit_history table if it doesn't exist
        try {
            db.exec(`ALTER TABLE visit_history ADD COLUMN updated_at INTEGER`);
            console.log('Added updated_at column to visit_history table');
        } catch (error) {
            // Column might already exist, which is fine
            console.log('updated_at column already exists or table is new');
        }

        // Add stay_duration column to existing visit_history table if it doesn't exist
        try {
            db.exec(`ALTER TABLE visit_history ADD COLUMN stay_duration REAL`);
            console.log('Added stay_duration column to visit_history table');
        } catch (error) {
            // Column might already exist, which is fine
            console.log('stay_duration column already exists or table is new');
        }

        // Add timestamp_ms column to existing shutdown_logs table if it doesn't exist
        try {
            db.exec(`ALTER TABLE shutdown_logs ADD COLUMN timestamp_ms INTEGER`);
            console.log('Added timestamp_ms column to shutdown_logs table');
        } catch (error) {
            // Column might already exist, which is fine
            console.log('timestamp_ms column already exists or table is new');
        }

        // Add platform column to existing shutdown_logs table if it doesn't exist
        try {
            db.exec(`ALTER TABLE shutdown_logs ADD COLUMN platform TEXT`);
            console.log('Added platform column to shutdown_logs table');
        } catch (error) {
            // Column might already exist, which is fine
            console.log('platform column already exists or table is new');
        }

        // Add version column to existing shutdown_logs table if it doesn't exist
        try {
            db.exec(`ALTER TABLE shutdown_logs ADD COLUMN version TEXT`);
            console.log('Added version column to shutdown_logs table');
        } catch (error) {
            // Column might already exist, which is fine
            console.log('version column already exists or table is new');
        }

        // Add last_visited_url column to existing shutdown_logs table if it doesn't exist
        try {
            db.exec(`ALTER TABLE shutdown_logs ADD COLUMN last_visited_url TEXT`);
            console.log('Added last_visited_url column to shutdown_logs table');
        } catch (error) {
            // Column might already exist, which is fine
            console.log('last_visited_url column already exists or table is new');
        }

        // Add session_duration column to existing shutdown_logs table if it doesn't exist
        try {
            db.exec(`ALTER TABLE shutdown_logs ADD COLUMN session_duration INTEGER`);
            console.log('Added session_duration column to shutdown_logs table');
        } catch (error) {
            // Column might already exist, which is fine
            console.log('session_duration column already exists or table is new');
        }

        // Create indexes to optimize query performance
        try {
            db.exec(`CREATE INDEX IF NOT EXISTS idx_visit_history_url ON visit_history(url)`);
            db.exec(`CREATE INDEX IF NOT EXISTS idx_visit_history_view_id ON visit_history(view_id)`);
            db.exec(`CREATE INDEX IF NOT EXISTS idx_visit_history_user_id ON visit_history(user_id)`);
            db.exec(`CREATE INDEX IF NOT EXISTS idx_active_records_view_id ON active_records(view_id)`);
            db.exec(`CREATE INDEX IF NOT EXISTS idx_shutdown_logs_timestamp ON shutdown_logs(timestamp_ms)`);

            // Try to create timestamp index, but don't fail if column doesn't exist
            try {
                db.exec(`CREATE INDEX IF NOT EXISTS idx_visit_history_timestamp ON visit_history(timestamp)`);
            } catch (error) {
                console.log('timestamp column index creation skipped - column may not exist yet');
            }
        } catch (error) {
            console.log('Some indexes creation failed, but continuing...', error.message);
        }
    }

    // ===================== Visit History Operations =====================

    // Add visit record
    addVisitRecord(url, title, timestamp, enterTime, viewId, domain, userId = null) {
        const stmt = db.prepare(`
            INSERT INTO visit_history (user_id, url, title, timestamp, enter_time, view_id, domain, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);
        const info = stmt.run(userId, url, title, timestamp, enterTime, viewId, domain, Date.now());
        return info.lastInsertRowid;
    }

    // Update record title
    updateRecordTitle(visitId, title) {
        const stmt = db.prepare(`
            UPDATE visit_history 
            SET title = ?, updated_at = ?
            WHERE id = ?
        `);
        return stmt.run(title, Date.now(), visitId);
    }

    // Update record stay duration
    updateRecordDuration(visitId, stayDuration) {
        const stmt = db.prepare(`
            UPDATE visit_history 
            SET stay_duration = ?, updated_at = ?
            WHERE id = ?
        `);
        return stmt.run(stayDuration, Date.now(), visitId);
    }

    // Get visit history (with pagination and user filtering)
    getVisitHistory(limit = null, offset = 0, userId = null) {
        let query = `SELECT * FROM visit_history`;
        const params = [];

        if (userId) {
            query += ` WHERE user_id = ?`;
            params.push(userId);
        }

        query += ` ORDER BY enter_time DESC`;

        if (limit) {
            query += ` LIMIT ? OFFSET ?`;
            params.push(limit, offset);
            return db.prepare(query).all(...params);
        }
        return db.prepare(query).all(...params);
    }

    // Get total visit history count
    getVisitHistoryCount() {
        return db.prepare(`SELECT COUNT(*) as count FROM visit_history`).get().count;
    }

    // Find recent visit record by URL
    getRecentVisitByUrl(url, timeThreshold) {
        const stmt = db.prepare(`
            SELECT * FROM visit_history 
            WHERE url = ? AND enter_time > ? AND stay_duration IS NULL
            ORDER BY enter_time DESC 
            LIMIT 1
        `);
        return stmt.get(url, timeThreshold);
    }

    // Update record timestamp (for merging visits)
    updateRecordTimestamp(visitId, timestamp) {
        const stmt = db.prepare(`
            UPDATE visit_history 
            SET timestamp = ?, updated_at = ?
            WHERE id = ?
        `);
        return stmt.run(timestamp, Date.now(), visitId);
    }

    // ===================== Active Records Operations =====================

    // Add active record
    addActiveRecord(visitId, url, enterTime, viewId) {
        const stmt = db.prepare(`
            INSERT INTO active_records (visit_id, url, enter_time, view_id)
            VALUES (?, ?, ?, ?)
        `);
        const info = stmt.run(visitId, url, enterTime, viewId);
        return info.lastInsertRowid;
    }

    // Get all active records
    getActiveRecords() {
        try {
            // First check if active_records table exists and has data
            const count = db.prepare(`SELECT COUNT(*) as count FROM active_records`).get().count;
            if (count === 0) {
                return [];
            }

            // Try to get records with join
            return db.prepare(`
                SELECT ar.*, vh.url, vh.title 
                FROM active_records ar 
                JOIN visit_history vh ON ar.visit_id = vh.id 
                ORDER BY ar.enter_time ASC
            `).all();
        } catch (error) {
            console.log('getActiveRecords: No active records found or table structure issue:', error.message);
            return [];
        }
    }

    // Get active records by view_id
    getActiveRecordsByViewId(viewId) {
        return db.prepare(`
            SELECT ar.*, vh.url, vh.title 
            FROM active_records ar 
            JOIN visit_history vh ON ar.visit_id = vh.id 
            WHERE ar.view_id = ?
        `).all(viewId);
    }

    // Delete active record
    deleteActiveRecord(activeRecordId) {
        return db.prepare(`DELETE FROM active_records WHERE id = ?`).run(activeRecordId);
    }

    // Delete active record by visit_id
    deleteActiveRecordByVisitId(visitId) {
        return db.prepare(`DELETE FROM active_records WHERE visit_id = ?`).run(visitId);
    }

    // Delete active records by view_id
    deleteActiveRecordsByViewId(viewId) {
        return db.prepare(`DELETE FROM active_records WHERE view_id = ?`).run(viewId);
    }

    // Get oldest active record
    getOldestActiveRecord() {
        return db.prepare(`
            SELECT ar.*, vh.url, vh.title 
            FROM active_records ar 
            JOIN visit_history vh ON ar.visit_id = vh.id 
            ORDER BY ar.enter_time ASC 
            LIMIT 1
        `).get();
    }

    // Clear all active records
    clearActiveRecords() {
        return db.prepare(`DELETE FROM active_records`).run();
    }

    // ===================== Statistics =====================

    // Get visit statistics (with user filtering)
    getVisitStats(userId = null) {
        let whereClause = '';
        const params = [];

        if (userId) {
            whereClause = ' WHERE user_id = ?';
            params.push(userId);
        }

        // Total visit count
        const totalVisits = db.prepare(`SELECT COUNT(*) as count FROM visit_history${whereClause}`).get(...params).count;

        // Total time (only calculate valid stay duration)
        const totalTimeWhere = userId ? ' AND user_id = ?' : '';
        const totalTimeParams = userId ? [userId] : [];
        const totalTimeResult = db.prepare(`
            SELECT COALESCE(SUM(stay_duration), 0) as total_time 
            FROM visit_history 
            WHERE stay_duration IS NOT NULL AND stay_duration > 0${totalTimeWhere}
        `).get(...totalTimeParams);

        // Average stay time
        const avgTimeResult = db.prepare(`
            SELECT COALESCE(AVG(stay_duration), 0) as avg_time 
            FROM visit_history 
            WHERE stay_duration IS NOT NULL AND stay_duration > 0${totalTimeWhere}
        `).get(...totalTimeParams);

        // Popular pages (by domain statistics)
        let topPagesQuery = `
            SELECT domain, COUNT(*) as count 
            FROM visit_history 
            WHERE domain IS NOT NULL
        `;
        if (whereClause) {
            topPagesQuery += ` AND user_id = ?`;
        }
        topPagesQuery += `
            GROUP BY domain 
            ORDER BY count DESC 
            LIMIT 10
        `;

        const topPages = db.prepare(topPagesQuery).all(...params);

        // Active records count
        const activeRecords = db.prepare(`SELECT COUNT(*) as count FROM active_records`).get().count;

        return {
            totalVisits,
            totalTime: totalTimeResult.total_time,
            averageStayTime: avgTimeResult.avg_time,
            topPages: topPages.reduce((acc, item) => {
                acc[item.domain] = item.count;
                return acc;
            }, {}),
            activeRecords
        };
    }

    // ===================== Shutdown Logs Operations =====================

    // Add shutdown log
    addShutdownLog(timestamp, timestampMs, reason, platform, version, lastVisitedUrl, sessionDuration) {
        const stmt = db.prepare(`
            INSERT INTO shutdown_logs (timestamp, timestamp_ms, reason, platform, version, last_visited_url, session_duration)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `);
        return stmt.run(timestamp, timestampMs, reason, platform, version, lastVisitedUrl, sessionDuration);
    }

    // Get shutdown history
    getShutdownHistory(limit = 50) {
        return db.prepare(`
            SELECT * FROM shutdown_logs 
            ORDER BY timestamp_ms DESC 
            LIMIT ?
        `).all(limit);
    }

    // Clean up old shutdown logs (keep recent N records)
    cleanupShutdownLogs(keepCount = 50) {
        const stmt = db.prepare(`
            DELETE FROM shutdown_logs 
            WHERE id NOT IN (
                SELECT id FROM shutdown_logs 
                ORDER BY timestamp_ms DESC 
                LIMIT ?
            )
        `);
        return stmt.run(keepCount);
    }

    // ===================== Data Cleanup and Maintenance =====================

    // Clean up old data (keep recent N days of data)
    cleanupOldData(daysToKeep = 30) {
        const cutoffTime = Date.now() - (daysToKeep * 24 * 60 * 60 * 1000);

        // Clean up old visit history
        const cleanupVisits = db.prepare(`
            DELETE FROM visit_history 
            WHERE enter_time < ?
        `).run(cutoffTime);

        // Clean up old shutdown logs
        this.cleanupShutdownLogs();

        return cleanupVisits;
    }

    // Get database statistics
    getDatabaseStats() {
        const stats = {};
        stats.visitHistory = db.prepare(`SELECT COUNT(*) as count FROM visit_history`).get().count;
        stats.activeRecords = db.prepare(`SELECT COUNT(*) as count FROM active_records`).get().count;
        stats.shutdownLogs = db.prepare(`SELECT COUNT(*) as count FROM shutdown_logs`).get().count;

        // Database file size and other information can be obtained through other methods
        return stats;
    }

    // Begin transaction
    beginTransaction() {
        return db.prepare('BEGIN TRANSACTION').run();
    }

    // Commit transaction
    commitTransaction() {
        return db.prepare('COMMIT').run();
    }

    // Rollback transaction
    rollbackTransaction() {
        return db.prepare('ROLLBACK').run();
    }
}

module.exports = HistoryDatabase;