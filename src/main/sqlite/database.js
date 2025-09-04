// /src/main/sqlite/database.js
const Database = require('better-sqlite3');
const path = require('path');
const FileUtils = require('../utils/fileUtils');

// Database file path
const dbPath = path.join(FileUtils.getAppRoot(), 'secure.db');

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
    console.log('Database encryption enabled');
} catch (error) {
    console.warn('Database encryption setup failed, using unencrypted database:', error);
}

// Create table: domain_main_nodes, record all domain's current main nodes, maximum 1000 records
db.exec(`
    CREATE TABLE IF NOT EXISTS domain_main_nodes (
        user_id     VARCHAR(50) PRIMARY KEY,
        username    TEXT,
        domain_id   VARCHAR(50),
        ip_address  VARCHAR(20)
    )
`);

// Create table: cluster_main_nodes, record current domain's all cluster main nodes, maximum 1000 records
db.exec(`
    CREATE TABLE IF NOT EXISTS cluster_main_nodes (
        user_id     VARCHAR(50) PRIMARY KEY,
        username    TEXT,
        domain_id   VARCHAR(50),
        cluster_id  VARCHAR(50),
        ip_address  VARCHAR(20)
    )
`);

// Create table: channel_main_nodes, record current cluster's all channel main nodes, maximum 1000 records
db.exec(`
    CREATE TABLE IF NOT EXISTS channel_main_nodes (
        user_id     VARCHAR(50) PRIMARY KEY,
        username    TEXT,
        domain_id   VARCHAR(50),
        cluster_id  VARCHAR(50),
        channel_id  VARCHAR(50),
        ip_address  VARCHAR(20)
    )
`);

// Create table: channel_users, record current channel's all nodes, for sending user activities, maximum 1000 records
db.exec(`
    CREATE TABLE IF NOT EXISTS channel_users (
        user_id     VARCHAR(50) PRIMARY KEY,
        username    TEXT,
        domain_id   VARCHAR(50),
        cluster_id  VARCHAR(50),
        channel_id  VARCHAR(50),
        ip_address  VARCHAR(20)
    )
`);

// Create table: local_users, record local users with same structure as channel_users, maximum 1000 records
db.exec(`
    CREATE TABLE IF NOT EXISTS local_users (
        user_id     VARCHAR(50) PRIMARY KEY,
        username    TEXT,
        domain_id   VARCHAR(50),
        cluster_id  VARCHAR(50),
        channel_id  VARCHAR(50),
        ip_address  VARCHAR(20),
        is_current  INTEGER DEFAULT 0
    )
`);

// Create table: user_activities
db.exec(`
    CREATE TABLE IF NOT EXISTS user_activities (
        user_id     VARCHAR(50),
        website     TEXT,
        url         TEXT,
        title       TEXT,
        description VARCHAR(50),
        date        TEXT,
        time        TEXT,
        duration    INTEGER
    )
`);

// Add is_current column to existing local_users table if it doesn't exist
try {
    db.exec(`ALTER TABLE local_users ADD COLUMN is_current INTEGER DEFAULT 0`);
    console.log('Added is_current column to local_users table');
} catch (error) {
    // Column might already exist, which is fine
    console.log('is_current column already exists or table is new');
}

// Set database performance optimization options
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('cache_size = 1000');
db.pragma('temp_store = memory');

console.log('Database initialized successfully');

module.exports = db;