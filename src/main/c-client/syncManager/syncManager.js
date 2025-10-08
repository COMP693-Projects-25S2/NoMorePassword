/**
 * C-Client Sync Manager
 * Manages user activity history synchronization between C-clients
 */

const { v4: uuidv4 } = require('uuid');
const { getCClientLogger } = require('../utils/logger');

class SyncManager {
    constructor(mainWindow, database) {
        this.mainWindow = mainWindow;
        this.database = database;
        this.logger = getCClientLogger('syncManager');
        this.syncInterval = null;
        this.syncIntervalMs = 5 * 60 * 1000; // 5 minutes
        this.currentUserId = null;
        this.pendingBatches = new Map(); // batch_id -> { data, timestamp }

        this.logger.info('SyncManager initialized');
    }

    /**
     * Start synchronization process for current user
     * @param {string} userId - Current user ID
     */
    startSync(userId) {
        this.currentUserId = userId;
        this.logger.info(`Starting sync for user: ${userId}`);

        // Clear existing interval
        if (this.syncInterval) {
            clearInterval(this.syncInterval);
        }

        // Start periodic sync
        this.syncInterval = setInterval(() => {
            this.performSync();
        }, this.syncIntervalMs);

        // Perform initial sync
        this.performSync();
    }

    /**
     * Stop synchronization process
     */
    stopSync() {
        this.logger.info('Stopping sync process');

        if (this.syncInterval) {
            clearInterval(this.syncInterval);
            this.syncInterval = null;
        }

        this.currentUserId = null;
        this.pendingBatches.clear();
    }

    /**
     * Perform synchronization cycle
     */
    async performSync() {
        if (!this.currentUserId) {
            this.logger.warn('⚠️ [SyncManager] No current user ID, skipping sync');
            return;
        }

        try {
            this.logger.info('🔄 [SyncManager] ===== STARTING SYNC CYCLE =====');
            this.logger.info(`👤 [SyncManager] Current user: ${this.currentUserId}`);

            // Get last sync timestamp
            this.logger.info('🔍 [SyncManager] Getting last sync timestamp...');
            const lastSyncTime = await this.getLastSyncTime();
            this.logger.info(`⏰ [SyncManager] Last sync time: ${lastSyncTime}`);

            // Get new user activities since last sync
            this.logger.info('📊 [SyncManager] Querying new user activities...');
            const newActivities = await this.getNewActivities(lastSyncTime);

            if (newActivities.length === 0) {
                this.logger.info('✅ [SyncManager] No new activities to sync - all up to date');
                this.logger.info('🔄 [SyncManager] ===== SYNC CYCLE COMPLETED (NO DATA) =====');
                return;
            }

            this.logger.info(`📈 [SyncManager] Found ${newActivities.length} new activities to sync`);

            // Log sample activities for debugging
            if (newActivities.length > 0) {
                this.logger.info('📝 [SyncManager] Sample activities to sync:');
                for (let i = 0; i < Math.min(3, newActivities.length); i++) {
                    const activity = newActivities[i];
                    this.logger.info(`   Activity ${i + 1}: ${activity.title || 'No title'} - ${activity.url || 'No URL'}`);
                }
                if (newActivities.length > 3) {
                    this.logger.info(`   ... and ${newActivities.length - 3} more activities`);
                }
            }

            // Create batch with UUID
            const batchId = uuidv4();
            const batchData = {
                batch_id: batchId,
                user_id: this.currentUserId,
                activities: newActivities,
                timestamp: new Date().toISOString(),
                count: newActivities.length
            };

            this.logger.info('📦 [SyncManager] ===== CREATING SYNC BATCH =====');
            this.logger.info(`🆔 [SyncManager] Batch ID: ${batchId}`);
            this.logger.info(`📊 [SyncManager] Activities count: ${newActivities.length}`);
            this.logger.info(`⏰ [SyncManager] Batch timestamp: ${batchData.timestamp}`);

            // Store batch as pending
            this.pendingBatches.set(batchId, {
                data: batchData,
                timestamp: Date.now()
            });

            this.logger.info(`💾 [SyncManager] Stored batch ${batchId} in pending batches`);
            this.logger.info(`📊 [SyncManager] Total pending batches: ${this.pendingBatches.size}`);

            // Send to B-client via WebSocket
            this.logger.info('📤 [SyncManager] Sending batch to B-client...');
            await this.sendToBClient(batchData);

            this.logger.info('✅ [SyncManager] ===== SYNC CYCLE COMPLETED =====');

        } catch (error) {
            this.logger.error('❌ [SyncManager] Error during sync cycle:', error);
        }
    }

    /**
     * Get last synchronization timestamp from sync_data table
     */
    async getLastSyncTime() {
        try {
            const query = `
                SELECT MAX(created_at) as last_sync_time 
                FROM sync_data 
                WHERE user_id = ?
            `;

            const row = this.database.prepare(query).get(this.currentUserId);
            const lastSyncTime = row?.last_sync_time || '2025-01-01T00:00:00.000Z';
            this.logger.info(`Last sync time determined: ${lastSyncTime} (${row?.last_sync_time ? 'from sync_data' : 'default first sync'})`);
            return lastSyncTime;
        } catch (error) {
            this.logger.error('Error getting last sync time:', error);
            throw error;
        }
    }

    /**
     * Get new user activities since last sync time
     */
    async getNewActivities(lastSyncTime) {
        try {
            const query = `
                SELECT id, user_id, username, activity_type, url, title, description, 
                       start_time, end_time, duration, created_at, updated_at
                FROM user_activities 
                WHERE user_id = ? AND created_at > ?
                ORDER BY created_at ASC
            `;

            const rows = this.database.prepare(query).all(this.currentUserId, lastSyncTime);
            return rows || [];
        } catch (error) {
            this.logger.error('Error getting new activities:', error);
            throw error;
        }
    }

    /**
     * Send batch data to B-client via WebSocket
     */
    async sendToBClient(batchData) {
        return new Promise((resolve, reject) => {
            const batchId = batchData.batch_id;
            const activitiesCount = batchData.activities ? batchData.activities.length : 0;

            this.logger.info('📤 [SyncManager] ===== SENDING BATCH TO B-CLIENT =====');
            this.logger.info(`📦 [SyncManager] Batch ID: ${batchId}`);
            this.logger.info(`📊 [SyncManager] Activities count: ${activitiesCount}`);
            this.logger.info(`👤 [SyncManager] User ID: ${batchData.user_id}`);
            this.logger.info(`⏰ [SyncManager] Timestamp: ${batchData.timestamp}`);

            // Log sent data content in detail
            if (batchData.activities && batchData.activities.length > 0) {
                this.logger.info('📋 [SyncManager] ===== ACTIVITIES TO SEND =====');
                batchData.activities.forEach((activity, index) => {
                    this.logger.info(`📋 [SyncManager] Activity ${index + 1}:`);
                    this.logger.info(`   ID: ${activity.id}`);
                    this.logger.info(`   User ID: ${activity.user_id}`);
                    this.logger.info(`   Username: ${activity.username}`);
                    this.logger.info(`   URL: ${activity.url}`);
                    this.logger.info(`   Title: ${activity.title}`);
                    this.logger.info(`   Activity Type: ${activity.activity_type}`);
                    this.logger.info(`   Duration: ${activity.duration}ms`);
                    this.logger.info(`   Created At: ${activity.created_at}`);
                });
                this.logger.info('📋 [SyncManager] ===== END ACTIVITIES LIST =====');
            } else {
                this.logger.warn('⚠️ [SyncManager] No activities to send in batch');
            }

            if (!this.mainWindow || !this.mainWindow.webSocketClient) {
                this.logger.error('❌ [SyncManager] WebSocket client not available');
                reject(new Error('WebSocket client not available'));
                return;
            }

            // New data format: {user_id, batch_id, sync_data: [user_activity1, user_activity2, ...]}
            const syncMessage = {
                user_id: batchData.user_id,
                batch_id: batchId,
                sync_data: batchData.activities || []
            };

            const message = {
                type: 'user_activities_batch',
                data: syncMessage
            };

            // Log message to be sent in detail
            this.logger.info('📤 [SyncManager] ===== MESSAGE TO SEND =====');
            this.logger.info(`📤 [SyncManager] Message type: ${message.type}`);
            this.logger.info(`📤 [SyncManager] Sync message structure:`);
            this.logger.info(`   User ID: ${syncMessage.user_id}`);
            this.logger.info(`   Batch ID: ${syncMessage.batch_id}`);
            this.logger.info(`   Sync Data Count: ${syncMessage.sync_data.length}`);

            // Log message size for performance monitoring
            const messageStr = JSON.stringify(message);
            const messageSize = Buffer.byteLength(messageStr, 'utf8');
            this.logger.info(`📏 [SyncManager] Message size: ${messageSize} bytes`);

            // Log WebSocket connection status
            const wsClient = this.mainWindow.webSocketClient;
            this.logger.info(`🔗 [SyncManager] WebSocket status: connected=${wsClient.isConnected}, registered=${wsClient.isRegistered}`);
            this.logger.info('📤 [SyncManager] ===== END MESSAGE DETAILS =====');

            this.mainWindow.webSocketClient.sendMessage(message)
                .then(() => {
                    this.logger.info(`✅ [SyncManager] Successfully sent batch ${batchId} to B-client`);
                    this.logger.info(`📤 [SyncManager] ===== BATCH SENT SUCCESSFULLY =====`);
                    resolve();
                })
                .catch((error) => {
                    this.logger.error(`❌ [SyncManager] Failed to send batch ${batchId}:`, error);
                    this.logger.error(`📤 [SyncManager] ===== BATCH SEND FAILED =====`);
                    reject(error);
                });
        });
    }

    /**
     * Handle feedback from B-client for sent batch
     */
    handleBatchFeedback(batchId, success, message) {
        const statusIcon = success ? '✅' : '❌';
        const statusText = success ? 'SUCCESS' : 'FAILED';

        this.logger.info(`📨 [SyncManager] ===== RECEIVED BATCH FEEDBACK =====`);
        this.logger.info(`📦 [SyncManager] Batch ID: ${batchId}`);
        this.logger.info(`${statusIcon} [SyncManager] Status: ${statusText}`);
        this.logger.info(`💬 [SyncManager] Message: ${message}`);

        if (this.pendingBatches.has(batchId)) {
            const batch = this.pendingBatches.get(batchId);
            const batchData = batch.data;
            const processingTime = Date.now() - batch.timestamp;

            this.logger.info(`📊 [SyncManager] ===== BATCH PROCESSING INFO =====`);
            this.logger.info(`👤 [SyncManager] User ID: ${batchData.user_id}`);
            this.logger.info(`📈 [SyncManager] Activities count: ${batchData.count}`);
            this.logger.info(`⏱️ [SyncManager] Processing time: ${processingTime}ms`);

            if (success) {
                this.logger.info(`💾 [SyncManager] Storing successful sync to sync_data table...`);
                // Store successful sync to sync_data table
                this.storeSyncData(batch.data, 'outgoing', 'success')
                    .then(() => {
                        this.logger.info(`✅ [SyncManager] Successfully stored sync data for batch ${batchId}`);
                    })
                    .catch((error) => {
                        this.logger.error(`❌ [SyncManager] Failed to store sync data for batch ${batchId}:`, error);
                    });
            } else {
                this.logger.error(`❌ [SyncManager] Batch ${batchId} processing failed: ${message}`);
                this.logger.error(`❌ [SyncManager] Failed batch details: ${batchData.count} activities from user ${batchData.user_id}`);
            }

            // Remove from pending batches
            this.pendingBatches.delete(batchId);
            this.logger.info(`🧹 [SyncManager] Removed batch ${batchId} from pending batches`);
            this.logger.info(`📊 [SyncManager] Remaining pending batches: ${this.pendingBatches.size}`);

            this.logger.info(`${statusIcon} [SyncManager] ===== BATCH FEEDBACK PROCESSED =====`);
        } else {
            this.logger.warn(`⚠️ [SyncManager] Received feedback for unknown batch: ${batchId}`);
            this.logger.warn(`📊 [SyncManager] Current pending batches: ${Array.from(this.pendingBatches.keys()).map(id => id.substring(0, 8) + '...').join(', ')}`);
        }
    }

    /**
     * Handle incoming user activities from B-client
     */
    async handleIncomingActivities(batchData) {
        this.logger.info('📥 [SyncManager] ===== RECEIVED INCOMING ACTIVITIES =====');
        this.logger.info('📥 [SyncManager] Raw batchData:', JSON.stringify(batchData, null, 2));

        // Step 1: Data validation and extraction
        this.logger.info('📥 [SyncManager] ===== STEP 1: DATA VALIDATION AND EXTRACTION =====');
        const batchId = batchData.batch_id;
        const userId = batchData.user_id;
        const syncData = batchData.sync_data || [];
        const activitiesCount = syncData.length;

        this.logger.info(`📦 [SyncManager] Batch ID: ${batchId}`);
        this.logger.info(`👤 [SyncManager] Source User ID: ${userId}`);
        this.logger.info(`📊 [SyncManager] Activities count: ${activitiesCount}`);
        this.logger.info(`📋 [SyncManager] Sync data type: ${Array.isArray(syncData) ? 'Array' : typeof syncData}`);

        // Log received data content in detail
        if (syncData.length > 0) {
            this.logger.info('📋 [SyncManager] ===== RECEIVED ACTIVITIES DETAILS =====');
            syncData.forEach((activity, index) => {
                this.logger.info(`📋 [SyncManager] Received Activity ${index + 1}:`);
                this.logger.info(`   ID: ${activity.id}`);
                this.logger.info(`   User ID: ${activity.user_id}`);
                this.logger.info(`   Username: ${activity.username}`);
                this.logger.info(`   URL: ${activity.url}`);
                this.logger.info(`   Title: ${activity.title}`);
                this.logger.info(`   Activity Type: ${activity.activity_type}`);
                this.logger.info(`   Description: ${activity.description ? activity.description.substring(0, 100) + '...' : 'N/A'}`);
                this.logger.info(`   Start Time: ${activity.start_time}`);
                this.logger.info(`   End Time: ${activity.end_time}`);
                this.logger.info(`   Duration: ${activity.duration}ms`);
                this.logger.info(`   Created At: ${activity.created_at}`);
                this.logger.info(`   Updated At: ${activity.updated_at}`);
            });
            this.logger.info('📋 [SyncManager] ===== END RECEIVED ACTIVITIES LIST =====');
        } else {
            this.logger.warn('⚠️ [SyncManager] No activities in received sync_data');
        }

        // Step 2: Check sync_data structure
        this.logger.info('📥 [SyncManager] ===== STEP 2: SYNC_DATA STRUCTURE CHECK =====');
        if (syncData.length > 0) {
            this.logger.info(`📝 [SyncManager] First activity keys: ${Object.keys(syncData[0])}`);
            this.logger.info(`📝 [SyncManager] First activity sample:`, JSON.stringify(syncData[0], null, 2));

            // Check if necessary fields are included
            const requiredFields = ['user_id', 'username', 'url', 'title'];
            const firstActivity = syncData[0];
            this.logger.info('📝 [SyncManager] Required fields check:');
            requiredFields.forEach(field => {
                this.logger.info(`   ${field}: ${firstActivity[field] ? '✅ Present' : '❌ Missing'}`);
            });
        } else {
            this.logger.warn('⚠️ [SyncManager] sync_data is empty');
            // If sync_data is empty, return success directly without further processing
            this.logger.info('📤 [SyncManager] Sending feedback for empty sync_data...');
            await this.sendBatchFeedback(batchId, true, 'Received empty sync_data successfully');
            this.logger.info('✅ [SyncManager] ===== EMPTY SYNC_DATA PROCESSED =====');
            return;
        }

        try {

            // Check if batch_id already exists
            this.logger.info('🔍 [SyncManager] Checking if batch already exists...');
            const exists = await this.checkBatchExists(batchId);

            // Start async operations without waiting
            let savePromise = Promise.resolve(true);

            if (exists) {
                this.logger.info(`⏭️ [SyncManager] Batch ${batchId} already exists, skipping save`);
                this.logger.info(`📊 [SyncManager] Duplicate batch detected - avoiding data redundancy`);
            } else {
                this.logger.info(`💾 [SyncManager] Batch ${batchId} is new, proceeding to store...`);
                // Process received sync data, convert each activity to independent sync_data record
                savePromise = this.processIncomingSyncData(userId, batchId, syncData)
                    .then((processedCount) => {
                        this.logger.info(`✅ [SyncManager] Successfully processed ${processedCount} activities into sync_data records`);
                        // Send notification to UI about received sync data
                        this.notifySyncDataReceived(userId, activitiesCount);
                    })
                    .catch((error) => {
                        this.logger.error(`❌ [SyncManager] Error storing activities: ${error.message}`);
                        throw error;
                    });
            }

            // Send feedback to B-client asynchronously (don't wait)
            this.logger.info('📤 [SyncManager] Sending feedback to B-client...');
            this.sendBatchFeedback(batchData.batch_id, true, 'Received successfully')
                .catch((error) => {
                    this.logger.error(`❌ [SyncManager] Error sending feedback: ${error.message}`);
                });

            // Wait for save operation to complete (but don't block feedback)
            await savePromise;

            this.logger.info('✅ [SyncManager] ===== INCOMING ACTIVITIES PROCESSED =====');

        } catch (error) {
            this.logger.error('❌ [SyncManager] Error handling incoming activities:', error);
            this.logger.error(`📦 [SyncManager] Failed batch ID: ${batchId}`);
            this.logger.error(`👤 [SyncManager] Source user: ${sourceUserId}`);

            // Send error feedback to B-client
            this.logger.info('📤 [SyncManager] Sending error feedback to B-client...');
            await this.sendBatchFeedback(batchData.batch_id, false, error.message);

            this.logger.error('❌ [SyncManager] ===== INCOMING ACTIVITIES FAILED =====');
        }
    }

    /**
     * Check if batch_id already exists in sync_data
     */
    async checkBatchExists(batchId) {
        try {
            const query = 'SELECT COUNT(*) as count FROM sync_data WHERE batch_id = ?';
            const row = this.database.prepare(query).get(batchId);
            return row.count > 0;
        } catch (error) {
            this.logger.error('Error checking batch existence:', error);
            throw error;
        }
    }

    /**
     * Process incoming sync data and store each activity as a separate sync_data record
     */
    async processIncomingSyncData(userId, batchId, syncData) {
        this.logger.info('📥 [SyncManager] ===== PROCESSING INCOMING SYNC DATA =====');
        this.logger.info(`📥 [SyncManager] Processing ${syncData.length} activities for user ${userId}, batch ${batchId}`);

        // If no activities, return success directly
        if (syncData.length === 0) {
            this.logger.info('📥 [SyncManager] No activities to process, returning success');
            return 0;
        }

        try {
            const insertQuery = `
                INSERT INTO sync_data (
                    user_id, username, activity_type, url, title, description,
                    start_time, end_time, duration, created_at, updated_at, batch_id
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;

            let processedCount = 0;

            this.logger.info(`📥 [SyncManager] Database insert query prepared`);

            // Iterate through each activity in sync_data, create independent sync_data record for each
            for (let i = 0; i < syncData.length; i++) {
                const activity = syncData[i];

                this.logger.info(`📥 [SyncManager] ===== PROCESSING ACTIVITY ${i + 1}/${syncData.length} =====`);
                this.logger.info(`📥 [SyncManager] Activity ${i + 1} keys: ${Object.keys(activity)}`);
                this.logger.info(`📥 [SyncManager] Activity ${i + 1} sample:`, JSON.stringify(activity, null, 2));

                try {
                    this.logger.info(`📥 [SyncManager] Inserting into database...`);
                    const result = this.database.prepare(insertQuery).run(
                        activity.user_id || userId,
                        activity.username,
                        activity.activity_type,
                        activity.url,
                        activity.title,
                        activity.description,
                        activity.start_time,
                        activity.end_time,
                        activity.duration,
                        activity.created_at,
                        activity.updated_at,
                        batchId
                    );

                    processedCount++;
                    this.logger.info(`✅ [SyncManager] Successfully stored activity ${processedCount}: ${activity.title || 'No title'} (Row ID: ${result.lastInsertRowid})`);
                } catch (insertError) {
                    this.logger.error(`❌ [SyncManager] Error storing activity ${i + 1}: ${insertError.message}`);
                    this.logger.error(`❌ [SyncManager] Activity data:`, JSON.stringify(activity, null, 2));
                    // Continue with other activities even if one fails
                }
            }

            this.logger.info(`📊 [SyncManager] ===== PROCESSING COMPLETE =====`);
            this.logger.info(`📊 [SyncManager] Successfully processed ${processedCount}/${syncData.length} activities into sync_data records`);
            return processedCount;
        } catch (error) {
            this.logger.error('❌ [SyncManager] Error processing incoming sync data:', error);
            this.logger.error('❌ [SyncManager] Error stack:', error.stack);
            throw error;
        }
    }


    /**
     * Store sync data to sync_data table
     */
    async storeSyncData(batchData, direction, status) {
        try {
            const activities = batchData.activities || [];
            let savedCount = 0;

            // Create a sync_data record for each activity
            for (const activity of activities) {
                const insertQuery = `
                    INSERT INTO sync_data (
                        user_id, username, activity_type, url, title, description,
                        start_time, end_time, duration, created_at, updated_at, batch_id
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `;

                const result = this.database.prepare(insertQuery).run(
                    activity.user_id,
                    activity.username,
                    activity.activity_type,
                    activity.url,
                    activity.title,
                    activity.description,
                    activity.start_time,
                    activity.end_time,
                    activity.duration,
                    activity.created_at,
                    activity.updated_at,
                    batchData.batch_id
                );

                savedCount++;
            }

            this.logger.info(`✅ [SyncManager] Stored ${savedCount} activities to sync_data table for batch ${batchData.batch_id}`);
            return savedCount;
        } catch (error) {
            this.logger.error('Error storing sync data:', error);
            throw error;
        }
    }

    /**
     * Send batch feedback to B-client
     */
    async sendBatchFeedback(batchId, success, message) {
        const statusIcon = success ? '✅' : '❌';
        const statusText = success ? 'SUCCESS' : 'FAILED';

        this.logger.info('📤 [SyncManager] ===== SENDING BATCH FEEDBACK =====');
        this.logger.info(`📦 [SyncManager] Batch ID: ${batchId}`);
        this.logger.info(`${statusIcon} [SyncManager] Status: ${statusText}`);
        this.logger.info(`💬 [SyncManager] Message: ${message}`);

        if (!this.mainWindow || !this.mainWindow.webSocketClient) {
            this.logger.error('❌ [SyncManager] WebSocket client not available for feedback');
            this.logger.error('📤 [SyncManager] ===== FEEDBACK SEND FAILED (NO WEBSOCKET) =====');
            return;
        }

        const feedbackMessage = {
            type: 'user_activities_batch_feedback',
            data: {
                batch_id: batchId,
                success: success,
                message: message,
                timestamp: new Date().toISOString()
            }
        };

        // Log message size for performance monitoring
        const messageStr = JSON.stringify(feedbackMessage);
        const messageSize = Buffer.byteLength(messageStr, 'utf8');
        this.logger.info(`📏 [SyncManager] Feedback message size: ${messageSize} bytes`);

        // Log WebSocket connection status
        const wsClient = this.mainWindow.webSocketClient;
        this.logger.info(`🔗 [SyncManager] WebSocket status: connected=${wsClient.isConnected}, registered=${wsClient.isRegistered}`);

        try {
            await this.mainWindow.webSocketClient.sendMessage(feedbackMessage);
            this.logger.info(`✅ [SyncManager] Successfully sent feedback for batch ${batchId}`);
            this.logger.info(`📤 [SyncManager] ===== FEEDBACK SENT SUCCESSFULLY =====`);
        } catch (error) {
            this.logger.error(`❌ [SyncManager] Failed to send feedback for batch ${batchId}:`, error);
            this.logger.error(`📤 [SyncManager] ===== FEEDBACK SEND FAILED =====`);
        }
    }

    /**
     * Get sync statistics
     */
    async getSyncStats() {
        this.logger.info('📊 [SyncManager] ===== GETTING SYNC STATISTICS =====');
        this.logger.info(`👤 [SyncManager] Current user: ${this.currentUserId}`);
        this.logger.info(`📦 [SyncManager] Pending batches: ${this.pendingBatches.size}`);

        try {
            const query = `
                SELECT 
                    COUNT(*) as count,
                    MAX(created_at) as last_sync
                FROM sync_data 
                WHERE user_id = ?
            `;

            const row = this.database.prepare(query).get(this.currentUserId);

            if (row && row.count > 0) {
                this.logger.info(`📈 [SyncManager] Total sync records: ${row.count}, last sync: ${row.last_sync}`);
            } else {
                this.logger.info('📊 [SyncManager] No sync statistics found - no previous sync data');
            }

            // Log pending batches details
            if (this.pendingBatches.size > 0) {
                this.logger.info('⏳ [SyncManager] Pending batches details:');
                this.pendingBatches.forEach((batch, batchId) => {
                    const age = Date.now() - batch.timestamp;
                    this.logger.info(`   ${batchId.substring(0, 8)}... | Age: ${age}ms | Activities: ${batch.data.count}`);
                });
            }

            this.logger.info('📊 [SyncManager] ===== SYNC STATISTICS COMPLETED =====');
            return row || { count: 0, last_sync: null };
        } catch (error) {
            this.logger.error('❌ [SyncManager] Error getting sync stats:', error);
            throw error;
        }
    }

    // ===================== Notification Methods =====================

    /**
     * Notify UI about received sync data
     * @param {string} sourceUserId - Source user ID
     * @param {number} activitiesCount - Number of activities received
     */
    notifySyncDataReceived(sourceUserId, activitiesCount) {
        try {
            // Use user ID directly for notification
            const displayName = sourceUserId ? sourceUserId.substring(0, 8) + '...' : 'Unknown User';

            // Send notification to renderer process
            if (this.mainWindow && !this.mainWindow.isDestroyed()) {
                this.mainWindow.webContents.send('sync-data-received', {
                    username: displayName,
                    activitiesCount: activitiesCount
                });
                this.logger.info(`📢 [SyncManager] Sent sync data received notification: ${displayName} (${activitiesCount} activities)`);
            } else {
                this.logger.warn('⚠️ [SyncManager] Main window not available for notification');
            }
        } catch (error) {
            this.logger.error('❌ [SyncManager] Error sending sync data received notification:', error);
        }
    }

    /**
     * Notify UI about sent sync data
     * @param {number} activitiesCount - Number of activities sent
     */
    notifySyncDataSent(activitiesCount) {
        try {
            // Send notification to renderer process
            if (this.mainWindow && !this.mainWindow.isDestroyed()) {
                this.mainWindow.webContents.send('sync-data-sent', {
                    activitiesCount: activitiesCount
                });
                this.logger.info(`📢 [SyncManager] Sent sync data sent notification: ${activitiesCount} activities`);
            } else {
                this.logger.warn('⚠️ [SyncManager] Main window not available for notification');
            }
        } catch (error) {
            this.logger.error('❌ [SyncManager] Error sending sync data sent notification:', error);
        }
    }

    /**
     * Notify UI about sync error
     * @param {string} errorMessage - Error message
     */
    notifySyncError(errorMessage) {
        try {
            // Send notification to renderer process
            if (this.mainWindow && !this.mainWindow.isDestroyed()) {
                this.mainWindow.webContents.send('sync-error', {
                    errorMessage: errorMessage
                });
                this.logger.info(`📢 [SyncManager] Sent sync error notification: ${errorMessage}`);
            } else {
                this.logger.warn('⚠️ [SyncManager] Main window not available for notification');
            }
        } catch (error) {
            this.logger.error('❌ [SyncManager] Error sending sync error notification:', error);
        }
    }


}

module.exports = SyncManager;
