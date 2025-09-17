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
    static addDomainMainNode(userId, username, domainId, nodeId = null, ipAddress = null) {
        const stmt = db.prepare(`
            INSERT INTO domain_main_nodes (user_id, username, domain_id, node_id, ip_address)
            VALUES (?, ?, ?, ?, ?)
        `);
        return stmt.run(userId, username, domainId, nodeId, ipAddress);
    }

    // ===================== Current Main Node Info Management =====================

    // Update current domain main node info
    static updateCurrentDomainMainNode(nodeInfo) {
        const stmt = db.prepare(`
            INSERT OR REPLACE INTO current_domain_main_node 
            (node_id, username, domain_id, ip_address, port, status, last_heartbeat, 
             updated_at, priority, capabilities, metadata)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        return stmt.run(
            nodeInfo.nodeId,
            nodeInfo.username,
            nodeInfo.domainId,
            nodeInfo.ipAddress,
            nodeInfo.port || 3000,
            nodeInfo.status || 'active',
            nodeInfo.lastHeartbeat || Math.floor(Date.now() / 1000),
            Math.floor(Date.now() / 1000),
            nodeInfo.priority || 0,
            nodeInfo.capabilities || '{}',
            nodeInfo.metadata || '{}'
        );
    }

    // Get current domain main node info
    static getCurrentDomainMainNode() {
        return db.prepare(`SELECT * FROM current_domain_main_node LIMIT 1`).get();
    }

    // Update current cluster main node info
    static updateCurrentClusterMainNode(nodeInfo) {
        const stmt = db.prepare(`
            INSERT OR REPLACE INTO current_cluster_main_node 
            (node_id, username, domain_id, cluster_id, ip_address, port, status, last_heartbeat, 
             updated_at, priority, capabilities, metadata)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        return stmt.run(
            nodeInfo.nodeId,
            nodeInfo.username,
            nodeInfo.domainId,
            nodeInfo.clusterId,
            nodeInfo.ipAddress,
            nodeInfo.port || 3001,
            nodeInfo.status || 'active',
            nodeInfo.lastHeartbeat || Math.floor(Date.now() / 1000),
            Math.floor(Date.now() / 1000),
            nodeInfo.priority || 0,
            nodeInfo.capabilities || '{}',
            nodeInfo.metadata || '{}'
        );
    }

    // Get current cluster main node info
    static getCurrentClusterMainNode() {
        return db.prepare(`SELECT * FROM current_cluster_main_node LIMIT 1`).get();
    }

    // Update current channel main node info
    static updateCurrentChannelMainNode(nodeInfo) {
        const stmt = db.prepare(`
            INSERT OR REPLACE INTO current_channel_main_node 
            (node_id, username, domain_id, cluster_id, channel_id, ip_address, port, status, last_heartbeat, 
             updated_at, priority, capabilities, metadata)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        return stmt.run(
            nodeInfo.nodeId,
            nodeInfo.username,
            nodeInfo.domainId,
            nodeInfo.clusterId,
            nodeInfo.channelId,
            nodeInfo.ipAddress,
            nodeInfo.port || 3002,
            nodeInfo.status || 'active',
            nodeInfo.lastHeartbeat || Math.floor(Date.now() / 1000),
            Math.floor(Date.now() / 1000),
            nodeInfo.priority || 0,
            nodeInfo.capabilities || '{}',
            nodeInfo.metadata || '{}'
        );
    }

    // Get current channel main node info
    static getCurrentChannelMainNode() {
        return db.prepare(`SELECT * FROM current_channel_main_node LIMIT 1`).get();
    }

    // Clear all current main node info
    static clearAllCurrentMainNodeInfo() {
        db.prepare(`DELETE FROM current_domain_main_node`).run();
        db.prepare(`DELETE FROM current_cluster_main_node`).run();
        db.prepare(`DELETE FROM current_channel_main_node`).run();
    }

    // Add domain main node with auto-generated UUID
    static addDomainMainNodeAutoId(nodeData) {
        const userId = nodeData.userId || generateUserId();
        const stmt = db.prepare(`
            INSERT INTO domain_main_nodes 
            (user_id, username, domain_id, node_id, ip_address, port, status, is_main_node, 
             last_heartbeat, created_at, updated_at, priority, capabilities, metadata)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        return stmt.run(
            userId, nodeData.username, nodeData.domainId, nodeData.nodeId, nodeData.ipAddress,
            nodeData.port || 3000, nodeData.status || 'active', nodeData.isMainNode || 0,
            nodeData.lastHeartbeat || Math.floor(Date.now() / 1000),
            nodeData.createdAt || Math.floor(Date.now() / 1000),
            nodeData.updatedAt || Math.floor(Date.now() / 1000),
            nodeData.priority || 0, nodeData.capabilities || '{}', nodeData.metadata || '{}'
        );
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

    // Get domain main node by node ID
    static getDomainMainNodeByNodeId(nodeId) {
        return db.prepare(`SELECT * FROM domain_main_nodes WHERE node_id = ?`).get(nodeId);
    }

    // Update domain main node information
    static updateDomainMainNode(userId, username, domainId, nodeId = null, ipAddress = null) {
        const stmt = db.prepare(`
            UPDATE domain_main_nodes
            SET username = ?, domain_id = ?, node_id = COALESCE(?, node_id), ip_address = COALESCE(?, ip_address)
            WHERE user_id = ?
        `);
        return stmt.run(username, domainId, nodeId, ipAddress, userId);
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
    static addClusterMainNode(userId, username, domainId, clusterId, nodeId = null, ipAddress = null) {
        const stmt = db.prepare(`
            INSERT INTO cluster_main_nodes (user_id, username, domain_id, cluster_id, node_id, ip_address)
            VALUES (?, ?, ?, ?, ?, ?)
        `);
        return stmt.run(userId, username, domainId, clusterId, nodeId, ipAddress);
    }

    // Add cluster main node with auto-generated UUID
    static addClusterMainNodeAutoId(nodeData) {
        const userId = nodeData.userId || generateUserId();
        const stmt = db.prepare(`
            INSERT INTO cluster_main_nodes 
            (user_id, username, domain_id, cluster_id, node_id, ip_address, port, status, is_main_node, 
             last_heartbeat, created_at, updated_at, priority, capabilities, metadata)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        return stmt.run(
            userId, nodeData.username, nodeData.domainId, nodeData.clusterId, nodeData.nodeId, nodeData.ipAddress,
            nodeData.port || 3001, nodeData.status || 'active', nodeData.isMainNode || 0,
            nodeData.lastHeartbeat || Math.floor(Date.now() / 1000),
            nodeData.createdAt || Math.floor(Date.now() / 1000),
            nodeData.updatedAt || Math.floor(Date.now() / 1000),
            nodeData.priority || 0, nodeData.capabilities || '{}', nodeData.metadata || '{}'
        );
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

    // Get cluster main node by node ID
    static getClusterMainNodeByNodeId(nodeId) {
        return db.prepare(`SELECT * FROM cluster_main_nodes WHERE node_id = ?`).get(nodeId);
    }

    // Update cluster main node information
    static updateClusterMainNode(userId, username, domainId, clusterId, nodeId = null, ipAddress = null) {
        const stmt = db.prepare(`
            UPDATE cluster_main_nodes
            SET username = ?, domain_id = ?, cluster_id = ?, node_id = COALESCE(?, node_id), ip_address = COALESCE(?, ip_address)
            WHERE user_id = ?
        `);
        return stmt.run(username, domainId, clusterId, nodeId, ipAddress, userId);
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
    static addChannelMainNode(userId, username, domainId, clusterId, channelId, nodeId = null, ipAddress = null) {
        const stmt = db.prepare(`
            INSERT INTO channel_main_nodes (user_id, username, domain_id, cluster_id, channel_id, node_id, ip_address)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `);
        return stmt.run(userId, username, domainId, clusterId, channelId, nodeId, ipAddress);
    }

    // Add channel main node with auto-generated UUID
    static addChannelMainNodeAutoId(nodeData) {
        const userId = nodeData.userId || generateUserId();
        const stmt = db.prepare(`
            INSERT INTO channel_main_nodes 
            (user_id, username, domain_id, cluster_id, channel_id, node_id, ip_address, port, status, is_main_node, 
             last_heartbeat, created_at, updated_at, priority, capabilities, metadata)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        return stmt.run(
            userId, nodeData.username, nodeData.domainId, nodeData.clusterId, nodeData.channelId,
            nodeData.nodeId, nodeData.ipAddress, nodeData.port || 3002, nodeData.status || 'active',
            nodeData.isMainNode || 0, nodeData.lastHeartbeat || Math.floor(Date.now() / 1000),
            nodeData.createdAt || Math.floor(Date.now() / 1000),
            nodeData.updatedAt || Math.floor(Date.now() / 1000),
            nodeData.priority || 0, nodeData.capabilities || '{}', nodeData.metadata || '{}'
        );
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

    // Get channel main node by node ID
    static getChannelMainNodeByNodeId(nodeId) {
        return db.prepare(`SELECT * FROM channel_main_nodes WHERE node_id = ?`).get(nodeId);
    }

    // Update channel main node information
    static updateChannelMainNode(userId, username, domainId, clusterId, channelId, nodeId = null, ipAddress = null) {
        const stmt = db.prepare(`
            UPDATE channel_main_nodes
            SET username = ?, domain_id = ?, cluster_id = ?, channel_id = ?, node_id = COALESCE(?, node_id), ip_address = COALESCE(?, ip_address)
            WHERE user_id = ?
        `);
        return stmt.run(username, domainId, clusterId, channelId, nodeId, ipAddress, userId);
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

    // ===================== Channel nodes table channel_nodes =====================

    // Add channel node
    // @param {string} userId - UUID for the user
    static addChannelNode(userId, username, domainId, clusterId, channelId, nodeId = null, ipAddress = null) {
        const stmt = db.prepare(`
            INSERT INTO channel_nodes (user_id, username, domain_id, cluster_id, channel_id, node_id, ip_address)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `);
        return stmt.run(userId, username, domainId, clusterId, channelId, nodeId, ipAddress);
    }

    // Add channel node with auto-generated UUID
    static addChannelNodeAutoId(username, domainId, clusterId, channelId, nodeId = null, ipAddress = null) {
        const userId = generateUserId();
        return this.addChannelNode(userId, username, domainId, clusterId, channelId, nodeId, ipAddress);
    }

    // Get all channel nodes
    static getAllChannelNodes() {
        return db.prepare(`SELECT * FROM channel_nodes`).all();
    }

    // Get channel node by ID
    static getChannelNodeById(userId) {
        return db.prepare(`SELECT * FROM channel_nodes WHERE user_id = ?`).get(userId);
    }

    // Get all channel nodes by domain ID
    static getChannelNodesByDomainId(domainId) {
        return db.prepare(`SELECT * FROM channel_nodes WHERE domain_id = ?`).all(domainId);
    }

    // Get all channel nodes by cluster ID
    static getChannelNodesByClusterId(clusterId) {
        return db.prepare(`SELECT * FROM channel_nodes WHERE cluster_id = ?`).all(clusterId);
    }

    // Get all channel nodes by channel ID
    static getChannelNodesByChannelId(channelId) {
        return db.prepare(`SELECT * FROM channel_nodes WHERE channel_id = ?`).all(channelId);
    }

    // Get channel node by username
    static getChannelNodeByUsername(username) {
        return db.prepare(`SELECT * FROM channel_nodes WHERE username = ?`).get(username);
    }

    // Update channel node information
    static updateChannelNode(userId, username, domainId, clusterId, channelId, nodeId = null, ipAddress = null) {
        const stmt = db.prepare(`
            UPDATE channel_nodes
            SET username = ?, domain_id = ?, cluster_id = ?, channel_id = ?, node_id = COALESCE(?, node_id), ip_address = COALESCE(?, ip_address)
            WHERE user_id = ?
        `);
        return stmt.run(username, domainId, clusterId, channelId, nodeId, ipAddress, userId);
    }

    // Delete channel node
    static deleteChannelNode(userId) {
        return db.prepare(`DELETE FROM channel_nodes WHERE user_id = ?`).run(userId);
    }

    // Delete all channel nodes by domain ID
    static deleteChannelNodesByDomainId(domainId) {
        return db.prepare(`DELETE FROM channel_nodes WHERE domain_id = ?`).run(domainId);
    }

    // Delete all channel nodes by cluster ID
    static deleteChannelNodesByClusterId(clusterId) {
        return db.prepare(`DELETE FROM channel_nodes WHERE cluster_id = ?`).run(clusterId);
    }

    // Delete all channel nodes by channel ID
    static deleteChannelNodesByChannelId(channelId) {
        return db.prepare(`DELETE FROM channel_nodes WHERE channel_id = ?`).run(channelId);
    }

    // ===================== Local users table local_users =====================

    // Add local user
    // @param {string} userId - UUID for the user
    static addLocalUser(userId, username, domainId, clusterId, channelId, nodeId = null, ipAddress = null, isCurrent = 0) {
        // Check if local_users table is empty
        const existingUsers = this.getAllLocalUsers();

        let finalNodeId = nodeId;

        if (existingUsers.length === 0) {
            // Table is empty, generate a new UUID for node_id
            finalNodeId = nodeId || generateUserId();
            console.log('Local users table is empty, generating new node_id:', finalNodeId);
        } else {
            // Table has data, use existing node_id from first user
            const existingNodeId = existingUsers[0].node_id;
            if (existingNodeId) {
                finalNodeId = existingNodeId;
                console.log('Using existing node_id from local users:', finalNodeId);
            } else {
                // If existing user has no node_id, generate one and update all users
                finalNodeId = nodeId || generateUserId();
                console.log('Existing users have no node_id, generating new one and updating all:', finalNodeId);
                this.updateAllLocalUsersNodeId(finalNodeId);
            }
        }

        const stmt = db.prepare(`
            INSERT INTO local_users (user_id, username, domain_id, cluster_id, channel_id, node_id, ip_address, is_current)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);
        return stmt.run(userId, username, domainId, clusterId, channelId, finalNodeId, ipAddress, isCurrent);
    }

    // Add local user with auto-generated UUID
    static addLocalUserAutoId(nodeData) {
        const userId = nodeData.userId || generateUserId();
        const stmt = db.prepare(`
            INSERT INTO local_users 
            (user_id, username, domain_id, cluster_id, channel_id, node_id, ip_address, port, status, is_main_node, 
             last_heartbeat, created_at, updated_at, priority, capabilities, metadata, is_current)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        return stmt.run(
            userId, nodeData.username, nodeData.domainId, nodeData.clusterId, nodeData.channelId,
            nodeData.nodeId, nodeData.ipAddress, nodeData.port || 3003, nodeData.status || 'active',
            nodeData.isMainNode || 0, nodeData.lastHeartbeat || Math.floor(Date.now() / 1000),
            nodeData.createdAt || Math.floor(Date.now() / 1000),
            nodeData.updatedAt || Math.floor(Date.now() / 1000),
            nodeData.priority || 0, nodeData.capabilities || '{}', nodeData.metadata || '{}',
            nodeData.isCurrent || 0
        );
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

    // Get all local users by domain, cluster, and channel ID
    static getLocalUsersByChannel(domainId, clusterId, channelId) {
        return db.prepare(`SELECT * FROM local_users WHERE domain_id = ? AND cluster_id = ? AND channel_id = ?`).all(domainId, clusterId, channelId);
    }

    // Get local user by username
    static getLocalUserByUsername(username) {
        return db.prepare(`SELECT * FROM local_users WHERE username = ?`).get(username);
    }

    // Update local user information
    static updateLocalUser(userId, username, domainId, clusterId, channelId, nodeId = null, ipAddress = null) {
        const stmt = db.prepare(`
            UPDATE local_users
            SET username = ?, domain_id = ?, cluster_id = ?, channel_id = ?, node_id = COALESCE(?, node_id), ip_address = COALESCE(?, ip_address)
            WHERE user_id = ?
        `);
        return stmt.run(username, domainId, clusterId, channelId, nodeId, ipAddress, userId);
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

    // Clear all local users
    static clearAllLocalUsers() {
        try {
            const result = db.prepare('DELETE FROM local_users').run();
            return { success: true, changes: result.changes };
        } catch (error) {
            console.error('Error clearing all local users:', error);
            return { success: false, error: error.message };
        }
    }

    // Clear all current users (set is_current to 0)
    static clearAllCurrentUsers() {
        try {
            const result = db.prepare('UPDATE local_users SET is_current = 0').run();
            return { success: true, changes: result.changes };
        } catch (error) {
            console.error('Error clearing all current users:', error);
            return { success: false, error: error.message };
        }
    }

    // Update local user with is_current flag
    static updateLocalUserWithCurrent(userId, username, domainId, clusterId, channelId, nodeId = null, ipAddress = null, isCurrent = 0) {
        try {
            const stmt = db.prepare(`
                UPDATE local_users
                SET username = COALESCE(?, username), 
                    domain_id = COALESCE(?, domain_id), 
                    cluster_id = COALESCE(?, cluster_id), 
                    channel_id = COALESCE(?, channel_id), 
                    node_id = COALESCE(?, node_id), 
                    ip_address = COALESCE(?, ip_address),
                    is_current = ?
                WHERE user_id = ?
            `);
            const result = stmt.run(username, domainId, clusterId, channelId, nodeId, ipAddress, isCurrent, userId);
            return { success: true, changes: result.changes };
        } catch (error) {
            console.error('Error updating local user with current flag:', error);
            return { success: false, error: error.message };
        }
    }

    // Clear current user activities
    static clearCurrentUserActivities() {
        try {
            // Get current user
            const currentUser = db.prepare('SELECT user_id FROM local_users WHERE is_current = 1').get();
            if (!currentUser) {
                return { success: false, error: 'No current user found' };
            }

            const result = db.prepare('DELETE FROM user_activities WHERE user_id = ?').run(currentUser.user_id);
            return { success: true, changes: result.changes };
        } catch (error) {
            console.error('Error clearing current user activities:', error);
            return { success: false, error: error.message };
        }
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
        stats.channelNodes = db.prepare(`SELECT COUNT(*) as count FROM channel_nodes`).get().count;
        stats.localUsers = db.prepare(`SELECT COUNT(*) as count FROM local_users`).get().count;
        stats.userActivities = db.prepare(`SELECT COUNT(*) as count FROM user_activities`).get().count;
        return stats;
    }

    // Clear all table data
    static clearAllData() {
        const tables = ['domain_main_nodes', 'cluster_main_nodes', 'channel_main_nodes', 'channel_nodes', 'local_users', 'user_activities'];
        tables.forEach(table => {
            db.prepare(`DELETE FROM ${table}`).run();
        });
        return true;
    }

    // ===================== Node ID based query methods =====================

    // Get domain main node by node_id
    static getDomainMainNodeByNodeId(nodeId) {
        return db.prepare(`SELECT * FROM domain_main_nodes WHERE node_id = ?`).get(nodeId);
    }

    // Get cluster main node by node_id
    static getClusterMainNodeByNodeId(nodeId) {
        return db.prepare(`SELECT * FROM cluster_main_nodes WHERE node_id = ?`).get(nodeId);
    }

    // Get channel main node by node_id
    static getChannelMainNodeByNodeId(nodeId) {
        return db.prepare(`SELECT * FROM channel_main_nodes WHERE node_id = ?`).get(nodeId);
    }

    // Get channel node by node_id
    static getChannelNodeByNodeId(nodeId) {
        return db.prepare(`SELECT * FROM channel_nodes WHERE node_id = ?`).get(nodeId);
    }

    // Get local user by node_id
    static getLocalUserByNodeId(nodeId) {
        return db.prepare(`SELECT * FROM local_users WHERE node_id = ?`).get(nodeId);
    }

    // Get all nodes with node_id (exclude null node_id)
    static getAllNodesWithNodeId() {
        const results = {};
        results.domainMainNodes = db.prepare(`SELECT * FROM domain_main_nodes WHERE node_id IS NOT NULL`).all();
        results.clusterMainNodes = db.prepare(`SELECT * FROM cluster_main_nodes WHERE node_id IS NOT NULL`).all();
        results.channelMainNodes = db.prepare(`SELECT * FROM channel_main_nodes WHERE node_id IS NOT NULL`).all();
        results.channelNodes = db.prepare(`SELECT * FROM channel_nodes WHERE node_id IS NOT NULL`).all();
        results.localUsers = db.prepare(`SELECT * FROM local_users WHERE node_id IS NOT NULL`).all();
        return results;
    }

    // Get all nodes without node_id (null node_id)
    static getAllNodesWithoutNodeId() {
        const results = {};
        results.domainMainNodes = db.prepare(`SELECT * FROM domain_main_nodes WHERE node_id IS NULL`).all();
        results.clusterMainNodes = db.prepare(`SELECT * FROM cluster_main_nodes WHERE node_id IS NULL`).all();
        results.channelMainNodes = db.prepare(`SELECT * FROM channel_main_nodes WHERE node_id IS NULL`).all();
        results.channelNodes = db.prepare(`SELECT * FROM channel_nodes WHERE node_id IS NULL`).all();
        results.localUsers = db.prepare(`SELECT * FROM local_users WHERE node_id IS NULL`).all();
        return results;
    }

    // Search nodes by partial node_id match
    static searchNodesByNodeId(partialNodeId) {
        const results = {};
        results.domainMainNodes = db.prepare(`SELECT * FROM domain_main_nodes WHERE node_id LIKE ?`).all(`%${partialNodeId}%`);
        results.clusterMainNodes = db.prepare(`SELECT * FROM cluster_main_nodes WHERE node_id LIKE ?`).all(`%${partialNodeId}%`);
        results.channelMainNodes = db.prepare(`SELECT * FROM channel_main_nodes WHERE node_id LIKE ?`).all(`%${partialNodeId}%`);
        results.channelNodes = db.prepare(`SELECT * FROM channel_nodes WHERE node_id LIKE ?`).all(`%${partialNodeId}%`);
        results.localUsers = db.prepare(`SELECT * FROM local_users WHERE node_id LIKE ?`).all(`%${partialNodeId}%`);
        return results;
    }

    // Update node_id for existing records
    static updateNodeId(tableName, userId, newNodeId) {
        const validTables = ['domain_main_nodes', 'cluster_main_nodes', 'channel_main_nodes', 'channel_nodes', 'local_users'];
        if (!validTables.includes(tableName)) {
            throw new Error('Invalid table name');
        }
        const stmt = db.prepare(`UPDATE ${tableName} SET node_id = ? WHERE user_id = ?`);
        return stmt.run(newNodeId, userId);
    }

    // Check if node_id exists in any table
    static nodeIdExists(nodeId) {
        const tables = ['domain_main_nodes', 'cluster_main_nodes', 'channel_main_nodes', 'channel_nodes', 'local_users'];
        for (const table of tables) {
            const result = db.prepare(`SELECT COUNT(*) as count FROM ${table} WHERE node_id = ?`).get(nodeId);
            if (result.count > 0) {
                return { exists: true, table: table };
            }
        }
        return { exists: false, table: null };
    }

    // Update all local users with the same node_id
    static updateAllLocalUsersNodeId(nodeId) {
        const stmt = db.prepare(`UPDATE local_users SET node_id = ?`);
        return stmt.run(nodeId);
    }

    // Get the current node_id used by local users (if any)
    static getLocalUsersNodeId() {
        const users = this.getAllLocalUsers();
        if (users.length > 0) {
            return users[0].node_id;
        }
        return null;
    }

    // Ensure all local users have the same node_id
    static ensureLocalUsersNodeIdConsistency() {
        const users = this.getAllLocalUsers();
        if (users.length === 0) {
            return null; // No users to sync
        }

        // Find the first non-null node_id
        let targetNodeId = null;
        for (const user of users) {
            if (user.node_id) {
                targetNodeId = user.node_id;
                break;
            }
        }

        // If no node_id found, generate one
        if (!targetNodeId) {
            targetNodeId = generateUserId();
        }

        // Update all users with the target node_id
        this.updateAllLocalUsersNodeId(targetNodeId);
        return targetNodeId;
    }

    // Clear all current user flags
    static clearCurrentLocalUserFlags() {
        try {
            const result = db.prepare('UPDATE local_users SET is_current = 0').run();
            return { success: true, changes: result.changes };
        } catch (error) {
            console.error('Error clearing current local user flags:', error);
            return { success: false, error: error.message };
        }
    }

    // Set current local user
    static setCurrentLocalUser(userId) {
        try {
            const result = db.prepare('UPDATE local_users SET is_current = 1 WHERE user_id = ?').run(userId);
            return { success: true, changes: result.changes };
        } catch (error) {
            console.error('Error setting current local user:', error);
            return { success: false, error: error.message };
        }
    }

    // Get current local user
    static getCurrentLocalUser() {
        try {
            return db.prepare('SELECT * FROM local_users WHERE is_current = 1').get();
        } catch (error) {
            console.error('Error getting current local user:', error);
            return null;
        }
    }
}

module.exports = DatabaseManager;