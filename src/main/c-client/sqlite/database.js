// /src/main/sqlite/database.js
const Database = require('better-sqlite3');
const path = require('path');
const FileUtils = require('../utils/fileUtils');

// Database file path - use exe file directory for independent instances
const { app } = require('electron');
const os = require('os');

// Get exe file directory for independent database instances
let exeDir;
if (app && app.isPackaged) {
    // For packaged Electron app, use the app directory
    exeDir = path.dirname(process.execPath);
} else {
    // For development or unpackaged app, use the current working directory
    exeDir = process.cwd();
}

const dbPath = path.join(exeDir, 'secure.db');

// Check if directory exists
const dbDir = path.dirname(dbPath);
if (!require('fs').existsSync(dbDir)) {
    console.error('Database directory does not exist:', dbDir);
    require('fs').mkdirSync(dbDir, { recursive: true });
}

// Initialize database connection
const db = new Database(dbPath);

// Use SQLCipher to set encryption key
// In actual applications, don't hardcode passwords, can get from environment variables or user input
try {
    db.pragma(`key = 'your_secret_password'`);
} catch (error) {
    console.warn('Database encryption setup failed, using unencrypted database:', error);
}

// Create table: domain_main_nodes, record all domain's current main nodes, maximum 1000 records
db.exec(`
    CREATE TABLE IF NOT EXISTS domain_main_nodes (
        node_id         VARCHAR(50) PRIMARY KEY,
        domain_id       VARCHAR(50),
        status          VARCHAR(20) DEFAULT 'active',
        sub_amount      INTEGER DEFAULT 0,
        created_at      INTEGER DEFAULT (strftime('%s', 'now')),
        updated_at      INTEGER DEFAULT (strftime('%s', 'now'))
    )
`);


// Create table: cluster_main_nodes, record current domain's all cluster main nodes, maximum 1000 records
db.exec(`
    CREATE TABLE IF NOT EXISTS cluster_main_nodes (
        node_id         VARCHAR(50) PRIMARY KEY,
        domain_id       VARCHAR(50),
        cluster_id      VARCHAR(50),
        status          VARCHAR(20) DEFAULT 'active',
        sub_amount      INTEGER DEFAULT 0,
        created_at      INTEGER DEFAULT (strftime('%s', 'now')),
        updated_at      INTEGER DEFAULT (strftime('%s', 'now'))
    )
`);


// Create table: channel_main_nodes, record current cluster's all channel main nodes, maximum 1000 records
db.exec(`
    CREATE TABLE IF NOT EXISTS channel_main_nodes (
        node_id         VARCHAR(50) PRIMARY KEY,
        domain_id       VARCHAR(50),
        cluster_id      VARCHAR(50),
        channel_id      VARCHAR(50),
        status          VARCHAR(20) DEFAULT 'active',
        sub_amount      INTEGER DEFAULT 0,
        created_at      INTEGER DEFAULT (strftime('%s', 'now')),
        updated_at      INTEGER DEFAULT (strftime('%s', 'now'))
    )
`);


// Create table: channel_nodes, record current channel's all nodes, for sending user activities, maximum 1000 records
db.exec(`
    CREATE TABLE IF NOT EXISTS channel_nodes (
        node_id         VARCHAR(50) PRIMARY KEY,
        domain_id       VARCHAR(50),
        cluster_id      VARCHAR(50),
        channel_id      VARCHAR(50),
        status          VARCHAR(20) DEFAULT 'active',
        created_at      INTEGER DEFAULT (strftime('%s', 'now')),
        updated_at      INTEGER DEFAULT (strftime('%s', 'now'))
    )
`);

// Create table: local_users, record local users with client_ids array for multi-client support
db.exec(`
    CREATE TABLE IF NOT EXISTS local_users (
        user_id         VARCHAR(50) PRIMARY KEY,
        username        TEXT,
        domain_id       VARCHAR(50),
        cluster_id      VARCHAR(50),
        channel_id      VARCHAR(50),
        node_id         VARCHAR(50),
        status          VARCHAR(20) DEFAULT 'active',
        created_at      INTEGER DEFAULT (strftime('%s', 'now')),
        updated_at      INTEGER DEFAULT (strftime('%s', 'now')),
        client_ids      TEXT DEFAULT '[]'
    )
`);

// Create table: user_activities
db.exec(`
    CREATE TABLE IF NOT EXISTS user_activities (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id     VARCHAR(50),
        username    TEXT,
        activity_type VARCHAR(50),
        url         TEXT,
        title       TEXT,
        description TEXT,
        start_time  INTEGER,
        end_time    INTEGER,
        duration    INTEGER,
        created_at  INTEGER DEFAULT (strftime('%s', 'now')),
        updated_at  INTEGER DEFAULT (strftime('%s', 'now'))
    )
`);

// Create table: sync_data
db.exec(`
    CREATE TABLE IF NOT EXISTS sync_data (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        batch_id    VARCHAR(50),
        user_id     VARCHAR(50),
        username    TEXT,
        activity_type VARCHAR(50),
        url         TEXT,
        title       TEXT,
        description TEXT,
        start_time  INTEGER,
        end_time    INTEGER,
        duration    INTEGER,
        created_at  INTEGER DEFAULT (strftime('%s', 'now')),
        updated_at  INTEGER DEFAULT (strftime('%s', 'now'))
    )
`);

// Create table: window_state, store window size and position preferences
db.exec(`
    CREATE TABLE IF NOT EXISTS window_state (
        id              INTEGER PRIMARY KEY CHECK (id = 1),
        width           INTEGER DEFAULT 1000,
        height          INTEGER DEFAULT 800,
        x               INTEGER,
        y               INTEGER,
        is_maximized    INTEGER DEFAULT 0,
        updated_at      INTEGER DEFAULT (strftime('%s', 'now'))
    )
`);

// Insert default window state if not exists
db.exec(`
    INSERT OR IGNORE INTO window_state (id, width, height)
    VALUES (1, 1000, 800)
`);

// Disable foreign key constraints for simpler data management
db.pragma('foreign_keys = OFF');

// Set database performance optimization options
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('cache_size = 1000');
db.pragma('temp_store = memory');

// Clean up invalid visit history records on startup (only if table exists)
try {
    // Check if visit_history table exists
    const tableExists = db.prepare(`
        SELECT name FROM sqlite_master 
        WHERE type='table' AND name='visit_history'
    `).get();

    if (tableExists) {
        const cleanupResult = db.prepare(`
            DELETE FROM visit_history 
            WHERE url = 'about:blank' 
               OR url LIKE 'browser://%'
               OR url IS NULL
               OR url = ''
        `).run();
        if (cleanupResult.changes > 0) {
            console.log(`🧹 Database: Cleaned up ${cleanupResult.changes} invalid visit records on startup`);
        }
    }
} catch (error) {
    console.warn('Database: Failed to clean up invalid records on startup:', error);
}

module.exports = db;