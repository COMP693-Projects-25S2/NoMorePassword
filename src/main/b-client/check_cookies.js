const BClientNodeManager = require('./nodeManager/bClientNodeManager');

const nodeManager = new BClientNodeManager();

console.log('=== All cookies in B-Client database ===');
const allCookies = nodeManager.getAllUserCookies();
console.log(`Total cookies: ${allCookies.length}`);

allCookies.forEach((cookie, index) => {
    console.log(`\nCookie ${index + 1}:`);
    console.log(`  User ID: ${cookie.user_id}`);
    console.log(`  Username: ${cookie.username}`);
    console.log(`  Domain ID: ${cookie.domain_id}`);
    console.log(`  Auto Refresh: ${cookie.auto_refresh}`);
    console.log(`  Create Time: ${cookie.create_time}`);
    console.log(`  Cookie: ${cookie.cookie.substring(0, 80)}...`);
});

console.log('\n=== Testing specific user queries ===');
const testUserIds = [
    '6a7af147-077d-413b-941f-194efee59acc',
    '3a420d62-146a-4925-8a27-b813bb10f862', 
    '87817d8b-a8c5-4366-80c7-9df0e2d8506e'
];

testUserIds.forEach(userId => {
    console.log(`\nQuerying cookies for user: ${userId}`);
    const userCookies = nodeManager.getAllUserCookies(userId);
    console.log(`  Found ${userCookies.length} cookies`);
    userCookies.forEach(cookie => {
        console.log(`    Username: ${cookie.username}, Cookie: ${cookie.cookie.substring(0, 50)}...`);
    });
});
