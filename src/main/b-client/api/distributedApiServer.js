/**
 * Distributed API Server - B-Client API server for handling c-client requests
 * Manages node forwarding, registration, and inter-node communication
 */

const express = require('express');
const cors = require('cors');
const DatabaseManager = require('../sqlite/nodeDatabase');
const UserDatabase = require('../sqlite/userDatabase');

class DistributedApiServer {
    constructor(config = {}) {
        this.config = {
            port: config.port || 3001,
            host: config.host || 'localhost',
            ...config
        };

        this.app = express();
        this.server = null;
        this.nodeDatabase = new DatabaseManager();
        this.userDatabase = new UserDatabase();

        this.setupMiddleware();
        this.setupRoutes();
    }

    /**
     * Setup middleware
     */
    setupMiddleware() {
        this.app.use(cors());
        this.app.use(express.json());
        this.app.use(express.urlencoded({ extended: true }));

        // Request logging
        this.app.use((req, res, next) => {
            console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
            next();
        });

        // Error handling
        this.app.use((error, req, res, next) => {
            console.error('API Error:', error);
            res.status(500).json({
                success: false,
                error: 'Internal server error'
            });
        });
    }

    /**
     * Setup API routes
     */
    setupRoutes() {
        // Health check
        this.app.get('/health', (req, res) => {
            res.json({
                success: true,
                status: 'healthy',
                timestamp: Date.now()
            });
        });

        // Node registration
        this.app.post('/api/nodes/register', this.handleNodeRegistration.bind(this));

        // Node forwarding
        this.app.post('/api/forward/domain', this.handleDomainForwarding.bind(this));
        this.app.post('/api/forward/cluster', this.handleClusterForwarding.bind(this));
        this.app.post('/api/forward/channel', this.handleChannelForwarding.bind(this));

        // Channel registration
        this.app.post('/api/register/channel', this.handleChannelRegistration.bind(this));

        // Heartbeat
        this.app.post('/api/heartbeat', this.handleHeartbeat.bind(this));

        // Node information
        this.app.get('/api/nodes/:nodeId', this.handleGetNodeInfo.bind(this));
        this.app.get('/api/main-node', this.handleGetMainNodeInfo.bind(this));

        // Messaging
        this.app.post('/api/messages/send', this.handleSendMessage.bind(this));
        this.app.get('/api/messages/pending/:nodeId', this.handleGetPendingMessages.bind(this));
        this.app.post('/api/messages/:messageId/processed', this.handleMarkMessageProcessed.bind(this));

        // Statistics
        this.app.get('/api/statistics', this.handleGetStatistics.bind(this));

        // Domain main node transfer notification
        this.app.post('/api/domain-main-node/transfer', this.handleDomainMainNodeTransfer.bind(this));

        // Get domain nodes
        this.app.get('/api/domain-nodes', this.handleGetDomainNodes.bind(this));
    }

    /**
     * Handle node registration - B-Client stores node info and forwards to domain main node
     */
    async handleNodeRegistration(req, res) {
        try {
            const { nodeType, ...nodeInfo } = req.body;

            console.log('📝 Received node registration:', nodeInfo.nodeId);

            // Store node information in B-Client's domain_nodes table for routing
            const result = await this.nodeDatabase.addDomainNode(
                nodeInfo.domainId,
                nodeInfo.nodeId,
                nodeInfo.ipAddress,
                new Date().toISOString()
            );

            if (result) {
                // Forward registration to domain main node
                try {
                    const domainMainNode = await this.nodeDatabase.getDomainNode(nodeInfo.domainId);

                    if (domainMainNode) {
                        console.log('📤 Forwarding registration to domain main node:', domainMainNode.node_id);

                        const forwardResult = await this.forwardRequestToNode(
                            domainMainNode.ip_address,
                            domainMainNode.port || 3000,
                            '/api/domain/register',
                            { nodeType, ...nodeInfo }
                        );

                        res.json({
                            success: true,
                            message: 'Node registered and forwarded to domain main node',
                            data: {
                                nodeId: nodeInfo.nodeId,
                                domainId: nodeInfo.domainId,
                                registeredAt: new Date().toISOString(),
                                forwarded: true,
                                domainMainNode: domainMainNode.node_id,
                                forwardResult
                            }
                        });
                    } else {
                        // No domain main node found, just store locally
                        res.json({
                            success: true,
                            message: 'Node registered locally (no domain main node found)',
                            data: {
                                nodeId: nodeInfo.nodeId,
                                domainId: nodeInfo.domainId,
                                registeredAt: new Date().toISOString(),
                                forwarded: false
                            }
                        });
                    }
                } catch (forwardError) {
                    console.error('❌ Error forwarding to domain main node:', forwardError);
                    res.json({
                        success: true,
                        message: 'Node registered locally (forwarding failed)',
                        data: {
                            nodeId: nodeInfo.nodeId,
                            domainId: nodeInfo.domainId,
                            registeredAt: new Date().toISOString(),
                            forwarded: false,
                            forwardError: forwardError.message
                        }
                    });
                }
            } else {
                throw new Error('Failed to register node');
            }
        } catch (error) {
            console.error('❌ Error handling node registration:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    /**
     * Handle domain forwarding - B-Client acts as a proxy/relay server
     */
    async handleDomainForwarding(req, res) {
        try {
            const { domainId, nodeInfo } = req.body;

            console.log('🔄 Forwarding to domain main node:', domainId);

            // Get domain main node from domain_nodes table
            const domainMainNode = await this.nodeDatabase.getDomainNode(domainId);

            if (!domainMainNode) {
                // No domain main node exists, return error
                console.log('❌ No domain main node found for:', domainId);
                res.status(404).json({
                    success: false,
                    error: 'No domain main node found',
                    data: {
                        domainId,
                        message: 'Please register a domain main node first'
                    }
                });
            } else {
                // Forward request to the actual domain main node
                console.log('📤 Forwarding to domain main node:', domainMainNode.node_id, 'at', domainMainNode.ip_address);

                try {
                    // Forward the request to the actual domain main node
                    const forwardResult = await this.forwardRequestToNode(
                        domainMainNode.ip_address,
                        domainMainNode.port || 3000,
                        '/api/domain/register',
                        nodeInfo
                    );

                    res.json({
                        success: true,
                        message: 'Request forwarded to domain main node',
                        data: {
                            domainId,
                            mainNodeId: domainMainNode.node_id,
                            mainNodeAddress: `${domainMainNode.ip_address}:${domainMainNode.port || 3000}`,
                            forwarded: true,
                            result: forwardResult
                        }
                    });
                } catch (forwardError) {
                    console.error('❌ Error forwarding to domain main node:', forwardError);
                    res.status(502).json({
                        success: false,
                        error: 'Failed to forward request to domain main node',
                        data: {
                            domainId,
                            mainNodeId: domainMainNode.node_id,
                            forwardError: forwardError.message
                        }
                    });
                }
            }
        } catch (error) {
            console.error('❌ Error handling domain forwarding:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    /**
     * Handle cluster forwarding
     */
    async handleClusterForwarding(req, res) {
        try {
            const { domainId, clusterId, nodeInfo } = req.body;

            console.log('🔄 Forwarding to cluster main node:', clusterId);

            // Get cluster main node
            const clusterMainNode = await this.getClusterMainNode(domainId, clusterId);

            if (!clusterMainNode) {
                // No cluster main node exists, create one
                console.log('👑 Creating cluster main node for:', clusterId);

                const clusterNodeId = `cluster-${clusterId}-${Date.now()}`;
                const result = await this.createClusterMainNode(domainId, clusterId, clusterNodeId);

                res.json({
                    success: true,
                    message: 'Created cluster main node',
                    data: {
                        domainId,
                        clusterId,
                        mainNodeId: clusterNodeId,
                        forwarded: false
                    }
                });
            } else {
                // Forward to existing cluster main node
                console.log('📤 Forwarding to existing cluster main node:', clusterMainNode.node_id);

                res.json({
                    success: true,
                    message: 'Forwarded to cluster main node',
                    data: {
                        domainId,
                        clusterId,
                        mainNodeId: clusterMainNode.node_id,
                        forwarded: true
                    }
                });
            }
        } catch (error) {
            console.error('❌ Error handling cluster forwarding:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    /**
     * Handle channel forwarding
     */
    async handleChannelForwarding(req, res) {
        try {
            const { domainId, clusterId, channelId, nodeInfo } = req.body;

            console.log('🔄 Forwarding to channel main node:', channelId);

            // Get channel main node
            const channelMainNode = await this.getChannelMainNode(domainId, clusterId, channelId);

            if (!channelMainNode) {
                // No channel main node exists, create one
                console.log('👑 Creating channel main node for:', channelId);

                const channelNodeId = `channel-${channelId}-${Date.now()}`;
                const result = await this.createChannelMainNode(domainId, clusterId, channelId, channelNodeId);

                res.json({
                    success: true,
                    message: 'Created channel main node',
                    data: {
                        domainId,
                        clusterId,
                        channelId,
                        mainNodeId: channelNodeId,
                        forwarded: false
                    }
                });
            } else {
                // Forward to existing channel main node
                console.log('📤 Forwarding to existing channel main node:', channelMainNode.node_id);

                res.json({
                    success: true,
                    message: 'Forwarded to channel main node',
                    data: {
                        domainId,
                        clusterId,
                        channelId,
                        mainNodeId: channelMainNode.node_id,
                        forwarded: true
                    }
                });
            }
        } catch (error) {
            console.error('❌ Error handling channel forwarding:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    /**
     * Handle channel registration completion
     */
    async handleChannelRegistration(req, res) {
        try {
            const { domainId, clusterId, channelId, nodeInfo } = req.body;

            console.log('✅ Completing channel registration:', channelId);

            // Register the c-client node in the channel
            const result = await this.registerNodeInChannel(domainId, clusterId, channelId, nodeInfo);

            if (result) {
                res.json({
                    success: true,
                    message: 'Channel registration completed',
                    data: {
                        domainId,
                        clusterId,
                        channelId,
                        nodeId: nodeInfo.nodeId,
                        registeredAt: new Date().toISOString()
                    }
                });
            } else {
                throw new Error('Failed to complete channel registration');
            }
        } catch (error) {
            console.error('❌ Error handling channel registration:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    /**
     * Handle heartbeat
     */
    async handleHeartbeat(req, res) {
        try {
            const { nodeId, status, timestamp } = req.body;

            console.log('💓 Received heartbeat from:', nodeId);

            // Update node heartbeat
            const result = await this.nodeDatabase.updateDomainNodeRefreshTime(nodeId, new Date().toISOString());

            // Get current main node info for all levels
            const mainNodeInfo = await this.getCurrentMainNodeInfo();

            res.json({
                success: true,
                message: 'Heartbeat received',
                data: {
                    nodeId,
                    status,
                    timestamp,
                    mainNodeInfo
                }
            });
        } catch (error) {
            console.error('❌ Error handling heartbeat:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    /**
     * Get current main node info for all levels
     */
    async getCurrentMainNodeInfo() {
        try {
            const mainNodeInfo = {};

            // Get domain main node info
            const domainMainNode = await this.nodeDatabase.getDomainMainNode();
            if (domainMainNode) {
                mainNodeInfo.domain = {
                    node_id: domainMainNode.node_id,
                    username: domainMainNode.username,
                    domain_id: domainMainNode.domain_id,
                    ip_address: domainMainNode.ip_address,
                    port: domainMainNode.port,
                    status: domainMainNode.status,
                    last_heartbeat: domainMainNode.last_heartbeat,
                    priority: domainMainNode.priority,
                    capabilities: domainMainNode.capabilities,
                    metadata: domainMainNode.metadata
                };
            }

            // Get cluster main node info
            const clusterMainNode = await this.nodeDatabase.getClusterMainNode();
            if (clusterMainNode) {
                mainNodeInfo.cluster = {
                    node_id: clusterMainNode.node_id,
                    username: clusterMainNode.username,
                    domain_id: clusterMainNode.domain_id,
                    cluster_id: clusterMainNode.cluster_id,
                    ip_address: clusterMainNode.ip_address,
                    port: clusterMainNode.port,
                    status: clusterMainNode.status,
                    last_heartbeat: clusterMainNode.last_heartbeat,
                    priority: clusterMainNode.priority,
                    capabilities: clusterMainNode.capabilities,
                    metadata: clusterMainNode.metadata
                };
            }

            // Get channel main node info
            const channelMainNode = await this.nodeDatabase.getChannelMainNode();
            if (channelMainNode) {
                mainNodeInfo.channel = {
                    node_id: channelMainNode.node_id,
                    username: channelMainNode.username,
                    domain_id: channelMainNode.domain_id,
                    cluster_id: channelMainNode.cluster_id,
                    channel_id: channelMainNode.channel_id,
                    ip_address: channelMainNode.ip_address,
                    port: channelMainNode.port,
                    status: channelMainNode.status,
                    last_heartbeat: channelMainNode.last_heartbeat,
                    priority: channelMainNode.priority,
                    capabilities: channelMainNode.capabilities,
                    metadata: channelMainNode.metadata
                };
            }

            return mainNodeInfo;
        } catch (error) {
            console.error('❌ Error getting current main node info:', error);
            return {};
        }
    }

    /**
     * Handle get node info
     */
    async handleGetNodeInfo(req, res) {
        try {
            const { nodeId } = req.params;

            const nodeInfo = await this.nodeDatabase.getDomainNodeByNodeId(nodeId);

            if (nodeInfo) {
                res.json({
                    success: true,
                    data: nodeInfo
                });
            } else {
                res.status(404).json({
                    success: false,
                    error: 'Node not found'
                });
            }
        } catch (error) {
            console.error('❌ Error getting node info:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    /**
     * Handle get main node info
     */
    async handleGetMainNodeInfo(req, res) {
        try {
            const { nodeType, domainId, clusterId, channelId } = req.query;

            let mainNode = null;

            switch (nodeType) {
                case 'domain':
                    mainNode = await this.nodeDatabase.getDomainNode(domainId);
                    break;
                case 'cluster':
                    mainNode = await this.getClusterMainNode(domainId, clusterId);
                    break;
                case 'channel':
                    mainNode = await this.getChannelMainNode(domainId, clusterId, channelId);
                    break;
            }

            if (mainNode) {
                res.json({
                    success: true,
                    data: mainNode
                });
            } else {
                res.status(404).json({
                    success: false,
                    error: 'Main node not found'
                });
            }
        } catch (error) {
            console.error('❌ Error getting main node info:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    /**
     * Handle send message
     */
    async handleSendMessage(req, res) {
        try {
            const { toNodeId, messageType, messageData, timestamp } = req.body;

            console.log('📤 Sending message to:', toNodeId);

            // Store message in database for delivery
            const messageId = await this.storeMessage(toNodeId, messageType, messageData, timestamp);

            res.json({
                success: true,
                message: 'Message sent',
                data: {
                    messageId,
                    toNodeId,
                    messageType
                }
            });
        } catch (error) {
            console.error('❌ Error sending message:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    /**
     * Handle get pending messages
     */
    async handleGetPendingMessages(req, res) {
        try {
            const { nodeId } = req.params;

            const messages = await this.getPendingMessages(nodeId);

            res.json({
                success: true,
                data: messages
            });
        } catch (error) {
            console.error('❌ Error getting pending messages:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    /**
     * Handle mark message as processed
     */
    async handleMarkMessageProcessed(req, res) {
        try {
            const { messageId } = req.params;

            await this.markMessageProcessed(messageId);

            res.json({
                success: true,
                message: 'Message marked as processed'
            });
        } catch (error) {
            console.error('❌ Error marking message as processed:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    /**
     * Handle get statistics
     */
    async handleGetStatistics(req, res) {
        try {
            const stats = await this.getSystemStatistics();

            res.json({
                success: true,
                data: stats
            });
        } catch (error) {
            console.error('❌ Error getting statistics:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    /**
     * Handle domain main node transfer notification
     */
    async handleDomainMainNodeTransfer(req, res) {
        try {
            const {
                oldMainNode,
                newMainNode,
                newMainNodeInfo,
                transferTime,
                reason,
                domainId
            } = req.body;

            console.log('📢 Received domain main node transfer notification:');
            console.log(`   旧主节点: ${oldMainNode}`);
            console.log(`   新主节点: ${newMainNode}`);
            console.log(`   转让原因: ${reason}`);
            console.log(`   转让时间: ${new Date(transferTime).toISOString()}`);

            // Update domain_nodes table with new main node information
            await this.updateDomainMainNodeInfo(domainId, newMainNode, newMainNodeInfo);

            // Log the transfer
            console.log('✅ B-Client updated domain main node information');

            res.json({
                success: true,
                message: 'Domain main node transfer notification processed',
                data: {
                    oldMainNode,
                    newMainNode,
                    transferTime,
                    reason,
                    domainId
                }
            });

        } catch (error) {
            console.error('❌ Error handling domain main node transfer:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    /**
     * Update domain main node information in B-Client's domain_nodes table
     */
    async updateDomainMainNodeInfo(domainId, newMainNode, newMainNodeInfo) {
        try {
            // Update the domain main node information
            const updateStmt = this.nodeDatabase.db.prepare(`
                UPDATE domain_nodes 
                SET node_id = ?, ip_address = ?, port = ?, updated_at = ?
                WHERE domain_id = ? AND node_id = ?
            `);

            const now = new Date().toISOString();
            updateStmt.run(
                newMainNode,
                newMainNodeInfo.ipAddress,
                newMainNodeInfo.port || 3000,
                now,
                domainId,
                'domain-main-node' // Update the old domain-main-node entry
            );

            // If the update didn't affect any rows, insert a new entry
            if (updateStmt.changes === 0) {
                const insertStmt = this.nodeDatabase.db.prepare(`
                    INSERT INTO domain_nodes (domain_id, node_id, ip_address, port, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?)
                `);

                insertStmt.run(
                    domainId,
                    newMainNode,
                    newMainNodeInfo.ipAddress,
                    newMainNodeInfo.port || 3000,
                    now,
                    now
                );
            }

            console.log(`✅ Updated domain main node info: ${newMainNode} at ${newMainNodeInfo.ipAddress}:${newMainNodeInfo.port || 3000}`);

        } catch (error) {
            console.error('❌ Error updating domain main node info:', error);
            throw error;
        }
    }

    /**
     * Forward request to a specific node
     */
    async forwardRequestToNode(ipAddress, port, endpoint, data) {
        const axios = require('axios');
        const url = `http://${ipAddress}:${port}${endpoint}`;

        try {
            const response = await axios.post(url, data, {
                timeout: 10000,
                headers: {
                    'Content-Type': 'application/json',
                    'User-Agent': 'B-Client-Proxy/1.0'
                }
            });

            return response.data;
        } catch (error) {
            throw new Error(`Failed to forward request to ${url}: ${error.message}`);
        }
    }

    /**
     * Helper methods
     */

    async getClusterMainNode(domainId, clusterId) {
        // Implementation for getting cluster main node
        // This would query the appropriate database table
        return null; // Placeholder
    }

    async createClusterMainNode(domainId, clusterId, nodeId) {
        // Implementation for creating cluster main node
        // This would insert into the appropriate database table
        return true; // Placeholder
    }

    async getChannelMainNode(domainId, clusterId, channelId) {
        // Implementation for getting channel main node
        // This would query the appropriate database table
        return null; // Placeholder
    }

    async createChannelMainNode(domainId, clusterId, channelId, nodeId) {
        // Implementation for creating channel main node
        // This would insert into the appropriate database table
        return true; // Placeholder
    }

    async registerNodeInChannel(domainId, clusterId, channelId, nodeInfo) {
        // Implementation for registering node in channel
        // This would insert into the appropriate database table
        return true; // Placeholder
    }

    async storeMessage(toNodeId, messageType, messageData, timestamp) {
        // Implementation for storing message
        // This would insert into the messages table
        return Date.now(); // Placeholder
    }

    async getPendingMessages(nodeId) {
        // Implementation for getting pending messages
        // This would query the messages table
        return []; // Placeholder
    }

    async markMessageProcessed(messageId) {
        // Implementation for marking message as processed
        // This would update the messages table
        return true; // Placeholder
    }

    async getSystemStatistics() {
        // Implementation for getting system statistics
        // This would query various database tables
        return {
            totalNodes: 0,
            activeNodes: 0,
            mainNodes: 0,
            offlineNodes: 0
        }; // Placeholder
    }

    /**
     * Start the API server
     */
    start() {
        return new Promise((resolve, reject) => {
            try {
                this.server = this.app.listen(this.config.port, this.config.host, () => {
                    console.log(`🚀 Distributed API Server started on ${this.config.host}:${this.config.port}`);
                    resolve();
                });
            } catch (error) {
                reject(error);
            }
        });
    }

    /**
     * Handle get domain nodes request
     */
    async handleGetDomainNodes(req, res) {
        try {
            console.log('📡 Getting domain nodes...');
            
            // Get all domain nodes from B-Client's domain_nodes table
            const domainNodes = this.nodeDatabase.getAllDomainNodes();
            
            res.json({
                success: true,
                data: domainNodes,
                message: `Found ${domainNodes.length} domain nodes`
            });
        } catch (error) {
            console.error('❌ Error getting domain nodes:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    /**
     * Stop the API server
     */
    stop() {
        return new Promise((resolve) => {
            if (this.server) {
                this.server.close(() => {
                    console.log('🛑 Distributed API Server stopped');
                    resolve();
                });
            } else {
                resolve();
            }
        });
    }
}

module.exports = DistributedApiServer;
