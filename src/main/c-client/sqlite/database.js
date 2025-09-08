// /src/main/sqlite/database.js
const Database = require('better-sqlite3');
const path = require('path');
const FileUtils = require('../utils/fileUtils');

// Database file path - use secure.db from sqlite folder
const dbPath = path.join(__dirname, 'secure.db');

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

// Add is_current column to existing local_users table if it doesn't exist
try {
    db.exec(`ALTER TABLE local_users ADD COLUMN is_current INTEGER DEFAULT 0`);
    console.log('Added is_current column to local_users table');
} catch (error) {
    // Column might already exist, which is fine
}

// Add username column to existing user_activities table if it doesn't exist
try {
    db.exec(`ALTER TABLE user_activities ADD COLUMN username TEXT`);
    console.log('Added username column to user_activities table');
} catch (error) {
    // Column might already exist, which is fine
}

// Add activity_type column to existing user_activities table if it doesn't exist
try {
    db.exec(`ALTER TABLE user_activities ADD COLUMN activity_type VARCHAR(50)`);
    console.log('Added activity_type column to user_activities table');
} catch (error) {
    // Column might already exist, which is fine
}

// Add start_time column to existing user_activities table if it doesn't exist
try {
    db.exec(`ALTER TABLE user_activities ADD COLUMN start_time INTEGER`);
    console.log('Added start_time column to user_activities table');
} catch (error) {
    // Column might already exist, which is fine
}

// Add end_time column to existing user_activities table if it doesn't exist
try {
    db.exec(`ALTER TABLE user_activities ADD COLUMN end_time INTEGER`);
    console.log('Added end_time column to user_activities table');
} catch (error) {
    // Column might already exist, which is fine
}

// Add created_at column to existing user_activities table if it doesn't exist
try {
    db.exec(`ALTER TABLE user_activities ADD COLUMN created_at INTEGER`);
    console.log('Added created_at column to user_activities table');
} catch (error) {
    // Column might already exist, which is fine
}

// Add updated_at column to existing user_activities table if it doesn't exist
try {
    db.exec(`ALTER TABLE user_activities ADD COLUMN updated_at INTEGER`);
    console.log('Added updated_at column to user_activities table');
} catch (error) {
    // Column might already exist, which is fine
}

// Disable foreign key constraints for simpler data management
db.pragma('foreign_keys = OFF');

// Set database performance optimization options
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('cache_size = 1000');
db.pragma('temp_store = memory');


module.exports = db;