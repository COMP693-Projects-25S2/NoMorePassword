/**
 * SecurityCodeHandler
 * Security code verification and new device login
 */

class SecurityCodeHandler {
    constructor(client) {
        this.client = client;
        this.logger = client.logger;
    }

    /**
     * Handle security code response from B-Client
     */
    handleSecurityCodeResponse(message) {
        try {
            // Use dedicated security code logger
            const { getCClientLogger } = require('../../utils/logger');
            const securityLogger = getCClientLogger('security_code');

            securityLogger.info('📱 [WebSocket Client] ===== HANDLING SECURITY CODE RESPONSE =====');
            securityLogger.info('📱 [WebSocket Client] Message:', JSON.stringify(message, null, 2));

            // Emit event for IPC handler to catch
            if (this.client.securityCodeCallback) {
                securityLogger.info('📱 [WebSocket Client] Calling security code callback');
                this.client.securityCodeCallback(message);
                this.client.securityCodeCallback = null; // Clear callback after use
            } else {
                securityLogger.warn('📱 [WebSocket Client] No security code callback registered');
            }

            securityLogger.info('📱 [WebSocket Client] ===== SECURITY CODE RESPONSE HANDLED =====');
        } catch (error) {
            const { getCClientLogger } = require('../../utils/logger');
            const securityLogger = getCClientLogger('security_code');
            securityLogger.error('❌ [WebSocket Client] Error handling security code response:', error);
        }
    }

    /**
     * Request security code from B-Client
     */
    requestSecurityCode(data) {
        // Use dedicated security code logger
        const { getCClientLogger } = require('../../utils/logger');
        const securityLogger = getCClientLogger('security_code');

        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                securityLogger.error('📱 [WebSocket Client] Security code request timeout');
                this.client.securityCodeCallback = null;
                resolve({
                    success: false,
                    error: 'Request timeout - please try again'
                });
            }, 10000); // 10 second timeout

            // Set up callback for response
            this.client.securityCodeCallback = (message) => {
                clearTimeout(timeout);
                securityLogger.info('📱 [WebSocket Client] Security code response received');

                if (message.data && message.data.success) {
                    resolve({
                        success: true,
                        security_code: message.data.security_code,
                        username: message.data.nmp_username,
                        domain_id: message.data.domain_id,
                        cluster_id: message.data.cluster_id,
                        channel_id: message.data.channel_id
                    });
                } else {
                    resolve({
                        success: false,
                        error: message.data?.error || 'Failed to get security code'
                    });
                }
            };

            // Send request
            const requestMessage = {
                type: 'request_security_code',
                data: data
            };

            this.client.sendMessage(requestMessage);
            securityLogger.info('📱 [WebSocket Client] Security code request sent');
        });
    }

    /**
     * Handle new device login - User switch from security code to real user
     * This is called after C2 registers with security code and B-Client verifies it
     * @param {Object} message - Registration success message with new device login flag
     */
    async handleNewDeviceLogin(message) {
        try {
            // Use dedicated security code logger
            const { getCClientLogger } = require('../../utils/logger');
            const securityLogger = getCClientLogger('security_code');

            securityLogger.info('🔐 [WebSocket Client] ===== HANDLING NEW DEVICE LOGIN =====');
            securityLogger.info('🔐 [WebSocket Client] Starting new device login process');
            securityLogger.info('🔐 [WebSocket Client] Current client_id:', this.client.clientId);

            // Extract user information from message
            securityLogger.info('🔐 [WebSocket Client] ===== STEP 1: EXTRACTING USER INFORMATION =====');
            const userInfo = {
                user_id: message.user_id,
                username: message.username,
                node_id: message.node_id,
                domain_id: message.domain_id,
                cluster_id: message.cluster_id,
                channel_id: message.channel_id,
                domain_main_node_id: message.domain_main_node_id,
                cluster_main_node_id: message.cluster_main_node_id,
                channel_main_node_id: message.channel_main_node_id,
                client_ids: JSON.stringify([this.client.clientId]) // Add current client ID
            };

            securityLogger.info('🔐 [WebSocket Client] Main node IDs from B-Client:');
            securityLogger.info(`🔐 [WebSocket Client]   - domain_main_node_id: ${userInfo.domain_main_node_id}`);
            securityLogger.info(`🔐 [WebSocket Client]   - cluster_main_node_id: ${userInfo.cluster_main_node_id}`);
            securityLogger.info(`🔐 [WebSocket Client]   - channel_main_node_id: ${userInfo.channel_main_node_id}`);

            securityLogger.info('🔐 [WebSocket Client] Extracted user info:');
            securityLogger.info(`🔐 [WebSocket Client]   - user_id: ${userInfo.user_id}`);
            securityLogger.info(`🔐 [WebSocket Client]   - username: ${userInfo.username}`);
            securityLogger.info(`🔐 [WebSocket Client]   - node_id: ${userInfo.node_id}`);
            securityLogger.info(`🔐 [WebSocket Client]   - domain_id: ${userInfo.domain_id}`);
            securityLogger.info(`🔐 [WebSocket Client]   - cluster_id: ${userInfo.cluster_id}`);
            securityLogger.info(`🔐 [WebSocket Client]   - channel_id: ${userInfo.channel_id}`);
            securityLogger.info(`🔐 [WebSocket Client]   - client_ids: ${userInfo.client_ids}`);

            // Get database
            securityLogger.info('🔐 [WebSocket Client] ===== STEP 2: SAVING TO LOCAL_USERS TABLE =====');
            const db = require('../../sqlite/database');

            securityLogger.info('🔐 [WebSocket Client] Database obtained');
            securityLogger.info('🔐 [WebSocket Client] Preparing INSERT OR REPLACE statement...');

            const now = Math.floor(Date.now() / 1000);

            try {
                securityLogger.info('🔐 [WebSocket Client] Executing database INSERT...');
                securityLogger.info('🔐 [WebSocket Client] Values:');
                securityLogger.info(`🔐 [WebSocket Client]   user_id: ${userInfo.user_id}`);
                securityLogger.info(`🔐 [WebSocket Client]   username: ${userInfo.username}`);
                securityLogger.info(`🔐 [WebSocket Client]   node_id: ${userInfo.node_id}`);
                securityLogger.info(`🔐 [WebSocket Client]   domain_id: ${userInfo.domain_id}`);
                securityLogger.info(`🔐 [WebSocket Client]   cluster_id: ${userInfo.cluster_id}`);
                securityLogger.info(`🔐 [WebSocket Client]   channel_id: ${userInfo.channel_id}`);
                securityLogger.info(`🔐 [WebSocket Client]   client_ids: ${userInfo.client_ids}`);
                securityLogger.info(`🔐 [WebSocket Client]   created_at: ${now}`);
                securityLogger.info(`🔐 [WebSocket Client]   updated_at: ${now}`);

                const result = db.prepare(`
                    INSERT OR REPLACE INTO local_users (
                        user_id, username, node_id, 
                        domain_id, cluster_id, channel_id,
                        client_ids, created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                `).run(
                    userInfo.user_id,
                    userInfo.username,
                    userInfo.node_id,
                    userInfo.domain_id,
                    userInfo.cluster_id,
                    userInfo.channel_id,
                    userInfo.client_ids,
                    now,
                    now
                );

                securityLogger.info(`🔐 [WebSocket Client] Database INSERT result: changes=${result.changes}, lastInsertRowid=${result.lastInsertRowid}`);
                securityLogger.info('✅ [WebSocket Client] User saved to local_users table successfully');
                securityLogger.info(`✅ [WebSocket Client] Record: user_id=${userInfo.user_id}, username=${userInfo.username}`);
            } catch (dbError) {
                securityLogger.error('❌ [WebSocket Client] Database INSERT error:', dbError.message);
                securityLogger.error('❌ [WebSocket Client] Error code:', dbError.code);
                securityLogger.error('❌ [WebSocket Client] Error stack:', dbError.stack);
                throw dbError; // Re-throw to be caught by outer catch
            }

            // Update main node information in respective tables
            securityLogger.info('🔐 [WebSocket Client] ===== STEP 3: UPDATING MAIN NODE TABLES =====');

            // Update domain_main_nodes
            if (userInfo.domain_id && userInfo.domain_main_node_id) {
                securityLogger.info(`🔐 [WebSocket Client] Updating domain_main_nodes...`);
                securityLogger.info(`🔐 [WebSocket Client]   node_id (PK): ${userInfo.domain_main_node_id}`);
                securityLogger.info(`🔐 [WebSocket Client]   domain_id: ${userInfo.domain_id}`);

                db.prepare(`
                    INSERT OR REPLACE INTO domain_main_nodes (
                        node_id, domain_id, updated_at
                    ) VALUES (?, ?, ?)
                `).run(userInfo.domain_main_node_id, userInfo.domain_id, now);
                securityLogger.info(`✅ [WebSocket Client] Domain main node updated successfully`);
            } else {
                securityLogger.info(`⚠️ [WebSocket Client] Skipping domain_main_nodes update (domain_id or main_node_id is null)`);
            }

            // Update cluster_main_nodes
            if (userInfo.cluster_id && userInfo.cluster_main_node_id) {
                securityLogger.info(`🔐 [WebSocket Client] Updating cluster_main_nodes...`);
                securityLogger.info(`🔐 [WebSocket Client]   node_id (PK): ${userInfo.cluster_main_node_id}`);
                securityLogger.info(`🔐 [WebSocket Client]   domain_id: ${userInfo.domain_id}`);
                securityLogger.info(`🔐 [WebSocket Client]   cluster_id: ${userInfo.cluster_id}`);

                db.prepare(`
                    INSERT OR REPLACE INTO cluster_main_nodes (
                        node_id, domain_id, cluster_id, updated_at
                    ) VALUES (?, ?, ?, ?)
                `).run(userInfo.cluster_main_node_id, userInfo.domain_id, userInfo.cluster_id, now);
                securityLogger.info(`✅ [WebSocket Client] Cluster main node updated successfully`);
            } else {
                securityLogger.info(`⚠️ [WebSocket Client] Skipping cluster_main_nodes update (cluster_id or main_node_id is null)`);
            }

            // Update channel_main_nodes
            if (userInfo.channel_id && userInfo.channel_main_node_id) {
                securityLogger.info(`🔐 [WebSocket Client] Updating channel_main_nodes...`);
                securityLogger.info(`🔐 [WebSocket Client]   node_id (PK): ${userInfo.channel_main_node_id}`);
                securityLogger.info(`🔐 [WebSocket Client]   domain_id: ${userInfo.domain_id}`);
                securityLogger.info(`🔐 [WebSocket Client]   cluster_id: ${userInfo.cluster_id}`);
                securityLogger.info(`🔐 [WebSocket Client]   channel_id: ${userInfo.channel_id}`);

                db.prepare(`
                    INSERT OR REPLACE INTO channel_main_nodes (
                        node_id, domain_id, cluster_id, channel_id, updated_at
                    ) VALUES (?, ?, ?, ?, ?)
                `).run(userInfo.channel_main_node_id, userInfo.domain_id, userInfo.cluster_id, userInfo.channel_id, now);
                securityLogger.info(`✅ [WebSocket Client] Channel main node updated successfully`);
            } else {
                securityLogger.info(`⚠️ [WebSocket Client] Skipping channel_main_nodes update (channel_id or main_node_id is null)`);
            }

            securityLogger.info('✅ [WebSocket Client] All main node tables updated');

            // Perform user switch operation
            securityLogger.info('🔐 [WebSocket Client] ===== STEP 4: TRIGGERING USER SWITCH =====');
            securityLogger.info(`🔐 [WebSocket Client] Will switch to user: ${userInfo.username} (${userInfo.user_id})`);

            // Get IPC handlers to trigger user switch
            const { ipcMain } = require('electron');

            // Emit event to trigger user switch
            // Note: ipcMain.emit requires (event, ...args) format
            // The first parameter will be received as 'event', the second as 'data'
            securityLogger.info('🔐 [WebSocket Client] Emitting new-device-login-complete event to IPC...');
            ipcMain.emit('new-device-login-complete', null, {
                user_id: userInfo.user_id,
                username: userInfo.username
            });

            securityLogger.info('✅ [WebSocket Client] Event emitted successfully');
            securityLogger.info('✅ [WebSocket Client] ===== NEW DEVICE LOGIN PROCESS COMPLETE =====');
            securityLogger.info('✅ [WebSocket Client] IPC handlers will now perform user switch (clear sessions, close tabs, create new tab)');

        } catch (error) {
            const { getCClientLogger } = require('../../utils/logger');
            const securityLogger = getCClientLogger('security_code');
            securityLogger.error('❌ [WebSocket Client] Error handling new device login:');
            securityLogger.error('❌ [WebSocket Client] Error type:', typeof error);
            securityLogger.error('❌ [WebSocket Client] Error:', error);
            if (error) {
                securityLogger.error('❌ [WebSocket Client] Error message:', error.message || 'No message');
                securityLogger.error('❌ [WebSocket Client] Error name:', error.name || 'No name');
                securityLogger.error('❌ [WebSocket Client] Error code:', error.code || 'No code');
                securityLogger.error('❌ [WebSocket Client] Error stack:', error.stack || 'No stack');
            }
        }
    }

}

module.exports = SecurityCodeHandler;
