/**
 * WebSocket Message Router
 * Routes incoming messages to appropriate handlers
 */

const WebSocket = require('ws');

class MessageRouter {
    constructor(client) {
        this.client = client;
        this.logger = client.logger;
    }

    /**
     * Handle incoming message (entry point)
     */
    handleIncomingMessage(message) {
        this.route(message);
    }

    /**
     * Route incoming message to appropriate handler
     */
    route(message) {
        const { type } = message;

        switch (type) {
            // Registration messages
            case 'registration_success':
                this.handleRegistrationSuccess(message);
                break;

            case 'registration_rejected':
                this.handleRegistrationRejected(message);
                break;

            // User connection messages
            case 'user_connected_on_another_node':
                this.client.handleUserConnectedOnAnotherNode(message);
                break;

            case 'user_connected_on_another_client':
                this.client.handleUserConnectedOnAnotherClient(message);
                break;

            // Authentication and session messages
            case 'auto_login':
                this.client.handleAutoLogin(message);
                break;

            case 'session_sync':
                this.client.handleSessionSync(message);
                break;

            case 'user_logout_notification':
                this.client.handleUserLogoutNotification(message);
                break;

            case 'user_logout':
                this.client.handleUserLogout(message);
                break;

            case 'logout_for_website':
                this.client.handleLogoutForWebsite(message);
                break;

            // Cookie messages
            case 'cookie_query':
                this.client.handleCookieQuery(message);
                break;

            case 'cookie_update':
                this.client.handleCookieUpdate(message);
                break;

            // NodeManager commands
            case 'new_domain_node':
            case 'new_cluster_node':
            case 'new_channel_node':
            case 'assign_to_domain':
            case 'assign_to_cluster':
            case 'assign_to_channel':
            case 'add_new_node_to_peers':
            case 'add_new_channel_to_peers':
            case 'add_new_cluster_to_peers':
            case 'add_new_domain_to_peers':
            case 'count_peers_amount':
                this.logger.info(`🔧 [WebSocket Client] Received NodeManager command: ${type}`);
                this.client.handleNodeManagerCommand(message);
                break;

            // Batch handling
            case 'user_activities_batch_forward':
                this.client.handleUserActivitiesBatchForward(message);
                break;

            case 'user_activities_batch_feedback':
                this.client.handleUserActivitiesBatchFeedback(message);
                break;

            // Cluster verification
            case 'cluster_verification_query':
                this.client.handleClusterVerificationQuery(message);
                break;

            case 'cluster_verification_request':
                this.client.handleClusterVerificationRequest(message);
                break;

            // Security code
            case 'security_code_response':
                this.client.handleSecurityCodeResponse(message);
                break;

            case 'new_device_login':
                this.client.handleNewDeviceLogin(message);
                break;

            // Error messages
            case 'error':
                this.logger.error('[WebSocket Client] Received error:', message.message);
                break;

            default:
                this.logger.info('[WebSocket Client] Unknown message type:', type);
        }
    }

    /**
     * Handle registration success
     */
    handleRegistrationSuccess(message) {
        this.logger.info('✅ [WebSocket Client] Registration successful');
        this.logger.info(`   Client ID: ${message.client_id || 'N/A'}`);
        this.logger.info(`   User ID: ${message.user_id || 'N/A'}`);
        this.logger.info(`   Username: ${message.username || 'N/A'}`);
        this.client.isRegistered = true;

        // Check if this is a new device login
        if (message.is_new_device_login) {
            // Use dedicated security code logger
            const { getCClientLogger } = require('../../utils/logger');
            const securityLogger = getCClientLogger('security_code');

            securityLogger.info('🔐 [WebSocket Client] ===== NEW DEVICE LOGIN REGISTRATION SUCCESS RECEIVED =====');
            securityLogger.info('🔐 [WebSocket Client] Received registration_success with is_new_device_login flag');
            securityLogger.info('🔐 [WebSocket Client] Message details:');
            securityLogger.info(`🔐 [WebSocket Client]   - client_id: ${message.client_id}`);
            securityLogger.info(`🔐 [WebSocket Client]   - user_id: ${message.user_id}`);
            securityLogger.info(`🔐 [WebSocket Client]   - username: ${message.username}`);
            securityLogger.info(`🔐 [WebSocket Client]   - node_id: ${message.node_id}`);
            securityLogger.info(`🔐 [WebSocket Client]   - domain_id: ${message.domain_id}`);
            securityLogger.info(`🔐 [WebSocket Client]   - cluster_id: ${message.cluster_id}`);
            securityLogger.info(`🔐 [WebSocket Client]   - channel_id: ${message.channel_id}`);
            securityLogger.info(`🔐 [WebSocket Client]   - domain_main_node_id: ${message.domain_main_node_id}`);
            securityLogger.info(`🔐 [WebSocket Client]   - cluster_main_node_id: ${message.cluster_main_node_id}`);
            securityLogger.info(`🔐 [WebSocket Client]   - channel_main_node_id: ${message.channel_main_node_id}`);
            securityLogger.info('🔐 [WebSocket Client] Calling handleNewDeviceLogin...');

            // Handle new device login
            this.client.handleNewDeviceLogin(message);
        }
    }

    /**
     * Handle registration rejected
     */
    handleRegistrationRejected(message) {
        this.logger.info('❌ [WebSocket Client] Registration rejected');
        this.logger.info(`   Reason: ${message.reason || 'Unknown'}`);
        this.logger.info(`   Message: ${message.message || 'No message provided'}`);
        this.logger.info(`   User ID: ${message.user_id || 'N/A'}`);
        this.logger.info(`   Username: ${message.username || 'N/A'}`);
    }

    /**
     * Send message to server
     */
    sendMessage(message) {
        return new Promise((resolve, reject) => {
            if (this.client.websocket && this.client.isConnected) {
                if (this.client.websocket.readyState === WebSocket.OPEN) {
                    try {
                        this.client.websocket.send(JSON.stringify(message));
                        resolve();
                    } catch (error) {
                        this.logger.error(`[WebSocket Client] Error sending message:`, error);
                        reject(error);
                    }
                } else {
                    const error = new Error(`WebSocket not ready. State: ${this.client.websocket.readyState} (${this.client.getReadyStateName(this.client.websocket.readyState)})`);
                    this.logger.warn(`[WebSocket Client] Cannot send message - ${error.message}`);
                    reject(error);
                }
            } else {
                const error = new Error('WebSocket not connected');
                this.logger.warn('[WebSocket Client] Cannot send message - not connected');
                reject(error);
            }
        });
    }
}

module.exports = MessageRouter;

