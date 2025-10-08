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
            const stmt = db.prepare('SELECT node_id FROM local_users ORDER BY updated_at DESC LIMIT 1');
            const result = stmt.get();
            return result ? result.node_id : null;
        } catch (error) {
            console.error('🔧 DatabaseManager: Error getting current node ID:', error);
            return null;
        }
    }

    // Get current node ID for specific client
    static getCurrentNodeIdForClient(clientId) {
        try {
            if (!clientId) {
                console.warn('No clientId provided, returning null for current node ID');
                return null;
            }

            const stmt = db.prepare('SELECT node_id FROM local_users WHERE client_ids LIKE ? ORDER BY updated_at DESC LIMIT 1');
            const result = stmt.get(`%"${clientId}"%`);
            const nodeId = result ? result.node_id : null;

            if (nodeId) {
                console.log(`Found current node_id ${nodeId} for client_id ${clientId}`);
            } else {
                console.log(`No current node found for client_id ${clientId}`);
            }

            return nodeId;
        } catch (error) {
            console.error('🔧 DatabaseManager: Error getting current node ID for client:', error);
            return null;
        }
    }

    // ===================== Domain main nodes table domain_main_nodes =====================

    // Add domain main node
    static addDomainMainNode(nodeId, domainId) {
        // Check if node already exists
        const existing = this.getDomainMainNodeByNodeId(nodeId);

        if (existing) {
            // Update existing record
            const stmt = db.prepare(`
                UPDATE domain_main_nodes 
                SET domain_id = ?
                WHERE node_id = ?
            `);
            console.log(`🔄 Updating existing domain_main_node: ${nodeId}`);
            return stmt.run(domainId, nodeId);
        } else {
            // Insert new record
            const stmt = db.prepare(`
                INSERT INTO domain_main_nodes (node_id, domain_id)
                VALUES (?, ?)
            `);
            console.log(`➕ Inserting new domain_main_node: ${nodeId}`);
            return stmt.run(nodeId, domainId);
        }
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
        // Check if node already exists
        const existing = this.getClusterMainNodeByNodeId(nodeId);

        if (existing) {
            // Update existing record
            const stmt = db.prepare(`
                UPDATE cluster_main_nodes 
                SET domain_id = ?, cluster_id = ?
                WHERE node_id = ?
            `);
            console.log(`🔄 Updating existing cluster_main_node: ${nodeId}`);
            return stmt.run(domainId, clusterId, nodeId);
        } else {
            // Insert new record
            const stmt = db.prepare(`
                INSERT INTO cluster_main_nodes (node_id, domain_id, cluster_id)
                VALUES (?, ?, ?)
            `);
            console.log(`➕ Inserting new cluster_main_node: ${nodeId}`);
            return stmt.run(nodeId, domainId, clusterId);
        }
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
        // Check if node already exists
        const existing = this.getChannelMainNodeByNodeId(nodeId);

        if (existing) {
            // Update existing record
            const stmt = db.prepare(`
                UPDATE channel_main_nodes 
                SET domain_id = ?, cluster_id = ?, channel_id = ?
                WHERE node_id = ?
            `);
            console.log(`🔄 Updating existing channel_main_node: ${nodeId}`);
            return stmt.run(domainId, clusterId, channelId, nodeId);
        } else {
            // Insert new record
            const stmt = db.prepare(`
                INSERT INTO channel_main_nodes (node_id, domain_id, cluster_id, channel_id)
                VALUES (?, ?, ?, ?)
            `);
            console.log(`➕ Inserting new channel_main_node: ${nodeId}`);
            return stmt.run(nodeId, domainId, clusterId, channelId);
        }
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
        // Check if node already exists
        const existing = this.getChannelNodeById(nodeId);

        if (existing) {
            // Update existing record
            const stmt = db.prepare(`
                UPDATE channel_nodes 
                SET domain_id = ?, cluster_id = ?, channel_id = ?
                WHERE node_id = ?
            `);
            console.log(`🔄 Updating existing channel_node: ${nodeId}`);
            return stmt.run(domainId, clusterId, channelId, nodeId);
        } else {
            // Insert new record
            const stmt = db.prepare(`
                INSERT INTO channel_nodes (node_id, domain_id, cluster_id, channel_id)
                VALUES (?, ?, ?, ?)
            `);
            console.log(`➕ Inserting new channel_node: ${nodeId}`);
            return stmt.run(nodeId, domainId, clusterId, channelId);
        }
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
    static addLocalUser(userId, username, domainId, clusterId, channelId, nodeId = null, ipAddress = null, isCurrent = 0, clientType = 'c-client', clientId = null) {
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
            INSERT INTO local_users (user_id, username, domain_id, cluster_id, channel_id, node_id, client_ids)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `);
        const clientIds = clientId ? this.serializeClientIds([clientId]) : '[]';
        return stmt.run(userId, username, domainId, clusterId, channelId, finalNodeId, clientIds);
    }

    // Add local user with auto-generated UUID
    static addLocalUserAutoId(nodeData) {
        const userId = nodeData.userId || generateUserId();
        const stmt = db.prepare(`
            INSERT INTO local_users 
            (user_id, username, domain_id, cluster_id, channel_id, node_id, status, created_at, updated_at, client_ids)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        const clientIds = nodeData.clientId ? this.serializeClientIds([nodeData.clientId]) : '[]';
        return stmt.run(
            userId, nodeData.username, nodeData.domainId, nodeData.clusterId, nodeData.channelId,
            nodeData.nodeId, nodeData.status || 'active',
            nodeData.createdAt || Math.floor(Date.now() / 1000),
            nodeData.updatedAt || Math.floor(Date.now() / 1000),
            clientIds
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

    // Clear all client assignments (deprecated - use client-specific methods instead)
    static clearAllCurrentUsers() {
        try {
            const result = db.prepare('UPDATE local_users SET client_ids = \'[]\', updated_at = ?').run(Math.floor(Date.now() / 1000));
            return { success: true, changes: result.changes };
        } catch (error) {
            console.error('Error clearing all client assignments:', error);
            return { success: false, error: error.message };
        }
    }

    // Update local user (deprecated - use client_ids based methods instead)
    static updateLocalUserWithCurrent(userId, username, domainId, clusterId, channelId, nodeId = null, isCurrent = 0) {
        try {
            const stmt = db.prepare(`
                UPDATE local_users
                SET username = COALESCE(?, username), 
                    domain_id = COALESCE(?, domain_id), 
                    cluster_id = COALESCE(?, cluster_id), 
                    channel_id = COALESCE(?, channel_id), 
                    node_id = COALESCE(?, node_id), 
                    updated_at = ?
                WHERE user_id = ?
            `);
            const result = stmt.run(username, domainId, clusterId, channelId, nodeId, Math.floor(Date.now() / 1000), userId);
            return { success: true, changes: result.changes };
        } catch (error) {
            console.error('Error updating local user with current flag:', error);
            return { success: false, error: error.message };
        }
    }

    // Clear current user activities
    static clearCurrentUserActivities(clientId = null) {
        try {
            // Get current user
            let currentUser;
            if (clientId) {
                currentUser = db.prepare('SELECT user_id FROM local_users WHERE client_ids LIKE ? ORDER BY updated_at DESC LIMIT 1').get(`%"${clientId}"%`);
            } else {
                currentUser = db.prepare('SELECT user_id FROM local_users ORDER BY updated_at DESC LIMIT 1').get();
            }

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

    // Node Test: Generate unique node_id for users except the first one
    static generateUniqueNodeIdsForAllUsers() {
        try {
            const allUsers = this.getAllLocalUsers();

            if (allUsers.length === 0) {
                return { success: true, count: 0 };
            }

            // Update each user with a unique node_id (except the first user)
            const stmt = db.prepare(`UPDATE local_users SET node_id = ? WHERE user_id = ?`);
            let updatedCount = 0;

            for (let i = 0; i < allUsers.length; i++) {
                const user = allUsers[i];

                if (i === 0) {
                    // Keep the first user's node_id unchanged
                    console.log(`🧪 Node Test: ${user.username} -> KEPT (${user.node_id})`);
                    continue;
                }

                // Generate new node_id for other users
                const newNodeId = generateUserId();
                stmt.run(newNodeId, user.user_id);
                console.log(`🧪 Node Test: ${user.username} -> ${newNodeId}`);
                updatedCount++;
            }

            return { success: true, count: updatedCount, total: allUsers.length };

        } catch (error) {
            console.error('❌ Node Test error:', error);
            return { success: false, error: error.message };
        }
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

    // Clear all client assignments (deprecated - use client-specific methods instead)
    static clearAllClientAssignments() {
        try {
            const result = db.prepare('UPDATE local_users SET client_ids = \'[]\', updated_at = ?').run(Math.floor(Date.now() / 1000));
            console.log(`Cleared client_ids for ${result.changes} users`);
            return { success: true, changes: result.changes };
        } catch (error) {
            console.error('Error clearing all client assignments:', error);
            return { success: false, error: error.message };
        }
    }

    // Clear current user flags for specific client_id only
    static removeClientFromCurrentUsers(clientId) {
        try {
            if (!clientId) {
                console.warn('No clientId provided, skipping client removal');
                return { success: true, changes: 0 };
            }

            // Remove client_id from all users' client_ids arrays
            const result = this.removeClientFromAllUsers(clientId);
            console.log(`Removed client ${clientId} from all users, affected ${result.changes} records`);
            return result;
        } catch (error) {
            console.error('Error removing client from current users:', error);
            return { success: false, error: error.message };
        }
    }

    // Helper method: parse client_ids array
    static parseClientIds(clientIdsJson) {
        try {
            return clientIdsJson ? JSON.parse(clientIdsJson) : [];
        } catch (error) {
            console.error('Error parsing client_ids:', error);
            return [];
        }
    }

    // Helper method: serialize client_ids array
    static serializeClientIds(clientIds) {
        try {
            return JSON.stringify(clientIds || []);
        } catch (error) {
            console.error('Error serializing client_ids:', error);
            return '[]';
        }
    }

    // Check if user is used by specified client
    static isUserAssignedToClient(userId, clientId) {
        try {
            const user = db.prepare('SELECT client_ids FROM local_users WHERE user_id = ?').get(userId);
            if (!user) return false;

            const clientIds = this.parseClientIds(user.client_ids);
            return clientIds.includes(clientId);
        } catch (error) {
            console.error('Error checking user assignment:', error);
            return false;
        }
    }

    // Assign user to client
    static assignUserToClient(userId, clientId) {
        try {
            if (!clientId) {
                console.warn('No clientId provided for assignUserToClient');
                return { success: false, error: 'clientId is required' };
            }

            const user = db.prepare('SELECT client_ids FROM local_users WHERE user_id = ?').get(userId);
            if (!user) {
                return { success: false, error: `User ${userId} not found` };
            }

            const clientIds = this.parseClientIds(user.client_ids);
            if (!clientIds.includes(clientId)) {
                clientIds.push(clientId);
                const newClientIds = this.serializeClientIds(clientIds);

                const result = db.prepare('UPDATE local_users SET client_ids = ?, updated_at = ? WHERE user_id = ?').run(
                    newClientIds,
                    Math.floor(Date.now() / 1000),
                    userId
                );

                console.log(`Assigned user ${userId} to client ${clientId}, affected ${result.changes} records`);
                return { success: true, changes: result.changes };
            } else {
                console.log(`User ${userId} already assigned to client ${clientId}`);
                return { success: true, changes: 0 };
            }
        } catch (error) {
            console.error('Error assigning user to client:', error);
            return { success: false, error: error.message };
        }
    }

    // Remove user from client
    static removeUserFromClient(userId, clientId) {
        try {
            if (!clientId) {
                console.warn('No clientId provided for removeUserFromClient');
                return { success: false, error: 'clientId is required' };
            }

            const user = db.prepare('SELECT client_ids FROM local_users WHERE user_id = ?').get(userId);
            if (!user) {
                return { success: false, error: `User ${userId} not found` };
            }

            const clientIds = this.parseClientIds(user.client_ids);
            const index = clientIds.indexOf(clientId);
            if (index > -1) {
                clientIds.splice(index, 1);
                const newClientIds = this.serializeClientIds(clientIds);

                const result = db.prepare('UPDATE local_users SET client_ids = ?, updated_at = ? WHERE user_id = ?').run(
                    newClientIds,
                    Math.floor(Date.now() / 1000),
                    userId
                );

                console.log(`Removed user ${userId} from client ${clientId}, affected ${result.changes} records`);
                return { success: true, changes: result.changes };
            } else {
                console.log(`User ${userId} not assigned to client ${clientId}`);
                return { success: true, changes: 0 };
            }
        } catch (error) {
            console.error('Error removing user from client:', error);
            return { success: false, error: error.message };
        }
    }

    // Get all clients for user
    static getUserClients(userId) {
        try {
            const user = db.prepare('SELECT client_ids FROM local_users WHERE user_id = ?').get(userId);
            if (!user) return [];

            return this.parseClientIds(user.client_ids);
        } catch (error) {
            console.error('Error getting user clients:', error);
            return [];
        }
    }

    // Remove specified client ID from all users
    static removeClientFromAllUsers(clientId) {
        try {
            if (!clientId) {
                console.warn('No clientId provided for removeClientFromAllUsers');
                return { success: false, error: 'clientId is required' };
            }

            // Get all users containing this client ID
            const users = db.prepare('SELECT user_id, client_ids FROM local_users WHERE client_ids LIKE ?').all(`%"${clientId}"%`);

            let totalChanges = 0;
            for (const user of users) {
                const clientIds = this.parseClientIds(user.client_ids);
                const index = clientIds.indexOf(clientId);
                if (index > -1) {
                    clientIds.splice(index, 1);
                    const newClientIds = this.serializeClientIds(clientIds);

                    const result = db.prepare('UPDATE local_users SET client_ids = ?, updated_at = ? WHERE user_id = ?').run(
                        newClientIds,
                        Math.floor(Date.now() / 1000),
                        user.user_id
                    );

                    totalChanges += result.changes;
                    console.log(`Removed client ${clientId} from user ${user.user_id}, client_ids now: [${clientIds.join(', ')}]`);
                }
            }

            console.log(`Removed client ${clientId} from ${totalChanges} users`);
            return { success: true, changes: totalChanges };
        } catch (error) {
            console.error('Error removing client from all users:', error);
            return { success: false, error: error.message };
        }
    }

    // Set current local user (new approach: just assign user to client, no is_current dependency)
    static setCurrentLocalUser(userId, clientId = null) {
        try {
            if (!clientId) {
                console.warn('No clientId provided for setCurrentLocalUser');
                return { success: false, error: 'clientId is required' };
            }

            // Step 1: Remove current client ID from other users
            this.removeClientFromAllUsers(clientId);

            // Step 2: Assign user to client (if not already assigned)
            const assignResult = this.assignUserToClient(userId, clientId);
            if (!assignResult.success) {
                return assignResult;
            }

            // Step 3: Update user's updated_at timestamp
            const result = db.prepare('UPDATE local_users SET updated_at = ? WHERE user_id = ?').run(
                Math.floor(Date.now() / 1000),
                userId
            );

            console.log(`Set user ${userId} as current for client_id ${clientId}, affected ${result.changes} records`);

            if (result.changes === 0) {
                console.error(`Failed to set user ${userId} as current - user may not exist`);
                return { success: false, error: `User ${userId} not found` };
            }

            return { success: true, changes: result.changes };
        } catch (error) {
            console.error('Error setting current local user:', error);
            return { success: false, error: error.message };
        }
    }

    // Get latest local user (deprecated - use client-specific methods instead)
    static getCurrentLocalUser() {
        try {
            return db.prepare('SELECT * FROM local_users ORDER BY updated_at DESC LIMIT 1').get();
        } catch (error) {
            console.error('Error getting latest local user:', error);
            return null;
        }
    }

    // Get current local user for specific client (new approach: no is_current dependency)
    static getCurrentLocalUserForClient(clientId) {
        try {
            if (!clientId) {
                console.warn('No clientId provided, returning null for current user');
                return null;
            }

            // First try: find user with matching client_id in client_ids array
            let user = db.prepare('SELECT * FROM local_users WHERE client_ids LIKE ? ORDER BY updated_at DESC LIMIT 1').get(`%"${clientId}"%`);
            if (user) {
                console.log(`Found current user for client_id ${clientId}: ${user.username || user.user_id}`);
                return user;
            }

            console.log(`No current user found for client_id ${clientId}, trying fallback to latest updated user`);

            // Fallback: get the latest updated user (regardless of is_current or client_ids)
            user = db.prepare('SELECT * FROM local_users ORDER BY updated_at DESC LIMIT 1').get();
            if (user) {
                console.log(`Found latest updated user as fallback: ${user.username || user.user_id}`);
                // Auto-assign this user to current client
                this.assignUserToClient(user.user_id, clientId);
                return user;
            }

            console.log(`No users found in database`);
            return null;
        } catch (error) {
            console.error('Error getting current local user for client:', error);
            return null;
        }
    }

    // Get total user count (replacing is_current based counting)
    static getTotalUserCount() {
        try {
            const result = db.prepare('SELECT COUNT(*) as total FROM local_users').get();
            return result ? result.total : 0;
        } catch (error) {
            console.error('Error getting total user count:', error);
            return 0;
        }
    }

    // Get latest user by specific fields (replacing is_current based query)
    static getLatestUserFields(fields) {
        try {
            const fieldList = fields.join(', ');
            return db.prepare(`SELECT ${fieldList} FROM local_users ORDER BY updated_at DESC LIMIT 1`).get();
        } catch (error) {
            console.error('Error getting latest user fields:', error);
            return null;
        }
    }

    // Assign user to client during startup (without clearing is_current flags)
    static assignUserToClientOnStartup(userId, clientId) {
        try {
            if (!clientId) {
                console.warn('No clientId provided for assignUserToClientOnStartup');
                return { success: false, error: 'clientId is required' };
            }

            // Only update the user's client_ids and updated_at, don't touch is_current flags
            const user = db.prepare('SELECT client_ids FROM local_users WHERE user_id = ?').get(userId);
            if (!user) {
                return { success: false, error: `User ${userId} not found` };
            }

            const clientIds = this.parseClientIds(user.client_ids);
            if (!clientIds.includes(clientId)) {
                clientIds.push(clientId);
                const newClientIds = this.serializeClientIds(clientIds);

                const result = db.prepare('UPDATE local_users SET client_ids = ?, updated_at = ? WHERE user_id = ?').run(
                    newClientIds,
                    Math.floor(Date.now() / 1000),
                    userId
                );

                console.log(`Assigned user ${userId} to client_id ${clientId} on startup, affected ${result.changes} records`);
                return { success: true, changes: result.changes };
            } else {
                console.log(`User ${userId} already assigned to client ${clientId} on startup`);
                return { success: true, changes: 0 };
            }
        } catch (error) {
            console.error('Error assigning user to client on startup:', error);
            return { success: false, error: error.message };
        }
    }


    // Get current user fields for specific client (new approach: no is_current dependency)
    static getCurrentUserFieldsForClient(fields, clientId) {
        try {
            if (!clientId) {
                console.warn('No clientId provided, returning null for current user fields');
                return null;
            }

            const fieldList = fields.join(', ');

            // First try: find user with matching client_id in client_ids array
            let user = db.prepare(`SELECT ${fieldList} FROM local_users WHERE client_ids LIKE ? ORDER BY updated_at DESC LIMIT 1`).get(`%"${clientId}"%`);
            if (user) {
                console.log(`Found current user fields for client_id ${clientId}: ${user.username || user.user_id}`);
                return user;
            }

            console.log(`No current user found for client_id ${clientId}, trying fallback to latest updated user`);

            // Fallback: get the latest updated user (regardless of is_current or client_ids)
            user = db.prepare(`SELECT ${fieldList} FROM local_users ORDER BY updated_at DESC LIMIT 1`).get();
            if (user) {
                console.log(`Found latest updated user as fallback: ${user.username || user.user_id}`);
                // Auto-assign this user to current client
                this.assignUserToClient(user.user_id, clientId);
                return user;
            }

            console.log(`No users found in database`);
            return null;
        } catch (error) {
            console.error('Error getting current user fields for client:', error);
            return null;
        }
    }

    // Get all users (replacing is_current based query)
    static getAllUsers() {
        try {
            return db.prepare('SELECT user_id FROM local_users ORDER BY updated_at DESC').all();
        } catch (error) {
            console.error('Error getting all users:', error);
            return [];
        }
    }

    // Update client_ids for user assigned to specific client
    static updateUserClientId(clientId) {
        try {
            // Find the user with matching client_id in client_ids array
            const currentUser = db.prepare('SELECT user_id, client_ids FROM local_users WHERE client_ids LIKE ?').get(`%"${clientId}"%`);
            if (!currentUser) {
                console.log(`No user found with client_id ${clientId} to update`);
                return { success: false, error: `No user found with client_id ${clientId}` };
            }

            // Update the user's client_ids array and updated_at
            const clientIds = this.parseClientIds(currentUser.client_ids);
            if (!clientIds.includes(clientId)) {
                clientIds.push(clientId);
                const newClientIds = this.serializeClientIds(clientIds);

                const result = db.prepare('UPDATE local_users SET client_ids = ?, updated_at = ? WHERE user_id = ?').run(
                    newClientIds,
                    Math.floor(Date.now() / 1000),
                    currentUser.user_id
                );

                console.log(`Updated client_ids for user ${currentUser.user_id}: added ${clientId}, affected ${result.changes} records`);
                return { success: true, changes: result.changes };
            } else {
                console.log(`User ${currentUser.user_id} already assigned to client ${clientId}`);
                return { success: true, changes: 0 };
            }
        } catch (error) {
            console.error('Error updating client_ids for user:', error);
            return { success: false, error: error.message };
        }
    }

    // Debug method to check user status (no is_current dependency)
    static debugUserStatus() {
        try {
            const allUsers = db.prepare('SELECT user_id, username, client_ids, updated_at FROM local_users ORDER BY updated_at DESC').all();
            console.log('🔍 DatabaseManager: User status debug:');
            allUsers.forEach(user => {
                const updateTime = new Date(user.updated_at * 1000).toISOString();
                const clientIds = this.parseClientIds(user.client_ids);
                console.log(`  User: ${user.username} (${user.user_id}) - client_ids: [${clientIds.join(', ')}], updated_at: ${updateTime}`);
            });
            return allUsers;
        } catch (error) {
            console.error('Error debugging user status:', error);
            return [];
        }
    }

    // Debug method to check specific client's current user (no is_current dependency)
    static debugClientCurrentUser(clientId) {
        try {
            console.log(`🔍 DatabaseManager: Debugging current user for client_id: ${clientId}`);

            // Check client-specific current user
            const clientUser = db.prepare('SELECT * FROM local_users WHERE client_ids LIKE ? ORDER BY updated_at DESC LIMIT 1').get(`%"${clientId}"%`);
            if (clientUser) {
                const clientIds = this.parseClientIds(clientUser.client_ids);
                console.log(`✅ Found client-specific current user: ${clientUser.username} (${clientUser.user_id}) - client_ids: [${clientIds.join(', ')}]`);
            } else {
                console.log(`❌ No client-specific current user found for client_id: ${clientId}`);

                // Check latest updated user
                const latestUser = db.prepare('SELECT * FROM local_users ORDER BY updated_at DESC LIMIT 1').get();
                if (latestUser) {
                    const clientIds = this.parseClientIds(latestUser.client_ids);
                    console.log(`📋 Latest updated user: ${latestUser.username} (${latestUser.user_id}) - client_ids: [${clientIds.join(', ')}]`);
                }
            }

            return clientUser;
        } catch (error) {
            console.error('Error in debugClientCurrentUser:', error);
            return null;
        }
    }

    // Startup user assignment (no is_current dependency)
    static assignStartupUser(clientId) {
        try {
            console.log('🔧 DatabaseManager: Starting startup user assignment...');
            console.log(`🔧 DatabaseManager: Client ID: ${clientId}`);

            // Check if current client already has a user assigned
            const currentClientUser = db.prepare('SELECT * FROM local_users WHERE client_ids LIKE ? ORDER BY updated_at DESC LIMIT 1').get(`%"${clientId}"%`);

            if (currentClientUser) {
                console.log(`✅ DatabaseManager: Current client already has user: ${currentClientUser.username}`);
                return {
                    success: true,
                    message: 'Current client already has user',
                    currentUser: {
                        user_id: currentClientUser.user_id,
                        username: currentClientUser.username
                    }
                };
            }

            // Get the latest updated user
            const latestUser = db.prepare('SELECT * FROM local_users ORDER BY updated_at DESC LIMIT 1').get();

            if (!latestUser) {
                console.log('🔧 DatabaseManager: No users found in database');
                return { success: true, message: 'No users found, need user registration' };
            }

            console.log(`🔧 DatabaseManager: Found latest user: ${latestUser.username}, assigning to current client`);

            // Assign this user to current client
            const assignResult = this.assignUserToClientOnStartup(latestUser.user_id, clientId);
            if (assignResult.success) {
                return {
                    success: true,
                    message: 'Assigned latest user to current client',
                    currentUser: {
                        user_id: latestUser.user_id,
                        username: latestUser.username
                    }
                };
            }

            return { success: false, error: 'Failed to assign user to client' };

        } catch (error) {
            console.error('❌ DatabaseManager: Error fixing multiple current users:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // ===================== Sync Data Methods =====================

    /**
     * Get all sync data records
     * @returns {Array} Array of sync data records
     */
    static getSyncData() {
        try {
            console.log('📊 DatabaseManager: Getting all sync data records...');

            const stmt = db.prepare(`
                SELECT 
                    id,
                    batch_id,
                    user_id,
                    direction,
                    activity_data,
                    status,
                    created_at,
                    updated_at
                FROM sync_data 
                ORDER BY created_at DESC
            `);

            const result = stmt.all();
            console.log(`📊 DatabaseManager: Retrieved ${result.length} sync data records`);

            return result;

        } catch (error) {
            console.error('❌ DatabaseManager: Error getting sync data:', error);
            throw error;
        }
    }

    /**
     * Get sync data statistics
     * @returns {Object} Sync data statistics
     */
    static getSyncDataStats() {
        try {
            console.log('📊 DatabaseManager: Getting sync data statistics...');

            const stmt = db.prepare(`
                SELECT 
                    direction,
                    status,
                    COUNT(*) as count,
                    MAX(created_at) as last_sync
                FROM sync_data 
                GROUP BY direction, status
            `);

            const result = stmt.all();
            console.log(`📊 DatabaseManager: Retrieved sync data statistics: ${result.length} groups`);

            return result;

        } catch (error) {
            console.error('❌ DatabaseManager: Error getting sync data statistics:', error);
            throw error;
        }
    }
}

module.exports = DatabaseManager;