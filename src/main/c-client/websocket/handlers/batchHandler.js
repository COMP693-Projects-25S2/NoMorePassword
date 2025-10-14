/**
 * BatchHandler
 * Batch operations and user activities forwarding
 */

class BatchHandler {
    constructor(client) {
        this.client = client;
        this.logger = client.logger;
        // Use syncLogger if available for sync-related operations
        this.syncLogger = client.syncLogger || client.logger;
    }

    /**
     * Handle user activities batch forward from B-Client
     */
    handleUserActivitiesBatchForward(message) {
        try {
            this.syncLogger.info('📦 [WebSocket Client] ===== RECEIVED USER ACTIVITIES BATCH FORWARD =====');
            this.syncLogger.info('📦 [WebSocket Client] Raw message:', JSON.stringify(message, null, 2));

            // Step 1: Check message structure
            this.syncLogger.info('📦 [WebSocket Client] ===== STEP 1: MESSAGE STRUCTURE CHECK =====');
            this.syncLogger.info(`📦 [WebSocket Client] Message type: ${message.type}`);
            this.syncLogger.info(`📦 [WebSocket Client] Message has data: ${!!message.data}`);

            const batchData = message.data;
            if (!batchData) {
                this.syncLogger.error('❌ [WebSocket Client] No batch data in message');
                return;
            }

            // Step 2: Check batchData structure
            this.syncLogger.info('📦 [WebSocket Client] ===== STEP 2: BATCH DATA STRUCTURE CHECK =====');
            this.syncLogger.info(`📦 [WebSocket Client] Batch data keys: ${Object.keys(batchData)}`);
            this.syncLogger.info(`📦 [WebSocket Client] user_id: ${batchData.user_id}`);
            this.syncLogger.info(`📦 [WebSocket Client] batch_id: ${batchData.batch_id}`);
            this.syncLogger.info(`📦 [WebSocket Client] sync_data type: ${Array.isArray(batchData.sync_data) ? 'Array' : typeof batchData.sync_data}`);
            this.syncLogger.info(`📦 [WebSocket Client] sync_data length: ${batchData.sync_data ? batchData.sync_data.length : 'undefined'}`);

            // Step 3: Check sync_data content
            if (batchData.sync_data && Array.isArray(batchData.sync_data)) {
                this.syncLogger.info('📦 [WebSocket Client] ===== STEP 3: SYNC_DATA CONTENT CHECK =====');
                this.syncLogger.info(`📦 [WebSocket Client] First activity keys: ${batchData.sync_data[0] ? Object.keys(batchData.sync_data[0]) : 'N/A'}`);
                if (batchData.sync_data[0]) {
                    this.syncLogger.info(`📦 [WebSocket Client] First activity sample:`, JSON.stringify(batchData.sync_data[0], null, 2));
                }

                // Log each received activity in detail
                this.syncLogger.info('📋 [WebSocket Client] ===== RECEIVED ACTIVITIES FROM B-CLIENT =====');
                batchData.sync_data.forEach((activity, index) => {
                    this.syncLogger.info(`📋 [WebSocket Client] Activity ${index + 1}:`);
                    this.syncLogger.info(`   ID: ${activity.id}`);
                    this.syncLogger.info(`   User ID: ${activity.user_id}`);
                    this.syncLogger.info(`   Username: ${activity.username}`);
                    this.syncLogger.info(`   URL: ${activity.url}`);
                    this.syncLogger.info(`   Title: ${activity.title}`);
                    this.syncLogger.info(`   Activity Type: ${activity.activity_type}`);
                    this.syncLogger.info(`   Description: ${activity.description ? activity.description.substring(0, 50) + '...' : 'N/A'}`);
                    this.syncLogger.info(`   Duration: ${activity.duration}ms`);
                    this.syncLogger.info(`   Created At: ${activity.created_at}`);
                });
                this.syncLogger.info('📋 [WebSocket Client] ===== END RECEIVED ACTIVITIES FROM B-CLIENT =====');
            } else {
                this.syncLogger.error('❌ [WebSocket Client] sync_data is not an array or is missing');
                return;
            }

            // Step 4: Check SyncManager availability
            this.syncLogger.info('📦 [WebSocket Client] ===== STEP 4: SYNC MANAGER AVAILABILITY CHECK =====');
            this.syncLogger.info(`📦 [WebSocket Client] mainWindow exists: ${!!this.client.mainWindow}`);

            try {
                if (this.client.mainWindow) {
                    try {
                        this.syncLogger.info(`📦 [WebSocket Client] mainWindow destroyed: ${this.client.mainWindow.isDestroyed()}`);
                    } catch (destroyedError) {
                        this.syncLogger.warn('⚠️ [WebSocket Client] Error checking mainWindow.isDestroyed():', destroyedError.message);
                    }

                    try {
                        this.syncLogger.info(`📦 [WebSocket Client] syncManager exists: ${!!this.client.mainWindow.syncManager}`);
                    } catch (syncManagerError) {
                        this.syncLogger.warn('⚠️ [WebSocket Client] Error checking syncManager exists:', syncManagerError.message);
                    }

                    if (this.client.mainWindow.syncManager) {
                        try {
                            this.syncLogger.info(`📦 [WebSocket Client] syncManager methods: ${Object.getOwnPropertyNames(Object.getPrototypeOf(this.client.mainWindow.syncManager))}`);
                        } catch (methodsError) {
                            this.syncLogger.warn('⚠️ [WebSocket Client] Error getting syncManager methods:', methodsError.message);
                        }
                    } else {
                        this.syncLogger.warn('⚠️ [WebSocket Client] SyncManager is null or undefined');
                    }
                } else {
                    this.syncLogger.warn('⚠️ [WebSocket Client] mainWindow is null or undefined');
                }
            } catch (checkError) {
                this.syncLogger.error('❌ [WebSocket Client] Error during SyncManager availability check:', checkError);
            }

            // Forward to SyncManager if available
            if (this.client.mainWindow && this.client.mainWindow.syncManager) {
                this.syncLogger.info('📦 [WebSocket Client] ===== STEP 5: FORWARDING TO SYNC MANAGER =====');
                this.syncLogger.info('📦 [WebSocket Client] Forwarding to SyncManager...');

                try {
                    const result = this.client.mainWindow.syncManager.handleIncomingActivities(batchData);
                    this.syncLogger.info(`📦 [WebSocket Client] handleIncomingActivities returned: ${typeof result}`);

                    if (result && typeof result.then === 'function') {
                        result.then(() => {
                            this.syncLogger.info('✅ [WebSocket Client] Successfully processed incoming activities batch');
                        }).catch((error) => {
                            this.syncLogger.error('❌ [WebSocket Client] Error processing incoming activities batch:', error);
                        });
                    } else {
                        this.syncLogger.info('✅ [WebSocket Client] SyncManager processing completed synchronously');
                    }
                } catch (syncError) {
                    this.syncLogger.error('❌ [WebSocket Client] Error calling handleIncomingActivities:', syncError);
                }
            } else {
                this.syncLogger.warn('⚠️ [WebSocket Client] SyncManager not available, cannot process incoming activities batch');
            }

            this.syncLogger.info('📦 [WebSocket Client] ===== END USER ACTIVITIES BATCH FORWARD =====');
        } catch (error) {
            this.syncLogger.error('❌ [WebSocket Client] Error handling user activities batch forward:', error);
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
