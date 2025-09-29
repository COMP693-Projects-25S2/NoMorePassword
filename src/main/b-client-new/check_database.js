const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Database path
const dbPath = path.join(__dirname, 'instance', 'b_client_secure.db');

console.log('🔍 Checking B-Client Database...');
console.log('📁 Database path:', dbPath);

// Open database
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('❌ Error opening database:', err.message);
        return;
    }
    console.log('✅ Connected to database');
});

// Check tables
db.all("SELECT name FROM sqlite_master WHERE type='table'", (err, rows) => {
    if (err) {
        console.error('❌ Error getting tables:', err.message);
        return;
    }
    console.log('📊 Tables:', rows.map(row => row.name));
});

// Check user_accounts count
db.get("SELECT COUNT(*) as count FROM user_accounts", (err, row) => {
    if (err) {
        console.error('❌ Error getting user_accounts count:', err.message);
        return;
    }
    console.log('👥 user_accounts count:', row.count);
});

// Check user_cookies count
db.get("SELECT COUNT(*) as count FROM user_cookies", (err, row) => {
    if (err) {
        console.error('❌ Error getting user_cookies count:', err.message);
        return;
    }
    console.log('🍪 user_cookies count:', row.count);
});

// Show all user_accounts records
db.all("SELECT user_id, username, website, logout FROM user_accounts", (err, rows) => {
    if (err) {
        console.error('❌ Error getting user_accounts records:', err.message);
        return;
    }
    console.log('👥 user_accounts records:');
    rows.forEach(row => {
        console.log(`  - ${row.user_id} | ${row.username} | ${row.website} | logout: ${row.logout}`);
    });
});

// Show all user_cookies records
db.all("SELECT user_id, username FROM user_cookies", (err, rows) => {
    if (err) {
        console.error('❌ Error getting user_cookies records:', err.message);
        return;
    }
    console.log('🍪 user_cookies records:');
    rows.forEach(row => {
        console.log(`  - ${row.user_id} | ${row.username}`);
    });

    // Close database
    db.close((err) => {
        if (err) {
            console.error('❌ Error closing database:', err.message);
        } else {
            console.log('✅ Database connection closed');
        }
    });
});
