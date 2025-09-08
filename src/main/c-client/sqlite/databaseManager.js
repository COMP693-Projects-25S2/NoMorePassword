// /src/main/sqlite/databaseManager.js
const db = require('./database');
const { v4: uuidv4 } = require('uuid');

// Helper function to generate UUID if not provided
function generateUserId() {
    return uuidv4();
}

class DatabaseManager {
    // ===================== Domain main nodes table domain_main_nodes =====================

    // Add domain main node
    // @param {string} userId - UUID for the user
    static addDomainMainNode(userId, username, domainId, ipAddress) {
        const stmt = db.prepare(`
            INSERT INTO domain_main_nodes (user_id, username, domain_id, ip_address)
            VALUES (?, ?, ?, ?)
        `);
        return stmt.run(userId, username, domainId, ipAddress);
    }

    // Add domain main node with auto-generated UUID
    static addDomainMainNodeAutoId(username, domainId, ipAddress) {
        const userId = generateUserId();
        return this.addDomainMainNode(userId, username, domainId, ipAddress);
    }

    // Get all domain main nodes
    static getAllDomainMainNodes() {
        return db.prepare(`SELECT * FROM domain_main_nodes`).all();
    }

    // Get domain main node by ID
    static getDomainMainNodeById(userId) {
        return db.prepare(`SELECT * FROM domain_main_nodes WHERE user_id = ?`).get(userId);
    }

    // Get domain main node by domain ID
    static getDomainMainNodeByDomainId(domainId) {
        return db.prepare(`SELECT * FROM domain_main_nodes WHERE domain_id = ?`).get(domainId);
    }

    // Update domain main node information
    static updateDomainMainNode(userId, username, domainId, ipAddress) {
        const stmt = db.prepare(`
            UPDATE domain_main_nodes
            SET username = ?, domain_id = ?, ip_address = ?
            WHERE user_id = ?
        `);
        return stmt.run(username, domainId, ipAddress, userId);
    }

    // Delete domain main node
    static deleteDomainMainNode(userId) {
        return db.prepare(`DELETE FROM domain_main_nodes WHERE user_id = ?`).run(userId);
    }

    // Delete domain main node by domain ID
    static deleteDomainMainNodeByDomainId(domainId) {
        return db.prepare(`DELETE FROM domain_main_nodes WHERE domain_id = ?`).run(domainId);
    }

    // ===================== Cluster main nodes table cluster_main_nodes =====================

    // Add cluster main node
    // @param {string} userId - UUID for the user
    static addClusterMainNode(userId, username, domainId, clusterId, ipAddress) {
        const stmt = db.prepare(`
            INSERT INTO cluster_main_nodes (user_id, username, domain_id, cluster_id, ip_address)
            VALUES (?, ?, ?, ?, ?)
        `);
        return stmt.run(userId, username, domainId, clusterId, ipAddress);
    }

    // Add cluster main node with auto-generated UUID
    static addClusterMainNodeAutoId(username, domainId, clusterId, ipAddress) {
        const userId = generateUserId();
        return this.addClusterMainNode(userId, username, domainId, clusterId, ipAddress);
    }

    // Get all cluster main nodes
    static getAllClusterMainNodes() {
        return db.prepare(`SELECT * FROM cluster_main_nodes`).all();
    }

    // Get cluster main node by ID
    static getClusterMainNodeById(userId) {
        return db.prepare(`SELECT * FROM cluster_main_nodes WHERE user_id = ?`).get(userId);
    }

    // Get all cluster main nodes by domain ID
    static getClusterMainNodesByDomainId(domainId) {
        return db.prepare(`SELECT * FROM cluster_main_nodes WHERE domain_id = ?`).all(domainId);
    }

    // Get cluster main node by cluster ID
    static getClusterMainNodeByClusterId(clusterId) {
        return db.prepare(`SELECT * FROM cluster_main_nodes WHERE cluster_id = ?`).get(clusterId);
    }

    // Update cluster main node information
    static updateClusterMainNode(userId, username, domainId, clusterId, ipAddress) {
        const stmt = db.prepare(`
            UPDATE cluster_main_nodes
            SET username = ?, domain_id = ?, cluster_id = ?, ip_address = ?
            WHERE user_id = ?
        `);
        return stmt.run(username, domainId, clusterId, ipAddress, userId);
    }

    // Delete cluster main node
    static deleteClusterMainNode(userId) {
        return db.prepare(`DELETE FROM cluster_main_nodes WHERE user_id = ?`).run(userId);
    }

    // Delete all cluster main nodes by domain ID
    static deleteClusterMainNodesByDomainId(domainId) {
        return db.prepare(`DELETE FROM cluster_main_nodes WHERE domain_id = ?`).run(domainId);
    }

    // Delete cluster main node by cluster ID
    static deleteClusterMainNodeByClusterId(clusterId) {
        return db.prepare(`DELETE FROM cluster_main_nodes WHERE cluster_id = ?`).run(clusterId);
    }

    // ===================== Channel main nodes table channel_main_nodes =====================

    // Add channel main node
    // @param {string} userId - UUID for the user
    static addChannelMainNode(userId, username, domainId, clusterId, channelId, ipAddress) {
        const stmt = db.prepare(`
            INSERT INTO channel_main_nodes (user_id, username, domain_id, cluster_id, channel_id, ip_address)
            VALUES (?, ?, ?, ?, ?, ?)
        `);
        return stmt.run(userId, username, domainId, clusterId, channelId, ipAddress);
    }

    // Add channel main node with auto-generated UUID
    static addChannelMainNodeAutoId(username, domainId, clusterId, channelId, ipAddress) {
        const userId = generateUserId();
        return this.addChannelMainNode(userId, username, domainId, clusterId, channelId, ipAddress);
    }

    // Get all channel main nodes
    static getAllChannelMainNodes() {
        return db.prepare(`SELECT * FROM channel_main_nodes`).all();
    }

    // Get channel main node by ID
    static getChannelMainNodeById(userId) {
        return db.prepare(`SELECT * FROM channel_main_nodes WHERE user_id = ?`).get(userId);
    }

    // Get all channel main nodes by domain ID
    static getChannelMainNodesByDomainId(domainId) {
        return db.prepare(`SELECT * FROM channel_main_nodes WHERE domain_id = ?`).all(domainId);
    }

    // Get all channel main nodes by cluster ID
    static getChannelMainNodesByClusterId(clusterId) {
        return db.prepare(`SELECT * FROM channel_main_nodes WHERE cluster_id = ?`).all(clusterId);
    }

    // Get channel main node by channel ID
    static getChannelMainNodeByChannelId(channelId) {
        return db.prepare(`SELECT * FROM channel_main_nodes WHERE channel_id = ?`).get(channelId);
    }

    // Update channel main node information
    static updateChannelMainNode(userId, username, domainId, clusterId, channelId, ipAddress) {
        const stmt = db.prepare(`
            UPDATE channel_main_nodes
            SET username = ?, domain_id = ?, cluster_id = ?, channel_id = ?, ip_address = ?
            WHERE user_id = ?
        `);
        return stmt.run(username, domainId, clusterId, channelId, ipAddress, userId);
    }

    // Delete channel main node
    static deleteChannelMainNode(userId) {
        return db.prepare(`DELETE FROM channel_main_nodes WHERE user_id = ?`).run(userId);
    }

    // Delete all channel main nodes by domain ID
    static deleteChannelMainNodesByDomainId(domainId) {
        return db.prepare(`DELETE FROM channel_main_nodes WHERE domain_id = ?`).run(domainId);
    }

    // Delete all channel main nodes by cluster ID
    static deleteChannelMainNodesByClusterId(clusterId) {
        return db.prepare(`DELETE FROM channel_main_nodes WHERE cluster_id = ?`).run(clusterId);
    }

    // Delete channel main node by channel ID
    static deleteChannelMainNodeByChannelId(channelId) {
        return db.prepare(`DELETE FROM channel_main_nodes WHERE channel_id = ?`).run(channelId);
    }

    // ===================== Channel users table channel_users =====================

    // Add user
    // @param {string} userId - UUID for the user
    static addUser(userId, username, domainId, clusterId, channelId, ipAddress) {
        const stmt = db.prepare(`
            INSERT INTO channel_users (user_id, username, domain_id, cluster_id, channel_id, ip_address)
            VALUES (?, ?, ?, ?, ?, ?)
        `);
        return stmt.run(userId, username, domainId, clusterId, channelId, ipAddress);
    }

    // Add user with auto-generated UUID
    static addUserAutoId(username, domainId, clusterId, channelId, ipAddress) {
        const userId = generateUserId();
        return this.addUser(userId, username, domainId, clusterId, channelId, ipAddress);
    }

    // Get all users
    static getAllUsers() {
        return db.prepare(`SELECT * FROM channel_users`).all();
    }

    // Get user by ID
    static getUserById(userId) {
        return db.prepare(`SELECT * FROM channel_users WHERE user_id = ?`).get(userId);
    }

    // Get all users by domain ID
    static getUsersByDomainId(domainId) {
        return db.prepare(`SELECT * FROM channel_users WHERE domain_id = ?`).all(domainId);
    }

    // Get all users by cluster ID
    static getUsersByClusterId(clusterId) {
        return db.prepare(`SELECT * FROM channel_users WHERE cluster_id = ?`).all(clusterId);
    }

    // Get all users by channel ID
    static getUsersByChannelId(channelId) {
        return db.prepare(`SELECT * FROM channel_users WHERE channel_id = ?`).all(channelId);
    }

    // Get user by username
    static getUserByUsername(username) {
        return db.prepare(`SELECT * FROM channel_users WHERE username = ?`).get(username);
    }

    // Update user information
    static updateUser(userId, username, domainId, clusterId, channelId, ipAddress) {
        const stmt = db.prepare(`
            UPDATE channel_users
            SET username = ?, domain_id = ?, cluster_id = ?, channel_id = ?, ip_address = ?
            WHERE user_id = ?
        `);
        return stmt.run(username, domainId, clusterId, channelId, ipAddress, userId);
    }

    // Delete user
    static deleteUser(userId) {
        return db.prepare(`DELETE FROM channel_users WHERE user_id = ?`).run(userId);
    }

    // Delete all users by domain ID
    static deleteUsersByDomainId(domainId) {
        return db.prepare(`DELETE FROM channel_users WHERE domain_id = ?`).run(domainId);
    }

    // Delete all users by cluster ID
    static deleteUsersByClusterId(clusterId) {
        return db.prepare(`DELETE FROM channel_users WHERE cluster_id = ?`).run(clusterId);
    }

    // Delete all users by channel ID
    static deleteUsersByChannelId(channelId) {
        return db.prepare(`DELETE FROM channel_users WHERE channel_id = ?`).run(channelId);
    }

    // ===================== Local users table local_users =====================

    // Add local user
    // @param {string} userId - UUID for the user
    static addLocalUser(userId, username, domainId, clusterId, channelId, ipAddress) {
        const stmt = db.prepare(`
            INSERT INTO local_users (user_id, username, domain_id, cluster_id, channel_id, ip_address)
            VALUES (?, ?, ?, ?, ?, ?)
        `);
        return stmt.run(userId, username, domainId, clusterId, channelId, ipAddress);
    }

    // Add local user with auto-generated UUID
    static addLocalUserAutoId(username, domainId, clusterId, channelId, ipAddress) {
        const userId = generateUserId();
        return this.addLocalUser(userId, username, domainId, clusterId, channelId, ipAddress);
    }

    // Get all local users
    static getAllLocalUsers() {
        return db.prepare(`SELECT * FROM local_users`).all();
    }

    // Get local user by ID
    static getLocalUserById(userId) {
        return db.prepare(`SELECT * FROM local_users WHERE user_id = ?`).get(userId);
    }

    // Get all local users by domain ID
    static getLocalUsersByDomainId(domainId) {
        return db.prepare(`SELECT * FROM local_users WHERE domain_id = ?`).all(domainId);
    }

    // Get all local users by cluster ID
    static getLocalUsersByClusterId(clusterId) {
        return db.prepare(`SELECT * FROM local_users WHERE cluster_id = ?`).all(clusterId);
    }

    // Get all local users by channel ID
    static getLocalUsersByChannelId(channelId) {
        return db.prepare(`SELECT * FROM local_users WHERE channel_id = ?`).all(channelId);
    }

    // Get local user by username
    static getLocalUserByUsername(username) {
        return db.prepare(`SELECT * FROM local_users WHERE username = ?`).get(username);
    }

    // Update local user information
    static updateLocalUser(userId, username, domainId, clusterId, channelId, ipAddress) {
        const stmt = db.prepare(`
            UPDATE local_users
            SET username = ?, domain_id = ?, cluster_id = ?, channel_id = ?, ip_address = ?
            WHERE user_id = ?
        `);
        return stmt.run(username, domainId, clusterId, channelId, ipAddress, userId);
    }

    // Delete local user
    static deleteLocalUser(userId) {
        return db.prepare(`DELETE FROM local_users WHERE user_id = ?`).run(userId);
    }

    // Delete all local users by domain ID
    static deleteLocalUsersByDomainId(domainId) {
        return db.prepare(`DELETE FROM local_users WHERE domain_id = ?`).run(domainId);
    }

    // Delete all local users by cluster ID
    static deleteLocalUsersByClusterId(clusterId) {
        return db.prepare(`DELETE FROM local_users WHERE cluster_id = ?`).run(clusterId);
    }

    // Delete all local users by channel ID
    static deleteLocalUsersByChannelId(channelId) {
        return db.prepare(`DELETE FROM local_users WHERE channel_id = ?`).run(channelId);
    }

    // ===================== User activities table user_activities =====================

    // Add user activity
    static addActivity(userId, website, url, title, description, date, time, duration) {
        const stmt = db.prepare(`
            INSERT INTO user_activities (user_id, website, url, title, description, date, time, duration)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);
        return stmt.run(userId, website, url, title, description, date, time, duration);
    }

    // Get all activity records
    static getAllActivities() {
        return db.prepare(`SELECT * FROM user_activities`).all();
    }

    // Get activity records by user ID
    static getActivitiesByUserId(userId) {
        return db.prepare(`
            SELECT * FROM user_activities WHERE user_id = ?
        `).all(userId);
    }

    // Get activity records by website
    static getActivitiesByWebsite(website) {
        return db.prepare(`
            SELECT * FROM user_activities WHERE website = ?
        `).all(website);
    }

    // Get activity records by date
    static getActivitiesByDate(date) {
        return db.prepare(`
            SELECT * FROM user_activities WHERE date = ?
        `).all(date);
    }

    // Get activity records by user ID and date
    static getActivitiesByUserAndDate(userId, date) {
        return db.prepare(`
            SELECT * FROM user_activities WHERE user_id = ? AND date = ?
        `).all(userId, date);
    }

    // Update user activity
    static updateActivity(userId, website, url, title, description, date, time, duration) {
        const stmt = db.prepare(`
            UPDATE user_activities
            SET website = ?, url = ?, title = ?, description = ?, date = ?, time = ?, duration = ?
            WHERE user_id = ?
        `);
        return stmt.run(website, url, title, description, date, time, duration, userId);
    }

    // Delete user activity (based on userID and other conditions)
    static deleteActivity(userId, website, url, date, time) {
        return db.prepare(`
            DELETE FROM user_activities 
            WHERE user_id = ? AND website = ? AND url = ? AND date = ? AND time = ?
        `).run(userId, website, url, date, time);
    }

    // Delete all activity records for a specific user
    static deleteActivitiesByUserId(userId) {
        return db.prepare(`DELETE FROM user_activities WHERE user_id = ?`).run(userId);
    }

    // Delete all activity records for a specific website
    static deleteActivitiesByWebsite(website) {
        return db.prepare(`DELETE FROM user_activities WHERE website = ?`).run(website);
    }

    // Delete all activity records for a specific date
    static deleteActivitiesByDate(date) {
        return db.prepare(`DELETE FROM user_activities WHERE date = ?`).run(date);
    }

    // ===================== General Query Methods =====================

    // Get database statistics
    static getStatistics() {
        const stats = {};
        stats.domainMainNodes = db.prepare(`SELECT COUNT(*) as count FROM domain_main_nodes`).get().count;
        stats.clusterMainNodes = db.prepare(`SELECT COUNT(*) as count FROM cluster_main_nodes`).get().count;
        stats.channelMainNodes = db.prepare(`SELECT COUNT(*) as count FROM channel_main_nodes`).get().count;
        stats.channelUsers = db.prepare(`SELECT COUNT(*) as count FROM channel_users`).get().count;
        stats.localUsers = db.prepare(`SELECT COUNT(*) as count FROM local_users`).get().count;
        stats.userActivities = db.prepare(`SELECT COUNT(*) as count FROM user_activities`).get().count;
        return stats;
    }

    // Clear all table data
    static clearAllData() {
        const tables = ['domain_main_nodes', 'cluster_main_nodes', 'channel_main_nodes', 'channel_users', 'local_users', 'user_activities'];
        tables.forEach(table => {
            db.prepare(`DELETE FROM ${table}`).run();
        });
        return true;
    }
}

module.exports = DatabaseManager;