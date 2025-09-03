# UUID Migration Guide

## Overview
All user tables have been migrated from `INTEGER PRIMARY KEY AUTOINCREMENT` to `VARCHAR(50) PRIMARY KEY` to support UUID-based user identification.

## Tables Affected
- `domain_main_nodes`
- `cluster_main_nodes` 
- `channel_main_nodes`
- `channel_users`
- `local_users`
- `user_activities`

## Changes Made

### 1. Database Schema Changes
- `user_id` field changed from `INTEGER PRIMARY KEY AUTOINCREMENT` to `VARCHAR(50) PRIMARY KEY`
- Removed foreign key constraints from `user_activities` table
- All tables now use UUID strings instead of auto-incrementing integers

### 2. Method Signature Changes
All add methods now require a `userId` parameter as the first argument:

```javascript
// Before (old method)
DatabaseManager.addUser(username, domainId, clusterId, channelId, ipAddress);

// After (new method)
DatabaseManager.addUser(userId, username, domainId, clusterId, channelId, ipAddress);
```

### 3. New Auto-ID Methods
For convenience, auto-ID methods have been added that automatically generate UUIDs:

```javascript
// Auto-generate UUID
DatabaseManager.addUserAutoId(username, domainId, clusterId, channelId, ipAddress);
DatabaseManager.addLocalUserAutoId(username, domainId, clusterId, channelId, ipAddress);
DatabaseManager.addDomainMainNodeAutoId(username, domainId, ipAddress);
DatabaseManager.addClusterMainNodeAutoId(username, domainId, clusterId, ipAddress);
DatabaseManager.addChannelMainNodeAutoId(username, domainId, clusterId, channelId, ipAddress);
```

## Usage Examples

### Manual UUID Usage
```javascript
const { v4: uuidv4 } = require('uuid');

// Generate UUID manually
const userId = uuidv4();

// Add user with custom UUID
const result = DatabaseManager.addUser(
    userId,           // Custom UUID
    'john_doe',      // username
    'domain1',       // domainId
    'cluster1',      // clusterId
    'channel1',      // channelId
    '192.168.1.100'  // ipAddress
);
```

### Auto UUID Generation
```javascript
// Let the system generate UUID automatically
const result = DatabaseManager.addUserAutoId(
    'john_doe',      // username
    'domain1',       // domainId
    'cluster1',      // clusterId
    'channel1',      // channelId
    '192.168.1.100'  // ipAddress
);
```

## Migration Notes

### 1. Existing Data
- If you have existing data with integer IDs, you'll need to migrate it
- Consider creating a migration script to convert existing integer IDs to UUIDs
- Update any external references to use the new UUID format

### 2. Dependencies
- Added `uuid` package dependency
- Run `npm install` to install the new dependency

### 3. Breaking Changes
- All existing code that calls add methods must be updated
- Remove any `parseInt()` calls on user IDs
- Update any logic that expects numeric user IDs

## Migration Script Example
```javascript
// Example migration script for existing data
const { v4: uuidv4 } = require('uuid');

function migrateExistingData() {
    // Get all existing users
    const existingUsers = db.prepare('SELECT * FROM channel_users').all();
    
    // Create new table with UUID structure
    db.exec(`
        CREATE TABLE channel_users_new (
            user_id VARCHAR(50) PRIMARY KEY,
            username TEXT,
            domain_id VARCHAR(50),
            cluster_id VARCHAR(50),
            channel_id VARCHAR(50),
            ip_address VARCHAR(20)
        )
    `);
    
    // Migrate data with new UUIDs
    const insertStmt = db.prepare(`
        INSERT INTO channel_users_new 
        (user_id, username, domain_id, cluster_id, channel_id, ip_address)
        VALUES (?, ?, ?, ?, ?, ?)
    `);
    
    existingUsers.forEach(user => {
        const newUserId = uuidv4();
        insertStmt.run(
            newUserId,
            user.username,
            user.domain_id,
            user.cluster_id,
            user.channel_id,
            user.ip_address
        );
    });
    
    // Replace old table
    db.exec('DROP TABLE channel_users');
    db.exec('ALTER TABLE channel_users_new RENAME TO channel_users');
}
```

## Benefits of UUID Migration
1. **Distributed Systems**: UUIDs work better in distributed environments
2. **Security**: UUIDs are harder to guess than sequential IDs
3. **Data Merging**: Easier to merge data from different sources
4. **No Collisions**: Virtually no chance of ID conflicts
5. **Future-Proof**: Better scalability for large systems

## Testing
After migration, test all CRUD operations:
1. Create new users with UUIDs
2. Query users by UUID
3. Update user information
4. Delete users
5. Verify statistics and cleanup methods work correctly
