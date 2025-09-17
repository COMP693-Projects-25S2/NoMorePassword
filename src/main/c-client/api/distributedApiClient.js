/**
 * Distributed API Client - Handles communication between c-client and b-client
 * Manages node registration, forwarding, and inter-node communication
 */

const axios = require('axios');
const EventEmitter = require('events');

class DistributedApiClient extends EventEmitter {
    constructor(config = {}) {
        super();
        this.config = {
            domainMainNodeUrl: config.domainMainNodeUrl || 'http://localhost:3002',
            bClientApiUrl: config.bClientApiUrl || 'http://localhost:3001', // For forwarding when not registered
            timeout: config.timeout || 10000,
            retryAttempts: config.retryAttempts || 1, // Reduce retry attempts to avoid long delays
            retryDelay: config.retryDelay || 1000,
            ...config
        };

        this.isConnected = false;
        this.connectionTimer = null;
        this.heartbeatTimer = null;

        this.init();
    }

    /**
     * Initialize the API client
     */
    init() {
        console.log('🔧 Initializing Distributed API Client...');
        this.setupEventHandlers();
        this.startConnectionMonitoring();
        console.log('✅ Distributed API Client initialized');
    }

    /**
     * Setup event handlers
     */
    setupEventHandlers() {
        this.on('connected', () => {
            console.log('🔗 Connected to B-Client API');
            this.isConnected = true;
        });

        this.on('disconnected', () => {
            console.log('🔌 Disconnected from B-Client API');
            this.isConnected = false;
        });

        this.on('error', (error) => {
            console.error('❌ API Client error:', error);
        });
    }

    /**
     * Start connection monitoring
     */
    startConnectionMonitoring() {
        this.connectionTimer = setInterval(async () => {
            await this.checkConnection();
        }, 30000); // Check every 30 seconds
    }

    /**
     * Check connection to B-Client
     */
    async checkConnection() {
        try {
            const response = await this.makeRequest('GET', '/health');
            if (response.success && !this.isConnected) {
                this.emit('connected');
            }
        } catch (error) {
            if (this.isConnected) {
                this.emit('disconnected');
            }
        }
    }

    /**
     * Register c-client node with domain main node
     */
    async registerNode(nodeInfo) {
        try {
            console.log('📝 Registering node with Domain Main Node:', nodeInfo.nodeId);

            const response = await this.makeRequest('POST', '/api/nodes/register', {
                nodeType: 'c-client',
                ...nodeInfo
            }, this.config.domainMainNodeUrl);

            if (response.success) {
                console.log('✅ Node registered successfully with Domain Main Node');
                this.emit('nodeRegistered', response.data);
                return response;
            } else {
                throw new Error(response.error || 'Registration failed');
            }
        } catch (error) {
            console.error('❌ Error registering node with Domain Main Node:', error);
            console.log('🔄 Falling back to B-Client for forwarding...');

            // Fallback to B-Client for forwarding
            try {
                const fallbackResponse = await this.makeRequest('POST', '/api/forward', {
                    target: this.config.domainMainNodeUrl,
                    method: 'POST',
                    endpoint: '/api/nodes/register',
                    data: {
                        nodeType: 'c-client',
                        ...nodeInfo
                    }
                }, this.config.bClientApiUrl);

                if (fallbackResponse.success) {
                    console.log('✅ Node registered via B-Client forwarding');
                    this.emit('nodeRegistered', fallbackResponse.data);
                    return fallbackResponse;
                } else {
                    throw new Error(fallbackResponse.error || 'Fallback registration failed');
                }
            } catch (fallbackError) {
                console.error('❌ Error with B-Client fallback:', fallbackError);
                this.emit('error', fallbackError);
                return {
                    success: false,
                    error: fallbackError.message
                };
            }
        }
    }

    /**
     * Forward node information to domain main node
     */
    async forwardToDomainMainNode(domainId, nodeInfo) {
        try {
            console.log('🔄 Forwarding to domain main node:', domainId);

            const response = await this.makeRequest('POST', '/api/forward/domain', {
                domainId,
                nodeInfo
            });

            if (response.success) {
                console.log('✅ Forwarded to domain main node');
                return response;
            } else {
                throw new Error(response.error || 'Forwarding failed');
            }
        } catch (error) {
            console.error('❌ Error forwarding to domain main node:', error);
            this.emit('error', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Forward node information to cluster main node
     */
    async forwardToClusterMainNode(domainId, clusterId, nodeInfo) {
        try {
            console.log('🔄 Forwarding to cluster main node:', clusterId);

            const response = await this.makeRequest('POST', '/api/forward/cluster', {
                domainId,
                clusterId,
                nodeInfo
            });

            if (response.success) {
                console.log('✅ Forwarded to cluster main node');
                return response;
            } else {
                throw new Error(response.error || 'Forwarding failed');
            }
        } catch (error) {
            console.error('❌ Error forwarding to cluster main node:', error);
            this.emit('error', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Forward node information to channel main node
     */
    async forwardToChannelMainNode(domainId, clusterId, channelId, nodeInfo) {
        try {
            console.log('🔄 Forwarding to channel main node:', channelId);

            const response = await this.makeRequest('POST', '/api/forward/channel', {
                domainId,
                clusterId,
                channelId,
                nodeInfo
            });

            if (response.success) {
                console.log('✅ Forwarded to channel main node');
                return response;
            } else {
                throw new Error(response.error || 'Forwarding failed');
            }
        } catch (error) {
            console.error('❌ Error forwarding to channel main node:', error);
            this.emit('error', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Complete node registration in channel
     */
    async completeChannelRegistration(domainId, clusterId, channelId, nodeInfo) {
        try {
            console.log('✅ Completing channel registration:', channelId);

            const response = await this.makeRequest('POST', '/api/register/channel', {
                domainId,
                clusterId,
                channelId,
                nodeInfo
            });

            if (response.success) {
                console.log('✅ Channel registration completed');
                this.emit('channelRegistered', {
                    domainId,
                    clusterId,
                    channelId,
                    nodeInfo
                });
                return response;
            } else {
                throw new Error(response.error || 'Channel registration failed');
            }
        } catch (error) {
            console.error('❌ Error completing channel registration:', error);
            this.emit('error', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Send heartbeat to B-Client
     */
    async sendHeartbeat(nodeId, nodeStatus = 'active', distributedNodeManager = null) {
        try {
            const response = await this.makeRequest('POST', '/api/heartbeat', {
                nodeId,
                status: nodeStatus,
                timestamp: Date.now()
            });

            if (response.success) {
                this.emit('heartbeatSent', nodeId);

                // Update main node info if distributedNodeManager is provided
                if (distributedNodeManager && response.data && response.data.mainNodeInfo) {
                    await this.updateMainNodeInfoFromHeartbeat(distributedNodeManager, response.data.mainNodeInfo);
                }
            }

            return response;
        } catch (error) {
            console.error('❌ Error sending heartbeat:', error);
            this.emit('error', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Update main node info from heartbeat response
     */
    async updateMainNodeInfoFromHeartbeat(distributedNodeManager, mainNodeInfo) {
        try {
            if (mainNodeInfo.domain) {
                await distributedNodeManager.updateCurrentMainNodeInfo('domain', mainNodeInfo.domain);
            }
            if (mainNodeInfo.cluster) {
                await distributedNodeManager.updateCurrentMainNodeInfo('cluster', mainNodeInfo.cluster);
            }
            if (mainNodeInfo.channel) {
                await distributedNodeManager.updateCurrentMainNodeInfo('channel', mainNodeInfo.channel);
            }
        } catch (error) {
            console.error('❌ Error updating main node info from heartbeat:', error);
        }
    }

    /**
     * Get node information from B-Client
     */
    async getNodeInfo(nodeId) {
        try {
            const response = await this.makeRequest('GET', `/api/nodes/${nodeId}`);
            return response;
        } catch (error) {
            console.error('❌ Error getting node info:', error);
            this.emit('error', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Get main node information for a level
     */
    async getMainNodeInfo(nodeType, domainId, clusterId = null, channelId = null) {
        try {
            const params = new URLSearchParams({
                nodeType,
                domainId
            });

            if (clusterId) params.append('clusterId', clusterId);
            if (channelId) params.append('channelId', channelId);

            const response = await this.makeRequest('GET', `/api/main-node?${params.toString()}`);
            return response;
        } catch (error) {
            console.error('❌ Error getting main node info:', error);
            this.emit('error', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Send message to another node through B-Client
     */
    async sendMessage(toNodeId, messageType, messageData) {
        try {
            const response = await this.makeRequest('POST', '/api/messages/send', {
                toNodeId,
                messageType,
                messageData,
                timestamp: Date.now()
            });

            if (response.success) {
                this.emit('messageSent', { toNodeId, messageType });
            }

            return response;
        } catch (error) {
            console.error('❌ Error sending message:', error);
            this.emit('error', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Get pending messages for current node
     */
    async getPendingMessages(nodeId) {
        try {
            const response = await this.makeRequest('GET', `/api/messages/pending/${nodeId}`);
            return response;
        } catch (error) {
            console.error('❌ Error getting pending messages:', error);
            this.emit('error', error);
            return {
                success: false,
                error: error.message,
                data: []
            };
        }
    }

    /**
     * Mark message as processed
     */
    async markMessageProcessed(messageId) {
        try {
            const response = await this.makeRequest('POST', `/api/messages/${messageId}/processed`);
            return response;
        } catch (error) {
            console.error('❌ Error marking message as processed:', error);
            this.emit('error', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Get domain nodes from B-Client
     * @returns {Promise<Object>} Domain nodes data
     */
    async getDomainNodes() {
        try {
            const response = await this.makeRequest('GET', '/api/domain-nodes');

            if (response.success) {
                console.log('📡 Retrieved domain nodes from B-Client:', response.data);
                this.emit('domainNodesRetrieved', response.data);
            }

            return response;
        } catch (error) {
            console.error('❌ Error getting domain nodes:', error);
            this.emit('error', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Get distributed system statistics
     */
    async getSystemStatistics() {
        try {
            const response = await this.makeRequest('GET', '/api/statistics');
            return response;
        } catch (error) {
            console.error('❌ Error getting system statistics:', error);
            this.emit('error', error);
            return {
                success: false,
                error: error.message,
                data: {}
            };
        }
    }

    /**
     * Start heartbeat monitoring
     */
    startHeartbeat(nodeId, distributedNodeManager = null) {
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
        }

        this.distributedNodeManager = distributedNodeManager;

        this.heartbeatTimer = setInterval(async () => {
            if (this.isConnected) {
                await this.sendHeartbeat(nodeId, 'active', this.distributedNodeManager);
            }
        }, 30000); // Send heartbeat every 30 seconds

        console.log('💓 Heartbeat monitoring started');
    }

    /**
     * Stop heartbeat monitoring
     */
    stopHeartbeat() {
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
            this.heartbeatTimer = null;
        }
        console.log('💓 Heartbeat monitoring stopped');
    }

    /**
     * Make HTTP request with retry logic
     */
    async makeRequest(method, endpoint, data = null, targetUrl = null) {
        const baseUrl = targetUrl || this.config.domainMainNodeUrl;
        const url = `${baseUrl}${endpoint}`;
        let lastError;

        for (let attempt = 1; attempt <= this.config.retryAttempts; attempt++) {
            try {
                const config = {
                    method,
                    url,
                    timeout: this.config.timeout,
                    headers: {
                        'Content-Type': 'application/json',
                        'User-Agent': 'C-Client-Distributed-API/1.0'
                    }
                };

                if (data) {
                    config.data = data;
                }

                const response = await axios(config);
                return {
                    success: true,
                    data: response.data,
                    status: response.status
                };
            } catch (error) {
                lastError = error;
                console.warn(`⚠️ Request attempt ${attempt} failed:`, error.message);

                if (attempt < this.config.retryAttempts) {
                    await this.delay(this.config.retryDelay * attempt);
                }
            }
        }

        throw lastError;
    }

    /**
     * Delay utility
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Shutdown the API client
     */
    async shutdown() {
        console.log('🔄 Shutting down Distributed API Client...');

        if (this.connectionTimer) {
            clearInterval(this.connectionTimer);
            this.connectionTimer = null;
        }

        this.stopHeartbeat();
        this.isConnected = false;

        console.log('✅ Distributed API Client shutdown complete');
    }
}

module.exports = DistributedApiClient;
