const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Database path
const dbPath = path.join(__dirname, 'instance', 'b_client_secure.db');

console.log('🔄 Resetting logout status for user test2...');

// Open database
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('❌ Error opening database:', err.message);
        return;
    }
    console.log('✅ Connected to database');
});

// Reset logout status for user test2
const userId = '6580b604-4d12-41d8-b815-6d2d874d8b42';
const username = 'test2';

db.run(
    "UPDATE user_accounts SET logout = 0 WHERE user_id = ? AND username = ?",
    [userId, username],
    function (err) {
        if (err) {
            console.error('❌ Error updating logout status:', err.message);
            return;
        }
        console.log(`✅ Updated ${this.changes} record(s) for user ${username}`);

        // Verify the update
        db.get(
            "SELECT user_id, username, website, logout FROM user_accounts WHERE user_id = ?",
            [userId],
            (err, row) => {
                if (err) {
                    console.error('❌ Error verifying update:', err.message);
                    return;
                }
                console.log('🔍 Updated record:', row);

                // Close database
                db.close((err) => {
                    if (err) {
                        console.error('❌ Error closing database:', err.message);
                    } else {
                        console.log('✅ Database connection closed');
                        console.log('🎉 User test2 can now login with NMP!');
                    }
                });
            }
        );
    }
);
