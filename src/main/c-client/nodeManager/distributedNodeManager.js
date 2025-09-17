/**
 * Distributed Node Manager - Core distributed node management system
 * Handles node registration, main node elections, heartbeat monitoring, and inter-node communication
 */

const { v4: uuidv4 } = require('uuid');
const EventEmitter = require('events');

class DistributedNodeManager extends EventEmitter {
    constructor(databaseManager, config = {}) {
        super();
        this.db = databaseManager;
        this.database = require('../sqlite/database'); // Direct database access
        this.DatabaseManager = require('../sqlite/databaseManager'); // Static class reference
        this.config = {
            heartbeatInterval: config.heartbeatInterval || 30000, // 30 seconds
            electionTimeout: config.electionTimeout || 10000, // 10 seconds
            maxNodesPerLevel: {
                domain: 1000,
                cluster: 1000,
                channel: 1000,
                local: 1000,        // 每个channel最多1000个local节点
                localUsers: 1000    // 每个local节点最多1000个本地用户
            },
            nodeTypes: ['domain', 'cluster', 'channel', 'local'],
            ...config
        };

        this.currentNode = null;
        // heartbeatTimer removed - handled by distributedApiClient
        this.electionTimer = null;
        this.isMainNode = false;
        this.nodeStatus = 'offline';

        this.init();
    }

    /**
     * Initialize the distributed node manager
     */
    init() {
        console.log('🔧 Initializing Distributed Node Manager...');
        this.setupEventHandlers();
        // startHeartbeat removed - handled by distributedApiClient
        console.log('✅ Distributed Node Manager initialized');
    }

    /**
     * Setup event handlers for node management
     */
    setupEventHandlers() {
        this.on('nodeRegistered', (nodeInfo) => {
            console.log('📝 Node registered:', nodeInfo.nodeId);
        });

        this.on('mainNodeElected', (electionInfo) => {
            console.log('👑 Main node elected:', electionInfo);
        });

        this.on('nodeOffline', (nodeId) => {
            console.log('⚠️ Node went offline:', nodeId);
        });

        this.on('heartbeatReceived', (nodeId) => {
            console.log('💓 Heartbeat received from:', nodeId);
        });
    }

    /**
     * Register a new node in the distributed system
     */
    async registerNode(nodeInfo) {
        try {
            const {
                nodeType,
                domainId,
                clusterId = null,
                channelId = null,
                username,
                ipAddress,
                port,
                capabilities = {},
                metadata = {}
            } = nodeInfo;

            const nodeId = nodeInfo.nodeId || uuidv4();
            const userId = nodeInfo.userId || uuidv4();

            // Validate node type and hierarchy
            if (!this.validateNodeHierarchy(nodeType, domainId, clusterId, channelId)) {
                throw new Error('Invalid node hierarchy');
            }

            // Check if node already exists
            const existingNode = await this.getNodeById(nodeId);
            if (existingNode) {
                console.log('🔄 Updating existing node:', nodeId);
                return await this.updateNode(nodeId, nodeInfo);
            }

            // Register node in appropriate table
            const nodeData = {
                userId,
                username,
                domainId,
                clusterId,
                channelId,
                nodeId,
                ipAddress,
                port: port || this.getDefaultPort(nodeType),
                status: 'active',
                isMainNode: 0,
                lastHeartbeat: Math.floor(Date.now() / 1000),
                createdAt: Math.floor(Date.now() / 1000),
                updatedAt: Math.floor(Date.now() / 1000),
                priority: 0,
                capabilities: JSON.stringify(capabilities),
                metadata: JSON.stringify(metadata)
            };

            let result;
            switch (nodeType) {
                case 'domain':
                    result = await this.DatabaseManager.constructor.addDomainMainNodeAutoId(nodeData);
                    break;
                case 'cluster':
                    result = await this.DatabaseManager.addClusterMainNodeAutoId(nodeData);
                    break;
                case 'channel':
                    result = await this.DatabaseManager.addChannelMainNodeAutoId(nodeData);
                    break;
                default:
                    throw new Error(`Unknown node type: ${nodeType}. Valid types: domain, cluster, channel`);
            }

            // Register heartbeat entry
            await this.registerHeartbeat({
                nodeId,
                nodeType,
                domainId,
                clusterId,
                channelId,
                ipAddress,
                port: nodeData.port
            });

            // Store current node info
            this.currentNode = {
                nodeId,
                nodeType,
                domainId,
                clusterId,
                channelId,
                userId,
                username,
                ipAddress,
                port: nodeData.port,
                status: 'active'
            };

            this.emit('nodeRegistered', this.currentNode);

            // Check if we need to elect a main node
            await this.checkMainNodeElection(nodeType, domainId, clusterId, channelId);

            return {
                success: true,
                nodeId,
                userId,
                message: 'Node registered successfully'
            };

        } catch (error) {
            console.error('❌ Error registering node:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // Local user management removed - handled by original nodeManager

    /**
     * Update an existing node
     */
    async updateNode(nodeId, nodeInfo) {
        try {
            const node = await this.getNodeById(nodeId);
            if (!node) {
                throw new Error('Node not found');
            }

            const updateData = {
                ...nodeInfo,
                updatedAt: Math.floor(Date.now() / 1000)
            };

            // Update in appropriate table based on node type
            let result;
            switch (node.nodeType) {
                case 'domain':
                    result = await this.DatabaseManager.updateDomainMainNode(nodeId, updateData);
                    break;
                case 'cluster':
                    result = await this.DatabaseManager.updateClusterMainNode(nodeId, updateData);
                    break;
                case 'channel':
                    result = await this.DatabaseManager.updateChannelMainNode(nodeId, updateData);
                    break;
                case 'local':
                    result = await this.DatabaseManager.updateLocalUser(nodeId, updateData);
                    break;
            }

            // Update heartbeat
            await this.updateHeartbeat(nodeId, {
                ipAddress: nodeInfo.ipAddress,
                port: nodeInfo.port,
                status: nodeInfo.status || 'active'
            });

            return {
                success: true,
                message: 'Node updated successfully'
            };

        } catch (error) {
            console.error('❌ Error updating node:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Get node by ID
     */
    async getNodeById(nodeId) {
        try {
            // Search in all node tables
            const domainNode = await this.DatabaseManager.getDomainMainNodeByNodeId(nodeId);
            if (domainNode) {
                return { ...domainNode, nodeType: 'domain' };
            }

            const clusterNode = await this.DatabaseManager.getClusterMainNodeByNodeId(nodeId);
            if (clusterNode) {
                return { ...clusterNode, nodeType: 'cluster' };
            }

            const channelNode = await this.DatabaseManager.getChannelMainNodeByNodeId(nodeId);
            if (channelNode) {
                return { ...channelNode, nodeType: 'channel' };
            }

            return null;
        } catch (error) {
            console.error('❌ Error getting node by ID:', error);
            return null;
        }
    }

    // getLocalUserByUserId removed - handled by original nodeManager

    // getLocalUserByNodeId removed - handled by original nodeManager

    // updateLocalUser removed - handled by original nodeManager

    // getLocalUsersInChannel removed - handled by original nodeManager

    // setCurrentLocalUser removed - handled by original nodeManager

    // getCurrentLocalUser removed - handled by original nodeManager

    /**
     * Register heartbeat for a node
     */
    async registerHeartbeat(heartbeatInfo) {
        try {
            const {
                nodeId,
                nodeType,
                domainId,
                clusterId,
                channelId,
                ipAddress,
                port
            } = heartbeatInfo;

            const stmt = this.database.prepare(`
                INSERT OR REPLACE INTO node_heartbeats 
                (node_id, node_type, domain_id, cluster_id, channel_id, ip_address, port, last_heartbeat, status, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)
            `);

            const now = Math.floor(Date.now() / 1000);
            stmt.run(nodeId, nodeType, domainId, clusterId, channelId, ipAddress, port, now, now);

            this.emit('heartbeatReceived', nodeId);
            return true;
        } catch (error) {
            console.error('❌ Error registering heartbeat:', error);
            return false;
        }
    }

    /**
     * Update heartbeat for a node
     */
    async updateHeartbeat(nodeId, updateData) {
        try {
            const stmt = this.database.prepare(`
                UPDATE node_heartbeats 
                SET last_heartbeat = ?, ip_address = COALESCE(?, ip_address), port = COALESCE(?, port), status = COALESCE(?, status)
                WHERE node_id = ?
            `);

            const now = Math.floor(Date.now() / 1000);
            stmt.run(now, updateData.ipAddress, updateData.port, updateData.status, nodeId);

            return true;
        } catch (error) {
            console.error('❌ Error updating heartbeat:', error);
            return false;
        }
    }

    // Heartbeat methods removed - handled by distributedApiClient

    /**
     * Update node heartbeat in main tables
     */
    async updateNodeHeartbeat(nodeId, nodeType) {
        try {
            const now = Math.floor(Date.now() / 1000);
            let stmt;

            switch (nodeType) {
                case 'domain':
                    stmt = this.database.prepare(`UPDATE domain_main_nodes SET last_heartbeat = ? WHERE node_id = ?`);
                    break;
                case 'cluster':
                    stmt = this.database.prepare(`UPDATE cluster_main_nodes SET last_heartbeat = ? WHERE node_id = ?`);
                    break;
                case 'channel':
                    stmt = this.database.prepare(`UPDATE channel_main_nodes SET last_heartbeat = ? WHERE node_id = ?`);
                    break;
                case 'local':
                    stmt = this.database.prepare(`UPDATE local_users SET last_heartbeat = ? WHERE node_id = ?`);
                    break;
            }

            if (stmt) {
                stmt.run(now, nodeId);
            }
        } catch (error) {
            console.error('❌ Error updating node heartbeat:', error);
        }
    }

    /**
     * Check node health and handle offline nodes
     */
    async checkNodeHealth() {
        try {
            const timeoutThreshold = Math.floor(Date.now() / 1000) - 120; // 2 minutes timeout

            const stmt = this.database.prepare(`
                SELECT * FROM node_heartbeats 
                WHERE last_heartbeat < ? AND status = 'active'
            `);

            const offlineNodes = stmt.all(timeoutThreshold);

            for (const node of offlineNodes) {
                console.log('⚠️ Node went offline:', node.node_id);

                // Mark node as offline
                const updateStmt = this.database.prepare(`
                    UPDATE node_heartbeats SET status = 'offline' WHERE node_id = ?
                `);
                updateStmt.run(node.node_id);

                // Notify other nodes about this node going offline
                if (node.node_type) {
                    await this.notifyNodeOffline(
                        node.node_id,
                        node.node_type,
                        node.domain_id,
                        node.cluster_id,
                        node.channel_id
                    );

                    // Check if this was a main node and trigger election
                    await this.checkMainNodeElection(node.node_type, node.domain_id, node.cluster_id, node.channel_id);
                }

                this.emit('nodeOffline', node.node_id);
            }
        } catch (error) {
            console.error('❌ Error checking node health:', error);
        }
    }

    /**
     * Check if main node election is needed
     */
    async checkMainNodeElection(nodeType, domainId, clusterId = null, channelId = null) {
        try {
            const mainNode = await this.getMainNode(nodeType, domainId, clusterId, channelId);

            if (!mainNode || mainNode.status !== 'active') {
                console.log(`🔄 No active main node found for ${nodeType}, triggering election...`);
                await this.electMainNode(nodeType, domainId, clusterId, channelId);
            }
        } catch (error) {
            console.error('❌ Error checking main node election:', error);
        }
    }

    /**
     * Elect a new main node
     */
    async electMainNode(nodeType, domainId, clusterId = null, channelId = null) {
        try {
            console.log(`🗳️ Starting main node election for ${nodeType}...`);

            // Get all active nodes for this level
            const activeNodes = await this.getActiveNodes(nodeType, domainId, clusterId, channelId);

            if (activeNodes.length === 0) {
                console.log('⚠️ No active nodes available for election');
                return null;
            }

            // Sort by priority (higher is better) and then by creation time (older is better)
            const sortedNodes = activeNodes.sort((a, b) => {
                if (b.priority !== a.priority) {
                    return b.priority - a.priority;
                }
                return a.created_at - b.created_at;
            });

            const newMainNode = sortedNodes[0];
            const oldMainNode = await this.getMainNode(nodeType, domainId, clusterId, channelId);

            // Update main node status
            await this.setMainNode(nodeType, domainId, clusterId, channelId, newMainNode.node_id);

            // Record election
            await this.recordElection(nodeType, domainId, clusterId, channelId,
                oldMainNode ? oldMainNode.node_id : null, newMainNode.node_id, 'automatic');

            console.log(`👑 New main node elected: ${newMainNode.node_id} for ${nodeType}`);

            const electionInfo = {
                nodeType,
                domainId,
                clusterId,
                channelId,
                oldMainNode: oldMainNode ? oldMainNode.node_id : null,
                newMainNode: newMainNode.node_id,
                electionTime: Math.floor(Date.now() / 1000)
            };

            this.emit('mainNodeElected', electionInfo);

            // 通知所有子节点主节点变更
            await this.notifyMainNodeChange(electionInfo);

            return newMainNode;

        } catch (error) {
            console.error('❌ Error electing main node:', error);
            return null;
        }
    }

    /**
     * Get active nodes for a specific level
     */
    async getActiveNodes(nodeType, domainId, clusterId = null, channelId = null) {
        try {
            let stmt;
            let params = [domainId];

            switch (nodeType) {
                case 'domain':
                    stmt = this.database.prepare(`
                        SELECT * FROM domain_main_nodes 
                        WHERE domain_id = ? AND status = 'active'
                        ORDER BY priority DESC, created_at ASC
                    `);
                    break;
                case 'cluster':
                    stmt = this.database.prepare(`
                        SELECT * FROM cluster_main_nodes 
                        WHERE domain_id = ? AND cluster_id = ? AND status = 'active'
                        ORDER BY priority DESC, created_at ASC
                    `);
                    params.push(clusterId);
                    break;
                case 'channel':
                    stmt = this.database.prepare(`
                        SELECT * FROM channel_main_nodes 
                        WHERE domain_id = ? AND cluster_id = ? AND channel_id = ? AND status = 'active'
                        ORDER BY priority DESC, created_at ASC
                    `);
                    params.push(clusterId, channelId);
                    break;
                case 'local':
                    stmt = this.database.prepare(`
                        SELECT * FROM local_users 
                        WHERE domain_id = ? AND cluster_id = ? AND channel_id = ? AND node_type = 'local' AND status = 'active'
                        ORDER BY priority DESC, created_at ASC
                    `);
                    params.push(clusterId, channelId);
                    break;
            }

            return stmt ? stmt.all(...params) : [];
        } catch (error) {
            console.error('❌ Error getting active nodes:', error);
            return [];
        }
    }

    /**
     * Get current main node for a level
     */
    async getMainNode(nodeType, domainId, clusterId = null, channelId = null) {
        try {
            let stmt;
            let params = [domainId];

            switch (nodeType) {
                case 'domain':
                    stmt = this.database.prepare(`
                        SELECT * FROM domain_main_nodes 
                        WHERE domain_id = ? AND is_main_node = 1 AND status = 'active'
                    `);
                    break;
                case 'cluster':
                    stmt = this.database.prepare(`
                        SELECT * FROM cluster_main_nodes 
                        WHERE domain_id = ? AND cluster_id = ? AND is_main_node = 1 AND status = 'active'
                    `);
                    params.push(clusterId);
                    break;
                case 'channel':
                    stmt = this.database.prepare(`
                        SELECT * FROM channel_main_nodes 
                        WHERE domain_id = ? AND cluster_id = ? AND channel_id = ? AND is_main_node = 1 AND status = 'active'
                    `);
                    params.push(clusterId, channelId);
                    break;
                case 'local':
                    stmt = this.database.prepare(`
                        SELECT * FROM local_users 
                        WHERE domain_id = ? AND cluster_id = ? AND channel_id = ? AND node_type = 'local' AND is_main_node = 1 AND status = 'active'
                    `);
                    params.push(clusterId, channelId);
                    break;
            }

            return stmt ? stmt.get(...params) : null;
        } catch (error) {
            console.error('❌ Error getting main node:', error);
            return null;
        }
    }

    /**
     * Set main node for a level
     */
    async setMainNode(nodeType, domainId, clusterId = null, channelId = null, nodeId) {
        try {
            // First, clear all main node flags for this level
            await this.clearMainNodeFlags(nodeType, domainId, clusterId, channelId);

            // Set new main node
            let stmt;
            let params = [nodeId];

            switch (nodeType) {
                case 'domain':
                    stmt = this.database.prepare(`
                        UPDATE domain_main_nodes 
                        SET is_main_node = 1, updated_at = ? 
                        WHERE domain_id = ? AND node_id = ?
                    `);
                    params.unshift(Math.floor(Date.now() / 1000), domainId);
                    break;
                case 'cluster':
                    stmt = this.database.prepare(`
                        UPDATE cluster_main_nodes 
                        SET is_main_node = 1, updated_at = ? 
                        WHERE domain_id = ? AND cluster_id = ? AND node_id = ?
                    `);
                    params.unshift(Math.floor(Date.now() / 1000), domainId, clusterId);
                    break;
                case 'channel':
                    stmt = this.database.prepare(`
                        UPDATE channel_main_nodes 
                        SET is_main_node = 1, updated_at = ? 
                        WHERE domain_id = ? AND cluster_id = ? AND channel_id = ? AND node_id = ?
                    `);
                    params.unshift(Math.floor(Date.now() / 1000), domainId, clusterId, channelId);
                    break;
                case 'local':
                    stmt = this.database.prepare(`
                        UPDATE local_users 
                        SET is_main_node = 1, updated_at = ? 
                        WHERE domain_id = ? AND cluster_id = ? AND channel_id = ? AND node_type = 'local' AND user_id = ?
                    `);
                    params.unshift(Math.floor(Date.now() / 1000), domainId, clusterId, channelId);
                    break;
            }

            if (stmt) {
                stmt.run(...params);
            }

            // Update current node status if this is our node
            if (this.currentNode && this.currentNode.nodeId === nodeId) {
                this.isMainNode = true;
                this.nodeStatus = 'main_node';
            }

        } catch (error) {
            console.error('❌ Error setting main node:', error);
        }
    }

    /**
     * Clear all main node flags for a level
     */
    async clearMainNodeFlags(nodeType, domainId, clusterId = null, channelId = null) {
        try {
            let stmt;
            let params = [domainId];

            switch (nodeType) {
                case 'domain':
                    stmt = this.database.prepare(`
                        UPDATE domain_main_nodes 
                        SET is_main_node = 0, updated_at = ? 
                        WHERE domain_id = ?
                    `);
                    params.unshift(Math.floor(Date.now() / 1000));
                    break;
                case 'cluster':
                    stmt = this.database.prepare(`
                        UPDATE cluster_main_nodes 
                        SET is_main_node = 0, updated_at = ? 
                        WHERE domain_id = ? AND cluster_id = ?
                    `);
                    params.unshift(Math.floor(Date.now() / 1000), clusterId);
                    break;
                case 'channel':
                    stmt = this.database.prepare(`
                        UPDATE channel_main_nodes 
                        SET is_main_node = 0, updated_at = ? 
                        WHERE domain_id = ? AND cluster_id = ? AND channel_id = ?
                    `);
                    params.unshift(Math.floor(Date.now() / 1000), clusterId, channelId);
                    break;
                case 'local':
                    stmt = this.database.prepare(`
                        UPDATE local_users 
                        SET is_main_node = 0, updated_at = ? 
                        WHERE domain_id = ? AND cluster_id = ? AND channel_id = ? AND node_type = 'local'
                    `);
                    params.unshift(Math.floor(Date.now() / 1000), clusterId, channelId);
                    break;
            }

            if (stmt) {
                stmt.run(...params);
            }
        } catch (error) {
            console.error('❌ Error clearing main node flags:', error);
        }
    }

    /**
     * Record election in database
     */
    async recordElection(nodeType, domainId, clusterId, channelId, oldMainNode, newMainNode, reason) {
        try {
            const stmt = this.database.prepare(`
                INSERT INTO node_elections 
                (node_type, domain_id, cluster_id, channel_id, old_main_node, new_main_node, election_reason, election_time, status)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'completed')
            `);

            const now = Math.floor(Date.now() / 1000);
            stmt.run(nodeType, domainId, clusterId, channelId, oldMainNode, newMainNode, reason, now);
        } catch (error) {
            console.error('❌ Error recording election:', error);
        }
    }

    /**
     * Validate node hierarchy
     */
    validateNodeHierarchy(nodeType, domainId, clusterId, channelId) {
        switch (nodeType) {
            case 'domain':
                return domainId && !clusterId && !channelId;
            case 'cluster':
                return domainId && clusterId && !channelId;
            case 'channel':
                return domainId && clusterId && channelId;
            case 'local':
                return domainId && clusterId && channelId;  // local节点需要完整的层级路径
            default:
                return false;
        }
    }

    /**
     * Get default port for node type
     */
    getDefaultPort(nodeType) {
        const ports = {
            domain: 3000,
            cluster: 3001,
            channel: 3002,
            local: 3003
        };
        return ports[nodeType] || 3000;
    }

    /**
     * Send message to another node
     */
    async sendMessage(toNodeId, messageType, messageData) {
        try {
            const stmt = this.database.prepare(`
                INSERT INTO node_messages 
                (from_node_id, to_node_id, message_type, message_data, status, created_at)
                VALUES (?, ?, ?, ?, 'pending', ?)
            `);

            const now = Math.floor(Date.now() / 1000);
            const result = stmt.run(
                this.currentNode ? this.currentNode.nodeId : 'system',
                toNodeId,
                messageType,
                JSON.stringify(messageData),
                now
            );

            return {
                success: true,
                messageId: result.lastInsertRowid
            };
        } catch (error) {
            console.error('❌ Error sending message:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Send message to all active nodes in a specific level
     */
    async sendMessageToLevel(nodeType, domainId, clusterId = null, channelId = null, messageType, messageData) {
        try {
            const activeNodes = await this.getActiveNodes(nodeType, domainId, clusterId, channelId);
            const results = [];

            for (const node of activeNodes) {
                if (node.node_id !== this.currentNode?.nodeId) { // 不给自己发消息
                    const result = await this.sendMessage(node.node_id, messageType, messageData);
                    results.push(result);
                }
            }

            return {
                success: true,
                sentCount: results.length,
                results
            };
        } catch (error) {
            console.error('❌ Error sending message to level:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Notify all nodes about main node change
     */
    async notifyMainNodeChange(electionInfo) {
        try {
            const { nodeType, domainId, clusterId, channelId, newMainNode, oldMainNode } = electionInfo;

            console.log(`📢 Broadcasting main node change: ${oldMainNode} → ${newMainNode}`);

            // 通知同级别的所有节点
            const result = await this.sendMessageToLevel(
                nodeType,
                domainId,
                clusterId,
                channelId,
                'main_node_changed',
                {
                    ...electionInfo,
                    timestamp: Date.now(),
                    message: `Main node changed from ${oldMainNode || 'none'} to ${newMainNode}`
                }
            );

            if (result.success) {
                console.log(`✅ Notified ${result.sentCount} nodes about main node change`);
            }

            return result;
        } catch (error) {
            console.error('❌ Error notifying main node change:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Notify all nodes about node going offline
     */
    async notifyNodeOffline(nodeId, nodeType, domainId, clusterId = null, channelId = null) {
        try {
            console.log(`📢 Broadcasting node offline: ${nodeId}`);

            const result = await this.sendMessageToLevel(
                nodeType,
                domainId,
                clusterId,
                channelId,
                'node_offline',
                {
                    nodeId,
                    nodeType,
                    domainId,
                    clusterId,
                    channelId,
                    timestamp: Date.now(),
                    message: `Node ${nodeId} went offline`
                }
            );

            if (result.success) {
                console.log(`✅ Notified ${result.sentCount} nodes about offline node`);
            }

            return result;
        } catch (error) {
            console.error('❌ Error notifying node offline:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Get pending messages for current node
     */
    async getPendingMessages() {
        try {
            if (!this.currentNode) return [];

            const stmt = this.database.prepare(`
                SELECT * FROM node_messages 
                WHERE to_node_id = ? AND status = 'pending'
                ORDER BY created_at ASC
            `);

            return stmt.all(this.currentNode.nodeId);
        } catch (error) {
            console.error('❌ Error getting pending messages:', error);
            return [];
        }
    }

    /**
     * Process pending messages
     */
    async processPendingMessages() {
        try {
            const messages = await this.getPendingMessages();

            for (const message of messages) {
                await this.processMessage(message);
                await this.markMessageProcessed(message.id);
            }

            return {
                success: true,
                processedCount: messages.length
            };
        } catch (error) {
            console.error('❌ Error processing pending messages:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Update current main node info based on heartbeat response
     */
    async updateCurrentMainNodeInfo(nodeType, nodeInfo) {
        try {
            switch (nodeType) {
                case 'domain':
                    await this.DatabaseManager.updateCurrentDomainMainNode({
                        nodeId: nodeInfo.node_id,
                        username: nodeInfo.username,
                        domainId: nodeInfo.domain_id,
                        ipAddress: nodeInfo.ip_address,
                        port: nodeInfo.port,
                        status: nodeInfo.status,
                        lastHeartbeat: nodeInfo.last_heartbeat,
                        priority: nodeInfo.priority,
                        capabilities: nodeInfo.capabilities,
                        metadata: nodeInfo.metadata
                    });
                    break;
                case 'cluster':
                    await this.DatabaseManager.updateCurrentClusterMainNode({
                        nodeId: nodeInfo.node_id,
                        username: nodeInfo.username,
                        domainId: nodeInfo.domain_id,
                        clusterId: nodeInfo.cluster_id,
                        ipAddress: nodeInfo.ip_address,
                        port: nodeInfo.port,
                        status: nodeInfo.status,
                        lastHeartbeat: nodeInfo.last_heartbeat,
                        priority: nodeInfo.priority,
                        capabilities: nodeInfo.capabilities,
                        metadata: nodeInfo.metadata
                    });
                    break;
                case 'channel':
                    await this.DatabaseManager.updateCurrentChannelMainNode({
                        nodeId: nodeInfo.node_id,
                        username: nodeInfo.username,
                        domainId: nodeInfo.domain_id,
                        clusterId: nodeInfo.cluster_id,
                        channelId: nodeInfo.channel_id,
                        ipAddress: nodeInfo.ip_address,
                        port: nodeInfo.port,
                        status: nodeInfo.status,
                        lastHeartbeat: nodeInfo.last_heartbeat,
                        priority: nodeInfo.priority,
                        capabilities: nodeInfo.capabilities,
                        metadata: nodeInfo.metadata
                    });
                    break;
            }
            console.log(`📊 Updated current ${nodeType} main node info: ${nodeInfo.node_id}`);
        } catch (error) {
            console.error(`❌ Error updating current ${nodeType} main node info:`, error);
        }
    }

    /**
     * Get current main node info for a specific level
     */
    async getCurrentMainNodeInfo(nodeType) {
        try {
            switch (nodeType) {
                case 'domain':
                    return await this.DatabaseManager.getCurrentDomainMainNode();
                case 'cluster':
                    return await this.DatabaseManager.getCurrentClusterMainNode();
                case 'channel':
                    return await this.DatabaseManager.getCurrentChannelMainNode();
                default:
                    return null;
            }
        } catch (error) {
            console.error(`❌ Error getting current ${nodeType} main node info:`, error);
            return null;
        }
    }

    /**
     * Clear all current main node info
     */
    async clearAllCurrentMainNodeInfo() {
        try {
            await this.DatabaseManager.clearAllCurrentMainNodeInfo();
            console.log('🧹 Cleared all current main node info');
        } catch (error) {
            console.error('❌ Error clearing current main node info:', error);
        }
    }

    /**
     * Process a single message
     */
    async processMessage(message) {
        try {
            const messageData = JSON.parse(message.message_data);

            switch (message.message_type) {
                case 'main_node_changed':
                    await this.handleMainNodeChanged(messageData);
                    break;
                case 'node_offline':
                    await this.handleNodeOffline(messageData);
                    break;
                case 'heartbeat_request':
                    await this.handleHeartbeatRequest(messageData);
                    break;
                default:
                    console.log(`📨 Received unknown message type: ${message.message_type}`);
            }
        } catch (error) {
            console.error('❌ Error processing message:', error);
        }
    }

    /**
     * Handle main node changed notification
     */
    async handleMainNodeChanged(messageData) {
        console.log(`📢 Received main node change notification:`, messageData);

        // Update local knowledge of main node
        const { nodeType, domainId, clusterId, channelId, newMainNode, oldMainNode } = messageData;

        // Emit event for UI or other components to handle
        this.emit('mainNodeChanged', messageData);

        // Update local main node cache if needed
        if (this.currentNode &&
            this.currentNode.domainId === domainId &&
            this.currentNode.clusterId === clusterId &&
            this.currentNode.channelId === channelId) {

            console.log(`🔄 Updating local main node knowledge: ${oldMainNode} → ${newMainNode}`);
        }
    }

    /**
     * Handle node offline notification
     */
    async handleNodeOffline(messageData) {
        console.log(`📢 Received node offline notification:`, messageData);

        // Emit event for UI or other components to handle
        this.emit('nodeOfflineNotification', messageData);
    }

    /**
     * Handle heartbeat request
     */
    async handleHeartbeatRequest(messageData) {
        console.log(`💓 Received heartbeat request:`, messageData);

        // Send heartbeat response
        if (this.currentNode) {
            await this.sendHeartbeat();
        }
    }

    /**
     * Mark message as processed
     */
    async markMessageProcessed(messageId) {
        try {
            const stmt = this.database.prepare(`
                UPDATE node_messages 
                SET status = 'processed', processed_at = ?
                WHERE id = ?
            `);

            const now = Math.floor(Date.now() / 1000);
            stmt.run(now, messageId);
        } catch (error) {
            console.error('❌ Error marking message as processed:', error);
        }
    }

    /**
     * Get node statistics
     */
    async getNodeStatistics() {
        try {
            const stats = {};

            // Count nodes by type
            for (const nodeType of this.config.nodeTypes) {
                const count = await this.getNodeCount(nodeType);
                stats[nodeType] = count;
            }

            // Count main nodes
            stats.mainNodes = await this.getMainNodeCount();

            // Count offline nodes
            stats.offlineNodes = await this.getOfflineNodeCount();

            return stats;
        } catch (error) {
            console.error('❌ Error getting node statistics:', error);
            return {};
        }
    }

    /**
     * Get node count by type
     */
    async getNodeCount(nodeType) {
        try {
            let stmt;
            switch (nodeType) {
                case 'domain':
                    stmt = this.database.prepare(`SELECT COUNT(*) as count FROM domain_main_nodes`);
                    break;
                case 'cluster':
                    stmt = this.database.prepare(`SELECT COUNT(*) as count FROM cluster_main_nodes`);
                    break;
                case 'channel':
                    stmt = this.database.prepare(`SELECT COUNT(*) as count FROM channel_main_nodes`);
                    break;
                case 'local':
                    stmt = this.database.prepare(`SELECT COUNT(*) as count FROM local_users WHERE node_type = 'local'`);
                    break;
                case 'localUsers':
                    stmt = this.database.prepare(`SELECT COUNT(*) as count FROM local_users`);
                    break;
            }

            const result = stmt ? stmt.get() : { count: 0 };
            return result.count;
        } catch (error) {
            console.error('❌ Error getting node count:', error);
            return 0;
        }
    }

    /**
     * Get main node count
     */
    async getMainNodeCount() {
        try {
            const stmt = this.database.prepare(`
                SELECT 
                    (SELECT COUNT(*) FROM domain_main_nodes WHERE is_main_node = 1) +
                    (SELECT COUNT(*) FROM cluster_main_nodes WHERE is_main_node = 1) +
                    (SELECT COUNT(*) FROM channel_main_nodes WHERE is_main_node = 1) +
                    (SELECT COUNT(*) FROM local_users WHERE is_main_node = 1 AND node_type = 'local') as count
            `);

            const result = stmt.get();
            return result.count;
        } catch (error) {
            console.error('❌ Error getting main node count:', error);
            return 0;
        }
    }

    /**
     * Get offline node count
     */
    async getOfflineNodeCount() {
        try {
            const stmt = this.database.prepare(`
                SELECT COUNT(*) as count FROM node_heartbeats WHERE status = 'offline'
            `);

            const result = stmt.get();
            return result.count;
        } catch (error) {
            console.error('❌ Error getting offline node count:', error);
            return 0;
        }
    }

    /**
     * Register with B-Client (simulate third-party website connection)
     */
    async registerWithBClient() {
        try {
            console.log('🔗 Registering with B-Client...');

            if (!this.currentNode) {
                return { success: false, error: 'No current node available' };
            }

            // Register the current node with B-Client
            const result = await this.apiClient.registerNode(this.currentNode);

            if (result.success) {
                console.log('✅ Successfully registered with B-Client');
                this.emit('registeredWithBClient', this.currentNode);
                return { success: true, message: 'Successfully registered with B-Client' };
            } else {
                console.error('❌ Failed to register with B-Client:', result.error);
                return { success: false, error: result.error };
            }
        } catch (error) {
            console.error('❌ Error registering with B-Client:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Shutdown the distributed node manager
     */
    async shutdown() {
        console.log('🔄 Shutting down Distributed Node Manager...');

        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
            this.heartbeatTimer = null;
        }

        if (this.electionTimer) {
            clearTimeout(this.electionTimer);
            this.electionTimer = null;
        }

        // Mark current node as offline
        if (this.currentNode) {
            await this.updateHeartbeat(this.currentNode.nodeId, { status: 'offline' });
        }

        this.nodeStatus = 'offline';
        this.isMainNode = false;
        this.currentNode = null;

        console.log('✅ Distributed Node Manager shutdown complete');
    }
}

module.exports = DistributedNodeManager;
