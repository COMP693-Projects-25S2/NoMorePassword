const { v4: uuidv4 } = require('uuid');
const axios = require('axios');
const DatabaseManager = require('../sqlite/databaseManager');

class NodeManager {
    constructor() {
        this.currentUser = null;
        this.apiPort = null;
        this.ipUpdateInterval = null; // Store the interval reference
        this.config = this.loadConfig(); // Load network configuration
        this.clientId = uuidv4(); // Generate unique client ID on startup
        console.log(`🆔 NodeManager: Generated client ID: ${this.clientId}`);
    }

    // Load network configuration
    loadConfig() {
        try {
            const fs = require('fs');
            const path = require('path');
            const configPath = path.join(__dirname, '..', 'config.json');
            const configData = fs.readFileSync(configPath, 'utf8');
            const config = JSON.parse(configData);
            console.log('🔧 NodeManager: Loaded network configuration');
            return config;
        } catch (error) {
            console.log('🔧 NodeManager: Using default network configuration (config.json not found)');
            return {
                network: {
                    use_public_ip: false,
                    public_ip: '121.74.37.6',
                    local_ip: '127.0.0.1'
                }
            };
        }
    }

    // Get the appropriate IP address based on configuration
    getConfiguredIpAddress() {
        if (this.config.network.use_public_ip) {
            console.log('🌐 NodeManager: Using public IP mode');
            return this.config.network.public_ip;
        } else {
            console.log('🏠 NodeManager: Using local IP mode');
            return this.config.network.local_ip;
        }
    }

    setCurrentUser(user) {
        this.currentUser = user;
    }

    getClientId() {
        return this.clientId;
    }

    async newDomainNode() {
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

            return {
                success: true,
                domain_id: domainId,
                node_id: nodeId
            };

        } catch (error) {
            console.error('Error in newDomainNode:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    async newClusterNode(nodeId) {
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
            await this.registerConfirmed(domainId, clusterId, null, nodeId, nodeId, 'cluster');

            return {
                success: true,
                domain_id: domainId,
                cluster_id: clusterId,
                node_id: nodeId
            };

        } catch (error) {
            console.error('Error in newClusterNode:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    async newChannelNode(nodeId) {
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
            await this.registerConfirmed(domainId, clusterId, channelId, nodeId, nodeId, 'channel');

            return {
                success: true,
                domain_id: domainId,
                cluster_id: clusterId,
                channel_id: channelId,
                node_id: nodeId
            };

        } catch (error) {
            console.error('Error in newChannelNode:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    async registerToDomainNode(domainId, nodeId, requesterIp, requesterPort) {
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
                // No available cluster found, call newClusterNode on the requester
                try {
                    console.log(`[NodeManager] No available cluster found, calling newClusterNode on ${requesterIp}:${requesterPort}`);

                    const response = await axios.post(`http://${requesterIp}:${requesterPort}/newclusternode`, {
                        node_id: nodeId
                    }, {
                        timeout: 10000,
                        headers: {
                            'Content-Type': 'application/json'
                        }
                    });

                    if (response.data.success) {
                        console.log(`[NodeManager] Successfully created new cluster: ${response.data.cluster_id}`);
                        return {
                            success: true,
                            clusterId: response.data.cluster_id,
                            nodeId: response.data.node_id,
                            message: 'New cluster created successfully, no registration confirmation needed'
                        };
                    } else {
                        return {
                            success: false,
                            error: `Failed to create new cluster: ${response.data.error}`
                        };
                    }
                } catch (error) {
                    console.error(`[NodeManager] Failed to call newClusterNode on ${requesterIp}:${requesterPort}:`, error.message);
                    return {
                        success: false,
                        error: `No available cluster found and failed to create new cluster: ${error.message}`
                    };
                }
            }

            // Asynchronously call registerConfirmed on the requester (only for existing clusters)
            this.callRegisterConfirmedAsync(requesterIp, requesterPort, {
                domain_id: domainId,
                cluster_id: availableCluster.cluster_id,
                channel_id: null, // Empty for domain main node confirmation
                node_id: this.currentUser.node_id || nodeId,
                target_node_id: availableCluster.node_id,
                confirmed_by: 'domain'
            });

            return {
                success: true,
                clusterId: availableCluster.cluster_id,
                nodeId: availableCluster.node_id,
                message: 'Domain allocation successful, registration confirmation sent asynchronously'
            };

        } catch (error) {
            console.error('Error in registerToDomainNode:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    async addNewNode(domainId, clusterId, channelId, nodeId, targetNodeId) {
        try {
            if (!this.currentUser) {
                throw new Error('No current user set');
            }

            // Check if target_node_id equals local user's node_id
            const localUser = DatabaseManager.getLocalUserByNodeId(targetNodeId);
            if (localUser) {
                // This is a registration from another peer node
                // Just store the sender's information and don't forward
                DatabaseManager.addChannelNode(nodeId, domainId, clusterId, channelId, ipAddress);

                return {
                    success: true,
                    message: 'Peer node registration completed (no forwarding needed)',
                    is_peer_registration: true
                };
            }

            // This is a new node registration, store it and forward to target
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

            // Send response to calling node
            try {
                const response = await axios.post(`http://localhost:3001/addNewNode`, responseData, {
                    timeout: 10000,
                    headers: {
                        'Content-Type': 'application/json'
                    }
                });

                return {
                    success: true,
                    message: 'Node added successfully',
                    response: response.data
                };
            } catch (httpError) {
                // Even if HTTP call fails, node was added to database
                return {
                    success: true,
                    message: 'Node added to database, but failed to notify calling node',
                    error: httpError.message
                };
            }

        } catch (error) {
            console.error('Error in addNewNode:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    getLocalIpAddress() {
        // Get local IP address (simplified implementation)
        const os = require('os');
        const interfaces = os.networkInterfaces();
        for (const name of Object.keys(interfaces)) {
            for (const iface of interfaces[name]) {
                if (iface.family === 'IPv4' && !iface.internal) {
                    return iface.address;
                }
            }
        }
        return '127.0.0.1';
    }

    async getPublicIpAddress() {
        // Use configured IP address instead of fetching from external service
        const configuredIp = this.getConfiguredIpAddress();
        console.log(`🌐 NodeManager: Using configured IP address: ${configuredIp}`);
        return configuredIp;
    }

    getLocalPort() {
        // Return the port this API server is running on
        // This should be set by the API server when it starts
        return this.apiPort;
    }

    setApiPort(port) {
        this.apiPort = port;
        // Update timestamp in database if we have current user
        if (this.currentUser && this.currentUser.user_id) {
            try {
                DatabaseManager.updateLocalUserTimestamp(this.currentUser.user_id);
                console.log(`[NodeManager] Updated local_users timestamp for user ${this.currentUser.user_id}`);
            } catch (error) {
                console.error(`[NodeManager] Failed to update timestamp in database:`, error);
            }
        }
    }

    // Start IP update task - runs every 5 minutes
    startIpUpdateTask() {
        console.log('[NodeManager] Starting IP update task (every 5 minutes)');

        // Run immediately on start
        this.updateAllNodeIps();

        // Set up interval for every 5 minutes
        this.ipUpdateInterval = setInterval(() => {
            this.updateAllNodeIps();
        }, 5 * 60 * 1000); // 5 minutes in milliseconds
    }

    // Stop IP update task
    stopIpUpdateTask() {
        if (this.ipUpdateInterval) {
            console.log('[NodeManager] Stopping IP update task');
            clearInterval(this.ipUpdateInterval);
            this.ipUpdateInterval = null;
        }
    }

    // Update IP addresses based on local_users table and main node status
    async updateAllNodeIps() {
        try {
            console.log('[NodeManager] Starting IP update based on local_users table...');

            const newPublicIp = await this.getPublicIpAddress();
            const currentPort = this.getLocalPort();

            console.log(`[NodeManager] New configured IP: ${newPublicIp}, Port: ${currentPort} (${this.config.network.use_public_ip ? 'public' : 'local'} mode)`);

            // Update local_users table timestamp
            if (this.currentUser && this.currentUser.user_id) {
                DatabaseManager.updateLocalUserTimestamp(this.currentUser.user_id);
                console.log(`[NodeManager] Updated local_users timestamp for user: ${this.currentUser.user_id}`);

                // Get the node_id from local_users
                const localUser = DatabaseManager.getLocalUserById(this.currentUser.user_id);
                if (localUser && localUser.node_id) {
                    const nodeId = localUser.node_id;

                    // Check if current node is a domain main node
                    const domainNode = DatabaseManager.getDomainMainNodeByNodeId(nodeId);
                    if (domainNode) {
                        DatabaseManager.updateDomainMainNodeTimestamp(nodeId);
                        console.log(`[NodeManager] Updated domain_main_nodes timestamp for: ${nodeId}`);
                    }

                    // Check if current node is a cluster main node
                    const clusterNode = DatabaseManager.getClusterMainNodeByNodeId(nodeId);
                    if (clusterNode) {
                        DatabaseManager.updateClusterMainNodeTimestamp(nodeId);
                        console.log(`[NodeManager] Updated cluster_main_nodes timestamp for: ${nodeId}`);
                    }

                    // Check if current node is a channel main node
                    const channelMainNode = DatabaseManager.getChannelMainNodeByNodeId(nodeId);
                    if (channelMainNode) {
                        DatabaseManager.updateChannelMainNodeTimestamp(nodeId);
                        console.log(`[NodeManager] Updated channel_main_nodes timestamp for: ${nodeId}`);
                    }

                    // Check if current node is a channel node
                    const channelNode = DatabaseManager.getChannelNodeByNodeId(nodeId);
                    if (channelNode) {
                        DatabaseManager.updateChannelNodeTimestamp(nodeId);
                        console.log(`[NodeManager] Updated channel_nodes timestamp for: ${nodeId}`);
                    }

                    console.log(`[NodeManager] IP update completed for node: ${nodeId}`);
                } else {
                    console.log(`[NodeManager] No node_id found in local_users for user: ${this.currentUser.user_id}`);
                }
            } else {
                console.log(`[NodeManager] No current user set, skipping IP update`);
            }

        } catch (error) {
            console.error('[NodeManager] Error updating IP addresses:', error);
        }
    }

    async registerToClusterNode(clusterId, nodeId, requesterIp, requesterPort) {
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
                // No available channel found, call newChannelNode on the requester
                try {
                    console.log(`[NodeManager] No available channel found, calling newChannelNode on ${requesterIp}:${requesterPort}`);

                    const response = await axios.post(`http://${requesterIp}:${requesterPort}/newchannelnode`, {
                        node_id: nodeId
                    }, {
                        timeout: 10000,
                        headers: {
                            'Content-Type': 'application/json'
                        }
                    });

                    if (response.data.success) {
                        console.log(`[NodeManager] Successfully created new channel: ${response.data.channel_id}`);
                        return {
                            success: true,
                            channelId: response.data.channel_id,
                            nodeId: response.data.node_id,
                            message: 'New channel created successfully, no registration confirmation needed'
                        };
                    } else {
                        return {
                            success: false,
                            error: `Failed to create new channel: ${response.data.error}`
                        };
                    }
                } catch (error) {
                    console.error(`[NodeManager] Failed to call newChannelNode on ${requesterIp}:${requesterPort}:`, error.message);
                    return {
                        success: false,
                        error: `No available channel found and failed to create new channel: ${error.message}`
                    };
                }
            }

            // Asynchronously call registerConfirmed on the requester (only for existing channels)
            this.callRegisterConfirmedAsync(requesterIp, requesterPort, {
                domain_id: clusterNode.domain_id,
                cluster_id: clusterId,
                channel_id: availableChannel.channel_id,
                node_id: this.currentUser.node_id || nodeId,
                target_node_id: availableChannel.node_id,
                confirmed_by: 'cluster'
            });

            return {
                success: true,
                channelId: availableChannel.channel_id,
                nodeId: availableChannel.node_id,
                message: 'Cluster allocation successful, registration confirmation sent asynchronously'
            };

        } catch (error) {
            console.error('Error in registerToClusterNode:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    generateNodeId() {
        // Generate a simple node ID if not available
        return `node_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    // Asynchronously call registerConfirmed without blocking
    async callRegisterConfirmedAsync(targetIp, targetPort, requestData) {
        try {
            console.log(`[NodeManager] Sending registerConfirmed to ${targetIp}:${targetPort}`);

            const response = await axios.post(`http://${targetIp}:${targetPort}/registerconfirmed`, requestData, {
                timeout: 10000,
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            console.log(`[NodeManager] registerConfirmed response from ${targetIp}:${targetPort}:`, response.data);
        } catch (error) {
            console.error(`[NodeManager] Failed to send registerConfirmed to ${targetIp}:${targetPort}:`, error.message);
            // Could implement retry logic here or queue for later processing
        }
    }

    // Asynchronously send addNewNode request without blocking
    async sendAddNewNodeRequestAsync(channelNodeItem, requestData) {
        try {
            const response = await axios.post(`http://localhost:3001/addNewNode`, requestData, {
                timeout: 10000,
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            console.log(`[NodeManager] Successfully sent addNewNode to ${channelNodeItem.node_id}:`, response.data);
        } catch (error) {
            console.error(`[NodeManager] Failed to send addNewNode to ${channelNodeItem.node_id}:`, error.message);
            // Could implement retry logic here or queue for later processing
        }
    }

    // Periodic synchronization of channel nodes
    async syncChannelNodes(channelId) {
        try {
            console.log(`[NodeManager] Starting periodic sync for channel ${channelId}`);

            // Get all channel nodes
            const channelNodes = DatabaseManager.getChannelNodesByChannelId(channelId);

            for (const node of channelNodes) {
                try {
                    // Send heartbeat or sync request to each node
                    const response = await axios.get(`http://localhost:3001/health`, {
                        timeout: 5000
                    });

                    console.log(`[NodeManager] Node ${node.node_id} is healthy`);
                } catch (error) {
                    console.warn(`[NodeManager] Node ${node.node_id} is unreachable:`, error.message);
                    // Could mark node as inactive or remove from database
                }
            }

            console.log(`[NodeManager] Completed periodic sync for channel ${channelId}`);
        } catch (error) {
            console.error(`[NodeManager] Error during periodic sync:`, error);
        }
    }

    // Start periodic synchronization
    startPeriodicSync(intervalMinutes = 5) {
        setInterval(() => {
            // Sync all channels this node is part of
            const allChannels = DatabaseManager.getAllChannelNodes();
            const uniqueChannels = [...new Set(allChannels.map(node => node.channel_id))];

            uniqueChannels.forEach(channelId => {
                this.syncChannelNodes(channelId);
            });
        }, intervalMinutes * 60 * 1000);

        console.log(`[NodeManager] Started periodic sync every ${intervalMinutes} minutes`);
    }

    // Start confirmation timeout detection
    startConfirmationTimeout(level, config) {
        const timeoutId = setTimeout(async () => {
            console.log(`[NodeManager] ${level} confirmation timeout, starting retry ${config.retryCount + 1}`);

            if (config.retryCount < config.maxRetries) {
                // Retry current level
                await this.retryCurrentLevel(level, config);
            } else {
                // Retry upper level
                await this.retryUpperLevel(level, config);
            }
        }, 60 * 1000); // 1 minute timeout

        // Store timeout ID for cancellation
        this.confirmationTimeouts = this.confirmationTimeouts || {};
        this.confirmationTimeouts[level] = timeoutId;

        console.log(`[NodeManager] Started ${level} confirmation timeout detection`);
    }

    // Cancel confirmation timeout
    cancelConfirmationTimeout(level) {
        if (this.confirmationTimeouts && this.confirmationTimeouts[level]) {
            clearTimeout(this.confirmationTimeouts[level]);
            delete this.confirmationTimeouts[level];
            console.log(`[NodeManager] Cancelled ${level} confirmation timeout`);
        }
    }

    // Retry current level registration
    async retryCurrentLevel(level, config) {
        try {
            if (level === 'cluster') {
                // Retry cluster registration
                const response = await axios.post(`http://${config.targetIp}:${config.targetPort}/registerToClusterNode`, {
                    cluster_id: config.clusterId,
                    node_id: this.currentUser.node_id
                }, {
                    timeout: 10000,
                    headers: {
                        'Content-Type': 'application/json'
                    }
                });

                if (response.data.success) {
                    // Restart timeout detection
                    this.startConfirmationTimeout('cluster', {
                        ...config,
                        retryCount: config.retryCount + 1
                    });
                }
            } else if (level === 'channel') {
                // Retry channel registration
                const response = await axios.post(`http://${config.targetIp}:${config.targetPort}/registerToChannelNode`, {
                    channel_id: config.channelId,
                    node_id: this.currentUser.node_id,
                    target_node_id: this.currentUser.node_id
                }, {
                    timeout: 10000,
                    headers: {
                        'Content-Type': 'application/json'
                    }
                });

                if (response.data.success) {
                    // Restart timeout detection
                    this.startConfirmationTimeout('channel', {
                        ...config,
                        retryCount: config.retryCount + 1
                    });
                }
            }
        } catch (error) {
            console.error(`[NodeManager] Retry failed for ${level}:`, error.message);
            // Continue retry
            this.startConfirmationTimeout(level, {
                ...config,
                retryCount: config.retryCount + 1
            });
        }
    }

    // Retry upper level registration
    async retryUpperLevel(level, config) {
        try {
            if (level === 'cluster') {
                // Request new cluster allocation from domain
                console.log(`[NodeManager] Requesting new cluster allocation from domain`);
                const domainNode = DatabaseManager.getDomainMainNodeById(this.currentUser.node_id);
                if (domainNode) {
                    const response = await axios.post(`http://localhost:3001/registerToDomainNode`, {
                        domain_id: config.domainId,
                        node_id: this.currentUser.node_id
                    }, {
                        timeout: 10000,
                        headers: {
                            'Content-Type': 'application/json'
                        }
                    });

                    if (response.data.success) {
                        console.log(`[NodeManager] Successfully requested new cluster allocation`);
                    }
                }
            } else if (level === 'channel') {
                // Request new channel allocation from cluster
                console.log(`[NodeManager] Requesting new channel allocation from cluster`);
                const clusterNode = DatabaseManager.getClusterMainNodeById(this.currentUser.node_id);
                if (clusterNode) {
                    const response = await axios.post(`http://localhost:3001/registerToClusterNode`, {
                        cluster_id: config.clusterId,
                        node_id: this.currentUser.node_id
                    }, {
                        timeout: 10000,
                        headers: {
                            'Content-Type': 'application/json'
                        }
                    });

                    if (response.data.success) {
                        console.log(`[NodeManager] Successfully requested new channel allocation`);
                    }
                }
            }
        } catch (error) {
            console.error(`[NodeManager] Upper level retry failed for ${level}:`, error.message);
        }
    }

    // Handle registration confirmation from domain/cluster/channel main nodes
    async registerConfirmed(domainId, clusterId, channelId, nodeId, targetNodeId, confirmedBy) {
        try {
            if (!this.currentUser) {
                throw new Error('No current user set');
            }

            // Case 1: Domain main node confirmation
            if (confirmedBy === 'domain') {
                console.log(`[NodeManager] Processing domain main node confirmation for domain ${domainId}`);

                // Clear domain_main_nodes table and insert new record
                DatabaseManager.clearAllDomainMainNodes();
                DatabaseManager.addDomainMainNode(nodeId, domainId);

                // Call registerToClusterNode on the target cluster node
                try {
                    const response = await axios.post(`http://localhost:3001/registerToClusterNode`, {
                        cluster_id: clusterId,
                        node_id: targetNodeId
                    }, {
                        timeout: 10000,
                        headers: {
                            'Content-Type': 'application/json'
                        }
                    });

                    if (response.data.success) {
                        // Start timeout detection for cluster confirmation
                        this.startConfirmationTimeout('cluster', {
                            domainId: domainId,
                            clusterId: clusterId,
                            targetIp: targetIpAddress,
                            targetPort: targetPort,
                            retryCount: 0,
                            maxRetries: 3
                        });
                    }

                    return {
                        success: true,
                        message: 'Domain registration confirmed and cluster registration initiated',
                        response: response.data
                    };
                } catch (error) {
                    return {
                        success: false,
                        error: `Failed to register with cluster node: ${error.message}`
                    };
                }
            }

            // Case 2: Cluster main node confirmation
            else if (confirmedBy === 'cluster') {
                console.log(`[NodeManager] Processing cluster main node confirmation for cluster ${clusterId}`);

                // Cancel cluster timeout detection
                this.cancelConfirmationTimeout('cluster');

                // Clear cluster_main_nodes table and insert new record
                DatabaseManager.clearAllClusterMainNodes();
                DatabaseManager.addClusterMainNode(nodeId, domainId, clusterId);

                // Call registerToChannelNode on the target channel node
                try {
                    const response = await axios.post(`http://localhost:3001/registerToChannelNode`, {
                        channel_id: channelId,
                        node_id: targetNodeId,
                        target_node_id: targetNodeId
                    }, {
                        timeout: 10000,
                        headers: {
                            'Content-Type': 'application/json'
                        }
                    });

                    if (response.data.success) {
                        // Start timeout detection for channel confirmation
                        this.startConfirmationTimeout('channel', {
                            domainId: domainId,
                            clusterId: clusterId,
                            channelId: channelId,
                            targetIp: targetIpAddress,
                            targetPort: targetPort,
                            retryCount: 0,
                            maxRetries: 3
                        });
                    }

                    return {
                        success: true,
                        message: 'Cluster registration confirmed and channel registration initiated',
                        response: response.data
                    };
                } catch (error) {
                    return {
                        success: false,
                        error: `Failed to register with channel node: ${error.message}`
                    };
                }
            }

            // Case 3: Channel main node confirmation
            else if (confirmedBy === 'channel') {
                console.log(`[NodeManager] Processing channel main node confirmation for channel ${channelId}`);

                // Cancel channel timeout detection
                this.cancelConfirmationTimeout('channel');

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
            console.error('Error in registerConfirmed:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    async registerToChannelNode(channelId, nodeId, targetNodeId) {
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

            // Asynchronously register the requesting node to all channel nodes
            // Don't wait for responses to avoid blocking the main thread
            channelNodes.forEach((channelNodeItem) => {
                // Fire and forget - send requests asynchronously
                this.sendAddNewNodeRequestAsync(channelNodeItem, {
                    domain_id: channelNode.domain_id,
                    cluster_id: channelNode.cluster_id,
                    channel_id: channelNode.channel_id,
                    node_id: this.currentUser.node_id,
                    target_node_id: targetNodeId
                });
            });

            // Asynchronously call registerConfirmed on the requester to notify channel registration success
            this.callRegisterConfirmedAsync('localhost', 3001, {
                domain_id: channelNode.domain_id,
                cluster_id: channelNode.cluster_id,
                channel_id: channelNode.channel_id,
                node_id: this.currentUser.node_id,
                target_node_id: targetNodeId,
                confirmed_by: 'channel'
            });

            return {
                success: true,
                message: 'Registration initiated asynchronously',
                total_nodes: channelNodes.length,
                note: 'Channel nodes will be synchronized via background tasks and channel registration confirmed'
            };

        } catch (error) {
            console.error('Error in registerToChannelNode:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }
}

module.exports = NodeManager;
