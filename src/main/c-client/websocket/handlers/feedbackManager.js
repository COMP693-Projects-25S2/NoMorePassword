/**
 * FeedbackManager
 * Feedback sending and response management
 */

const { getDataSyncLogger } = require('../../utils/logger');

class FeedbackManager {
    constructor(client) {
        this.client = client;
        this.logger = client.logger;
        this.dataSyncLogger = getDataSyncLogger('feedback_manager');
    }

    /**
     * Send session feedback to B-Client
     */
    sendSessionFeedback(originalMessage, success, message) {
        try {
            this.logger.info('📤 [WebSocket Client] Sending session feedback to B-Client');
            this.logger.info(`   Success: ${success}`);
            this.logger.info(`   Message: ${message}`);
            this.dataSyncLogger.info('📤 [Data Sync] Sending session feedback to B-Client');
            this.dataSyncLogger.info(`   Success: ${success}`);
            this.dataSyncLogger.info(`   Message: ${message}`);
            this.dataSyncLogger.info(`   User ID: ${originalMessage.user_id}`);

            const feedbackMessage = {
                type: 'session_feedback',
                user_id: originalMessage.user_id,
                username: originalMessage.username,
                success: success,
                message: message,
                timestamp: new Date().toISOString()
            };

            this.client.sendMessage(feedbackMessage);
            this.logger.info('✅ [WebSocket Client] Session feedback sent successfully');

        } catch (error) {
            this.logger.error('❌ [WebSocket Client] Error sending session feedback:', error);
        }
    }

    /**
     * Send logout feedback to B-Client
     */
    sendLogoutFeedback(originalMessage, success, message) {
        try {
            this.logger.info('📤 [WebSocket Client] Sending IMMEDIATE logout feedback to B-Client');
            this.logger.info(`   Success: ${success}`);
            this.logger.info(`   Message: ${message}`);
            this.logger.info(`   User ID: ${originalMessage.user_id}`);
            this.dataSyncLogger.info('📤 [Data Sync] Sending IMMEDIATE logout feedback to B-Client');
            this.dataSyncLogger.info(`   Success: ${success}`);
            this.dataSyncLogger.info(`   Message: ${message}`);
            this.dataSyncLogger.info(`   User ID: ${originalMessage.user_id}`);

            const feedbackMessage = {
                type: 'logout_feedback',
                user_id: originalMessage.user_id,
                username: originalMessage.username,
                success: success,
                message: message,
                timestamp: new Date().toISOString(),
                immediate: true,  // Flag for immediate processing
                client_id: this.client.clientId || 'unknown'  // Add client ID for tracking
            };

            // Send immediately without any delays (catch errors to prevent unhandled rejection)
            this.client.sendMessage(feedbackMessage)
                .then(() => {
                    this.logger.info('✅ [WebSocket Client] IMMEDIATE logout feedback sent successfully');
                    this.logger.info(`   Client ID: ${this.client.clientId || 'unknown'}`);
                    this.logger.info(`   User ID: ${originalMessage.user_id}`);
                })
                .catch((error) => {
                    this.logger.warn('⚠️ [WebSocket Client] Cannot send logout feedback (connection may be closed):', error.message);
                });

        } catch (error) {
            this.logger.error('❌ [WebSocket Client] Error sending immediate logout feedback:', error);
            this.logger.error('❌ [WebSocket Client] Error details:', error.stack);
        }
    }

}

module.exports = FeedbackManager;
