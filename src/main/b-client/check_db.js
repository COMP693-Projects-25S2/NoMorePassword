const Database = require('better-sqlite3');

try {
    const db = new Database('./sqlite/b_client_secure.db');

    console.log('=== B-Client Database Check ===');

    // Check user_cookies table
    const cookies = db.prepare('SELECT user_id, username, create_time FROM user_cookies ORDER BY create_time DESC').all();
    console.log(`\nFound ${cookies.length} cookies in user_cookies table:`);
    cookies.forEach((cookie, index) => {
        console.log(`${index + 1}. user_id: "${cookie.user_id}", username: "${cookie.username}", created: ${cookie.create_time}`);
    });

    // Check user_accounts table
    const accounts = db.prepare('SELECT user_id, username, website, account FROM user_accounts ORDER BY create_time DESC').all();
    console.log(`\nFound ${accounts.length} accounts in user_accounts table:`);
    accounts.forEach((account, index) => {
        console.log(`${index + 1}. user_id: "${account.user_id}", username: "${account.username}", website: "${account.website}", account: "${account.account}"`);
    });

    db.close();
} catch (error) {
    console.error('Error checking database:', error);
}
