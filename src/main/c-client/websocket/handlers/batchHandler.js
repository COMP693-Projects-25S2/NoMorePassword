/**
 * BatchHandler
 * Batch operations and user activities forwarding
 */

const { getDataSyncLogger } = require('../../utils/logger');

class BatchHandler {
    constructor(client) {
        this.client = client;
        this.logger = client.logger;
        // Use dedicated data sync logger for sync-related operations
        this.dataSyncLogger = getDataSyncLogger('batch_handler');
    }

    /**
     * Handle user activities batch forward from B-Client
     */
    handleUserActivitiesBatchForward(message) {
        try {
            // Log to both regular logger and data sync logger
            this.logger.info('📦 [WebSocket Client] ===== RECEIVED USER ACTIVITIES BATCH FORWARD =====');
            this.logger.info('📦 [WebSocket Client] Raw message:', JSON.stringify(message, null, 2));
            this.dataSyncLogger.info('📦 [Data Sync] ===== RECEIVED USER ACTIVITIES BATCH FORWARD =====');
            this.dataSyncLogger.info('📦 [Data Sync] Raw message:', JSON.stringify(message, null, 2));

            // Step 1: Check message structure
            this.logger.info('📦 [WebSocket Client] ===== STEP 1: MESSAGE STRUCTURE CHECK =====');
            this.logger.info(`📦 [WebSocket Client] Message type: ${message.type}`);
            this.logger.info(`📦 [WebSocket Client] Message has data: ${!!message.data}`);
            this.dataSyncLogger.info('📦 [Data Sync] ===== STEP 1: MESSAGE STRUCTURE CHECK =====');
            this.dataSyncLogger.info(`📦 [Data Sync] Message type: ${message.type}`);
            this.dataSyncLogger.info(`📦 [Data Sync] Message has data: ${!!message.data}`);

            const batchData = message.data;
            if (!batchData) {
                this.dataSyncLogger.error('❌ [WebSocket Client] No batch data in message');
                return;
            }

            // Step 2: Check batchData structure
            this.dataSyncLogger.info('📦 [WebSocket Client] ===== STEP 2: BATCH DATA STRUCTURE CHECK =====');
            this.dataSyncLogger.info(`📦 [WebSocket Client] Batch data keys: ${Object.keys(batchData)}`);
            this.dataSyncLogger.info(`📦 [WebSocket Client] user_id: ${batchData.user_id}`);
            this.dataSyncLogger.info(`📦 [WebSocket Client] batch_id: ${batchData.batch_id}`);
            this.dataSyncLogger.info(`📦 [WebSocket Client] sync_data type: ${Array.isArray(batchData.sync_data) ? 'Array' : typeof batchData.sync_data}`);
            this.dataSyncLogger.info(`📦 [WebSocket Client] sync_data length: ${batchData.sync_data ? batchData.sync_data.length : 'undefined'}`);

            // Step 3: Check sync_data content
            if (batchData.sync_data && Array.isArray(batchData.sync_data)) {
                this.dataSyncLogger.info('📦 [WebSocket Client] ===== STEP 3: SYNC_DATA CONTENT CHECK =====');
                this.dataSyncLogger.info(`📦 [WebSocket Client] First activity keys: ${batchData.sync_data[0] ? Object.keys(batchData.sync_data[0]) : 'N/A'}`);
                if (batchData.sync_data[0]) {
                    this.dataSyncLogger.info(`📦 [WebSocket Client] First activity sample:`, JSON.stringify(batchData.sync_data[0], null, 2));
                }

                // Log each received activity in detail
                this.dataSyncLogger.info('📋 [WebSocket Client] ===== RECEIVED ACTIVITIES FROM B-CLIENT =====');
                batchData.sync_data.forEach((activity, index) => {
                    this.dataSyncLogger.info(`📋 [WebSocket Client] Activity ${index + 1}:`);
                    this.dataSyncLogger.info(`   ID: ${activity.id}`);
                    this.dataSyncLogger.info(`   User ID: ${activity.user_id}`);
                    this.dataSyncLogger.info(`   Username: ${activity.username}`);
                    this.dataSyncLogger.info(`   URL: ${activity.url}`);
                    this.dataSyncLogger.info(`   Title: ${activity.title}`);
                    this.dataSyncLogger.info(`   Activity Type: ${activity.activity_type}`);
                    this.dataSyncLogger.info(`   Description: ${activity.description ? activity.description.substring(0, 50) + '...' : 'N/A'}`);
                    this.dataSyncLogger.info(`   Duration: ${activity.duration}ms`);
                    this.dataSyncLogger.info(`   Created At: ${activity.created_at}`);
                });
                this.dataSyncLogger.info('📋 [WebSocket Client] ===== END RECEIVED ACTIVITIES FROM B-CLIENT =====');
            } else {
                this.dataSyncLogger.error('❌ [WebSocket Client] sync_data is not an array or is missing');
                return;
            }

            // Step 4: Check SyncManager availability
            this.dataSyncLogger.info('📦 [WebSocket Client] ===== STEP 4: SYNC MANAGER AVAILABILITY CHECK =====');
            this.dataSyncLogger.info(`📦 [WebSocket Client] mainWindow exists: ${!!this.client.mainWindow}`);

            try {
                if (this.client.mainWindow) {
                    try {
                        this.dataSyncLogger.info(`📦 [WebSocket Client] mainWindow destroyed: ${this.client.mainWindow.isDestroyed()}`);
                    } catch (destroyedError) {
                        this.dataSyncLogger.warn('⚠️ [WebSocket Client] Error checking mainWindow.isDestroyed():', destroyedError.message);
                    }

                    try {
                        this.dataSyncLogger.info(`📦 [WebSocket Client] syncManager exists: ${!!this.client.mainWindow.syncManager}`);
                    } catch (syncManagerError) {
                        this.dataSyncLogger.warn('⚠️ [WebSocket Client] Error checking syncManager exists:', syncManagerError.message);
                    }

                    if (this.client.mainWindow.syncManager) {
                        try {
                            this.dataSyncLogger.info(`📦 [WebSocket Client] syncManager methods: ${Object.getOwnPropertyNames(Object.getPrototypeOf(this.client.mainWindow.syncManager))}`);
                        } catch (methodsError) {
                            this.dataSyncLogger.warn('⚠️ [WebSocket Client] Error getting syncManager methods:', methodsError.message);
                        }
                    } else {
                        this.dataSyncLogger.warn('⚠️ [WebSocket Client] SyncManager is null or undefined');
                    }
                } else {
                    this.dataSyncLogger.warn('⚠️ [WebSocket Client] mainWindow is null or undefined');
                }
            } catch (checkError) {
                this.dataSyncLogger.error('❌ [WebSocket Client] Error during SyncManager availability check:', checkError);
            }

            // Forward to SyncManager if available
            if (this.client.mainWindow && this.client.mainWindow.syncManager) {
                this.dataSyncLogger.info('📦 [WebSocket Client] ===== STEP 5: FORWARDING TO SYNC MANAGER =====');
                this.dataSyncLogger.info('📦 [WebSocket Client] Forwarding to SyncManager...');

                try {
                    const result = this.client.mainWindow.syncManager.handleIncomingActivities(batchData);
                    this.dataSyncLogger.info(`📦 [WebSocket Client] handleIncomingActivities returned: ${typeof result}`);

                    if (result && typeof result.then === 'function') {
                        result.then(() => {
                            this.dataSyncLogger.info('✅ [WebSocket Client] Successfully processed incoming activities batch');
                        }).catch((error) => {
                            this.dataSyncLogger.error('❌ [WebSocket Client] Error processing incoming activities batch:', error);
                        });
                    } else {
                        this.dataSyncLogger.info('✅ [WebSocket Client] SyncManager processing completed synchronously');
                    }
                } catch (syncError) {
                    this.dataSyncLogger.error('❌ [WebSocket Client] Error calling handleIncomingActivities:', syncError);
                }
            } else {
                this.dataSyncLogger.warn('⚠️ [WebSocket Client] SyncManager not available, cannot process incoming activities batch');
            }

            this.dataSyncLogger.info('📦 [WebSocket Client] ===== END USER ACTIVITIES BATCH FORWARD =====');
        } catch (error) {
            this.dataSyncLogger.error('❌ [WebSocket Client] Error handling user activities batch forward:', error);
        }
    }

    /**
     * Handle feedback from B-client about batch processing
     */
    handleUserActivitiesBatchFeedback(message) {
        try {
            this.logger.info('📨 [WebSocket Client] ===== RECEIVED BATCH FEEDBACK =====');
            this.logger.info('📨 [WebSocket Client] Message:', JSON.stringify(message, null, 2));

            const feedbackData = message.data;
            if (!feedbackData) {
                this.logger.error('❌ [WebSocket Client] No feedback data in message');
                return;
            }

            const batchId = feedbackData.batch_id;
            const success = feedbackData.success;
            const feedbackMessage = feedbackData.message;

            this.logger.info(`📨 [WebSocket Client] Batch ${batchId}: ${success ? 'success' : 'failed'} - ${feedbackMessage}`);

            // Forward to SyncManager if available
            if (this.client.mainWindow && this.client.mainWindow.syncManager) {
                this.logger.info('📨 [WebSocket Client] Forwarding feedback to SyncManager...');
                this.client.mainWindow.syncManager.handleBatchFeedback(batchId, success, feedbackMessage);
            } else {
                this.logger.warn('⚠️ [WebSocket Client] SyncManager not available, cannot process batch feedback');
            }

            this.logger.info('📨 [WebSocket Client] ===== END BATCH FEEDBACK =====');
        } catch (error) {
            this.logger.error('❌ [WebSocket Client] Error handling batch feedback:', error);
        }
    }

}

module.exports = BatchHandler;
