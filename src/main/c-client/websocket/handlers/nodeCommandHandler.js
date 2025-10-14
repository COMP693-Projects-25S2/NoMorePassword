/**
 * NodeCommandHandler
 * NodeManager command processing
 */

class NodeCommandHandler {
    constructor(client) {
        this.client = client;
        this.logger = client.logger;
    }

    /**
     * Handle NodeManager commands from B-Client
     */
    async handleNodeManagerCommand(message) {
        this.logger.info('='.repeat(80));
        this.logger.info(`🔧 [WebSocket Client] handleNodeManagerCommand() CALLED`);
        this.logger.info(`📋 Command type: ${message.type}`);
        this.logger.info(`📋 Command data:`, message.data);
        this.logger.info(`📋 Request ID: ${message.request_id}`);

        try {
            // Get NodeManager instance
            const NodeManager = require('../../nodeManager/nodeManager');

            // Check if nodeManager is available in electronApp
            if (!this.client.electronApp || !this.client.electronApp.nodeManager) {
                this.logger.error('❌ [WebSocket Client] NodeManager not available in electronApp');

                // Send error response
                this.client.sendMessage({
                    success: false,
                    error: 'NodeManager not initialized',
                    request_id: message.request_id
                });
                return;
            }

            const nodeManager = this.client.electronApp.nodeManager;
            this.logger.info('✅ [WebSocket Client] NodeManager found');

            let result = null;

            // Handle different command types
            switch (message.type) {
                case 'new_domain_node':
                    this.logger.info('🏗️ [WebSocket Client] Calling nodeManager.newDomainNode()...');
                    result = await nodeManager.newDomainNode();
                    break;

                case 'new_cluster_node':
                    this.logger.info('🏗️ [WebSocket Client] Calling nodeManager.newClusterNode()...');
                    result = await nodeManager.newClusterNode(message.data.domain_id);
                    break;

                case 'new_channel_node':
                    this.logger.info('🏗️ [WebSocket Client] Calling nodeManager.newChannelNode()...');
                    result = await nodeManager.newChannelNode(
                        message.data.domain_id,
                        message.data.cluster_id
                    );
                    break;

                case 'assign_to_domain':
                    this.logger.info('📍 [WebSocket Client] Calling nodeManager.assignToDomain()...');
                    result = await nodeManager.assignToDomain(
                        message.data.domain_id,
                        message.data.node_id
                    );
                    break;

                case 'assign_to_cluster':
                    this.logger.info('📍 [WebSocket Client] Calling nodeManager.assignToCluster()...');
                    result = await nodeManager.assignToCluster(
                        message.data.cluster_id,
                        message.data.node_id,
                        message.data.domain_id
                    );
                    break;

                case 'assign_to_channel':
                    this.logger.info('📍 [WebSocket Client] Calling nodeManager.assignToChannel()...');
                    result = await nodeManager.assignToChannel(
                        message.data.channel_id,
                        message.data.node_id,
                        message.data.domain_id,
                        message.data.cluster_id
                    );
                    break;

                case 'add_new_node_to_peers':
                    this.logger.info('👥 [WebSocket Client] Calling nodeManager.addNewNodeToPeers()...');
                    result = await nodeManager.addNewNodeToPeers(
                        message.data.domain_id,
                        message.data.cluster_id,
                        message.data.channel_id,
                        message.data.node_id
                    );
                    break;

                case 'add_new_channel_to_peers':
                    this.logger.info('👥 [WebSocket Client] Calling nodeManager.addNewChannelToPeers()...');
                    result = await nodeManager.addNewChannelToPeers(
                        message.data.domain_id,
                        message.data.cluster_id,
                        message.data.channel_id,
                        message.data.node_id
                    );
                    break;

                case 'add_new_cluster_to_peers':
                    this.logger.info('👥 [WebSocket Client] Calling nodeManager.addNewClusterToPeers()...');
                    result = await nodeManager.addNewClusterToPeers(
                        message.data.domain_id,
                        message.data.cluster_id,
                        message.data.node_id
                    );
                    break;

                case 'add_new_domain_to_peers':
                    this.logger.info('👥 [WebSocket Client] Calling nodeManager.addNewDomainToPeers()...');
                    result = await nodeManager.addNewDomainToPeers(
                        message.data.domain_id,
                        message.data.node_id
                    );
                    break;

                case 'count_peers_amount':
                    this.logger.info('📊 [WebSocket Client] Calling nodeManager.countPeersAmount()...');
                    result = await nodeManager.countPeersAmount(
                        message.data.domain_id,
                        message.data.cluster_id,
                        message.data.channel_id
                    );
                    break;

                default:
                    this.logger.warn(`[WebSocket Client] Unhandled NodeManager command: ${message.type}`);
                    result = {
                        success: false,
                        error: `Unknown command type: ${message.type}`
                    };
            }

            this.logger.info(`[WebSocket Client] NodeManager command completed:`, result);

            // Send response back to B-Client
            const response = {
                success: result.success,
                data: result,
                request_id: message.request_id,
                command_type: message.type
            };

            this.logger.info(`📤 [WebSocket Client] Sending response to B-Client:`, response);
            this.client.sendMessage(response);
            this.logger.info('='.repeat(80));

        } catch (error) {
            this.logger.error('❌ [WebSocket Client] Error handling NodeManager command:', error);
            this.logger.error(error.stack);

            // Send error response
            this.client.sendMessage({
                success: false,
                error: error.message,
                request_id: message.request_id
            });
            this.logger.info('='.repeat(80));
        }
    }

}

module.exports = NodeCommandHandler;
