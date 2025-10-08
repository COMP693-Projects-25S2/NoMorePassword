const { v4: uuidv4 } = require('uuid');
const DatabaseManager = require('../sqlite/databaseManager');

// Import logging system
const { getCClientLogger } = require('../utils/logger');

/**
 * NodeManager - Complete node management functionality
 * Handles all node registration and management operations
 */
class NodeManager {
    constructor() {
        // Initialize logging system
        this.logger = getCClientLogger('nodemanager');

        this.currentUser = null;
        this.clientId = uuidv4(); // Generate unique client ID on startup
        this.websocketClient = null; // Will be set by external code
        this.logger.info(`Generated client ID: ${this.clientId}`);
    }

    setCurrentUser(user) {
        this.currentUser = user;
    }

    getClientId() {
        return this.clientId;
    }

    setWebSocketClient(websocketClient) {
        this.websocketClient = websocketClient;
    }

    // ===================== Get Main Node IDs Methods =====================

    /**
     * getMainNodeIds - Get all main node IDs for NMP parameters
     * Returns domain_main_node_id, cluster_main_node_id, channel_main_node_id
     */
    getMainNodeIds() {
        try {
            console.log('='.repeat(80));
            console.log('[NodeManager] 🔍 getMainNodeIds() CALLED');

            if (!this.currentUser) {
                console.warn('[NodeManager] ⚠️ No current user set');
                console.log('='.repeat(80));
                return {
                    domain_main_node_id: null,
                    cluster_main_node_id: null,
                    channel_main_node_id: null
                };
            }

            console.log(`[NodeManager] 📋 Current user: ${this.currentUser.user_id}`);

            const localUser = DatabaseManager.getLocalUserById(this.currentUser.user_id);
            if (!localUser || !localUser.node_id) {
                console.warn('[NodeManager] ⚠️ No valid node_id found in local_user');
                console.log('='.repeat(80));
                return {
                    domain_main_node_id: null,
                    cluster_main_node_id: null,
                    channel_main_node_id: null
                };
            }

            console.log(`[NodeManager] 📋 Local user info:`, {
                user_id: localUser.user_id,
                username: localUser.username,
                node_id: localUser.node_id,
                domain_id: localUser.domain_id,
                cluster_id: localUser.cluster_id,
                channel_id: localUser.channel_id
            });

            let domainMainNodeId = null;
            let clusterMainNodeId = null;
            let channelMainNodeId = null;

            // Get domain_main_node_id (exclude current node)
            console.log('[NodeManager] 🔍 Querying domain_main_nodes...');
            const domainNodes = DatabaseManager.getAllDomainMainNodes();
            console.log(`[NodeManager]    Found ${domainNodes.length} domain main node(s)`);
            if (domainNodes.length > 0) {
                // Find domain main node that is NOT the current node
                const otherDomainMain = domainNodes.find(node => node.node_id !== localUser.node_id);
                domainMainNodeId = otherDomainMain ? otherDomainMain.node_id : null;
                console.log(`[NodeManager]    domain_main_node_id: ${domainMainNodeId} (excluding self)`);
            } else {
                console.log(`[NodeManager]    No domain main nodes found`);
            }

            // Get cluster_main_node_id (exclude current node)
            console.log('[NodeManager] 🔍 Querying cluster_main_nodes...');
            const clusterNodes = DatabaseManager.getAllClusterMainNodes();
            console.log(`[NodeManager]    Found ${clusterNodes.length} cluster main node(s)`);
            if (clusterNodes.length > 0) {
                // Find cluster main node that is NOT the current node
                const otherClusterMain = clusterNodes.find(node => node.node_id !== localUser.node_id);
                clusterMainNodeId = otherClusterMain ? otherClusterMain.node_id : null;
                console.log(`[NodeManager]    cluster_main_node_id: ${clusterMainNodeId} (excluding self)`);
            } else {
                console.log(`[NodeManager]    No cluster main nodes found`);
            }

            // Get channel_main_node_id (exclude current node)
            console.log('[NodeManager] 🔍 Querying channel_main_nodes...');
            const channelMainNodes = DatabaseManager.getAllChannelMainNodes();
            console.log(`[NodeManager]    Found ${channelMainNodes.length} channel main node(s)`);
            if (channelMainNodes.length > 0) {
                // Find channel main node that is NOT the current node
                const otherChannelMain = channelMainNodes.find(node => node.node_id !== localUser.node_id);
                channelMainNodeId = otherChannelMain ? otherChannelMain.node_id : null;
                console.log(`[NodeManager]    channel_main_node_id: ${channelMainNodeId} (excluding self)`);
            } else {
                console.log(`[NodeManager]    No channel main nodes found`);
            }

            const result = {
                domain_main_node_id: domainMainNodeId,
                cluster_main_node_id: clusterMainNodeId,
                channel_main_node_id: channelMainNodeId
            };

            console.log(`[NodeManager] ✅ Main node IDs result:`, result);
            console.log('='.repeat(80));

            return result;

        } catch (error) {
            console.error(`[NodeManager] ❌ Error getting main node IDs:`, error);
            console.log('='.repeat(80));
            return {
                domain_main_node_id: null,
                cluster_main_node_id: null,
                channel_main_node_id: null
            };
        }
    }

    // ===================== Confirm Methods =====================

    /**
     * assignConfirmed - Send current node's domain_id, cluster_id, channel_id to B-Client
     * Queries domain_main_nodes, cluster_main_nodes, channel_main_nodes tables
     * If only one record exists, gets the ID directly
     * If multiple records exist, matches by local_users.node_id
     */
    async assignConfirmed() {
        try {
            // Get current user from database (fallback if not set)
            let localUser = null;
            if (this.currentUser) {
                localUser = DatabaseManager.getLocalUserById(this.currentUser.user_id);
            } else {
                console.log('[NodeManager] ⚠️ currentUser not set, fetching from database...');
                localUser = DatabaseManager.getCurrentLocalUserForClient(this.clientId);
                if (localUser) {
                    console.log(`[NodeManager] ✅ Found current user in database: ${localUser.username}`);
                }
            }

            if (!localUser || !localUser.node_id) {
                throw new Error('No valid node_id found in local_user');
            }

            const nodeId = localUser.node_id;
            let domainId = null;
            let clusterId = null;
            let channelId = null;

            // Check domain_main_nodes
            const domainNodes = DatabaseManager.getAllDomainMainNodes();
            if (domainNodes.length === 1) {
                domainId = domainNodes[0].domain_id;
            } else if (domainNodes.length > 1) {
                const domainNode = DatabaseManager.getDomainMainNodeByNodeId(nodeId);
                if (domainNode) {
                    domainId = domainNode.domain_id;
                }
            }

            // Check cluster_main_nodes
            const clusterNodes = DatabaseManager.getAllClusterMainNodes();
            if (clusterNodes.length === 1) {
                clusterId = clusterNodes[0].cluster_id;
            } else if (clusterNodes.length > 1) {
                const clusterNode = DatabaseManager.getClusterMainNodeByNodeId(nodeId);
                if (clusterNode) {
                    clusterId = clusterNode.cluster_id;
                }
            }

            // Check channel_main_nodes
            const channelMainNodes = DatabaseManager.getAllChannelMainNodes();
            if (channelMainNodes.length === 1) {
                channelId = channelMainNodes[0].channel_id;
            } else if (channelMainNodes.length > 1) {
                const channelMainNode = DatabaseManager.getChannelMainNodeByNodeId(nodeId);
                if (channelMainNode) {
                    channelId = channelMainNode.channel_id;
                }
            }

            const assignData = {
                domain_id: domainId,
                cluster_id: clusterId,
                channel_id: channelId,
                node_id: nodeId
            };

            console.log(`[NodeManager] assignConfirmed data:`, assignData);

            // Update this.currentUser with latest information from database
            if (this.currentUser) {
                this.currentUser.domain_id = domainId;
                this.currentUser.cluster_id = clusterId;
                this.currentUser.channel_id = channelId;
                this.currentUser.node_id = nodeId;
                console.log(`[NodeManager] Updated this.currentUser with latest information`);
            }

            // Send to B-Client via WebSocket
            if (this.websocketClient && this.websocketClient.sendMessage) {
                console.log(`[NodeManager] 📤 Sending assignConfirmed to B-Client via WebSocket...`);
                this.websocketClient.sendMessage({
                    type: 'assignConfirmed',
                    data: assignData
                });
                console.log(`[NodeManager] ✅ assignConfirmed sent successfully`);
            } else {
                console.warn(`[NodeManager] ⚠️ WebSocket client not available, cannot send assignConfirmed`);
            }

            return {
                success: true,
                data: assignData
            };

        } catch (error) {
            console.error(`[NodeManager] Error in assignConfirmed:`, error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // ===================== New Main Nodes Methods =====================

    /**
     * newDomainNode - Create new domain node
     * Stores current node info in domain_main_nodes table
     */
    async newDomainNode() {
        try {
            console.log('='.repeat(80));
            console.log('[NodeManager] 🏗️ newDomainNode() CALLED');

            // Get current user from database (fallback if not set)
            let localUser = null;
            if (this.currentUser) {
                localUser = DatabaseManager.getLocalUserById(this.currentUser.user_id);
            } else {
                console.log('[NodeManager] ⚠️ currentUser not set, fetching from database...');
                localUser = DatabaseManager.getCurrentLocalUserForClient(this.clientId);
                if (localUser) {
                    console.log(`[NodeManager] ✅ Found current user in database: ${localUser.username}`);
                }
            }

            if (!localUser || !localUser.node_id) {
                throw new Error('No valid node_id found in local_user');
            }

            const nodeId = localUser.node_id;
            const domainId = uuidv4();

            console.log(`[NodeManager] 📋 Creating domain node:`);
            console.log(`[NodeManager]    node_id: ${nodeId}`);
            console.log(`[NodeManager]    domain_id: ${domainId} (new UUID)`);

            // Clear existing domain_main_nodes and add new one
            console.log('[NodeManager] 🗑️ Clearing existing domain_main_nodes...');
            DatabaseManager.clearAllDomainMainNodes();

            console.log('[NodeManager] ➕ Adding new domain_main_nodes record...');
            DatabaseManager.addDomainMainNode(nodeId, domainId);
            console.log('[NodeManager] ✅ domain_main_nodes record created');

            // Update local_users with new domain_id
            console.log('[NodeManager] 🔄 Updating local_users table...');
            DatabaseManager.updateLocalUser(
                localUser.user_id,
                localUser.username,
                domainId,  // Update domain_id
                localUser.cluster_id,  // Keep existing cluster_id
                localUser.channel_id,  // Keep existing channel_id
                nodeId
            );
            console.log(`[NodeManager] ✅ local_users updated with domain_id: ${domainId}`);

            // Call assignConfirmed to notify B-Client
            console.log('[NodeManager] 📤 Calling assignConfirmed() to notify B-Client...');
            await this.assignConfirmed();

            console.log(`[NodeManager] ✅ newDomainNode() COMPLETED`);
            console.log('='.repeat(80));

            return {
                success: true,
                node_id: nodeId,
                domain_id: domainId
            };

        } catch (error) {
            console.error(`[NodeManager] ❌ Error in newDomainNode:`, error);
            console.log('='.repeat(80));
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * newClusterNode - Create new cluster node
     * @param {string} domain_id - Domain ID
     */
    async newClusterNode(domain_id) {
        try {
            if (!domain_id) {
                throw new Error('domain_id parameter is required');
            }

            // Get current user from database (fallback if not set)
            let localUser = null;
            if (this.currentUser) {
                localUser = DatabaseManager.getLocalUserById(this.currentUser.user_id);
            } else {
                console.log('[NodeManager] ⚠️ currentUser not set, fetching from database...');
                localUser = DatabaseManager.getCurrentLocalUserForClient(this.clientId);
                if (localUser) {
                    console.log(`[NodeManager] ✅ Found current user in database: ${localUser.username}`);
                }
            }

            if (!localUser || !localUser.node_id) {
                throw new Error('No valid node_id found in local_user');
            }

            const nodeId = localUser.node_id;
            const clusterId = uuidv4();

            // Clear existing cluster_main_nodes and add new one
            DatabaseManager.clearAllClusterMainNodes();
            DatabaseManager.addClusterMainNode(nodeId, domain_id, clusterId);

            // Update local_users with new cluster_id
            DatabaseManager.updateLocalUser(
                localUser.user_id,
                localUser.username,
                domain_id,  // Update domain_id
                clusterId,  // Update cluster_id
                localUser.channel_id,  // Keep existing channel_id
                nodeId
            );

            console.log(`[NodeManager] Created new cluster node: ${nodeId} with cluster: ${clusterId} in domain: ${domain_id}`);
            console.log(`[NodeManager] Updated local_users with cluster_id: ${clusterId}`);

            // Call assignConfirmed to notify B-Client
            await this.assignConfirmed();

            return {
                success: true,
                node_id: nodeId,
                domain_id: domain_id,
                cluster_id: clusterId
            };

        } catch (error) {
            console.error(`[NodeManager] Error in newClusterNode:`, error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * newChannelNode - Create new channel node
     * @param {string} domain_id - Domain ID
     * @param {string} cluster_id - Cluster ID
     */
    async newChannelNode(domain_id, cluster_id) {
        try {
            if (!domain_id || !cluster_id) {
                throw new Error('domain_id and cluster_id parameters are required');
            }

            // Get current user from database (fallback if not set)
            let localUser = null;
            if (this.currentUser) {
                localUser = DatabaseManager.getLocalUserById(this.currentUser.user_id);
            } else {
                console.log('[NodeManager] ⚠️ currentUser not set, fetching from database...');
                localUser = DatabaseManager.getCurrentLocalUserForClient(this.clientId);
                if (localUser) {
                    console.log(`[NodeManager] ✅ Found current user in database: ${localUser.username}`);
                }
            }

            if (!localUser || !localUser.node_id) {
                throw new Error('No valid node_id found in local_user');
            }

            const nodeId = localUser.node_id;
            const channelId = uuidv4();

            // Clear existing channel_main_nodes and add new one
            DatabaseManager.clearAllChannelMainNodes();
            DatabaseManager.addChannelMainNode(nodeId, domain_id, cluster_id, channelId);

            // Also add to channel_nodes
            DatabaseManager.addChannelNode(nodeId, domain_id, cluster_id, channelId);

            // Update local_users with new channel_id
            DatabaseManager.updateLocalUser(
                localUser.user_id,
                localUser.username,
                domain_id,  // Update domain_id
                cluster_id,  // Update cluster_id
                channelId,  // Update channel_id
                nodeId
            );

            console.log(`[NodeManager] Created new channel node: ${nodeId} with channel: ${channelId} in cluster: ${cluster_id}`);
            console.log(`[NodeManager] Updated local_users with channel_id: ${channelId}`);

            // Call assignConfirmed to notify B-Client
            await this.assignConfirmed();

            return {
                success: true,
                node_id: nodeId,
                domain_id: domain_id,
                cluster_id: cluster_id,
                channel_id: channelId
            };

        } catch (error) {
            console.error(`[NodeManager] Error in newChannelNode:`, error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // ===================== Assign To Main Nodes Methods =====================

    /**
     * assignToDomain - Assign node to domain
     * @param {string} domain_id - Domain ID
     * @param {string} node_id - Node ID
     */
    async assignToDomain(domain_id, node_id) {
        try {
            if (!domain_id || !node_id) {
                throw new Error('domain_id and node_id parameters are required');
            }

            // Get current user from database (fallback if not set)
            let localUser = null;
            if (this.currentUser) {
                localUser = DatabaseManager.getLocalUserById(this.currentUser.user_id);
            } else {
                console.log('[NodeManager] ⚠️ currentUser not set, fetching from database...');
                localUser = DatabaseManager.getCurrentLocalUserForClient(this.clientId);
                if (localUser) {
                    console.log(`[NodeManager] ✅ Found current user in database: ${localUser.username}`);
                }
            }

            if (!localUser) {
                throw new Error('Local user not found');
            }

            // Delete existing record for this node if exists and add new one
            DatabaseManager.deleteDomainMainNode(node_id);
            DatabaseManager.addDomainMainNode(node_id, domain_id);

            // Update local_users with domain_id
            DatabaseManager.updateLocalUser(
                localUser.user_id,
                localUser.username,
                domain_id,  // Update domain_id
                localUser.cluster_id,  // Keep existing cluster_id
                localUser.channel_id,  // Keep existing channel_id
                node_id
            );

            console.log(`[NodeManager] Assigned node ${node_id} to domain ${domain_id}`);
            console.log(`[NodeManager] Updated local_users with domain_id: ${domain_id}`);

            // Call assignConfirmed to notify B-Client
            await this.assignConfirmed();

            return {
                success: true,
                node_id: node_id,
                domain_id: domain_id
            };

        } catch (error) {
            console.error(`[NodeManager] Error in assignToDomain:`, error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * assignToCluster - Assign node to cluster
     * @param {string} cluster_id - Cluster ID
     * @param {string} node_id - Node ID
     * @param {string} domain_id - Domain ID (provided by B-Client)
     */
    async assignToCluster(cluster_id, node_id, domain_id = null) {
        try {
            if (!cluster_id || !node_id) {
                throw new Error('cluster_id and node_id parameters are required');
            }

            // Get current user from database (fallback if not set)
            let localUser = null;
            if (this.currentUser) {
                localUser = DatabaseManager.getLocalUserById(this.currentUser.user_id);
            } else {
                console.log('[NodeManager] ⚠️ currentUser not set, fetching from database...');
                localUser = DatabaseManager.getCurrentLocalUserForClient(this.clientId);
                if (localUser) {
                    console.log(`[NodeManager] ✅ Found current user in database: ${localUser.username}`);
                }
            }

            if (!localUser) {
                throw new Error('Local user not found');
            }

            // Get domain_id from cluster_main_nodes or use B-Client provided domain_id
            let existingCluster = DatabaseManager.getClusterMainNodeByClusterId(cluster_id);
            let final_domain_id;

            if (!existingCluster) {
                // Cluster not found, use B-Client provided domain_id to create new record
                console.log(`[NodeManager] Cluster ${cluster_id} not found, creating new record with B-Client provided domain_id`);

                if (domain_id) {
                    final_domain_id = domain_id;
                    console.log(`[NodeManager] Using B-Client provided domain_id: ${final_domain_id}`);
                } else {
                    throw new Error('No domain_id provided by B-Client for cluster assignment');
                }
            } else {
                // Use existing cluster's domain_id
                final_domain_id = existingCluster.domain_id;
                console.log(`[NodeManager] Found existing cluster record: domain_id=${final_domain_id}`);
            }

            // Delete existing record for this node if exists and add new one
            DatabaseManager.deleteClusterMainNode(node_id);
            DatabaseManager.addClusterMainNode(node_id, final_domain_id, cluster_id);

            // Update local_users with cluster_id and domain_id
            DatabaseManager.updateLocalUser(
                localUser.user_id,
                localUser.username,
                final_domain_id,   // Update domain_id
                cluster_id,  // Update cluster_id
                localUser.channel_id,  // Keep existing channel_id
                node_id
            );

            console.log(`[NodeManager] Assigned node ${node_id} to cluster ${cluster_id}`);
            console.log(`[NodeManager] Updated local_users with cluster_id: ${cluster_id}`);

            // Call assignConfirmed to notify B-Client
            await this.assignConfirmed();

            return {
                success: true,
                node_id: node_id,
                domain_id: final_domain_id,
                cluster_id: cluster_id
            };

        } catch (error) {
            console.error(`[NodeManager] Error in assignToCluster:`, error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * assignToChannel - Assign node to channel
     * @param {string} channel_id - Channel ID
     * @param {string} node_id - Node ID
     * @param {string} domain_id - Domain ID (provided by B-Client)
     * @param {string} cluster_id - Cluster ID (provided by B-Client)
     */
    async assignToChannel(channel_id, node_id, domain_id = null, cluster_id = null) {
        try {
            if (!channel_id || !node_id) {
                throw new Error('channel_id and node_id parameters are required');
            }

            // Get current user from database (fallback if not set)
            let localUser = null;
            if (this.currentUser) {
                localUser = DatabaseManager.getLocalUserById(this.currentUser.user_id);
            } else {
                console.log('[NodeManager] ⚠️ currentUser not set, fetching from database...');
                localUser = DatabaseManager.getCurrentLocalUserForClient(this.clientId);
                if (localUser) {
                    console.log(`[NodeManager] ✅ Found current user in database: ${localUser.username}`);
                }
            }

            if (!localUser) {
                throw new Error('Local user not found');
            }

            // Get domain_id and cluster_id from channel_main_nodes or use B-Client provided values
            let existingChannel = DatabaseManager.getChannelMainNodeByChannelId(channel_id);
            let final_domain_id, final_cluster_id;

            if (!existingChannel) {
                // Channel not found, use B-Client provided values to create new record
                console.log(`[NodeManager] Channel ${channel_id} not found, creating new record with B-Client provided values`);

                if (domain_id && cluster_id) {
                    final_domain_id = domain_id;
                    final_cluster_id = cluster_id;
                    console.log(`[NodeManager] Using B-Client provided values: domain_id=${final_domain_id}, cluster_id=${final_cluster_id}`);
                } else {
                    throw new Error('No domain_id or cluster_id provided by B-Client for channel assignment');
                }
            } else {
                // Use existing channel's values
                final_domain_id = existingChannel.domain_id;
                final_cluster_id = existingChannel.cluster_id;
                console.log(`[NodeManager] Found existing channel record: domain_id=${final_domain_id}, cluster_id=${final_cluster_id}`);
            }

            // Delete existing record for this node if exists and add new one
            DatabaseManager.deleteChannelMainNode(node_id);
            DatabaseManager.addChannelMainNode(node_id, final_domain_id, final_cluster_id, channel_id);

            // Update local_users with all IDs
            DatabaseManager.updateLocalUser(
                localUser.user_id,
                localUser.username,
                final_domain_id,   // Update domain_id
                final_cluster_id,  // Update cluster_id
                channel_id,  // Update channel_id
                node_id
            );

            console.log(`[NodeManager] Assigned node ${node_id} to channel ${channel_id}`);
            console.log(`[NodeManager] Updated local_users with channel_id: ${channel_id}`);

            // Call assignConfirmed to notify B-Client
            await this.assignConfirmed();

            return {
                success: true,
                node_id: node_id,
                domain_id: final_domain_id,
                cluster_id: final_cluster_id,
                channel_id: channel_id
            };

        } catch (error) {
            console.error(`[NodeManager] Error in assignToChannel:`, error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // ===================== Add Peers Methods =====================

    /**
     * addNewNodeToPeers - Add new node to channel peers
     * @param {string} domain_id - Domain ID
     * @param {string} cluster_id - Cluster ID
     * @param {string} channel_id - Channel ID
     * @param {string} node_id - Node ID
     */
    async addNewNodeToPeers(domain_id, cluster_id, channel_id, node_id) {
        try {
            if (!domain_id || !cluster_id || !channel_id || !node_id) {
                throw new Error('All parameters are required');
            }

            // Check if domain_main_nodes exists
            const domainNode = DatabaseManager.getDomainMainNodeByDomainId(domain_id);
            if (!domainNode) {
                throw new Error('Domain not found');
            }

            // Check if cluster_main_nodes exists
            const clusterNode = DatabaseManager.getClusterMainNodeByClusterId(cluster_id);
            if (!clusterNode) {
                throw new Error('Cluster not found');
            }

            // Check if channel_main_nodes exists
            const channelMainNode = DatabaseManager.getChannelMainNodeByChannelId(channel_id);
            if (!channelMainNode) {
                throw new Error('Channel main node not found');
            }

            // Add to channel_nodes
            DatabaseManager.addChannelNode(node_id, domain_id, cluster_id, channel_id);

            console.log(`[NodeManager] Added new node ${node_id} to channel ${channel_id}`);

            return {
                success: true,
                node_id: node_id,
                domain_id: domain_id,
                cluster_id: cluster_id,
                channel_id: channel_id
            };

        } catch (error) {
            console.error(`[NodeManager] Error in addNewNodeToPeers:`, error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * addNewChannelToPeers - Add new channel to cluster peers
     * @param {string} domain_id - Domain ID
     * @param {string} cluster_id - Cluster ID
     * @param {string} channel_id - Channel ID
     * @param {string} node_id - Node ID
     */
    async addNewChannelToPeers(domain_id, cluster_id, channel_id, node_id) {
        try {
            if (!domain_id || !cluster_id || !channel_id || !node_id) {
                throw new Error('All parameters are required');
            }

            // Check if domain_main_nodes exists
            const domainNode = DatabaseManager.getDomainMainNodeByDomainId(domain_id);
            if (!domainNode) {
                throw new Error('Domain not found');
            }

            // Check if cluster_main_nodes exists
            const clusterNode = DatabaseManager.getClusterMainNodeByClusterId(cluster_id);
            if (!clusterNode) {
                throw new Error('Cluster not found');
            }

            // Add to channel_main_nodes
            DatabaseManager.addChannelMainNode(node_id, domain_id, cluster_id, channel_id);

            console.log(`[NodeManager] Added new channel ${channel_id} to cluster ${cluster_id}`);

            return {
                success: true,
                node_id: node_id,
                domain_id: domain_id,
                cluster_id: cluster_id,
                channel_id: channel_id
            };

        } catch (error) {
            console.error(`[NodeManager] Error in addNewChannelToPeers:`, error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * addNewClusterToPeers - Add new cluster to domain peers
     * @param {string} domain_id - Domain ID
     * @param {string} cluster_id - Cluster ID
     * @param {string} node_id - Node ID
     */
    async addNewClusterToPeers(domain_id, cluster_id, node_id) {
        try {
            if (!domain_id || !cluster_id || !node_id) {
                throw new Error('All parameters are required');
            }

            // Check if domain_main_nodes exists
            const domainNode = DatabaseManager.getDomainMainNodeByDomainId(domain_id);
            if (!domainNode) {
                throw new Error('Domain not found');
            }

            // Add to cluster_main_nodes
            DatabaseManager.addClusterMainNode(node_id, domain_id, cluster_id);

            console.log(`[NodeManager] Added new cluster ${cluster_id} to domain ${domain_id}`);

            return {
                success: true,
                node_id: node_id,
                domain_id: domain_id,
                cluster_id: cluster_id
            };

        } catch (error) {
            console.error(`[NodeManager] Error in addNewClusterToPeers:`, error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * addNewDomainToPeers - Add new domain to peers
     * @param {string} domain_id - Domain ID
     * @param {string} node_id - Node ID
     */
    async addNewDomainToPeers(domain_id, node_id) {
        try {
            if (!domain_id || !node_id) {
                throw new Error('domain_id and node_id parameters are required');
            }

            // Add to domain_main_nodes
            DatabaseManager.addDomainMainNode(node_id, domain_id);

            console.log(`[NodeManager] Added new domain ${domain_id}`);

            return {
                success: true,
                node_id: node_id,
                domain_id: domain_id
            };

        } catch (error) {
            console.error(`[NodeManager] Error in addNewDomainToPeers:`, error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // ===================== Count Peers Methods =====================

    /**
     * countPeersAmount - Count peers in specified level
     * @param {string} domain_id - Domain ID (optional)
     * @param {string} cluster_id - Cluster ID (optional)
     * @param {string} channel_id - Channel ID (optional)
     */
    async countPeersAmount(domain_id, cluster_id, channel_id) {
        try {
            let count = 0;

            if (domain_id) {
                // Count domain_main_nodes
                const domainNodes = DatabaseManager.getAllDomainMainNodes();
                count = domainNodes.length;
            } else if (cluster_id) {
                // Count cluster_main_nodes
                const clusterNodes = DatabaseManager.getAllClusterMainNodes();
                count = clusterNodes.length;
            } else if (channel_id) {
                // Count channel_main_nodes
                const channelMainNodes = DatabaseManager.getAllChannelMainNodes();
                count = channelMainNodes.length;
            } else {
                // Count channel_nodes
                const channelNodes = DatabaseManager.getAllChannelNodes();
                count = channelNodes.length;
            }

            console.log(`[NodeManager] Count peers result: ${count} for domain_id: ${domain_id}, cluster_id: ${cluster_id}, channel_id: ${channel_id}`);

            return {
                success: true,
                count: count,
                domain_id: domain_id,
                cluster_id: cluster_id,
                channel_id: channel_id
            };

        } catch (error) {
            console.error(`[NodeManager] Error in countPeersAmount:`, error);
            return {
                success: false,
                error: error.message
            };
        }
    }
}

module.exports = NodeManager;


