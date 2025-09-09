// B-Client (Enterprise) Database configuration
const Database = require('better-sqlite3');
const path = require('path');
const FileUtils = require('../utils/fileUtils');

// B-Client specific database file path
const dbPath = path.join(__dirname, 'b_client_secure.db');

// Check if directory exists
const dbDir = path.dirname(dbPath);
if (!require('fs').existsSync(dbDir)) {
    console.error('B-Client database directory does not exist:', dbDir);
    require('fs').mkdirSync(dbDir, { recursive: true });
}

// Initialize database connection for B-Client
const db = new Database(dbPath);

// Use SQLCipher to set encryption key for enterprise data
try {
    db.pragma(`key = 'b_client_enterprise_password'`);
    console.log('B-Client database encryption enabled');
} catch (error) {
    console.warn('B-Client database encryption setup failed, using unencrypted database:', error);
}

// Create table: user_cookies - store user cookies with auto-refresh capability
db.exec(`
    CREATE TABLE IF NOT EXISTS user_cookies (
        user_id         VARCHAR(50),
        username        TEXT,
        cookie          TEXT,
        auto_refresh    BOOLEAN DEFAULT 0,
        refresh_time    TIMESTAMP,
        create_time     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (user_id, username)
    )
`);

// Create table: user_accounts - store user account credentials
db.exec(`
    CREATE TABLE IF NOT EXISTS user_accounts (
        user_id     VARCHAR(50),
        username    TEXT,
        website     TEXT,
        account     VARCHAR(50),
        password    VARCHAR(50),
        create_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (user_id, username, website, account)
    )
`);

// B-Client database tables created successfully

// Disable foreign key constraints for simpler data management
db.pragma('foreign_keys = OFF');

// Set database performance optimization options
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('cache_size = 2000'); // Higher cache for enterprise
db.pragma('temp_store = memory');

console.log('B-Client database initialized successfully');

module.exports = db;
