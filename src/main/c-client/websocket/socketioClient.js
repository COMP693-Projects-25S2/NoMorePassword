/**
 * Socket.IO Client for C-Client
 * Handles WebSocket communication using Socket.IO protocol
 */

const { io } = require("socket.io-client");

class SocketIOClient {
    constructor(client) {
        this.client = client;
        this.logger = client.logger;
        this.socket = null;
        this.isConnected = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 1000; // 1 second
    }

    /**
     * Connect to Socket.IO server
     * @param {string} serverUrl - Server URL (e.g., "ws://localhost:3000")
     * @param {string} environmentName - Environment name for logging
     * @returns {Promise<boolean>} - Connection success
     */
    async connectToSocketIO(serverUrl, environmentName = 'Socket.IO Server') {
        return new Promise((resolve) => {
            this.logger.info(`[Socket.IO Client] Attempting to connect to ${environmentName} at ${serverUrl}`);

            // Parse URL to ensure proper format
            let socketUrl = serverUrl;
            if (serverUrl.startsWith('ws://')) {
                socketUrl = serverUrl.replace('ws://', 'http://');
            } else if (serverUrl.startsWith('wss://')) {
                socketUrl = serverUrl.replace('wss://', 'https://');
            }

            this.socket = io(socketUrl, {
                transports: ["websocket"],
                reconnection: true,
                reconnectionAttempts: this.maxReconnectAttempts,
                reconnectionDelay: this.reconnectDelay,
                timeout: 10000, // 10 seconds timeout
                forceNew: true
            });

            // Connection event handlers
            this.socket.on('connect', () => {
                this.logger.info(`[Socket.IO Client] ✅ Connected to ${environmentName}`);
                this.isConnected = true;
                this.reconnectAttempts = 0;
                resolve(true);
            });

            this.socket.on('disconnect', (reason) => {
                this.logger.info(`[Socket.IO Client] Disconnected from ${environmentName}: ${reason}`);
                this.isConnected = false;
            });

            this.socket.on('connect_error', (error) => {
                this.logger.error(`[Socket.IO Client] Connection error: ${error.message}`);
                this.isConnected = false;
                this.reconnectAttempts++;

                if (this.reconnectAttempts >= this.maxReconnectAttempts) {
                    this.logger.error(`[Socket.IO Client] Max reconnection attempts reached`);
                    resolve(false);
                }
            });

            this.socket.on('error', (error) => {
                this.logger.error(`[Socket.IO Client] Error: ${error.message}`);
            });

            // Message handlers
            this.socket.on('status', (data) => {
                this.logger.info(`[Socket.IO Client] Server status: ${data.message}`);
            });

            this.socket.on('registration_success', (data) => {
                this.logger.info(`[Socket.IO Client] Registration successful: ${JSON.stringify(data)}`);
                // Route to message handler
                this.client.messageRouter.route({
                    action: 'registration_success',
                    ...data
                });
            });

            this.socket.on('bind_success', (data) => {
                this.logger.info(`[Socket.IO Client] Bind successful: ${JSON.stringify(data)}`);
                // Route to message handler
                this.client.messageRouter.route({
                    action: 'bind_success',
                    ...data
                });
            });

            this.socket.on('message', (data) => {
                this.logger.info(`[Socket.IO Client] Message received: ${JSON.stringify(data)}`);
                // Route to message handler
                this.client.messageRouter.route({
                    action: 'message',
                    ...data
                });
            });

            this.socket.on('error', (data) => {
                this.logger.error(`[Socket.IO Client] Server error: ${JSON.stringify(data)}`);
                // Route to message handler
                this.client.messageRouter.route({
                    action: 'error',
                    ...data
                });
            });

            // Handle timeout if connection takes too long
            const timeoutId = setTimeout(() => {
                if (!this.isConnected) {
                    this.logger.error(`[Socket.IO Client] Connection timeout after 10 seconds`);
                    this.socket.disconnect();
                    resolve(false);
                }
            }, 10000);

            this.socket.on('connect', () => clearTimeout(timeoutId));
        });
    }

    /**
     * Register with the server
     * @param {Object} registrationData - Registration data
     * @returns {boolean} - Send success
     */
    register(registrationData) {
        if (this.isConnected && this.socket) {
            this.logger.info(`[Socket.IO Client] Sending registration: ${JSON.stringify(registrationData)}`);
            this.socket.emit('register', registrationData);
            return true;
        } else {
            this.logger.warn(`[Socket.IO Client] Cannot register - not connected`);
            return false;
        }
    }

    /**
     * Send a message to the server
     * @param {Object} messageData - Message data
     * @returns {boolean} - Send success
     */
    send(messageData) {
        if (this.isConnected && this.socket) {
            this.logger.info(`[Socket.IO Client] Sending message: ${JSON.stringify(messageData)}`);
            this.socket.emit('message', messageData);
            return true;
        } else {
            this.logger.warn(`[Socket.IO Client] Cannot send message - not connected`);
            return false;
        }
    }

    /**
     * Send bind request to the server
     * @param {Object} bindData - Bind data
     * @returns {boolean} - Send success
     */
    bind(bindData) {
        if (this.isConnected && this.socket) {
            this.logger.info(`[Socket.IO Client] Sending bind request: ${JSON.stringify(bindData)}`);
            this.socket.emit('bind', bindData);
            return true;
        } else {
            this.logger.warn(`[Socket.IO Client] Cannot send bind request - not connected`);
            return false;
        }
    }

    /**
     * Disconnect from the server
     */
    disconnect() {
        if (this.socket) {
            this.logger.info(`[Socket.IO Client] Disconnecting from server`);
            this.socket.disconnect();
            this.isConnected = false;
        }
    }

    /**
     * Get connection status
     * @returns {Object} - Connection status
     */
    getStatus() {
        return {
            isConnected: this.isConnected,
            hasSocket: !!this.socket,
            reconnectAttempts: this.reconnectAttempts,
            maxReconnectAttempts: this.maxReconnectAttempts
        };
    }
}

module.exports = SocketIOClient;
