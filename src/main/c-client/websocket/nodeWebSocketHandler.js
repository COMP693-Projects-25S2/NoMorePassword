const DatabaseManager = require('../sqlite/databaseManager');
const { v4: uuidv4 } = require('uuid');

/**
 * Node WebSocket Handler
 * Handles node management commands received from B-Client via WebSocket
 */
class NodeWebSocketHandler {
    constructor() {
        this.currentUser = null;
        this.clientId = uuidv4();
        this.commandHandlers = {
            'create_domain_node': this.handleCreateDomainNode.bind(this),
            'create_cluster_node': this.handleCreateClusterNode.bind(this),
            'create_channel_node': this.handleCreateChannelNode.bind(this),
            'register_to_domain': this.handleRegisterToDomain.bind(this),
            'register_to_cluster': this.handleRegisterToCluster.bind(this),
            'register_to_channel': this.handleRegisterToChannel.bind(this),
            'add_node_to_channel': this.handleAddNodeToChannel.bind(this),
            'confirm_registration': this.handleConfirmRegistration.bind(this),
            'get_node_status': this.handleGetNodeStatus.bind(this),
            'update_node_info': this.handleUpdateNodeInfo.bind(this)
        };
        console.log(`🆔 NodeWebSocketHandler: Generated client ID: ${this.clientId}`);
    }

    /**
     * Process WebSocket command from B-Client
     * @param {Object} command - Command object from B-Client
     * @param {string} command.type - Command type
     * @param {Object} command.data - Command data
     * @param {string} command.requestId - Request ID for response tracking
     * @returns {Object} Response object
     */
    async processCommand(command) {
        try {
            console.log(`[NodeWebSocketHandler] Processing command: ${command.type}`);
            console.log(`[NodeWebSocketHandler] Command data:`, command.data);

            const handler = this.commandHandlers[command.type];
            if (!handler) {
                return {
                    success: false,
                    error: `Unknown command type: ${command.type}`,
                    requestId: command.requestId
                };
            }

            const result = await handler(command.data);
            return {
                ...result,
                requestId: command.requestId,
                commandType: command.type
            };

        } catch (error) {
            console.error(`[NodeWebSocketHandler] Error processing command ${command.type}:`, error);
            return {
                success: false,
                error: error.message,
                requestId: command.requestId,
                commandType: command.type
            };
        }
    }

    /**
     * Handle create domain node command
     */
    async handleCreateDomainNode(data) {
        try {
            if (!this.currentUser) {
                throw new Error('No current user set');
            }

            // Generate domain ID
            const domainId = uuidv4();

            // Get node ID from local_user
            const localUser = DatabaseManager.getLocalUserById(this.currentUser.user_id);
            if (!localUser || !localUser.node_id) {
                throw new Error('No valid node_id found in local_user');
            }

            const nodeId = localUser.node_id;

            // Store in domain_main_nodes
            DatabaseManager.addDomainMainNode(nodeId, domainId);

            const result = {
                success: true,
                domain_id: domainId,
                node_id: nodeId
            };

            console.log(`[NodeWebSocketHandler] Domain node creation result:`, result);
            return result;
        } catch (error) {
            console.error(`[NodeWebSocketHandler] Error creating domain node:`, error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Handle create cluster node command
     */
    async handleCreateClusterNode(data) {
        try {
            const { node_id } = data;
            if (!node_id) {
                return {
                    success: false,
                    error: 'node_id parameter is required'
                };
            }

            const result = await this.handleCreateClusterNodeInternal(node_id);
            console.log(`[NodeWebSocketHandler] Cluster node creation result:`, result);
            return result;
        } catch (error) {
            console.error(`[NodeWebSocketHandler] Error creating cluster node:`, error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Handle create channel node command
     */
    async handleCreateChannelNode(data) {
        try {
            const { node_id } = data;
            if (!node_id) {
                return {
                    success: false,
                    error: 'node_id parameter is required'
                };
            }

            const result = await this.handleCreateChannelNodeInternal(node_id);
            console.log(`[NodeWebSocketHandler] Channel node creation result:`, result);
            return result;
        } catch (error) {
            console.error(`[NodeWebSocketHandler] Error creating channel node:`, error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Handle register to domain command
     */
    async handleRegisterToDomain(data) {
        try {
            const { domain_id, node_id, requester_ip, requester_port } = data;
            if (!domain_id || !node_id) {
                return {
                    success: false,
                    error: 'domain_id and node_id parameters are required'
                };
            }

            const result = await this.handleRegisterToDomainInternal(domain_id, node_id, requester_ip, requester_port);
            console.log(`[NodeWebSocketHandler] Domain registration result:`, result);
            return result;
        } catch (error) {
            console.error(`[NodeWebSocketHandler] Error registering to domain:`, error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Handle register to cluster command
     */
    async handleRegisterToCluster(data) {
        try {
            const { cluster_id, node_id, requester_ip, requester_port } = data;
            if (!cluster_id || !node_id) {
                return {
                    success: false,
                    error: 'cluster_id and node_id parameters are required'
                };
            }

            const result = await this.handleRegisterToClusterInternal(cluster_id, node_id, requester_ip, requester_port);
            console.log(`[NodeWebSocketHandler] Cluster registration result:`, result);
            return result;
        } catch (error) {
            console.error(`[NodeWebSocketHandler] Error registering to cluster:`, error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Handle register to channel command
     */
    async handleRegisterToChannel(data) {
        try {
            const { channel_id, node_id, target_node_id } = data;
            if (!channel_id || !node_id || !target_node_id) {
                return {
                    success: false,
                    error: 'channel_id, node_id, and target_node_id parameters are required'
                };
            }

            const result = await this.handleRegisterToChannelInternal(channel_id, node_id, target_node_id);
            console.log(`[NodeWebSocketHandler] Channel registration result:`, result);
            return result;
        } catch (error) {
            console.error(`[NodeWebSocketHandler] Error registering to channel:`, error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Handle add node to channel command
     */
    async handleAddNodeToChannel(data) {
        try {
            const { domain_id, cluster_id, channel_id, node_id, target_node_id } = data;
            if (!domain_id || !cluster_id || !channel_id || !node_id || !target_node_id) {
                return {
                    success: false,
                    error: 'domain_id, cluster_id, channel_id, node_id, and target_node_id parameters are required'
                };
            }

            const result = await this.handleAddNodeToChannelInternal(domain_id, cluster_id, channel_id, node_id, target_node_id);
            console.log(`[NodeWebSocketHandler] Add node to channel result:`, result);
            return result;
        } catch (error) {
            console.error(`[NodeWebSocketHandler] Error adding node to channel:`, error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Handle confirm registration command
     */
    async handleConfirmRegistration(data) {
        try {
            const { domain_id, cluster_id, channel_id, node_id, target_node_id, confirmed_by } = data;
            if (!domain_id || !cluster_id || !node_id || !target_node_id || !confirmed_by) {
                return {
                    success: false,
                    error: 'domain_id, cluster_id, node_id, target_node_id, and confirmed_by parameters are required'
                };
            }

            const result = await this.handleConfirmRegistrationInternal(domain_id, cluster_id, channel_id, node_id, target_node_id, confirmed_by);
            console.log(`[NodeWebSocketHandler] Registration confirmation result:`, result);
            return result;
        } catch (error) {
            console.error(`[NodeWebSocketHandler] Error confirming registration:`, error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Handle get node status command
     */
    async handleGetNodeStatus(data) {
        try {
            const { node_id } = data;
            if (!node_id) {
                return {
                    success: false,
                    error: 'node_id parameter is required'
                };
            }

            // Get node status from all relevant tables
            const domainNode = DatabaseManager.getDomainMainNodeByNodeId(node_id);
            const clusterNode = DatabaseManager.getClusterMainNodeByNodeId(node_id);
            const channelMainNode = DatabaseManager.getChannelMainNodeByNodeId(node_id);
            const channelNode = DatabaseManager.getChannelNodeByNodeId(node_id);
            const localUser = DatabaseManager.getLocalUserByNodeId(node_id);

            const status = {
                node_id: node_id,
                is_domain_node: !!domainNode,
                is_cluster_node: !!clusterNode,
                is_channel_main_node: !!channelMainNode,
                is_channel_node: !!channelNode,
                local_user: localUser,
                domain_info: domainNode,
                cluster_info: clusterNode,
                channel_main_info: channelMainNode,
                channel_info: channelNode
            };

            console.log(`[NodeWebSocketHandler] Node status for ${node_id}:`, status);
            return {
                success: true,
                status: status
            };
        } catch (error) {
            console.error(`[NodeWebSocketHandler] Error getting node status:`, error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Handle update node info command
     */
    async handleUpdateNodeInfo(data) {
        try {
            const { node_id, updates } = data;
            if (!node_id || !updates) {
                return {
                    success: false,
                    error: 'node_id and updates parameters are required'
                };
            }

            // Update node information based on the updates object
            // This is a simplified implementation - in practice, you'd want more specific update methods
            console.log(`[NodeWebSocketHandler] Updating node ${node_id} with:`, updates);

            // For now, just update timestamps
            if (DatabaseManager.getDomainMainNodeByNodeId(node_id)) {
                DatabaseManager.updateDomainMainNodeTimestamp(node_id);
            }
            if (DatabaseManager.getClusterMainNodeByNodeId(node_id)) {
                DatabaseManager.updateClusterMainNodeTimestamp(node_id);
            }
            if (DatabaseManager.getChannelMainNodeByNodeId(node_id)) {
                DatabaseManager.updateChannelMainNodeTimestamp(node_id);
            }
            if (DatabaseManager.getChannelNodeByNodeId(node_id)) {
                DatabaseManager.updateChannelNodeTimestamp(node_id);
            }

            return {
                success: true,
                message: 'Node information updated successfully',
                node_id: node_id
            };
        } catch (error) {
            console.error(`[NodeWebSocketHandler] Error updating node info:`, error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Set current user
     */
    setCurrentUser(user) {
        this.currentUser = user;
        console.log(`[NodeWebSocketHandler] Set current user: ${user?.username || 'unknown'}`);
    }

    /**
     * Set API port (no longer needed)
     */
    setApiPort(port) {
        console.log(`[NodeWebSocketHandler] API port set: ${port}`);
    }

    /**
     * Get client ID
     */
    getClientId() {
        return this.clientId;
    }

    /**
     * Internal method to create cluster node
     */
    async handleCreateClusterNodeInternal(nodeId) {
        try {
            if (!nodeId) {
                return {
                    success: false,
                    error: 'node_id parameter is required'
                };
            }

            // Get domain_id from domain_main_nodes table using the provided node_id
            const domainNode = DatabaseManager.getDomainMainNodeByNodeId(nodeId);
            if (!domainNode) {
                return {
                    success: false,
                    error: 'No domain found for the provided node_id. Please create a domain first.'
                };
            }

            const domainId = domainNode.domain_id;

            // Generate cluster ID
            const clusterId = uuidv4();

            // Store in cluster_main_nodes with domain_id
            DatabaseManager.addClusterMainNode(nodeId, domainId, clusterId);

            // Register self to own cluster via registerConfirmed
            await this.handleConfirmRegistrationInternal(domainId, clusterId, null, nodeId, nodeId, 'cluster');

            return {
                success: true,
                domain_id: domainId,
                cluster_id: clusterId,
                node_id: nodeId
            };

        } catch (error) {
            console.error('Error in handleCreateClusterNodeInternal:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Internal method to create channel node
     */
    async handleCreateChannelNodeInternal(nodeId) {
        try {
            if (!nodeId) {
                return {
                    success: false,
                    error: 'node_id parameter is required'
                };
            }

            // Get domain_id and cluster_id from cluster_main_nodes table using the provided node_id
            const clusterNode = DatabaseManager.getClusterMainNodeByNodeId(nodeId);
            if (!clusterNode) {
                return {
                    success: false,
                    error: 'No cluster found for the provided node_id. Please create a cluster first.'
                };
            }

            const domainId = clusterNode.domain_id;
            const clusterId = clusterNode.cluster_id;

            // Generate channel ID
            const channelId = uuidv4();

            // Store in channel_main_nodes with domain_id and cluster_id
            DatabaseManager.addChannelMainNode(nodeId, domainId, clusterId, channelId);

            // Store own information in channel_nodes table with domain_id and cluster_id
            DatabaseManager.addChannelNode(nodeId, domainId, clusterId, channelId);

            // Register self to own channel via registerConfirmed
            await this.handleConfirmRegistrationInternal(domainId, clusterId, channelId, nodeId, nodeId, 'channel');

            return {
                success: true,
                domain_id: domainId,
                cluster_id: clusterId,
                channel_id: channelId,
                node_id: nodeId
            };

        } catch (error) {
            console.error('Error in handleCreateChannelNodeInternal:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Internal method to handle registration confirmation
     */
    async handleConfirmRegistrationInternal(domainId, clusterId, channelId, nodeId, targetNodeId, confirmedBy) {
        try {
            if (!this.currentUser) {
                throw new Error('No current user set');
            }

            // Case 1: Domain main node confirmation
            if (confirmedBy === 'domain') {
                console.log(`[NodeWebSocketHandler] Processing domain main node confirmation for domain ${domainId}`);

                // Clear domain_main_nodes table and insert new record
                DatabaseManager.clearAllDomainMainNodes();
                DatabaseManager.addDomainMainNode(nodeId, domainId);

                return {
                    success: true,
                    message: 'Domain registration confirmed',
                    nextStep: 'cluster_registration',
                    clusterId: clusterId,
                    targetNodeId: targetNodeId
                };
            }

            // Case 2: Cluster main node confirmation
            else if (confirmedBy === 'cluster') {
                console.log(`[NodeWebSocketHandler] Processing cluster main node confirmation for cluster ${clusterId}`);

                // Clear cluster_main_nodes table and insert new record
                DatabaseManager.clearAllClusterMainNodes();
                DatabaseManager.addClusterMainNode(nodeId, domainId, clusterId);

                return {
                    success: true,
                    message: 'Cluster registration confirmed',
                    nextStep: 'channel_registration',
                    channelId: channelId,
                    targetNodeId: targetNodeId
                };
            }

            // Case 3: Channel main node confirmation
            else if (confirmedBy === 'channel') {
                console.log(`[NodeWebSocketHandler] Processing channel main node confirmation for channel ${channelId}`);

                // Clear channel_main_nodes table and insert new record
                DatabaseManager.clearAllChannelMainNodes();
                DatabaseManager.addChannelMainNode(nodeId, domainId, clusterId, channelId);

                return {
                    success: true,
                    message: 'Channel registration confirmed successfully'
                };
            }

            else {
                return {
                    success: false,
                    error: 'Invalid confirmed_by parameter. Must be one of: domain, cluster, channel'
                };
            }

        } catch (error) {
            console.error('Error in handleConfirmRegistrationInternal:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Internal method to handle register to domain
     */
    async handleRegisterToDomainInternal(domainId, nodeId, requesterIp, requesterPort) {
        try {
            if (!this.currentUser) {
                throw new Error('No current user set');
            }

            // Check if domain exists in domain_main_nodes
            const domainNode = DatabaseManager.getDomainMainNodeByDomainId(domainId);
            if (!domainNode) {
                return {
                    success: false,
                    error: 'Domain not found'
                };
            }

            // Check if current user exists in local_users with matching node_id
            const localUser = DatabaseManager.getLocalUserByNodeId(nodeId);
            if (!localUser) {
                return {
                    success: false,
                    error: 'Node not found in local users'
                };
            }

            // Verify this is a domain main node by checking if node_id matches
            if (domainNode.node_id !== nodeId) {
                return {
                    success: false,
                    error: 'Node ID does not match domain main node'
                };
            }

            // Find a cluster with less than 1000 members in this domain
            let availableCluster = DatabaseManager.getClusterWithAvailableCapacityByDomain(domainId);

            if (!availableCluster) {
                // No available cluster found - this should be handled by B-Client via WebSocket
                console.log(`[NodeWebSocketHandler] No available cluster found for domain ${domainId}`);
                return {
                    success: false,
                    error: 'No available cluster found in domain',
                    requiresNewCluster: true,
                    domainId: domainId
                };
            }

            // Return cluster information for B-Client to handle registration confirmation
            return {
                success: true,
                clusterId: availableCluster.cluster_id,
                nodeId: availableCluster.node_id,
                message: 'Available cluster found, registration confirmation should be sent via WebSocket'
            };

        } catch (error) {
            console.error('Error in handleRegisterToDomainInternal:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Internal method to handle register to cluster
     */
    async handleRegisterToClusterInternal(clusterId, nodeId, requesterIp, requesterPort) {
        try {
            if (!this.currentUser) {
                throw new Error('No current user set');
            }

            // Check if cluster exists in cluster_main_nodes
            const clusterNode = DatabaseManager.getClusterMainNodeByClusterId(clusterId);
            if (!clusterNode) {
                return {
                    success: false,
                    error: 'Cluster not found'
                };
            }

            // Check if current user exists in local_users with matching node_id
            const localUser = DatabaseManager.getLocalUserByNodeId(nodeId);
            if (!localUser) {
                return {
                    success: false,
                    error: 'Node not found in local users'
                };
            }

            // Verify this is a cluster main node by checking if node_id matches
            if (clusterNode.node_id !== nodeId) {
                return {
                    success: false,
                    error: 'Node ID does not match cluster main node'
                };
            }

            // Find a channel with less than 1000 members in this cluster
            let availableChannel = DatabaseManager.getChannelMainNodeWithAvailableCapacityByCluster(clusterId);

            if (!availableChannel) {
                // No available channel found - this should be handled by B-Client via WebSocket
                console.log(`[NodeWebSocketHandler] No available channel found for cluster ${clusterId}`);
                return {
                    success: false,
                    error: 'No available channel found in cluster',
                    requiresNewChannel: true,
                    clusterId: clusterId
                };
            }

            // Return channel information for B-Client to handle registration confirmation
            return {
                success: true,
                channelId: availableChannel.channel_id,
                nodeId: availableChannel.node_id,
                message: 'Available channel found, registration confirmation should be sent via WebSocket'
            };

        } catch (error) {
            console.error('Error in handleRegisterToClusterInternal:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Internal method to handle register to channel
     */
    async handleRegisterToChannelInternal(channelId, nodeId, targetNodeId) {
        try {
            if (!this.currentUser) {
                throw new Error('No current user set');
            }

            // Check if channel exists in channel_main_nodes
            const channelNode = DatabaseManager.getChannelMainNodeByChannelId(channelId);
            if (!channelNode) {
                return {
                    success: false,
                    error: 'Channel not found'
                };
            }

            // Check if current user exists in local_users with matching node_id
            const localUser = DatabaseManager.getLocalUserByNodeId(nodeId);
            if (!localUser) {
                return {
                    success: false,
                    error: 'Node not found in local users'
                };
            }

            // Verify this is a channel main node by checking if node_id matches
            if (channelNode.node_id !== nodeId) {
                return {
                    success: false,
                    error: 'Node ID does not match channel main node'
                };
            }

            // Get all channel nodes in this channel
            const channelNodes = DatabaseManager.getChannelNodesByChannelId(channelId);
            if (!channelNodes || channelNodes.length === 0) {
                return {
                    success: false,
                    error: 'No channel nodes found in this channel'
                };
            }

            // Prepare registration data for B-Client to handle via WebSocket
            const registrationData = {
                domain_id: channelNode.domain_id,
                cluster_id: channelNode.cluster_id,
                channel_id: channelNode.channel_id,
                node_id: this.currentUser.node_id,
                target_node_id: targetNodeId,
                confirmed_by: 'channel',
                channel_nodes: channelNodes
            };

            return {
                success: true,
                message: 'Channel registration data prepared',
                total_nodes: channelNodes.length,
                registrationData: registrationData,
                note: 'Registration will be handled by B-Client via WebSocket'
            };

        } catch (error) {
            console.error('Error in handleRegisterToChannelInternal:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Internal method to handle add node to channel
     */
    async handleAddNodeToChannelInternal(domainId, clusterId, channelId, nodeId, targetNodeId) {
        try {
            if (!this.currentUser) {
                throw new Error('No current user set');
            }

            // Check if target_node_id equals local user's node_id
            const localUser = DatabaseManager.getLocalUserByNodeId(targetNodeId);
            if (localUser) {
                // This is a registration from another peer node
                // Just store the sender's information and don't forward
                DatabaseManager.addChannelNode(nodeId, domainId, clusterId, channelId);

                return {
                    success: true,
                    message: 'Peer node registration completed (no forwarding needed)',
                    is_peer_registration: true
                };
            }

            // This is a new node registration, store it
            DatabaseManager.addChannelNode(targetNodeId, domainId, clusterId, channelId);

            // Prepare response data with current user info
            const responseData = {
                domain_id: domainId,
                cluster_id: clusterId,
                channel_id: channelId,
                node_id: this.currentUser.node_id || nodeId,
                target_node_id: targetNodeId,
                user_id: this.currentUser.user_id,
                username: this.currentUser.username
            };

            // Return response data for B-Client to handle via WebSocket
            return {
                success: true,
                message: 'Node added successfully',
                responseData: responseData
            };

        } catch (error) {
            console.error('Error in handleAddNodeToChannelInternal:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }
}

module.exports = NodeWebSocketHandler;
