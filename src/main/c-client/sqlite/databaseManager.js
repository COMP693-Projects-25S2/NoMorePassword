// /src/main/sqlite/databaseManager.js
const db = require('./database');
const { v4: uuidv4 } = require('uuid');

// Helper function to generate UUID if not provided
function generateUserId() {
    return uuidv4();
}

class DatabaseManager {
    // ===================== Network Configuration Methods =====================

    // Update all IP addresses for current node across all tables
    static updateAllNodeIpAddresses(nodeId, newIpAddress) {
        try {
            console.log(`🔧 DatabaseManager: Updating all IP addresses for node ${nodeId} to ${newIpAddress}`);

            // Update local_users table
            const localUsersStmt = db.prepare(`
                UPDATE local_users 
                SET updated_at = ? 
                WHERE node_id = ?
            `);
            const localUsersResult = localUsersStmt.run(Math.floor(Date.now() / 1000), nodeId);
            console.log(`🔧 DatabaseManager: Updated ${localUsersResult.changes} records in local_users`);

            // Update domain_main_nodes table
            const domainStmt = db.prepare(`
                UPDATE domain_main_nodes 
                SET updated_at = ? 
                WHERE node_id = ?
            `);
            const domainResult = domainStmt.run(Math.floor(Date.now() / 1000), nodeId);
            console.log(`🔧 DatabaseManager: Updated ${domainResult.changes} records in domain_main_nodes`);

            // Update cluster_main_nodes table
            const clusterStmt = db.prepare(`
                UPDATE cluster_main_nodes 
                SET updated_at = ? 
                WHERE node_id = ?
            `);
            const clusterResult = clusterStmt.run(Math.floor(Date.now() / 1000), nodeId);
            console.log(`🔧 DatabaseManager: Updated ${clusterResult.changes} records in cluster_main_nodes`);

            // Update channel_main_nodes table
            const channelMainStmt = db.prepare(`
                UPDATE channel_main_nodes 
                SET updated_at = ? 
                WHERE node_id = ?
            `);
            const channelMainResult = channelMainStmt.run(Math.floor(Date.now() / 1000), nodeId);
            console.log(`🔧 DatabaseManager: Updated ${channelMainResult.changes} records in channel_main_nodes`);

            // Update channel_nodes table
            const channelStmt = db.prepare(`
                UPDATE channel_nodes 
                SET updated_at = ? 
                WHERE node_id = ?
            `);
            const channelResult = channelStmt.run(Math.floor(Date.now() / 1000), nodeId);
            console.log(`🔧 DatabaseManager: Updated ${channelResult.changes} records in channel_nodes`);

            const totalChanges = localUsersResult.changes + domainResult.changes + clusterResult.changes + channelMainResult.changes + channelResult.changes;
            console.log(`🔧 DatabaseManager: Total ${totalChanges} records updated across all tables`);

            return {
                success: true,
                totalChanges: totalChanges,
                details: {
                    local_users: localUsersResult.changes,
                    domain_main_nodes: domainResult.changes,
                    cluster_main_nodes: clusterResult.changes,
                    channel_main_nodes: channelMainResult.changes,
                    channel_nodes: channelResult.changes
                }
            };
        } catch (error) {
            console.error('🔧 DatabaseManager: Error updating node IP addresses:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // Get current node ID from local_users
    static getCurrentNodeId() {
        try {
            const stmt = db.prepare('SELECT node_id FROM local_users WHERE is_current = 1 LIMIT 1');
            const result = stmt.get();
            return result ? result.node_id : null;
        } catch (error) {
            console.error('🔧 DatabaseManager: Error getting current node ID:', error);
            return null;
        }
    }

    // ===================== Domain main nodes table domain_main_nodes =====================

    // Add domain main node
    static addDomainMainNode(nodeId, domainId) {
        const stmt = db.prepare(`
            INSERT INTO domain_main_nodes (node_id, domain_id)
            VALUES (?, ?)
        `);
        return stmt.run(nodeId, domainId);
    }

    // Add domain main node with auto-generated UUID
    static addDomainMainNodeAutoId(nodeData) {
        const stmt = db.prepare(`
            INSERT INTO domain_main_nodes 
            (node_id, domain_id, status, sub_amount, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
        `);
        return stmt.run(
            nodeData.nodeId, nodeData.domainId,
            nodeData.status || 'active', nodeData.subAmount || 0,
            nodeData.createdAt || Math.floor(Date.now() / 1000),
            nodeData.updatedAt || Math.floor(Date.now() / 1000)
        );
    }

    // Get all domain main nodes
    static getAllDomainMainNodes() {
        return db.prepare(`SELECT * FROM domain_main_nodes`).all();
    }

    // Update domain main node sub_amount
    static updateDomainMainNodeSubAmount(nodeId, subAmount) {
        const stmt = db.prepare(`
            UPDATE domain_main_nodes 
            SET sub_amount = ?, updated_at = ?
            WHERE node_id = ?
        `);
        return stmt.run(subAmount, Math.floor(Date.now() / 1000), nodeId);
    }

    // Get domain main node by node ID
    static getDomainMainNodeById(nodeId) {
        return db.prepare(`SELECT * FROM domain_main_nodes WHERE node_id = ?`).get(nodeId);
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
    static updateDomainMainNode(nodeId, domainId) {
        const stmt = db.prepare(`
            UPDATE domain_main_nodes
            SET domain_id = ?, updated_at = ?
            WHERE node_id = ?
        `);
        return stmt.run(domainId, Math.floor(Date.now() / 1000), nodeId);
    }

    // Delete domain main node
    static deleteDomainMainNode(nodeId) {
        return db.prepare(`DELETE FROM domain_main_nodes WHERE node_id = ?`).run(nodeId);
    }

    // Delete domain main node by domain ID
    static deleteDomainMainNodeByDomainId(domainId) {
        return db.prepare(`DELETE FROM domain_main_nodes WHERE domain_id = ?`).run(domainId);
    }

    // Clear all domain main nodes
    static clearAllDomainMainNodes() {
        return db.prepare(`DELETE FROM domain_main_nodes`).run();
    }

    // ===================== Cluster main nodes table cluster_main_nodes =====================

    // Add cluster main node
    static addClusterMainNode(nodeId, domainId, clusterId) {
        const stmt = db.prepare(`
            INSERT INTO cluster_main_nodes (node_id, domain_id, cluster_id)
            VALUES (?, ?, ?)
        `);
        return stmt.run(nodeId, domainId, clusterId);
    }

    // Add cluster main node with auto-generated UUID
    static addClusterMainNodeAutoId(nodeData) {
        const stmt = db.prepare(`
            INSERT INTO cluster_main_nodes 
            (node_id, domain_id, cluster_id, status, sub_amount, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `);
        return stmt.run(
            nodeData.nodeId, nodeData.domainId, nodeData.clusterId,
            nodeData.status || 'active', nodeData.subAmount || 0,
            nodeData.createdAt || Math.floor(Date.now() / 1000),
            nodeData.updatedAt || Math.floor(Date.now() / 1000)
        );
    }

    // Get all cluster main nodes
    static getAllClusterMainNodes() {
        return db.prepare(`SELECT * FROM cluster_main_nodes`).all();
    }

    // Update cluster main node sub_amount
    static updateClusterMainNodeSubAmount(nodeId, subAmount) {
        const stmt = db.prepare(`
            UPDATE cluster_main_nodes 
            SET sub_amount = ?, updated_at = ?
            WHERE node_id = ?
        `);
        return stmt.run(subAmount, Math.floor(Date.now() / 1000), nodeId);
    }

    // Get cluster main node by node ID
    static getClusterMainNodeById(nodeId) {
        return db.prepare(`SELECT * FROM cluster_main_nodes WHERE node_id = ?`).get(nodeId);
    }

    // Get cluster with available capacity (sub_amount < 1000)
    static getClusterWithAvailableCapacity() {
        return db.prepare(`SELECT * FROM cluster_main_nodes WHERE sub_amount < 1000 LIMIT 1`).get();
    }

    // Get cluster with available capacity for specific domain
    static getClusterWithAvailableCapacityByDomain(domainId) {
        return db.prepare(`SELECT * FROM cluster_main_nodes WHERE domain_id = ? AND sub_amount < 1000 LIMIT 1`).get(domainId);
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
    static updateClusterMainNode(nodeId, domainId, clusterId) {
        const stmt = db.prepare(`
            UPDATE cluster_main_nodes
            SET domain_id = ?, cluster_id = ?, updated_at = ?
            WHERE node_id = ?
        `);
        return stmt.run(domainId, clusterId, Math.floor(Date.now() / 1000), nodeId);
    }

    // Delete cluster main node
    static deleteClusterMainNode(nodeId) {
        return db.prepare(`DELETE FROM cluster_main_nodes WHERE node_id = ?`).run(nodeId);
    }

    // Delete all cluster main nodes by domain ID
    static deleteClusterMainNodesByDomainId(domainId) {
        return db.prepare(`DELETE FROM cluster_main_nodes WHERE domain_id = ?`).run(domainId);
    }

    // Delete cluster main node by cluster ID
    static deleteClusterMainNodeByClusterId(clusterId) {
        return db.prepare(`DELETE FROM cluster_main_nodes WHERE cluster_id = ?`).run(clusterId);
    }

    // Clear all cluster main nodes
    static clearAllClusterMainNodes() {
        return db.prepare(`DELETE FROM cluster_main_nodes`).run();
    }

    // ===================== Channel main nodes table channel_main_nodes =====================

    // Add channel main node
    static addChannelMainNode(nodeId, domainId, clusterId, channelId) {
        const stmt = db.prepare(`
            INSERT INTO channel_main_nodes (node_id, domain_id, cluster_id, channel_id)
            VALUES (?, ?, ?, ?)
        `);
        return stmt.run(nodeId, domainId, clusterId, channelId);
    }

    // Add channel main node with auto-generated UUID
    static addChannelMainNodeAutoId(nodeData) {
        const stmt = db.prepare(`
            INSERT INTO channel_main_nodes 
            (node_id, domain_id, cluster_id, channel_id, status, sub_amount, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);
        return stmt.run(
            nodeData.nodeId, nodeData.domainId, nodeData.clusterId, nodeData.channelId,
            nodeData.status || 'active', nodeData.subAmount || 0,
            nodeData.createdAt || Math.floor(Date.now() / 1000),
            nodeData.updatedAt || Math.floor(Date.now() / 1000)
        );
    }

    // Get all channel main nodes
    static getAllChannelMainNodes() {
        return db.prepare(`SELECT * FROM channel_main_nodes`).all();
    }

    // Update channel main node sub_amount
    static updateChannelMainNodeSubAmount(nodeId, subAmount) {
        const stmt = db.prepare(`
            UPDATE channel_main_nodes 
            SET sub_amount = ?, updated_at = ?
            WHERE node_id = ?
        `);
        return stmt.run(subAmount, Math.floor(Date.now() / 1000), nodeId);
    }

    // Get channel main node by node ID
    static getChannelMainNodeById(nodeId) {
        return db.prepare(`SELECT * FROM channel_main_nodes WHERE node_id = ?`).get(nodeId);
    }

    // Get all channel main nodes by domain ID
    static getChannelMainNodesByDomainId(domainId) {
        return db.prepare(`SELECT * FROM channel_main_nodes WHERE domain_id = ?`).all(domainId);
    }

    // Get all channel main nodes by cluster ID
    static getChannelMainNodesByClusterId(clusterId) {
        return db.prepare(`SELECT * FROM channel_main_nodes WHERE cluster_id = ?`).all(clusterId);
    }

    // Get channel main node with available capacity for specific cluster
    static getChannelMainNodeWithAvailableCapacityByCluster(clusterId) {
        return db.prepare(`SELECT * FROM channel_main_nodes WHERE cluster_id = ? AND sub_amount < 1000 LIMIT 1`).get(clusterId);
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
    static updateChannelMainNode(nodeId, domainId, clusterId, channelId) {
        const stmt = db.prepare(`
            UPDATE channel_main_nodes
            SET domain_id = ?, cluster_id = ?, channel_id = ?, updated_at = ?
            WHERE node_id = ?
        `);
        return stmt.run(domainId, clusterId, channelId, Math.floor(Date.now() / 1000), nodeId);
    }

    // Delete channel main node
    static deleteChannelMainNode(nodeId) {
        return db.prepare(`DELETE FROM channel_main_nodes WHERE node_id = ?`).run(nodeId);
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

    // Clear all channel main nodes
    static clearAllChannelMainNodes() {
        return db.prepare(`DELETE FROM channel_main_nodes`).run();
    }


    // Update IP and port methods
    static updateDomainMainNodeTimestamp(nodeId) {
        const stmt = db.prepare(`
            UPDATE domain_main_nodes
            SET updated_at = ?
            WHERE node_id = ?
        `);
        return stmt.run(Math.floor(Date.now() / 1000), nodeId);
    }

    static updateClusterMainNodeTimestamp(nodeId) {
        const stmt = db.prepare(`
            UPDATE cluster_main_nodes
            SET updated_at = ?
            WHERE node_id = ?
        `);
        return stmt.run(Math.floor(Date.now() / 1000), nodeId);
    }

    static updateChannelMainNodeTimestamp(nodeId) {
        const stmt = db.prepare(`
            UPDATE channel_main_nodes
            SET updated_at = ?
            WHERE node_id = ?
        `);
        return stmt.run(Math.floor(Date.now() / 1000), nodeId);
    }

    static updateChannelNodeTimestamp(nodeId) {
        const stmt = db.prepare(`
            UPDATE channel_nodes
            SET updated_at = ?
            WHERE node_id = ?
        `);
        return stmt.run(Math.floor(Date.now() / 1000), nodeId);
    }

    // Update local_user timestamp
    static updateLocalUserTimestamp(userId) {
        const stmt = db.prepare(`
            UPDATE local_users
            SET updated_at = ?
            WHERE user_id = ?
        `);
        return stmt.run(Math.floor(Date.now() / 1000), userId);
    }

    // Update local_user port only
    static updateLocalUserPort(userId, port) {
        const stmt = db.prepare(`
            UPDATE local_users
            SET port = ?, updated_at = ?
            WHERE user_id = ?
        `);
        return stmt.run(port, Math.floor(Date.now() / 1000), userId);
    }

    // Note: updateLocalUserIpPort method removed - IP and port tracking no longer needed in local_users table

    // Get methods for checking main node status
    static getDomainMainNodeByNodeId(nodeId) {
        return db.prepare(`SELECT * FROM domain_main_nodes WHERE node_id = ?`).get(nodeId);
    }

    static getClusterMainNodeByNodeId(nodeId) {
        return db.prepare(`SELECT * FROM cluster_main_nodes WHERE node_id = ?`).get(nodeId);
    }

    static getChannelMainNodeByNodeId(nodeId) {
        return db.prepare(`SELECT * FROM channel_main_nodes WHERE node_id = ?`).get(nodeId);
    }

    static getChannelNodeByNodeId(nodeId) {
        return db.prepare(`SELECT * FROM channel_nodes WHERE node_id = ?`).get(nodeId);
    }

    // ===================== Channel nodes table channel_nodes =====================

    // Add channel node
    static addChannelNode(nodeId, domainId, clusterId, channelId) {
        const stmt = db.prepare(`
            INSERT INTO channel_nodes (node_id, domain_id, cluster_id, channel_id)
            VALUES (?, ?, ?, ?)
        `);
        return stmt.run(nodeId, domainId, clusterId, channelId);
    }

    // Add channel node with auto-generated UUID
    static addChannelNodeAutoId(nodeId, domainId, clusterId, channelId) {
        return this.addChannelNode(nodeId, domainId, clusterId, channelId);
    }

    // Get all channel nodes
    static getAllChannelNodes() {
        return db.prepare(`SELECT * FROM channel_nodes`).all();
    }

    // Get channel node by node ID
    static getChannelNodeById(nodeId) {
        return db.prepare(`SELECT * FROM channel_nodes WHERE node_id = ?`).get(nodeId);
    }

    // Get all channel nodes by domain ID
    static getChannelNodesByDomainId(domainId) {
        return db.prepare(`SELECT * FROM channel_nodes WHERE domain_id = ?`).all(domainId);
    }

    // Get all channel nodes by cluster ID
    static getChannelNodesByClusterId(clusterId) {
        return db.prepare(`SELECT * FROM channel_nodes WHERE cluster_id = ?`).all(clusterId);
    }

    // Get cluster main node by cluster ID
    static getClusterMainNodeByClusterId(clusterId) {
        return db.prepare(`SELECT * FROM cluster_main_nodes WHERE cluster_id = ?`).get(clusterId);
    }

    // Get all channel nodes by channel ID
    static getChannelNodesByChannelId(channelId) {
        return db.prepare(`SELECT * FROM channel_nodes WHERE channel_id = ?`).all(channelId);
    }

    // Get channel node by node ID (alias for getChannelNodeById)
    static getChannelNodeByNodeId(nodeId) {
        return db.prepare(`SELECT * FROM channel_nodes WHERE node_id = ?`).get(nodeId);
    }

    // Update channel node information
    static updateChannelNode(nodeId, domainId, clusterId, channelId) {
        const stmt = db.prepare(`
            UPDATE channel_nodes
            SET domain_id = ?, cluster_id = ?, channel_id = ?, updated_at = ?
            WHERE node_id = ?
        `);
        return stmt.run(domainId, clusterId, channelId, Math.floor(Date.now() / 1000), nodeId);
    }

    // Delete channel node
    static deleteChannelNode(nodeId) {
        return db.prepare(`DELETE FROM channel_nodes WHERE node_id = ?`).run(nodeId);
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
    static addLocalUser(userId, username, domainId, clusterId, channelId, nodeId = null, ipAddress = null, isCurrent = 0, clientType = 'c-client') {
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
            INSERT INTO local_users (user_id, username, domain_id, cluster_id, channel_id, node_id, is_current)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `);
        return stmt.run(userId, username, domainId, clusterId, channelId, finalNodeId, isCurrent);
    }

    // Add local user with auto-generated UUID
    static addLocalUserAutoId(nodeData) {
        const userId = nodeData.userId || generateUserId();
        const stmt = db.prepare(`
            INSERT INTO local_users 
            (user_id, username, domain_id, cluster_id, channel_id, node_id, status, created_at, updated_at, is_current)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        return stmt.run(
            userId, nodeData.username, nodeData.domainId, nodeData.clusterId, nodeData.channelId,
            nodeData.nodeId, nodeData.status || 'active',
            nodeData.createdAt || Math.floor(Date.now() / 1000),
            nodeData.updatedAt || Math.floor(Date.now() / 1000),
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
    static updateLocalUser(userId, username, domainId, clusterId, channelId, nodeId = null) {
        const stmt = db.prepare(`
            UPDATE local_users
            SET username = ?, domain_id = ?, cluster_id = ?, channel_id = ?, node_id = COALESCE(?, node_id), updated_at = ?
            WHERE user_id = ?
        `);
        return stmt.run(username, domainId, clusterId, channelId, nodeId, Math.floor(Date.now() / 1000), userId);
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
    static updateLocalUserWithCurrent(userId, username, domainId, clusterId, channelId, nodeId = null, isCurrent = 0) {
        try {
            const stmt = db.prepare(`
                UPDATE local_users
                SET username = COALESCE(?, username), 
                    domain_id = COALESCE(?, domain_id), 
                    cluster_id = COALESCE(?, cluster_id), 
                    channel_id = COALESCE(?, channel_id), 
                    node_id = COALESCE(?, node_id), 
                    updated_at = ?,
                    is_current = ?
                WHERE user_id = ?
            `);
            const result = stmt.run(username, domainId, clusterId, channelId, nodeId, Math.floor(Date.now() / 1000), isCurrent, userId);
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